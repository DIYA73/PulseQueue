import type Redis from 'ioredis';

const DLQ_STREAM = 'pq:dlq';

export async function publishToDLQ(
  redis: Redis,
  runId: string,
  workflow: string,
  error: string,
): Promise<void> {
  await redis.xadd(
    DLQ_STREAM, '*',
    'run_id',   runId,
    'workflow', workflow,
    'error',    error,
    'failed_at', new Date().toISOString(),
  );
}

export async function startDLQWatcher(redis: Redis): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('[dlq] SLACK_WEBHOOK_URL not set — DLQ alerts disabled');
    return;
  }

  let lastId = '$';
  console.log('[dlq] watcher started — alerting to Slack');

  while (true) {
    const result = await redis.xread(
      'COUNT', '10',
      'BLOCK', '5000',
      'STREAMS', DLQ_STREAM, lastId,
    ) as [string, [string, string[]][]][] | null;

    if (!result) continue;

    const [, messages] = result[0];
    for (const [msgId, fields] of messages) {
      const get = (k: string) => fields[fields.indexOf(k) + 1] ?? '';
      const runId    = get('run_id');
      const workflow = get('workflow');
      const error    = get('error');

      console.error(`[dlq] permanent failure: run=${runId} workflow=${workflow}`);

      await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `❌ *PulseQueue* — workflow \`${workflow}\` failed permanently\n*Run:* \`${runId}\`\n*Error:* ${error}`,
        }),
      }).catch(() => {}); // don't crash the watcher on Slack errors

      lastId = msgId;
    }
  }
}
