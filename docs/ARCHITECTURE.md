# Architecture

## Code map

```
src/
  app/                    Next.js App Router
    (marketing)/          Landing page
    (auth)/               Sign in / sign up (Better Auth)
    (dashboard)/          workspace, investigations, memory, tools, payments, learning, settings
    api/                  Typed route handlers (thin: validate → authorize → call a service)
  components/             UI (ui/ primitives, agent/, memory/, payments/, learning/, settings/, shared/)
  lib/
    ai/
      orchestrator/       run-agent.ts (state machine + model loop), prompt.ts
      planning/           Deterministic task parsing & categorisation
      tools/              Registry, chain tools, paid tool spec
      verification/       Assertions + independent verification engine
      reflection/         Agent Autopsy
      worthit/            Reliability statistics + tool-selection policy
      evaluation/         Paired evaluation harness
      providers.ts        LLM provider resolution and verified pricing
    blockchain/
      tatum/              Sui gRPC client (native HTTP/2 + x-api-key) + normalisation
      sui/                Validation, exact amount math, explorer links
    memory/               MemWal store adapter, lesson codec, memory service, namespaces
    payments/
      x402/               Protocol types, Sui `exact` verify/settle, facilitators, resource server
      authorization/      Spending policy (trusted code)
      verification/       Independent settlement verification
    specialist/           Computation behind the paid x402 API (first-party)
    auth/, db/, security/, logging/, env.ts
  server/
    services/             Tenant-scoped read/write services used by pages and API routes
    jobs/                 Postgres job queue, worker, worker entrypoint
  instrumentation.ts      Starts the inline worker in the Node.js server
drizzle/                  Version-controlled SQL migrations
tests/                    unit / integration (PGlite) / live / e2e (Playwright)
```

## Investigation lifecycle

1. **API** (`POST /api/agent/runs`) validates input, applies rate and concurrency limits, refuses honestly if the LLM is not configured, creates the run, and enqueues `agent.run`.
2. **PLANNING**: deterministic identifier extraction and task categorisation (`lib/ai/planning/task.ts`).
3. **RECALLING_MEMORY**: semantic recall from the user's namespace and the platform namespace. Results are joined to local provenance by blob ID and filtered (distance, superseded/flagged/retracted, evaluation-only, ownership, conflicting directives). Every retrieved memory gets a `memory_usage` row.
4. **SELECTING_TOOLS**: WorthIt decides which tools are offered and whether paid analysis can be proposed. Directive effects are recorded in `tool_plan`.
5. **EXECUTING**: the AI SDK runs the tool loop. Each tool call is budgeted, timed out, cancellable, persisted as `tool_execution`, and its fetched data stored as `evidence_record` rows (E1…). `submit_final_report` enforces learned policies and can reject a report. The paid tool creates a `payment_intent` and pauses the run. If the model stops without a report, it gets one reminder and then a report-only pass, where the only tool is `submit_final_report` (forced where the provider allows). Empty model responses are recorded with the provider's finish reason. A run that still has no report ends with `endReason: "no_report"`, which the autopsy records as an incomplete analysis, not as a limit.
6. **AWAITING_APPROVAL** (optional): the user signs in their wallet. `payment.settle` presents the payment to the x402 endpoint and verifies settlement through Tatum. `agent.resume` continues the conversation with the paid result (or a notice that it is unavailable).
7. **VERIFYING**: every claim with an assertion is re-checked against fresh chain reads. Before that, at submission, the answer prose is grounded (`lib/ai/verification/grounding.ts`): every transaction digest, full address, date and coin amount in it must appear in what the run fetched. That means tool outputs, the user's request and payment settlements. Roundings of a fetched amount and exact SUI conversions of fetched MIST integers are accepted. A report with unmatched values is sent back twice with the list. After that it is accepted with the values under limitations, the run is partial, and the autopsy records an `unsupported_claim` lesson. Claims about the current network state use `latest_checkpoint`: the checkpoint must exist and be within 15 minutes of the network head, measured in chain time. This catches a "current height" taken from an old transaction.
8. **REFLECTING**: the Autopsy maps verification diagnoses, tool failures, payment outcomes and limits to failures and lesson candidates. Tool performance observations are written. A clean run also yields a proven-strategy lesson (`strategy`, `prefer_tool_for_category`): at least 2 verified claims, no contradictions, no claim failures and no ungrounded values. The lesson records which tools produced the verified evidence, in order. It is kept once per user and task category. On recall, WorthIt marks the first tool as preferred for that category.
9. **SAVING_MEMORY**: lessons go through validation and dedupe into the outbox. `memory.submit` hands them to the relayer, and `memory.confirm` marks them stored only on `done` with a blob ID. If the relayer reports a job as failed, the memory is resubmitted under a new idempotency key derived from the failed job, because the relayer returns the failed job again for a reused key. This stops after 3 submissions in total, and the memory then stays `failed` with the relayer's error.
10. **COMPLETED / PARTIALLY_COMPLETED** (contradictions, limits or payment problems) or **FAILED / CANCELLED**.

Checkpoints (model messages, counters, memory context) are saved after every model pass. On restart the worker resumes at the right phase: planning phases re-run, the verify/reflect/save tail is idempotent, and leases reclaim jobs from dead workers.

## Data model highlights

- Money is `numeric(78,0)` in atomic units and is never a float. Display conversion uses on-chain decimals (`GetCoinInfo`) with integer math.
- `agent_execution_step` is both the audit trail and the SSE source. The UI shows nothing the backend did not record.
- `learning_memory` stores the exact text sent to Walrus, `walrus_job_id`, `walrus_blob_id` and storage status. A partial unique index on `(namespace, content_hash) WHERE status='active'` prevents duplicate lessons.
- `x402_sale` is the seller-side ledger keyed by payment digest (replay protection and idempotent re-delivery).
- `job` is the durable queue: idempotency keys (partial unique index), leases, bounded attempts, dead-lettering.
- Evaluation rows are flagged `is_evaluation` and excluded from production statistics.

## Memory ownership model

RecallIQ writes to one operator MemWal account. Each user has a private namespace, `prefix-u-<sha256(userId)[:20]>`, and server-side authorization ensures a user's runs recall only their own namespace plus the platform namespace. Platform lessons are template-generated and contain no addresses, digests or user text, which validation enforces. Memories are not cryptographically owned by the user's wallet; the UI says so.

The relayer's `/health` is a liveness probe and can report `ok` while recall or remember return errors. The store therefore records the outcome of every real recall and remember call. The Walrus health check reports `degraded` (for example "recall failing (HTTP 500) since 03:44 UTC") until a later call succeeds. Runs continue without memory and record "Walrus Memory unavailable".

## x402 flow (Sui `exact`)

```
agent → POST /api/x402/forensics (no header)            ← 402 + PAYMENT-REQUIRED (real terms)
trusted code: allowlist + spending policy → payment_intent (awaiting_approval)
user  → /prepare: server builds the exact transfer via Tatum (coin selection, gas)
user wallet signs bytes (dApp Kit signTransaction) → /authorize
server: decode, sender == wallet, signature, not executed, simulation credits payTo exactly
worker → POST /api/x402/forensics + PAYMENT-SIGNATURE
seller: verify → compute → settle (Tatum ExecuteTransaction) → 200 + PAYMENT-RESPONSE
buyer: verify settlement independently (recipient, asset, exact amount, sender, success, checkpoint)
ambiguous outcome → reconcile by the locally computed digest; the same signed bytes can execute at most once
```
