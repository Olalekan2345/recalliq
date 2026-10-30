# RecallIQ

**AI that remembers its mistakes. Intelligence that knows its worth.**

RecallIQ is an evidence-driven investigation agent for **Sui Mainnet**. Ask it about a transaction, wallet or contract in plain language. It answers from live chain data read through **Tatum's Sui gRPC API** and re-checks every factual claim against fresh chain reads. When it can prove one of its own claims was wrong, it diagnoses the cause from evidence and stores the lesson in **Walrus Memory**. Later, independent investigations recall that lesson, and it changes what the agent does. When free data is not enough, it can propose a specialist analysis paid for with **x402 on Sui**. You approve that exact payment in your own wallet, and the settlement is verified on chain before the result is used.

- **Live app:** https://recalliq-seven.vercel.app
- **Live integration status:** https://recalliq-seven.vercel.app/api/integrations/health

---

## Key capabilities

|                                     |                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agent Autopsy**                   | Claims carry machine-checkable assertions. The verification engine re-reads the chain (not the model's own tool output). A claimed amount off by exactly 10⁹ is diagnosed as a decimal-scaling error, not "the model was confused".                                                                                      |
| **Learning that changes behaviour** | Lessons map to an allowlist of directives. A recalled `verify_coin_decimals` lesson becomes a policy enforced in code: a report with amount claims is rejected until the agent runs the decimals analyzer. The memory trace records that the decision changed.                                                           |
| **WorthIt Intelligence**            | Tool choice = relevance × measured reliability (Wilson lower bound, shown only with n ≥ 5). Paid analysis is offered only when trusted code allows it, and a memory that a past purchase added no verified value removes the offer.                                                                                      |
| **Agent payments**                  | x402 v2 `exact` scheme on Sui. RecallIQ runs its own x402-protected specialist API (disclosed as first-party). Payments are wallet-signed, verified by simulation, settled through Tatum's `TransactionExecutionService`, independently re-verified, idempotent, and reconciled by digest when the outcome is ambiguous. |
| **Data integrity**                  | No demo mode, no seeded activity, no synthetic metrics. Missing credentials show up as "not configured". Reliability below n=5 reads "insufficient data". Evaluations with too few pairs read "inconclusive".                                                                                                            |
| **Learning Lab**                    | Traces every lesson from the failure that created it to each later decision it changed, and runs paired evaluations (memory on vs. off) with an exact sign test.                                                                                                                                                         |

## Production deployment

| Component            | Production configuration                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Chain data           | Tatum Sui gRPC gateway (`sui-mainnet-grpc.gateway.tatum.io`), authenticated, Sui Mainnet                                 |
| Memory               | Walrus Memory on Mainnet through the MemWal relayer; encrypted, one namespace per user; stored only once a blob ID exists |
| Language model       | Google `gemini-3.5-flash-lite` (provider-agnostic; see [docs/DECISIONS.md](docs/DECISIONS.md))                          |
| Payments             | x402 `exact` on `sui:mainnet`, self-facilitated through Tatum, 0.01 SUI per specialist call                             |
| Hosting and database | Vercel (serverless worker mode) with Neon PostgreSQL                                                                     |

**Verifiable memory example.** After the agent asserted a gas amount with the wrong sign and verification contradicted it, the Agent Autopsy stored the rule "every fact needs evidence and a checkable assertion" on Walrus Mainnet as blob [`qXq-A_vKJY87zubVjU5RSgV79CRokPP6cPQndbd5e2g`](https://walruscan.com/mainnet/blob/qXq-A_vKJY87zubVjU5RSgV79CRokPP6cPQndbd5e2g). Later investigations recall that lesson and enforce it: a report with unsupported claims is rejected until every claim is backed by evidence.

## Architecture

```
Browser (Next.js App Router, Tailwind, dApp Kit for wallet signing only)
   │  REST + SSE (execution trail streamed from Postgres)
Next.js server ──────────────┬──────────────────────────────────────────────────
   API routes (zod, auth,    │  Durable job queue (Postgres, leases)
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

## Documentation

| Document                                     | Contents                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| [Architecture](docs/ARCHITECTURE.md)         | Code map, investigation lifecycle, data model, memory ownership, x402   |
| [Technical decisions](docs/DECISIONS.md)     | Choices of stack, transport, facilitator, model and evaluation method  |
| [Security](docs/SECURITY.md)                 | Model boundaries, payment safeguards, application security, secrets    |
| [Deployment](docs/DEPLOYMENT.md)             | Vercel (production), Render and Docker; worker modes                    |
| [Design system](docs/DESIGN.md)              | Tokens, motion, homepage scenes, app shell                              |

## Tech stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 · Vercel AI SDK · Better Auth · Drizzle ORM and PostgreSQL · `@mysten/sui` and dApp Kit · MemWal SDK (`@mysten-incubation/memwal`) · Vitest, PGlite and Playwright.

## Quick start (local)

Requirements: Node 20.9+ (tested on 24), pnpm 9.

```bash
pnpm install
pnpm dev:db                     # terminal 1: real PostgreSQL via embedded-postgres (port 54330)
cp .env.example .env            # set DATABASE_URL (printed by dev:db) and BETTER_AUTH_SECRET
pnpm db:migrate
pnpm dev                        # http://localhost:3300 (worker runs inline)
```

The app runs with no third-party keys and reports exactly which integration is not configured. To enable each integration:

| Integration   | Variables                                                                                                     | Where to get them                    |
| ------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| LLM           | `LLM_PROVIDER` (`anthropic`, `openai`, `groq` or `google`), `LLM_MODEL`, and that provider's API key variable | The provider's console               |
| Tatum         | `TATUM_API_KEY`                                                                                               | dashboard.tatum.io → RPC nodes → Sui |
| Walrus Memory | `MEMWAL_KEY`, `MEMWAL_ACCOUNT_ID`                                                                             | memory.walrus.xyz                    |
| x402 payments | `X402_PAY_TO`, `X402_ALLOWED_RECIPIENTS`, `X402_FORENSICS_PRICE_ATOMIC`                                       | Your own Sui address and price       |

Check everything with `pnpm health`. All variables are documented in `.env.example`.

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

## Testing

`pnpm check` runs Prettier, `tsc --noEmit`, ESLint and 144 unit and integration tests. Playwright end-to-end tests cover desktop and mobile viewports.

Test doubles exist only in `tests/`: a recorded-fixture chain client (real signatures, real transaction serialization), the MemWal SDK's own `MemWalMock`, a scripted language model, and PGlite (real PostgreSQL compiled to WASM). The application never imports them. Live tests in `tests/live` call real services and skip themselves when credentials are absent, so a skip is never reported as a pass.

The `learning-loop` integration test exercises the full mechanism through the real orchestrator. A scripted model makes a decimals mistake, independent verification catches it, the autopsy stores a lesson, and a later run recalls it. The enforced policy then changes that run's behaviour and its claims verify, while a baseline run repeats the mistake. Finally, the paired evaluation reports n=1 as inconclusive.

## License

Apache-2.0 (see `LICENSE`).
