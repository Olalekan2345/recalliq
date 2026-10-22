# RecallIQ

**AI that remembers its mistakes. Intelligence that knows its worth.**

RecallIQ is an evidence-driven investigation agent for **Sui Mainnet**. Ask it about a transaction, wallet or contract in plain language. It answers from live chain data read through **Tatum's Sui gRPC API** and re-checks every factual claim against fresh chain reads. When it can prove one of its own claims was wrong, it diagnoses the cause from evidence and stores the lesson in **Walrus Memory**. Later, independent investigations recall that lesson, and it changes what the agent does. When free data is not enough, it can propose a specialist analysis paid for with **x402 on Sui**. You approve that exact payment in your own wallet, and the settlement is verified on chain before the result is used.

Built for the **Walrus × Tatum "Total Recall" hackathon** (track: _Smart Agents for Real Life_; also _Best Walrus Memory_ and _Best Use of Agent Payments_).

---

## What makes it different

|                                     |                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agent Autopsy**                   | Claims carry machine-checkable assertions. The verification engine re-reads the chain (not the model's own tool output). A claimed amount off by exactly 10⁹ is diagnosed as a decimal-scaling error, not "the model was confused".                                                                                      |
| **Learning that changes behaviour** | Lessons map to an allowlist of directives. A recalled `verify_coin_decimals` lesson becomes a policy enforced in code: a report with amount claims is rejected until the agent runs the decimals analyzer. The memory trace records that the decision changed.                                                           |
| **WorthIt Intelligence**            | Tool choice = relevance × measured reliability (Wilson lower bound, shown only with n ≥ 5). Paid analysis is offered only when trusted code allows it, and a memory that a past purchase added no verified value removes the offer.                                                                                      |
| **Real agent payments**             | x402 v2 `exact` scheme on Sui. RecallIQ runs its own x402-protected specialist API (disclosed as first-party). Payments are wallet-signed, verified by simulation, settled through Tatum's `TransactionExecutionService`, independently re-verified, idempotent, and reconciled by digest when the outcome is ambiguous. |
| **Honest by construction**          | No demo mode, no seeded activity, no synthetic metrics. Missing credentials show up as "not configured". Reliability below n=5 reads "insufficient data". Evaluations with too few pairs read "inconclusive".                                                                                                            |

## Architecture (one screen)

```
Browser (Next.js App Router, Tailwind, dApp Kit for wallet signing only)
   │  REST + SSE (execution trail streamed from Postgres)
Next.js server ──────────────┬──────────────────────────────────────────────────
   API routes (zod, auth,    │  Durable worker (Postgres job queue, leases)
   same-origin, rate limits) │   agent.run / agent.resume / memory.submit|confirm
                             │   payment.settle|reconcile / evaluation.run
   ┌─────────────────────────┴───────────────────────────────────────────────┐
   │ Orchestrator (Vercel AI SDK, typed tools, budgets, checkpoints)         │
   │   PLANNING → RECALLING_MEMORY → SELECTING_TOOLS → EXECUTING             │
   │   → (AWAITING_APPROVAL) → VERIFYING → REFLECTING → SAVING_MEMORY        │
   ├──────────────┬──────────────┬───────────────┬──────────────┬────────────┤
   │ Tatum Sui    │ Verification │ Agent Autopsy │ WorthIt      │ x402 buyer │
   │ gRPC client  │ engine       │ (deterministic)│ (policy)    │ + seller   │
   └──────┬───────┴──────────────┴───────┬───────┴──────────────┴─────┬──────┘
          │ native gRPC + x-api-key      │ MemWal SDK (relayer)       │ Tatum
    sui-mainnet-grpc.gateway.tatum.io    │ Walrus Memory Mainnet      │ simulate/execute
                                   PostgreSQL (Drizzle, migrations)
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Security: [docs/SECURITY.md](docs/SECURITY.md) · Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · Design decisions & deviations: [docs/DECISIONS.md](docs/DECISIONS.md) · Hackathon checklist: [docs/HACKATHON.md](docs/HACKATHON.md)

## Status (honest)

| Area                                                                                                           | Implemented                | Automated tests                 | Live-verified                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Tatum Sui gRPC client (tx, checkpoints, balances, objects, packages, SuiNS, address history, simulate/execute) | ✅                         | ✅ fixtures                     | ✅ Mainnet reads through Tatum (keyless: rate-limited after a few calls); full live suite 5/5 against the Sui gRPC API on the public fullnode |
| Verification engine, Agent Autopsy, learned-policy enforcement                                                 | ✅                         | ✅                              | ✅ verification on real Mainnet transactions                                                                                                  |
| Walrus Memory outbox → accepted → stored (blob id) → recall                                                    | ✅                         | ✅ with the SDK's `MemWalMock`  | ⏳ **needs `MEMWAL_KEY` + `MEMWAL_ACCOUNT_ID`** (`pnpm test:live`)                                                                            |
| LLM orchestrator (tools, budgets, cancellation, checkpoints, resume)                                           | ✅                         | ✅ scripted mock model          | ⏳ **needs an LLM API key**                                                                                                                   |
| x402 on Sui (quote, wallet approval, verify, settle, verify settlement, reconcile)                             | ✅                         | ✅ real Ed25519-signed tx bytes | ⏳ **needs `X402_PAY_TO`, a price, and a funded wallet** for a real Mainnet settlement                                                        |
| Auth, tenant isolation, guests, rate limits, CSRF/origin checks                                                | ✅                         | ✅ integration + E2E            | ✅ local production build                                                                                                                     |
| Learning Lab (paired evaluation, sign test, influence traces)                                                  | ✅                         | ✅                              | ⏳ needs real runs                                                                                                                            |
| Deployment                                                                                                     | Dockerfile + `render.yaml` | —                               | ⏳ needs a hosting account                                                                                                                    |

Quality gates: `pnpm check` (Prettier, `tsc --noEmit`, ESLint, 117 unit + integration tests) passes. `pnpm build` passes. Playwright E2E passes 16 tests on desktop and mobile viewports (2 skip until an LLM key is configured).

## Quick start (local)

Requirements: Node 20.9+ (tested on 24), pnpm 9.

```bash
pnpm install
pnpm dev:db                     # terminal 1: real PostgreSQL via embedded-postgres (port 54330)
cp .env.example .env            # set DATABASE_URL (printed by dev:db) and BETTER_AUTH_SECRET
pnpm db:migrate
pnpm dev                        # http://localhost:3300 (worker runs inline)
```

The app runs with no third-party keys and tells you exactly what is missing. To enable each integration:

| Integration   | Variables                                                                                           | Where to get them                    |
| ------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| LLM           | `ANTHROPIC_API_KEY` (default model `claude-opus-5-5`) or another `LLM_PROVIDER` + `LLM_MODEL` + key | console.anthropic.com                |
| Tatum         | `TATUM_API_KEY`                                                                                     | dashboard.tatum.io → RPC nodes → Sui |
| Walrus Memory | `MEMWAL_KEY`, `MEMWAL_ACCOUNT_ID`                                                                   | memory.walrus.xyz                    |
| x402 payments | `X402_PAY_TO`, `X402_ALLOWED_RECIPIENTS`, `X402_FORENSICS_PRICE_ATOMIC`                             | your own Sui address and price       |

Check everything with `pnpm health`.

## Scripts

| Script                                   | Purpose                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js (worker inline when `WORKER_MODE=inline`)                        |
| `pnpm worker`                            | Dedicated worker process (`WORKER_MODE=external` on the web service)     |
| `pnpm dev:db`                            | Local PostgreSQL (embedded-postgres)                                     |
| `pnpm db:generate` / `pnpm db:migrate`   | Drizzle migrations                                                       |
| `pnpm check`                             | Format check + typecheck + lint + unit/integration tests                 |
| `pnpm test:live`                         | Live tests against real Mainnet services (auto-skip without credentials) |
| `pnpm test:e2e`                          | Playwright against a running server                                      |
| `pnpm health`                            | Live integration status                                                  |
| `pnpm walrus:restore <namespace>`        | Rebuild a namespace's recall index from Walrus                           |

## Testing philosophy

Test doubles exist only in `tests/`. These are a recorded-fixture chain client (real signatures, real transaction serialization), the MemWal SDK's own `MemWalMock`, a scripted mock language model, and PGlite (real PostgreSQL compiled to WASM). The application never imports them. Live tests in `tests/live` hit real services and skip themselves when credentials are absent, so a skip is never reported as a pass.

The `learning-loop` integration test exercises the full mechanism through the real orchestrator. A scripted model makes a decimals mistake, independent verification catches it, the autopsy stores a lesson, and a later run recalls it. The enforced policy then changes that run's behavior and its claims verify, while a baseline run repeats the mistake. Finally, the paired evaluation reports n=1 as inconclusive.

## License

Apache-2.0 (see `LICENSE`).
