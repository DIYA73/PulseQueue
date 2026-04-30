import { trace, context, SpanStatusCode } from '@opentelemetry/api';
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

const tracer = trace.getTracer('pulsequeue-worker');

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
      // Memoization: return cached output without a trace span (no real work done)
      const cached = await getStepOutput(runId, name);
      if (cached) return cached.output as T;

      const attempt = await getStepAttempt(runId, name);

      await upsertStep(runId, name, { status: 'running', attempt, started_at: new Date() });

      // Each step execution gets its own trace span
      const span = tracer.startSpan(`step.run/${name}`, {
        attributes: {
          'pq.run_id':   runId,
          'pq.workflow': def.name,
          'pq.step':     name,
          'pq.attempt':  attempt,
        },
      });

      try {
        const output = await context.with(trace.setSpan(context.active(), span), fn);

        await upsertStep(runId, name, { status: 'completed', output, completed_at: new Date() });

        span.setStatus({ code: SpanStatusCode.OK });
        return output;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);

        span.recordException(err instanceof Error ? err : new Error(message));
        span.setStatus({ code: SpanStatusCode.ERROR, message });

        if (attempt < def.retries.maxAttempts) {
          const delayMs = calcDelay(attempt, def.retries);
          await upsertStep(runId, name, {
            status: 'failed', attempt: attempt + 1, error: message, completed_at: new Date(),
          });
          await redis.zadd('pq:retry', Date.now() + delayMs,
            JSON.stringify({ run_id: runId, workflow: def.name }));
        } else {
          await upsertStep(runId, name, { status: 'failed', error: message, completed_at: new Date() });
          await setRunStatus(runId, 'failed', message);
        }

        throw new StepFailed(name, err);
      } finally {
        span.end();
      }
    },

    async sleep(name: string, duration: string): Promise<void> {
      const cached = await getStepOutput(runId, name);
      if (cached) return;

      if (await stepIsPending(runId, name)) {
        throw new WorkflowSuspended(`sleep(${duration})`);
      }

      const dueAt = new Date(Date.now() + parseDuration(duration));

      const span = tracer.startSpan(`step.sleep/${name}`, {
        attributes: { 'pq.run_id': runId, 'pq.workflow': def.name, 'pq.sleep_until': dueAt.toISOString() },
      });
      span.end();

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
