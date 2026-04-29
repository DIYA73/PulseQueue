import type { Metadata } from 'next';
import NavLink from '@/components/NavLink';
import './globals.css';

export const metadata: Metadata = {
  title: 'PulseQueue',
  description: 'Durable Workflow Engine Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen flex antialiased">
        <aside className="w-52 shrink-0 min-h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col">
          <div className="px-4 py-4 border-b border-zinc-800">
            <span className="font-bold text-base tracking-tight">
              <span className="text-blue-400">Pulse</span>
              <span className="text-white">Queue</span>
            </span>
          </div>
          <nav className="p-2 flex flex-col gap-0.5">
            <NavLink href="/runs">Runs</NavLink>
            <NavLink href="/crons">Cron Jobs</NavLink>
          </nav>
        </aside>
        <main className="flex-1 overflow-auto">{children}</main>
      </body>
    </html>
  );
}
