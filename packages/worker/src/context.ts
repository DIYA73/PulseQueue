import type { StepContext, WorkflowDefinition } from '@pulsequeue/core';
import { StepFailed, WorkflowSuspended } from './errors.js';
import { calcDelay } from './backoff.js';
import { parseDuration } from './duration.js';
import {
  getStepOutput,
  getStepAttempt,
  stepIsPending,
  upsertStep,
  setRunStatus,
  scheduleWake,
} from './db.js';

interface RedisLike {
  zadd(key: string, score: number, member: string): Promise<number | string>;
}

export function createStepContext(
  runId: string,
  def: WorkflowDefinition,
  redis: RedisLike,
): StepContext {
  return {
    async run<T>(name: string, fn: () => Promise<T>): Promise<T> {
      // Memoization: return cached output for completed steps (enables replay)
      const cached = await getStepOutput(runId, name);
      if (cached) return cached.output as T;

      const attempt = await getStepAttempt(runId, name);

      await upsertStep(runId, name, {
        status: 'running',
        attempt,
        started_at: new Date(),
      });

      try {
        const output = await fn();
        await upsertStep(runId, name, {
          status: 'completed',
          output,
          completed_at: new Date(),
        });
        return output;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        if (attempt < def.retries.maxAttempts) {
          const delayMs = calcDelay(attempt, def.retries);
          await upsertStep(runId, name, {
            status: 'failed',
            attempt: attempt + 1,
            error: message,
            completed_at: new Date(),
          });
          await redis.zadd(
            'pq:retry',
            Date.now() + delayMs,
            JSON.stringify({ run_id: runId, workflow: def.name }),
          );
        } else {
          await upsertStep(runId, name, {
            status: 'failed',
            error: message,
            completed_at: new Date(),
          });
          await setRunStatus(runId, 'failed', message);
        }

        throw new StepFailed(name, err);
      }
    },

    async sleep(name: string, duration: string): Promise<void> {
      const cached = await getStepOutput(runId, name);
      if (cached) return;

      // Already suspended and waiting — re-suspend without re-inserting
      if (await stepIsPending(runId, name)) {
        throw new WorkflowSuspended(`sleep(${duration})`);
      }

      const dueAt = new Date(Date.now() + parseDuration(duration));
      await upsertStep(runId, name, { status: 'pending', started_at: new Date() });
      await scheduleWake(runId, def.name, name, dueAt);
      await setRunStatus(runId, 'sleeping');

      throw new WorkflowSuspended(`sleep(${duration}) — resumes at ${dueAt.toISOString()}`);
    },

    async waitUntil(name: string, date: Date): Promise<void> {
      const cached = await getStepOutput(runId, name);
      if (cached) return;

      if (await stepIsPending(runId, name)) {
        throw new WorkflowSuspended(`waitUntil(${date.toISOString()})`);
      }

      await upsertStep(runId, name, { status: 'pending', started_at: new Date() });
      await scheduleWake(runId, def.name, name, date);
      await setRunStatus(runId, 'sleeping');

      throw new WorkflowSuspended(`waitUntil(${date.toISOString()})`);
    },

    // Fan-out: run all branches concurrently, fan-in when all settle.
    // Uses allSettled so every branch gets a chance to write its result to DB
    // before we re-throw any failure — preserving memoized outputs for replay.
    async parallel<T>(fns: Array<() => Promise<T>>): Promise<T[]> {
      const results = await Promise.allSettled(fns.map(fn => fn()));

      const values: T[] = [];
      let firstError: unknown = null;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          values.push(result.value);
        } else if (!firstError) {
          firstError = result.reason;
        }
      }

      if (firstError !== null) throw firstError;
      return values;
    },
  };
}
