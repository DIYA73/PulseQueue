export interface Run {
  id: string;
  workflow: string;
  status: string;
  trigger_data: unknown;
  parent_run_id: string | null;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface Step {
  id: string;
  run_id: string;
  name: string;
  status: string;
  attempt: number;
  input: unknown;
  output: unknown;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface CronJob {
  id: string;
  name: string;
  workflow: string;
  cron_expr: string;
  payload: unknown;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
  created_at: string;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());
export { fetcher };

export function runsKey(status?: string) {
  return status && status !== 'all' ? `/api/runs?status=${status}&limit=50` : '/api/runs?limit=50';
}

export async function replayRun(id: string, fromStep?: string) {
  const res = await fetch(`/api/runs/${id}/replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_step: fromStep }),
  });
  return res.json() as Promise<{ run_id: string; original_run_id: string }>;
}

export async function cancelRun(id: string) {
  const res = await fetch(`/api/runs/${id}/cancel`, { method: 'POST' });
  return res.json();
}

export async function toggleCron(name: string, enabled: boolean) {
  await fetch(`/api/crons/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export async function deleteCron(name: string) {
  await fetch(`/api/crons/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

// Formatting helpers
export function ago(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function duration(start: string, end?: string | null): string {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export const ACTIVE_STATUSES = new Set(['pending', 'running', 'sleeping']);
