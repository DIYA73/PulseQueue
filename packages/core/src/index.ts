export type StepContext = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  sleep: (name: string, duration: string) => Promise<void>;
  waitUntil: (name: string, date: Date) => Promise<void>;
  parallel: <T>(fns: Array<() => Promise<T>>) => Promise<T[]>;
};

export type WorkflowHandler<TPayload = unknown> = (
  step: StepContext,
  payload: TPayload,
) => Promise<void>;

export type RetryPolicy = {
  maxAttempts?: number;
  backoff?: 'exponential' | 'linear';
  initialDelay?: number;
  maxDelay?: number;
};

export type WorkflowDefinition<TPayload = unknown> = {
  name: string;
  handler: WorkflowHandler<TPayload>;
  retries: Required<RetryPolicy>;
};

const DEFAULT_RETRY: Required<RetryPolicy> = {
  maxAttempts: 3,
  backoff: 'exponential',
  initialDelay: 1_000,
  maxDelay: 30_000,
};

export function defineWorkflow<TPayload = unknown>(
  name: string,
  handler: WorkflowHandler<TPayload>,
  options?: { retries?: RetryPolicy },
): WorkflowDefinition<TPayload> {
  return {
    name,
    handler,
    retries: { ...DEFAULT_RETRY, ...options?.retries },
  };
}
