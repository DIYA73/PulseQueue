import { startWorker } from './worker.js';

startWorker().catch(err => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
