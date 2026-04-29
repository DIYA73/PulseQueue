import type { RetryPolicy } from '@pulsequeue/core';

export function calcDelay(attempt: number, policy: Required<RetryPolicy>): number {
  const raw =
    policy.backoff === 'linear'
      ? policy.initialDelay * attempt
      : policy.initialDelay * Math.pow(2, attempt - 1);
  return Math.min(raw, policy.maxDelay);
}
