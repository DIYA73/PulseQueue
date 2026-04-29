'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { fetcher, runsKey, ago, duration, shortId, ACTIVE_STATUSES, type Run } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';

const FILTERS = ['all', 'running', 'sleeping', 'failed', 'completed', 'cancelled'];

export default function RunsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const status = searchParams.get('status') ?? 'all';

  const { data, isLoading } = useSWR<{ runs: Run[] }>(runsKey(status), fetcher, {
    refreshInterval: d =>
      d?.runs.some(r => ACTIVE_STATUSES.has(r.status)) ? 2000 : 5000,
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Runs</h1>
        {data && (
          <span className="text-sm text-zinc-500">{data.runs.length} results</span>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-5">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => router.push(f === 'all' ? '/runs' : `/runs?status=${f}`)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              status === f
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : !data?.runs.length ? (
        <div className="text-zinc-500 text-sm">No runs found.</div>
      ) : (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900">
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Workflow</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Run ID</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Started</th>
                <th className="text-left px-4 py-3 text-zinc-400 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {data.runs.map(run => (
                <tr
                  key={run.id}
                  onClick={() => router.push(`/runs/${run.id}`)}
                  className="bg-zinc-950 hover:bg-zinc-900 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-200">{run.workflow}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/runs/${run.id}`}
                      onClick={e => e.stopPropagation()}
                      className="font-mono text-zinc-400 hover:text-blue-400 text-xs"
                    >
                      {shortId(run.id)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{ago(run.started_at)}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {duration(run.started_at, run.completed_at)}
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
