import { pool } from '@pulsequeue/db';
import type { ScheduledJob, CronJob } from '@pulsequeue/db';

// Sleep jobs ----------------------------------------------------------------

export async function drainDueSleepJobs(limit = 50): Promise<ScheduledJob[]> {
  const { rows } = await pool.query(
    `DELETE FROM scheduled_jobs
     WHERE id IN (
       SELECT id FROM scheduled_jobs
       WHERE type = 'sleep' AND due_at <= now()
       ORDER BY due_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [limit],
  );
  return rows;
}

export async function completeSleepStep(runId: string, stepName: string): Promise<void> {
  await pool.query(
    `INSERT INTO steps (run_id, name, status, completed_at)
     VALUES ($1, $2, 'completed', now())
     ON CONFLICT (run_id, name) DO UPDATE SET
       status       = 'completed',
       completed_at = now()`,
    [runId, stepName],
  );
}

export async function setRunRunning(runId: string): Promise<void> {
  await pool.query(
    `UPDATE runs SET status = 'running' WHERE id = $1 AND status = 'sleeping'`,
    [runId],
  );
}

// Cron jobs -----------------------------------------------------------------

// Atomically claim due cron jobs and bump their next_run_at in one transaction
export async function claimDueCronJobs(
  calcNext: (expr: string) => Date,
  limit = 20,
): Promise<CronJob[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: jobs } = await client.query<CronJob>(
      `SELECT * FROM cron_jobs
       WHERE enabled = true AND next_run_at <= now()
       ORDER BY next_run_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit],
    );

    for (const job of jobs) {
      const next = calcNext(job.cron_expr);
      await client.query(
        `UPDATE cron_jobs SET last_run_at = now(), next_run_at = $1 WHERE id = $2`,
        [next, job.id],
      );
    }

    await client.query('COMMIT');
    return jobs;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createRun(workflow: string, payload: unknown): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO runs (workflow, status, trigger_data)
     VALUES ($1, 'pending', $2)
     RETURNING id`,
    [workflow, JSON.stringify(payload ?? {})],
  );
  return rows[0].id as string;
}
