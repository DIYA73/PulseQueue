'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import {
  fetcher,
  replayRun,
  cancelRun,
  ago,
  duration,
  shortId,
  ACTIVE_STATUSES,
  type Run,
  type Step,
} from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, mutate, isLoading } = useSWR<{ run: Run; steps: Step[] }>(
    `/api/runs/${id}`,
    fetcher,
    {
      refreshInterval: d =>
        d?.run && ACTIVE_STATUSES.has(d.run.status) ? 2000 : 0,
    },
  );

  async function handleReplay(fromStep?: string) {
    const result = await replayRun(id, fromStep);
    router.push(`/runs/${result.run_id}`);
  }

  async function handleCancel() {
    await cancelRun(id);
    mutate();
  }

  if (isLoading) return <div className="p-6 text-zinc-500 text-sm">Loading…</div>;
  if (!data?.run) return <div className="p-6 text-zinc-500 text-sm">Run not found.</div>;

  const { run, steps } = data;
  const isActive = ACTIVE_STATUSES.has(run.status);

  return (
    <div className="p-6 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-zinc-500 mb-5">
        <Link href="/runs" className="hover:text-zinc-300">Runs</Link>
        <span>/</span>
        <span className="font-mono text-zinc-400">{run.workflow}</span>
        <span>/</span>
        <span className="font-mono text-zinc-600">{shortId(run.id)}</span>
      </div>

      {/* Run header */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <StatusBadge status={run.status} />
              <h1 className="font-mono font-semibold text-white text-base">{run.workflow}</h1>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span>Started {ago(run.started_at)}</span>
              <span>Duration: {duration(run.started_at, run.completed_at)}</span>
              <span className="font-mono text-zinc-600">{run.id}</span>
            </div>
            {run.parent_run_id && (
              <div className="text-xs text-zinc-500">
                Replay of{' '}
                <Link href={`/runs/${run.parent_run_id}`} className="text-blue-400 hover:underline font-mono">
                  {shortId(run.parent_run_id)}
                </Link>
              </div>
            )}
            {run.error && (
              <p className="text-red-400 text-xs font-mono mt-1">{run.error}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isActive && (
              <button
                onClick={handleCancel}
                className="text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => handleReplay()}
              className="text-xs px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              ↺ Full replay
            </button>
          </div>
        </div>
      </div>

      {/* Step timeline */}
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        Steps · {steps.length}
      </h2>

      {steps.length === 0 ? (
        <p className="text-zinc-600 text-sm">No steps recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {steps.map(step => (
            <StepCard key={step.id} step={step} onReplay={s => handleReplay(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepCard({
  step,
  onReplay,
}: {
  step: Step;
  onReplay: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = step.output != null || step.error;

  const LEFT_COLOR: Record<string, string> = {
    completed: 'border-l-green-500',
    failed:    'border-l-red-500',
    running:   'border-l-blue-500',
    pending:   'border-l-zinc-600',
    sleeping:  'border-l-purple-500',
  };

  return (
    <div
      className={`rounded-lg border border-zinc-800 bg-zinc-900 border-l-2 overflow-hidden ${LEFT_COLOR[step.status] ?? LEFT_COLOR.pending}`}
    >
      <div
        className={`flex items-center gap-3 px-4 py-3 ${hasDetail ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
        onClick={() => hasDetail && setOpen(o => !o)}
      >
        <StatusBadge status={step.status} />
        <span className="font-mono text-sm text-zinc-100 flex-1">{step.name}</span>
        {step.attempt > 1 && (
          <span className="text-xs bg-orange-900/40 text-orange-400 px-2 py-0.5 rounded-full">
            attempt {step.attempt}
          </span>
        )}
        {step.started_at && (
          <span className="text-xs text-zinc-600">
            {duration(step.started_at, step.completed_at)}
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onReplay(step.name); }}
          className="text-xs text-zinc-600 hover:text-blue-400 px-2 py-1 rounded hover:bg-zinc-800 transition-colors ml-1"
          title="Replay from this step"
        >
          ↺
        </button>
      </div>

      {open && hasDetail && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
          {step.error && (
            <pre className="text-xs font-mono text-red-400 bg-red-950/20 rounded p-3 whitespace-pre-wrap">
              {step.error}
            </pre>
          )}
          {step.output != null && (
            <pre className="text-xs font-mono text-zinc-300 bg-zinc-950 rounded p-3 overflow-auto max-h-56">
              {JSON.stringify(step.output, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
