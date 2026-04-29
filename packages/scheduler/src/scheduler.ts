import Redis from 'ioredis';
import cronParser from 'cron-parser';
import {
  drainDueSleepJobs,
  completeSleepStep,
  setRunRunning,
  claimDueCronJobs,
  createRun,
} from './db.js';

const STREAM = 'pq:jobs';

function nextOccurrence(expr: string): Date {
  return cronParser.parseExpression(expr).next().toDate();
}

export async function startScheduler(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

  console.log('[scheduler] ready — polling every 1s');

  while (true) {
    try {
      await processSleepJobs(redis);
      await processCronJobs(redis);
    } catch (err) {
      console.error('[scheduler] poll error:', err);
    }

    await tick(1_000);
  }
}

async function processSleepJobs(redis: Redis): Promise<void> {
  const jobs = await drainDueSleepJobs();

  for (const job of jobs) {
    if (!job.run_id || !job.step_name || !job.workflow) continue;

    await completeSleepStep(job.run_id, job.step_name);
    await setRunRunning(job.run_id);

    await redis.xadd(
      STREAM, '*',
      'payload', JSON.stringify({ run_id: job.run_id, workflow: job.workflow }),
    );

    console.log(`[scheduler] resumed run ${job.run_id} (step: ${job.step_name})`);
  }
}

async function processCronJobs(redis: Redis): Promise<void> {
  const jobs = await claimDueCronJobs(nextOccurrence);

  for (const job of jobs) {
    const runId = await createRun(job.workflow, job.payload);

    await redis.xadd(
      STREAM, '*',
      'payload', JSON.stringify({ run_id: runId, workflow: job.workflow }),
    );

    console.log(
      `[scheduler] cron "${job.name}" fired → run ${runId}` +
      ` (next: ${nextOccurrence(job.cron_expr).toISOString()})`,
    );
  }
}

function tick(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
