# PulseQueue

![CI](https://github.com/DIYA73/PulseQueue/actions/workflows/ci.yml/badge.svg)

Open-source durable workflow engine — self-hostable alternative to Inngest and Trigger.dev.

Write plain async functions. PulseQueue makes them survive crashes, retries, and server restarts — with automatic retry, sleep/wait primitives, fan-out/fan-in, cron jobs, and **step-level replay** from any point in a failed run.

---

## Why PulseQueue?

Most background job systems (BullMQ, Sidekiq, etc.) give you a single retry on a single function. PulseQueue gives you **durable multi-step workflows** where each step is independently checkpointed. If your workflow crashes halfway through — at step 7 of 12 — you replay from step 7. Steps 1–6 return their cached results instantly.

This is how Temporal, Inngest, and Trigger.dev work. PulseQueue is the open-source, self-hostable version you can run on your own infrastructure.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Next.js Dashboard  (:3000)                  │
│      run list · step timeline · replay · cron jobs       │
└──────────────────────┬───────────────────────────────────┘
                       │ REST + SSE
┌──────────────────────▼───────────────────────────────────┐
│              Fastify API Server  (:3001)                  │
│    /trigger  /runs  /runs/:id/replay  /crons             │
└──────┬───────────────┬──────────────────────┬────────────┘
       │               │                      │
 ┌─────▼──────┐  ┌─────▼──────┐  ┌───────────▼──────────┐
 │   Redis    │  │ PostgreSQL │  │   Worker  /  Scheduler│
 │  Streams   │  │   State    │  │  (Node.js processes)  │
 └────────────┘  └────────────┘  └──────────────────────┘
```

**Redis Streams** — job dispatch with consumer groups (`pq:jobs`), retry sorted-set (`pq:retry`)

**PostgreSQL** — `runs`, `steps`, `scheduled_jobs`, `cron_jobs` tables; `UNIQUE(run_id, step_name)` is the idempotency key that makes replay work

**Worker** — pulls from Redis Streams, re-runs the workflow function; completed steps return from DB cache (memoization); failed steps trigger retry scheduling

**Scheduler** — polls every 1s for due `sleep`/`waitUntil` and cron jobs; re-enqueues them into `pq:jobs`

---

## Features

- **Durable `step.run()`** — each step is checkpointed; completed steps are never re-executed
- **Automatic retry** — exponential or linear backoff, configurable per workflow
- **`step.sleep(duration)`** — suspend a run for `30s`, `5m`, `2h`, `3d`, `1w`
- **`step.waitUntil(date)`** — suspend until an absolute timestamp
- **`step.parallel([...])`** — fan-out multiple steps concurrently, fan-in when all settle
- **Cron jobs** — register recurring workflows with standard cron expressions
- **Step-level replay** — replay any failed run from any step, preserving prior outputs
- **Dashboard** — live run list, step timeline, one-click replay, cron management

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/DIYA73/PulseQueue.git
cd PulseQueue
pnpm install

# 2. Start Postgres + Redis
pnpm infra:up

# 3. Run database migrations
cp .env.example .env
pnpm db:migrate

# 4. Start all services (4 terminals)
pnpm --filter @pulsequeue/api       dev   # API server   → :3001
pnpm --filter @pulsequeue/worker    dev   # Worker process
pnpm --filter @pulsequeue/scheduler dev   # Scheduler
pnpm --filter @pulsequeue/dashboard dev   # Dashboard    → :3000
```

Open **http://localhost:3000** to see the dashboard.

---

## Running the Demo

The `apps/example` package contains two demo workflows.

```bash
# Start the example worker (registers both demo workflows)
pnpm demo:worker

# In another terminal — trigger the onboarding flow
pnpm demo:trigger

# Trigger the payment retry demo
pnpm demo:trigger:retry
```

**`user-onboarding`** — demonstrates `step.parallel()` and `step.sleep()`:
1. Fetch user profile
2. Fan-out: create account + send welcome email (concurrent)
3. Sleep 15s (simulates 3-day follow-up window)
4. Send follow-up email
5. Update CRM

**`payment-retry`** — demonstrates automatic retry with exponential backoff:
- `charge-card` step fails intentionally on attempts 1 and 2
- Succeeds on attempt 3
- Receipt step runs only after successful charge

Watch the step timeline in the dashboard as the workflow progresses.

---

## SDK

```typescript
import { defineWorkflow } from '@pulsequeue/core';
import { register, startWorker } from '@pulsequeue/worker';

const myWorkflow = defineWorkflow(
  'user-onboarding',
  async (step, payload: { userId: string }) => {

    // Durable step — result is cached on success
    const user = await step.run('fetch-user', async () => {
      return db.users.findById(payload.userId);
    });

    // Fan-out — runs concurrently, fan-in when both complete
    await step.parallel([
      () => step.run('send-email', () => email.send(user.email)),
      () => step.run('notify-slack', () => slack.post(`New user: ${user.name}`)),
    ]);

    // Suspend the run for 3 days — worker is free during this time
    await step.sleep('wait-3-days', '3d');

    // Resumes here after 3 days
    await step.run('send-followup', () => email.sendFollowUp(user.email));
  },
  {
    retries: {
      maxAttempts: 3,
      backoff: 'exponential',
      initialDelay: 1_000,
      maxDelay: 30_000,
    },
  },
);

register(myWorkflow);
startWorker();
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/trigger` | Trigger a workflow run |
| `GET` | `/api/runs` | List runs (`?status=` `?workflow=` `?limit=`) |
| `GET` | `/api/runs/:id` | Run detail with step list |
| `POST` | `/api/runs/:id/replay` | Replay from a step (`{ "from_step": "name" }`) |
| `POST` | `/api/runs/:id/cancel` | Cancel an active run |
| `POST` | `/api/crons` | Register a cron job |
| `GET` | `/api/crons` | List cron jobs |
| `DELETE` | `/api/crons/:name` | Remove a cron job |
| `PATCH` | `/api/crons/:name` | Enable / disable `{ "enabled": false }` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (ESM, strict) |
| Monorepo | pnpm workspaces + Turborepo |
| API server | Fastify |
| Job queue | Redis Streams (consumer groups) |
| State store | PostgreSQL 16 |
| Dashboard | Next.js 14 (App Router) + Tailwind CSS |
| Tests | Vitest |

---

## How replay works

Every `step.run()` call writes its output to the `steps` table with a `UNIQUE(run_id, step_name)` constraint. On subsequent executions, the worker checks this table before running anything — if output exists, it returns immediately (memoization).

Replay creates a new run and **copies completed step outputs** from the original run up to the replay point:

```sql
INSERT INTO steps (run_id, name, status, output, ...)
SELECT $new_run_id, name, status, output, ...
FROM   steps
WHERE  run_id     = $original_run_id
  AND  status     = 'completed'
  AND  started_at < $replay_step_started_at
```

The worker re-runs the workflow function from the beginning. All copied steps return from cache. Only the target step and beyond execute for real. The original run is untouched.

---

## License

MIT
