import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.mock is hoisted by Vitest — these mocks are in place before imports resolve
vi.mock('../db.js', () => ({
  getStepOutput: vi.fn(),
  getStepAttempt: vi.fn(),
  stepIsPending:  vi.fn(),
  upsertStep:     vi.fn(),
  setRunStatus:   vi.fn(),
  scheduleWake:   vi.fn(),
}));

import { createStepContext } from '../context.js';
import { StepFailed, WorkflowSuspended } from '../errors.js';
import * as db from '../db.js';

const def = {
  name:    'test-workflow',
  handler: async () => {},
  retries: { maxAttempts: 3, backoff: 'exponential' as const, initialDelay: 1_000, maxDelay: 30_000 },
};

const redis = { zadd: vi.fn().mockResolvedValue(1) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.upsertStep).mockResolvedValue(undefined);
  vi.mocked(db.setRunStatus).mockResolvedValue(undefined);
  vi.mocked(db.scheduleWake).mockResolvedValue(undefined);
  vi.mocked(db.getStepAttempt).mockResolvedValue(1);
  vi.mocked(db.stepIsPending).mockResolvedValue(false);
});

// ─── step.run() ────────────────────────────────────────────────────────────

describe('step.run() — memoization', () => {
  it('returns cached output without calling fn (replay path)', async () => {
    vi.mocked(db.getStepOutput).mockResolvedValue({ output: { id: 42 }, attempt: 1 });

    const ctx = createStepContext('run-1', def, redis);
    const fn  = vi.fn().mockResolvedValue('never called');

    const result = await ctx.run('fetch-user', fn);

    expect(result).toEqual({ id: 42 });
    expect(fn).not.toHaveBeenCalled();
    expect(db.upsertStep).not.toHaveBeenCalled();
  });

  it('executes fn and persists output on cache miss', async () => {
    vi.mocked(db.getStepOutput).mockResolvedValue(null);

    const ctx = createStepContext('run-1', def, redis);
    const fn  = vi.fn().mockResolvedValue({ name: 'Alice' });

    const result = await ctx.run('fetch-user', fn);

    expect(result).toEqual({ name: 'Alice' });
    expect(fn).toHaveBeenCalledOnce();
    expect(db.upsertStep).toHaveBeenCalledWith(
      'run-1', 'fetch-user',
      expect.objectContaining({ status: 'completed', output: { name: 'Alice' } }),
    );
  });
});

describe('step.run() — retry logic', () => {
  it('schedules retry and increments attempt when step fails with attempts remaining', async () => {
    vi.mocked(db.getStepOutput).mockResolvedValue(null);
    vi.mocked(db.getStepAttempt).mockResolvedValue(1); // attempt 1 of 3

    const ctx = createStepContext('run-1', def, redis);
    const fn  = vi.fn().mockRejectedValue(new Error('network timeout'));

    await expect(ctx.run('call-api', fn)).rejects.toBeInstanceOf(StepFailed);

    // Step recorded as failed with incremented attempt
    expect(db.upsertStep).toHaveBeenCalledWith(
      'run-1', 'call-api',
      expect.objectContaining({ status: 'failed', attempt: 2, error: 'network timeout' }),
    );
    // Retry enqueued in sorted set
    expect(redis.zadd).toHaveBeenCalledWith(
      'pq:retry',
      expect.any(Number),
      expect.stringContaining('"run_id":"run-1"'),
    );
    // Run itself NOT failed — still has retries left
    expect(db.setRunStatus).not.toHaveBeenCalled();
  });

  it('marks run as failed when max attempts exhausted', async () => {
    vi.mocked(db.getStepOutput).mockResolvedValue(null);
    vi.mocked(db.getStepAttempt).mockResolvedValue(3); // at maxAttempts (3)

    const ctx = createStepContext('run-1', def, redis);
    const fn  = vi.fn().mockRejectedValue(new Error('still broken'));

    await expect(ctx.run('call-api', fn)).rejects.toBeInstanceOf(StepFailed);

    expect(db.setRunStatus).toHaveBeenCalledWith('run-1', 'failed', 'still broken');
    expect(redis.zadd).not.toHaveBeenCalled(); // no more retries
  });
});

// ─── step.sleep() ──────────────────────────────────────────────────────────

describe('step.sleep()', () => {
  it('returns immediately if sleep step already completed (resume path)', async () => {
    vi.mocked(db.getStepOutput).mockResolvedValue({ output: null, attempt: 1 });

    const ctx = createStepContext('run-1', def, redis);
    await expect(ctx.sleep('wait-24h', '24h')).resolves.toBeUndefined();

    expect(db.scheduleWake).not.toHaveBeenCalled();
  });

  it('inserts scheduled job and throws WorkflowSuspended on first hit', async () => {
    vi.mocked(db.getStepOutput).mockResolvedValue(null);
    vi.mocked(db.stepIsPending).mockResolvedValue(false);

    const ctx = createStepContext('run-1', def, redis);
    await expect(ctx.sleep('wait-1h', '1h')).rejects.toBeInstanceOf(WorkflowSuspended);

    expect(db.scheduleWake).toHaveBeenCalledWith(
      'run-1', 'test-workflow', 'wait-1h',
      expect.any(Date),
    );
    expect(db.setRunStatus).toHaveBeenCalledWith('run-1', 'sleeping');
  });

  it('re-suspends without re-inserting if already pending (duplicate execution guard)', async () => {
    vi.mocked(db.getStepOutput).mockResolvedValue(null);
    vi.mocked(db.stepIsPending).mockResolvedValue(true); // already scheduled

    const ctx = createStepContext('run-1', def, redis);
    await expect(ctx.sleep('wait-1h', '1h')).rejects.toBeInstanceOf(WorkflowSuspended);

    expect(db.scheduleWake).not.toHaveBeenCalled(); // no duplicate insert
  });
});
