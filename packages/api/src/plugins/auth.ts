import type { FastifyInstance } from 'fastify';

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    // Health check is always public
    if (req.url === '/health') return;

    const apiKey = process.env.API_KEY;
    if (!apiKey) return; // auth disabled when API_KEY not set (local dev)

    if (req.headers['x-api-key'] !== apiKey) {
      return reply.code(401).send({ error: 'Invalid or missing API key' });
    }
  });
}
