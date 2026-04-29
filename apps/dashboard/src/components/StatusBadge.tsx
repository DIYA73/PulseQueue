const STYLES: Record<string, string> = {
  pending:   'text-zinc-400  bg-zinc-800',
  running:   'text-blue-300  bg-blue-900/40',
  sleeping:  'text-purple-300 bg-purple-900/40',
  completed: 'text-green-300 bg-green-900/40',
  failed:    'text-red-300   bg-red-900/40',
  cancelled: 'text-zinc-500  bg-zinc-800',
};

const DOT: Record<string, string> = {
  pending:   'bg-zinc-500',
  running:   'bg-blue-400 animate-pulse',
  sleeping:  'bg-purple-400 animate-pulse',
  completed: 'bg-green-400',
  failed:    'bg-red-400',
  cancelled: 'bg-zinc-600',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STYLES[status] ?? STYLES.pending}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[status] ?? DOT.pending}`} />
      {status}
    </span>
  );
}
