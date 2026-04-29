import { defineWorkflow } from '@pulsequeue/core';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * User onboarding flow demonstrating:
 *   step.run()      — individual durable steps
 *   step.parallel() — fan-out / fan-in
 *   step.sleep()    — workflow suspension (15s stands in for 3 days)
 */
export const onboardingWorkflow = defineWorkflow(
  'user-onboarding',
  async (step, payload: { userId: string }) => {

    // ── Step 1: fetch user profile ─────────────────────────────────
    const user = await step.run('fetch-user', async () => {
      await delay(80);
      return {
        id:    payload.userId,
        email: `${payload.userId}@example.com`,
        name:  'Alice',
      };
    });

    console.log(`[onboarding] Starting for ${user.name} <${user.email}>`);

    // ── Step 2: fan-out — create account + send welcome email ──────
    const [account, email] = await step.parallel([
      () => step.run('create-account', async () => {
        await delay(120);
        const id = 'acc_' + Math.random().toString(36).slice(2, 8);
        console.log(`  [account] Created ${id}`);
        return { accountId: id, createdAt: new Date().toISOString() };
      }),
      () => step.run('send-welcome-email', async () => {
        await delay(90);
        const msgId = 'msg_' + Math.random().toString(36).slice(2, 8);
        console.log(`  [email]   Welcome email → ${user.email} (${msgId})`);
        return { messageId: msgId, sent: true };
      }),
    ]);

    console.log(`[onboarding] Account ${account.accountId} ready | email ${email.messageId} queued`);

    // ── Step 3: suspend for 15s (simulates 3-day delay) ───────────
    console.log('[onboarding] Sleeping 15s (simulates 3-day follow-up window)…');
    await step.sleep('wait-3-days', '15s');

    // ── Step 4: follow-up nudge ────────────────────────────────────
    const nudge = await step.run('send-followup-email', async () => {
      await delay(80);
      console.log(`  [email]   Follow-up sent to ${user.email}`);
      return { subject: "How are you getting on?", sent: true };
    });

    // ── Step 5: update CRM ─────────────────────────────────────────
    await step.run('update-crm', async () => {
      await delay(60);
      console.log(`  [crm]     ${user.name} marked as onboarded`);
      return { status: 'onboarded', followUpSent: nudge.sent };
    });

    console.log(`[onboarding] ✓ ${user.name} fully onboarded`);
  },
);
