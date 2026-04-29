-- Workflow run instances
CREATE TABLE runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow      VARCHAR     NOT NULL,
  status        VARCHAR     NOT NULL DEFAULT 'pending',
  trigger_data  JSONB,
  parent_run_id UUID        REFERENCES runs(id),  -- set when this is a replay
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  error         TEXT,

  CONSTRAINT runs_status_check
    CHECK (status IN ('pending','running','completed','failed','cancelled'))
);

CREATE INDEX idx_runs_workflow ON runs(workflow);
CREATE INDEX idx_runs_status   ON runs(status);

-- Step execution history — the foundation of step-level replay
CREATE TABLE steps (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  name          VARCHAR     NOT NULL,
  status        VARCHAR     NOT NULL DEFAULT 'pending',
  attempt       INT         NOT NULL DEFAULT 1,
  input         JSONB,
  output        JSONB,
  error         TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,

  -- same step name within a run is always the same logical step (idempotency)
  UNIQUE (run_id, name),

  CONSTRAINT steps_status_check
    CHECK (status IN ('pending','running','completed','failed'))
);

CREATE INDEX idx_steps_run_id ON steps(run_id);

-- Sleep / waitUntil / cron scheduled work
CREATE TABLE scheduled_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type          VARCHAR     NOT NULL,
  run_id        UUID        REFERENCES runs(id) ON DELETE CASCADE,
  step_name     VARCHAR,
  workflow      VARCHAR,
  trigger_data  JSONB,
  due_at        TIMESTAMPTZ NOT NULL,
  cron_expr     VARCHAR,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT scheduled_jobs_type_check
    CHECK (type IN ('sleep','cron'))
);

CREATE INDEX idx_scheduled_jobs_due_at ON scheduled_jobs(due_at)
  WHERE due_at > now();
