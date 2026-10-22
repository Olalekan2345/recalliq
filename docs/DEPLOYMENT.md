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

The web app builds on Vercel, but serverless functions must not host the worker. Set `WORKER_MODE=external` and run `pnpm worker` on a long-running host pointed at the same database. SSE streams are limited by the function duration; the client reconnects with `Last-Event-ID`.

## Post-deploy checklist

- `/api/health` returns 200 (database).
- `/api/integrations/health` shows Tatum `ok` (authenticated), Walrus `ok`, LLM `ok`, x402 `ok`.
- Sign up, run an investigation, and watch the activity feed stream.
- `pnpm test:live` against production credentials (from a trusted machine).
