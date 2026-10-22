# Deployment

RecallIQ needs (1) a long-running Node.js process, because native gRPC over HTTP/2 to Tatum and the durable job worker need one, (2) PostgreSQL 15+, and (3) HTTPS.

## Recommended: Render (Blueprint included)

1. Push the repository to GitHub.
2. In Render, choose **New → Blueprint**, select the repo, and apply `render.yaml`. This creates the web service (Docker) and PostgreSQL. `preDeployCommand` runs migrations.
3. Set the secrets marked `sync: false`: `NEXT_PUBLIC_APP_URL` (the Render HTTPS URL), `GOOGLE_GENERATIVE_AI_API_KEY` (or another LLM provider key), `TATUM_API_KEY`, `MEMWAL_KEY`, `MEMWAL_ACCOUNT_ID`, `X402_PAY_TO`, `X402_ALLOWED_RECIPIENTS`, `X402_FORENSICS_PRICE_ATOMIC`.
4. Deploy, then open `/api/integrations/health`. Every integration should report `ok`.

The worker runs inline (`WORKER_MODE=inline`). To scale, add a second service from the same image with command `pnpm worker`, and set `WORKER_MODE=external` on the web service.

## Any Docker host (Railway, Fly.io, a VM)

```bash
docker build -t recalliq .
docker run --env-file .env recalliq pnpm db:migrate        # release step
docker run -p 3300:3300 --env-file .env recalliq           # web (+ inline worker)
docker run --env-file .env recalliq pnpm worker            # optional dedicated worker
```

## Vercel

Vercel has no long-running process, so RecallIQ runs there without a worker: set `WORKER_MODE=serverless` (`src/server/jobs/drain.ts`).

- A request that queues work (start or retry an investigation, approve a payment, start an evaluation) runs the ready jobs after its response with `after()`, inside the function's time limit. Those routes declare `maxDuration = 300`, and `vercel.json` enables Fluid compute, which allows 300 s on every plan.
- An investigation is only started when a full agent budget (`AGENT_MAX_DURATION_MS`, 240 s by default) still fits. Otherwise the drain hands off to `POST /api/jobs/drain`, a fresh function, authorised with `CRON_SECRET`.
- Short follow-ups that are due soon (Walrus storage confirmations, payment reconciliation) are waited for while time remains. Anything left over is picked up by the next drain: any dashboard page load, anyone watching an unfinished run (the event stream drains alongside), or the daily Vercel Cron (`vercel.json`, `GET /api/jobs/drain`), which also records integration health. Homepage visits refresh health that is older than ten minutes.
- Evaluations run one task × mode per function and requeue themselves.
- Concurrent drains are safe (leases with `FOR UPDATE SKIP LOCKED`). A job cut off by the time limit is reclaimed when its lease expires and resumes from its checkpoint.
- The run event stream closes after 270 s on Vercel; the browser's `EventSource` reconnects and resumes from `Last-Event-ID`.

Setup:

1. Import the GitHub repository in Vercel (framework: Next.js; `vercel.json` sets pnpm and Fluid compute).
2. Add a Postgres database from the Vercel Marketplace (Neon). It sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`.
3. Set the environment variables: `WORKER_MODE=serverless`, `CRON_SECRET` (long random string), `BETTER_AUTH_SECRET` (new, long random string), `NEXT_PUBLIC_APP_URL` (the production domain), `DATABASE_POOL_MAX=3`, and the integration keys listed for Render above.
4. Run the migrations once against the unpooled URL: `DATABASE_URL=<unpooled url> pnpm db:migrate`.
5. Deploy, then check `/api/integrations/health` and run an investigation.

## Post-deploy checklist

- `/api/health` returns 200 (database).
- `/api/integrations/health` shows Tatum `ok` (authenticated), Walrus `ok`, LLM `ok`, x402 `ok`.
- Sign up, run an investigation, and watch the activity feed stream.
- `pnpm test:live` against production credentials (from a trusted machine).
