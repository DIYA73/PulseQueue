export type RunStatus = 'pending' | 'running' | 'sleeping' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ScheduledJobType = 'sleep' | 'cron';

export interface Run {
  id: string;
  workflow: string;
  status: RunStatus;
  trigger_data: unknown;
  parent_run_id: string | null;
  started_at: Date;
  completed_at: Date | null;
  error: string | null;
}

export interface Step {
  id: string;
  run_id: string;
  name: string;
  status: StepStatus;
  attempt: number;
  input: unknown;
  output: unknown;
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface ScheduledJob {
  id: string;
  type: ScheduledJobType;
  run_id: string | null;
  step_name: string | null;
  workflow: string | null;
  trigger_data: unknown;
  due_at: Date;
  cron_expr: string | null;
}

export interface CronJob {
  id: string;
  name: string;
  workflow: string;
  cron_expr: string;
  payload: unknown;
  enabled: boolean;
  last_run_at: Date | null;
  next_run_at: Date;
  created_at: Date;
}
