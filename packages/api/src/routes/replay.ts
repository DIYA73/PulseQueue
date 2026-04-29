import type { FastifyInstance } from 'fastify';
import { pool } from '@pulsequeue/db';
import { redis } from '../redis.js';

export async function replayRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/runs/:id/replay
   *
   * Body (optional): { "from_step": "step-name" }
   *
   * - No from_step  → full replay: re-execute every step from scratch
   * - from_step     → partial replay: copy all completed steps that ran
   *                   BEFORE the target step, then re-execute from there
   *
   * Returns the new run's id. The original run is untouched.
   */
  app.post<{
    Params: { id: string };
    Body: { from_step?: string };
  }>('/api/runs/:id/replay', async (req, reply) => {
    const { id: originalRunId } = req.params;
    const { from_step: fromStep } = req.body ?? {};

    // Load original run
    const { rows: runRows } = await pool.query(
      `SELECT id, workflow, status, trigger_data FROM runs WHERE id = $1`,
      [originalRunId],
    );
    if (!runRows[0]) return reply.code(404).send({ error: 'Run not found' });
    const original = runRows[0];

    // Validate from_step exists in the original run
    if (fromStep) {
      const { rows: check } = await pool.query(
        `SELECT 1 FROM steps WHERE run_id = $1 AND name = $2`,
        [originalRunId, fromStep],
      );
      if (!check[0]) {
        return reply.code(400).send({
          error: `Step "${fromStep}" was not found in run ${originalRunId}`,
        });
      }
    }

    // Create the replay run linked to the original
    const { rows: newRunRows } = await pool.query(
      `INSERT INTO runs (workflow, status, trigger_data, parent_run_id)
       VALUES ($1, 'pending', $2, $3)
       RETURNING id`,
      [original.workflow, JSON.stringify(original.trigger_data), originalRunId],
    );
    const newRunId = newRunRows[0].id as string;

    if (fromStep) {
      // Find when the replay step started — used as the cutoff for copying
      const { rows: targetRows } = await pool.query(
        `SELECT started_at FROM steps WHERE run_id = $1 AND name = $2`,
        [originalRunId, fromStep],
      );
      const cutoff = targetRows[0]?.started_at;

      if (cutoff) {
        // Copy every completed step that started before the replay step
        await pool.query(
          `INSERT INTO steps
             (run_id, name, status, attempt, input, output, error, started_at, completed_at)
           SELECT $1, name, status, attempt, input, output, error, started_at, completed_at
           FROM   steps
           WHERE  run_id     = $2
             AND  status     = 'completed'
             AND  started_at < $3`,
          [newRunId, originalRunId, cutoff],
        );
      }
      // cutoff is null when the step was recorded but never started —
      // copy nothing and re-execute the whole workflow
    }
    // No from_step → full replay, copy nothing

    // Enqueue the replay run
    await redis.xadd(
      'pq:jobs', '*',
      'payload', JSON.stringify({ run_id: newRunId, workflow: original.workflow }),
    );

    return reply.code(201).send({
      run_id: newRunId,
      original_run_id: originalRunId,
      replayed_from: fromStep ?? null,
    });
  });

  /**
   * POST /api/runs/:id/cancel
   * Cancels a run that hasn't finished yet (pending / running / sleeping).
   */
  app.post<{ Params: { id: string } }>('/api/runs/:id/cancel', async (req, reply) => {
    const { rowCount } = await pool.query(
      `UPDATE runs
       SET status = 'cancelled', completed_at = now()
       WHERE id = $1
         AND status IN ('pending', 'running', 'sleeping')`,
      [req.params.id],
    );
    if (!rowCount) {
      return reply.code(404).send({ error: 'Run not found or already finished' });
    }
    return { cancelled: true };
  });
}
