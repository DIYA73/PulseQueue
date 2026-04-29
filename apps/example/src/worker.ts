import { register, startWorker } from '@pulsequeue/worker';
import { onboardingWorkflow }   from './workflows/user-onboarding.js';
import { paymentRetryWorkflow } from './workflows/payment-retry.js';

register(onboardingWorkflow);
register(paymentRetryWorkflow);

console.log('[example-worker] Registered workflows:');
console.log('  • user-onboarding  (sleep + parallel steps)');
console.log('  • payment-retry    (exponential backoff demo)');
console.log('');

startWorker().catch(err => {
  console.error('[example-worker] fatal:', err);
  process.exit(1);
});
