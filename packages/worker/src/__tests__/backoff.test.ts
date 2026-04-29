import { describe, it, expect } from 'vitest';
import { calcDelay } from '../backoff.js';

const policy = (overrides = {}) => ({
  maxAttempts:  5,
  backoff:      'exponential' as const,
  initialDelay: 1_000,
  maxDelay:     30_000,
  ...overrides,
});

describe('calcDelay — exponential backoff', () => {
  it('attempt 1 returns initialDelay', () => {
    expect(calcDelay(1, policy())).toBe(1_000);
  });

  it('doubles on each successive attempt', () => {
    expect(calcDelay(2, policy())).toBe(2_000);
    expect(calcDelay(3, policy())).toBe(4_000);
    expect(calcDelay(4, policy())).toBe(8_000);
    expect(calcDelay(5, policy())).toBe(16_000);
  });

  it('caps at maxDelay', () => {
    const p = policy({ maxDelay: 5_000 });
    expect(calcDelay(4, p)).toBe(5_000);
    expect(calcDelay(5, p)).toBe(5_000);
    expect(calcDelay(10, p)).toBe(5_000);
  });

  it('never returns more than maxDelay regardless of attempt', () => {
    const p = policy({ initialDelay: 1_000, maxDelay: 3_000 });
    for (let i = 1; i <= 20; i++) {
      expect(calcDelay(i, p)).toBeLessThanOrEqual(3_000);
    }
  });
});

describe('calcDelay — linear backoff', () => {
  it('multiplies initialDelay by attempt number', () => {
    const p = policy({ backoff: 'linear' });
    expect(calcDelay(1, p)).toBe(1_000);
    expect(calcDelay(2, p)).toBe(2_000);
    expect(calcDelay(3, p)).toBe(3_000);
  });

  it('caps at maxDelay', () => {
    const p = policy({ backoff: 'linear', maxDelay: 2_500 });
    expect(calcDelay(3, p)).toBe(2_500);
    expect(calcDelay(5, p)).toBe(2_500);
  });
});
