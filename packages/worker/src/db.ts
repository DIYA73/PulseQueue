import { pool } from '@pulsequeue/db';
import type { StepStatus, RunStatus } from '@pulsequeue/db';

export async function getStepOutput(
  runId: string,
  stepName: string,
): Promise<{ output: unknown; attempt: number } | null> {
  const { rows } = await pool.query(
    `SELECT output, attempt FROM steps
     WHERE run_id = $1 AND name = $2 AND status = 'completed'`,
    [runId, stepName],
  );
  return rows[0] ?? null;
}

export async function getStepAttempt(runId: string, stepName: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT attempt FROM steps WHERE run_id = $1 AND name = $2`,
    [runId, stepName],
  );
  return rows[0]?.attempt ?? 1;
}

export async function stepIsPending(runId: string, stepName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM steps WHERE run_id = $1 AND name = $2 AND status = 'pending'`,
    [runId, stepName],
  );
  return rows.length > 0;
}

export async function upsertStep(
  runId: string,
  stepName: string,
  fields: {
    status: StepStatus;
    attempt?: number;
    output?: unknown;
    error?: string;
    started_at?: Date;
    completed_at?: Date;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO steps (run_id, name, status, attempt, output, error, started_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (run_id, name) DO UPDATE SET
       status       = EXCLUDED.status,
       attempt      = COALESCE(EXCLUDED.attempt,      steps.attempt),
       output       = COALESCE(EXCLUDED.output,       steps.output),
       error        = EXCLUDED.error,
       started_at   = COALESCE(EXCLUDED.started_at,   steps.started_at),
       completed_at = EXCLUDED.completed_at`,
    [
      runId,
      stepName,
      fields.status,
      fields.attempt ?? null,
      fields.output !== undefined ? JSON.stringify(fields.output) : null,
      fields.error ?? null,
      fields.started_at ?? null,
      fields.completed_at ?? null,
    ],
  );
}

export async function setRunStatus(
  runId: string,
  status: RunStatus,
  error?: string,
): Promise<void> {
  await pool.query(
    `UPDATE runs
     SET status = $1,
         error  = $2,
         completed_at = CASE
           WHEN $1 IN ('completed','failed','cancelled') THEN now()
           ELSE completed_at
         END
     WHERE id = $3`,
    [status, error ?? null, runId],
  );
}

export async function getRunPayload(runId: string): Promise<unknown> {
  const { rows } = await pool.query(
    `SELECT trigger_data FROM runs WHERE id = $1`,
    [runId],
  );
  return rows[0]?.trigger_data ?? {};
}

export async function getRunStatus(runId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT status FROM runs WHERE id = $1`,
    [runId],
  );
  return rows[0]?.status ?? null;
}

export async function scheduleWake(
  runId: string,
  workflowName: string,
  stepName: string,
  dueAt: Date,
): Promise<void> {
  await pool.query(
    `INSERT INTO scheduled_jobs (type, run_id, workflow, step_name, due_at)
     VALUES ('sleep', $1, $2, $3, $4)`,
    [runId, workflowName, stepName, dueAt],
  );
}
