import Fastify from 'fastify';
import { authPlugin }    from './plugins/auth.js';
import { triggerRoutes } from './routes/trigger.js';
import { runRoutes }     from './routes/runs.js';
import { cronRoutes }    from './routes/crons.js';
import { replayRoutes }  from './routes/replay.js';

const app = Fastify({ logger: true });

await app.register(authPlugin);

app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

await app.register(triggerRoutes);
await app.register(runRoutes);
await app.register(cronRoutes);
await app.register(replayRoutes);

const PORT = Number(process.env.API_PORT) || 3001;
app.listen({ port: PORT, host: '0.0.0.0' });
