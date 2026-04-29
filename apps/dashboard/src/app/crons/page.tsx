'use client';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { fetcher, toggleCron, deleteCron, ago, type CronJob } from '@/lib/api';

export default function CronsPage() {
  const { data, mutate, isLoading } = useSWR<{ crons: CronJob[] }>(
    '/api/crons',
    fetcher,
    { refreshInterval: 10_000 },
  );

  async function handleToggle(name: string, enabled: boolean) {
    await toggleCron(name, !enabled);
    mutate();
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete cron "${name}"?`)) return;
    await deleteCron(name);
    mutate();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Cron Jobs</h1>
        {data && (
          <span className="text-sm text-zinc-500">{data.crons.length} registered</span>
        )}
      </div>

      {isLoading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : !data?.crons.length ? (
        <div className="text-zinc-500 text-sm">
          No cron jobs registered.{' '}
          <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">
            POST /api/crons
          </code>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900">
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Workflow</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Schedule</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Next Run</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Last Run</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {data.crons.map(cron => (
                <tr key={cron.id} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">
                  <td className="px-4 py-3 font-mono text-zinc-200 text-xs">{cron.name}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{cron.workflow}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono">
                      {cron.cron_expr}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {ago(cron.next_run_at)}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {cron.last_run_at ? ago(cron.last_run_at) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(cron.name, cron.enabled)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                        cron.enabled
                          ? 'bg-green-900/40 text-green-300 hover:bg-red-900/40 hover:text-red-300'
                          : 'bg-zinc-800 text-zinc-500 hover:bg-green-900/40 hover:text-green-300'
                      }`}
                    >
                      {cron.enabled ? 'enabled' : 'disabled'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(cron.name)}
                      className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
