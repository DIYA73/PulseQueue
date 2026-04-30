let shuttingDown = false;
let activeJob: Promise<void> | null = null;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function setActiveJob(p: Promise<void> | null): void {
  activeJob = p;
}

export function registerShutdownHandler(): void {
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received — finishing current job then exiting`);
    if (activeJob) await activeJob;
    console.log('[worker] clean shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}
