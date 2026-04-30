import { initTelemetry } from '@pulsequeue/telemetry';
import { startWorker }   from './worker.js';

initTelemetry('pulsequeue-worker');

startWorker().catch(err => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
