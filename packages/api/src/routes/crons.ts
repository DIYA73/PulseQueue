import type { FastifyInstance } from 'fastify';
import { pool } from '@pulsequeue/db';
import cronParser from 'cron-parser';

function nextOccurrence(expr: string): Date {
  return cronParser.parseExpression(expr).next().toDate();
}

export async function cronRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { name: string; workflow: string; cron: string; payload?: unknown };
  }>('/api/crons', async (req, reply) => {
    const { name, workflow, cron, payload = {} } = req.body;

    if (!name || !workflow || !cron) {
      return reply.code(400).send({ error: 'name, workflow, and cron are required' });
    }

    let nextRunAt: Date;
    try {
      nextRunAt = nextOccurrence(cron);
    } catch {
      return reply.code(400).send({ error: `Invalid cron expression: ${cron}` });
    }

    const { rows } = await pool.query(
      `INSERT INTO cron_jobs (name, workflow, cron_expr, payload, next_run_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET
         workflow    = EXCLUDED.workflow,
         cron_expr   = EXCLUDED.cron_expr,
         payload     = EXCLUDED.payload,
         next_run_at = EXCLUDED.next_run_at,
         enabled     = true
       RETURNING *`,
      [name, workflow, cron, JSON.stringify(payload), nextRunAt],
    );

    return reply.code(201).send({ cron: rows[0] });
  });

  app.get('/api/crons', async () => {
    const { rows } = await pool.query(
      `SELECT * FROM cron_jobs ORDER BY name`,
    );
    return { crons: rows };
  });

  app.delete<{ Params: { name: string } }>('/api/crons/:name', async (req, reply) => {
    const { rowCount } = await pool.query(
      `DELETE FROM cron_jobs WHERE name = $1`,
      [req.params.name],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Cron not found' });
    return reply.code(204).send();
  });

  app.patch<{
    Params: { name: string };
    Body: { enabled: boolean };
  }>('/api/crons/:name', async (req, reply) => {
    const { rows } = await pool.query(
      `UPDATE cron_jobs SET enabled = $1 WHERE name = $2 RETURNING *`,
      [req.body.enabled, req.params.name],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Cron not found' });
    return { cron: rows[0] };
  });
}
