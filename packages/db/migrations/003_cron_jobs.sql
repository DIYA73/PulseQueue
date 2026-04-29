-- Registered recurring cron workflows
CREATE TABLE cron_jobs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR     NOT NULL UNIQUE,
  workflow    VARCHAR     NOT NULL,
  cron_expr   VARCHAR     NOT NULL,
  payload     JSONB,
  enabled     BOOLEAN     NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cron_jobs_next_run ON cron_jobs(next_run_at)
  WHERE enabled = true;
