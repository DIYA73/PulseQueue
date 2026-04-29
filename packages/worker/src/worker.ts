import Redis from 'ioredis';
import { lookup } from './registry.js';
import { createStepContext } from './context.js';
import { setRunStatus, getRunPayload, getRunStatus } from './db.js';
import { StepFailed, WorkflowSuspended } from './errors.js';

const STREAM = 'pq:jobs';
const GROUP = 'workers';
const CONSUMER = `worker-${process.pid}`;

type StreamMessage = [id: string, fields: string[]];
type StreamResult = [streamName: string, messages: StreamMessage[]];

export async function startWorker(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

  try {
    await redis.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM');
  } catch (err: unknown) {
    if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err;
  }

  console.log(`[worker] ${CONSUMER} ready — listening on ${STREAM}`);

  while (true) {
    await drainRetryQueue(redis);

    const result = (await redis.xreadgroup(
      'GROUP', GROUP, CONSUMER,
      'COUNT', '1',
      'BLOCK', '2000',
      'STREAMS', STREAM, '>',
    )) as StreamResult[] | null;

    if (!result) continue;

    const [, messages] = result[0];

    for (const [msgId, fields] of messages) {
      const payloadStr = fields[fields.indexOf('payload') + 1];

      let job: { run_id: string; workflow: string } | null = null;
      try {
        job = JSON.parse(payloadStr);
      } catch {
        console.error('[worker] bad message payload, discarding');
        await redis.xack(STREAM, GROUP, msgId);
        continue;
      }

      if (!job) continue;
      await processJob(job.run_id, job.workflow, redis);
      await redis.xack(STREAM, GROUP, msgId);
    }
  }
}

async function processJob(runId: string, workflowName: string, redis: Redis): Promise<void> {
  // Skip runs that finished or were cancelled externally
  const currentStatus = await getRunStatus(runId);
  if (currentStatus === 'completed' || currentStatus === 'cancelled') {
    console.log(`[worker] skipping ${runId} (status: ${currentStatus})`);
    return;
  }

  const def = lookup(workflowName);
  if (!def) {
    console.error(`[worker] unknown workflow "${workflowName}"`);
    await setRunStatus(runId, 'failed', `No handler registered for "${workflowName}"`);
    return;
  }

  await setRunStatus(runId, 'running');

  const payload = await getRunPayload(runId);
  const ctx = createStepContext(runId, def, redis);

  try {
    await def.handler(ctx, payload);
    await setRunStatus(runId, 'completed');
    console.log(`[worker] run ${runId} completed`);
  } catch (err) {
    if (err instanceof WorkflowSuspended) {
      // Normal — run is sleeping, scheduler will re-enqueue it
      console.log(`[worker] run ${runId} suspended: ${err.reason}`);
    } else if (!(err instanceof StepFailed)) {
      const message = err instanceof Error ? err.message : String(err);
      await setRunStatus(runId, 'failed', message);
      console.error(`[worker] run ${runId} failed:`, message);
    }
    // StepFailed: already handled in context.ts (retry scheduled or run marked failed)
  }
}

async function drainRetryQueue(redis: Redis): Promise<void> {
  const due = await redis.zrangebyscore('pq:retry', 0, Date.now(), 'LIMIT', 0, 20);
  for (const item of due) {
    await redis.xadd(STREAM, '*', 'payload', item);
    await redis.zrem('pq:retry', item);
  }
}
