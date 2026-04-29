import type { FastifyInstance } from 'fastify';
import { pool } from '@pulsequeue/db';
import { redis } from '../redis.js';

export async function triggerRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { workflow: string; payload?: unknown };
  }>('/api/trigger', async (req, reply) => {
    const { workflow, payload = {} } = req.body;

    if (!workflow || typeof workflow !== 'string') {
      return reply.code(400).send({ error: 'workflow is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO runs (workflow, status, trigger_data)
       VALUES ($1, 'pending', $2)
       RETURNING id`,
      [workflow, JSON.stringify(payload)],
    );
    const runId = rows[0].id as string;

    await redis.xadd(
      'pq:jobs', '*',
      'payload', JSON.stringify({ run_id: runId, workflow }),
    );

    return reply.code(201).send({ run_id: runId });
  });
}
