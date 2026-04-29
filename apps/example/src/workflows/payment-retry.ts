import { defineWorkflow } from '@pulsequeue/core';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// In-process call counter — simulates a flaky payment gateway.
// Fails the first 2 attempts, succeeds on the 3rd.
const callCounts = new Map<string, number>();

/**
 * Payment flow demonstrating:
 *   automatic retry with exponential backoff
 *   step memoization (completed steps are never re-executed on retry)
 */
export const paymentRetryWorkflow = defineWorkflow(
  'payment-retry',
  async (step, payload: { userId: string; amount: number }) => {

    const charge = await step.run('charge-card', async () => {
      const n = (callCounts.get(payload.userId) ?? 0) + 1;
      callCounts.set(payload.userId, n);
      await delay(200);

      if (n < 3) {
        console.log(`  [payment] Attempt ${n}: gateway timeout (simulated)`);
        throw new Error(`Payment gateway timeout — attempt ${n}/3`);
      }

      callCounts.delete(payload.userId);
      const txnId = 'txn_' + Math.random().toString(36).slice(2, 10);
      console.log(`  [payment] Attempt ${n}: charged $${payload.amount} ✓ → ${txnId}`);
      return { txnId, amount: payload.amount };
    });

    await step.run('send-receipt', async () => {
      await delay(100);
      console.log(`  [receipt] Receipt sent for ${charge.txnId}`);
      return { sent: true, txnId: charge.txnId };
    });
  },
  {
    retries: {
      maxAttempts: 4,
      backoff:     'exponential',
      initialDelay: 3_000,
      maxDelay:    15_000,
    },
  },
);
