/**
 * Usage:
 *   pnpm --filter @pulsequeue/example trigger
 *   pnpm --filter @pulsequeue/example trigger payment-retry 49.99
 */
const workflow = process.argv[2] ?? 'user-onboarding';
const amount   = parseFloat(process.argv[3] ?? '29.99');
const userId   = 'usr_' + Math.random().toString(36).slice(2, 8);

const payload =
  workflow === 'payment-retry'
    ? { userId, amount }
    : { userId };

const res = await fetch('http://localhost:3001/api/trigger', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ workflow, payload }),
});

if (!res.ok) {
  console.error('API error:', await res.text());
  process.exit(1);
}

const { run_id } = await res.json() as { run_id: string };

console.log('');
console.log(`✓ Triggered: ${workflow}`);
console.log(`  Run ID  : ${run_id}`);
console.log(`  Payload : ${JSON.stringify(payload)}`);
console.log(`  Dashboard → http://localhost:3000/runs/${run_id}`);
console.log('');
