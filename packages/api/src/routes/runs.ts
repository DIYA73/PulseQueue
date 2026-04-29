import type { FastifyInstance } from 'fastify';
import { pool } from '@pulsequeue/db';

export async function runRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/runs', async req => {
    const { workflow, status, limit = '20' } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (workflow) {
      params.push(workflow);
      conditions.push(`r.workflow = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(Math.min(Number(limit) || 20, 100));

    const { rows } = await pool.query(
      `SELECT id, workflow, status, trigger_data, started_at, completed_at, error
       FROM runs r
       ${where}
       ORDER BY started_at DESC
       LIMIT $${params.length}`,
      params,
    );

    return { runs: rows };
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id', async (req, reply) => {
    const { id } = req.params;

    const { rows: runRows } = await pool.query(
      `SELECT id, workflow, status, trigger_data, started_at, completed_at, error
       FROM runs WHERE id = $1`,
      [id],
    );

    if (!runRows[0]) return reply.code(404).send({ error: 'Run not found' });

    const { rows: stepRows } = await pool.query(
      `SELECT id, name, status, attempt, input, output, error, started_at, completed_at
       FROM steps
       WHERE run_id = $1
       ORDER BY started_at ASC NULLS LAST, id ASC`,
      [id],
    );

    return { run: runRows[0], steps: stepRows };
  });
}
