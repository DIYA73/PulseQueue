import { startScheduler } from './scheduler.js';

startScheduler().catch(err => {
  console.error('[scheduler] fatal:', err);
  process.exit(1);
});
