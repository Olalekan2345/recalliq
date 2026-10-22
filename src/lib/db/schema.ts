/**
 * RecallIQ relational schema (PostgreSQL, Drizzle ORM).
 *
 * Conventions
 *  - Every user-owned row carries `user_id` and every read path filters on it.
 *  - Token amounts are numeric(78,0) in atomic units (u256-safe), exposed as
 *    strings. Floating point is never used for money.
 *  - Evaluation runs are flagged (`is_evaluation`) so controlled experiments
 *    never mix with production statistics.
 *  - Nothing here is seeded with activity: only tool definitions (static
 *    registry configuration) are upserted at startup.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();
const amount = (name: string) => numeric(name, { precision: 78, scale: 0 });

/* ───────────────────────────── Auth (Better Auth) ───────────────────────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  isAnonymous: boolean("is_anonymous").default(false),
  createdAt: created(),
  updatedAt: updated(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: created(),
    updatedAt: updated(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ───────────────────────────── Users: settings, wallets ───────────────────────────── */

export const analysisDepth = pgEnum("analysis_depth", ["standard", "deep"]);

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  analysisDepth: analysisDepth("analysis_depth").notNull().default("standard"),
  memoryEnabled: boolean("memory_enabled").notNull().default(true),
  /** When false, paid tools are never offered to the agent. */
  paidToolsEnabled: boolean("paid_tools_enabled").notNull().default(true),
  /** User's own per-payment ceiling, in atomic units of `limitAsset`. Null = platform cap only. */
  perPaymentLimitAtomic: amount("per_payment_limit_atomic"),
  /** Ceiling across one investigation run. */
  perRunLimitAtomic: amount("per_run_limit_atomic"),
  /** Rolling 24h ceiling. */
  dailyLimitAtomic: amount("daily_limit_atomic"),
  limitAsset: text("limit_asset").notNull().default("0x2::sui::SUI"),
  notifyOnPaymentRequest: boolean("notify_on_payment_request").notNull().default(true),
  updatedAt: updated(),
});

export const connectedWallet = pgTable(
  "connected_wallet",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    network: text("network").notNull(),
    walletName: text("wallet_name"),
    /** Set once the user signed our ownership challenge with this address. */
    verifiedAt: ts("verified_at"),
    challenge: text("challenge"),
    challengeExpiresAt: ts("challenge_expires_at"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("connected_wallet_user_address_uq").on(t.userId, t.address, t.network)],
);

/* ───────────────────────────── Investigations & agent runs ───────────────────────────── */

export const runStatus = pgEnum("run_status", [
  "CREATED",
  "PLANNING",
  "RECALLING_MEMORY",
  "SELECTING_TOOLS",
  "EXECUTING",
  "AWAITING_APPROVAL",
  "VERIFYING",
  "REFLECTING",
  "SAVING_MEMORY",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const investigation = pgTable(
  "investigation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    lastRunId: text("last_run_id"),
    lastStatus: runStatus("last_status"),
    isEvaluation: boolean("is_evaluation").notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("investigation_user_idx").on(t.userId, t.updatedAt)],
);

export const memoryMode = pgEnum("memory_mode", ["enabled", "disabled"]);

export const agentRun = pgTable(
  "agent_run",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: runStatus("status").notNull().default("CREATED"),
    task: text("task").notNull(),
    /** Structured inputs extracted/validated server-side: addresses, digests, names. */
    inputs: jsonb("inputs").$type<RunInputs>().notNull(),
    taskCategory: text("task_category"),
    memoryMode: memoryMode("memory_mode").notNull().default("enabled"),
    analysisDepth: analysisDepth("analysis_depth").notNull().default("standard"),
    isEvaluation: boolean("is_evaluation").notNull().default(false),
    evaluationRunId: text("evaluation_run_id"),
    /** Explicit, labelled fault injection for controlled evaluations only. */
    faultInjection: jsonb("fault_injection").$type<FaultInjection | null>(),
    provider: text("provider"),
    model: text("model"),
    limits: jsonb("limits").$type<RunLimitsSnapshot>().notNull(),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    modelIterations: integer("model_iterations").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** Model cost in micro-USD, only when verified pricing is known for the model. */
    modelCostMicroUsd: bigint("model_cost_micro_usd", { mode: "bigint" }),
    /** Opaque resumable state (model messages, pending intent). */
    checkpoint: jsonb("checkpoint").$type<RunCheckpoint | null>(),
    finalReport: jsonb("final_report").$type<FinalReport | null>(),
    toolPlan: jsonb("tool_plan").$type<ToolPlanRecord | null>(),
    error: text("error"),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("agent_run_user_idx").on(t.userId, t.createdAt),
    index("agent_run_investigation_idx").on(t.investigationId, t.createdAt),
    index("agent_run_status_idx").on(t.status),
    index("agent_run_eval_idx").on(t.evaluationRunId),
  ],
);

export const agentMessage = pgTable(
  "agent_message",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").$type<"user" | "assistant" | "notice">().notNull(),
    content: text("content").notNull(),
    createdAt: created(),
  },
  (t) => [index("agent_message_run_idx").on(t.runId, t.createdAt)],
);

/**
 * Durable execution trail. Doubles as the SSE event source: the UI only shows
 * events that were written here by the real backend.
 */
export const agentExecutionStep = pgTable(
  "agent_execution_step",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    kind: text("kind").$type<StepKind>().notNull(),
    state: runStatus("state"),
    title: text("title").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown> | null>(),
    createdAt: created(),
  },
  (t) => [index("agent_step_run_idx").on(t.runId, t.id)],
);

/* ───────────────────────────── Tools ───────────────────────────── */

export const toolDefinition = pgTable("tool_definition", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  provider: text("provider").notNull(),
  operator: text("operator").notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().notNull(),
  supportedNetworks: jsonb("supported_networks").$type<string[]>().notNull(),
  pricingType: text("pricing_type").$type<"free" | "x402">().notNull(),
  /** Quoted from configuration of the operator's paid endpoint; null for free tools. */
  priceAtomic: amount("price_atomic"),
  priceAsset: text("price_asset"),
  authorizationRequirements: text("authorization_requirements").notNull(),
  timeoutMs: integer("timeout_ms").notNull(),
  availabilityStatus: text("availability_status").$type<"available" | "unconfigured" | "degraded" | "disabled">().notNull(),
  disclosure: text("disclosure"),
  updatedAt: updated(),
});

export const toolExecution = pgTable(
  "tool_execution",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    toolId: text("tool_id").notNull(),
    toolCallId: text("tool_call_id"),
    input: jsonb("input").$type<unknown>(),
    output: jsonb("output").$type<unknown>(),
    status: text("status").$type<"running" | "success" | "error" | "timeout" | "rejected" | "fault_injected">().notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
    paymentIntentId: text("payment_intent_id"),
    isEvaluation: boolean("is_evaluation").notNull().default(false),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("tool_execution_run_idx").on(t.runId), index("tool_execution_tool_idx").on(t.toolId, t.startedAt)],
);

export const evidenceRecord = pgTable(
  "evidence_record",
  {
    id: text("id").primaryKey(),
    /** Short per-run reference shown to the model and in the UI ("E3"). */
    ref: text("ref").notNull(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    toolExecutionId: text("tool_execution_id"),
    provider: text("provider").notNull(),
    network: text("network").notNull(),
    kind: text("kind").notNull(),
    reference: text("reference").notNull(),
    method: text("method").notNull(),
    checkpoint: text("checkpoint"),
    data: jsonb("data").$type<unknown>().notNull(),
    dataHash: text("data_hash").notNull(),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("evidence_run_ref_uq").on(t.runId, t.ref), index("evidence_reference_idx").on(t.reference)],
);

export const verificationStatus = pgEnum("verification_status", ["VERIFIED", "PARTIALLY_VERIFIED", "UNVERIFIED", "CONTRADICTED", "UNAVAILABLE"]);

export const verificationResult = pgTable(
  "verification_result",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    claimRef: text("claim_ref").notNull(),
    claim: text("claim").notNull(),
    claimKind: text("claim_kind").$type<ClaimKind>().notNull(),
    assertion: jsonb("assertion").$type<unknown>(),
    citedEvidenceRefs: jsonb("cited_evidence_refs").$type<string[]>().notNull(),
    sourceProvider: text("source_provider"),
    evidenceReference: text("evidence_reference"),
    verificationMethod: text("verification_method").notNull(),
    status: verificationStatus("status").notNull(),
    observed: jsonb("observed").$type<unknown>(),
    detail: text("detail"),
    verifiedAt: ts("verified_at").notNull().defaultNow(),
  },
  (t) => [index("verification_run_idx").on(t.runId)],
);

/* ───────────────────────────── Autopsy & learning ───────────────────────────── */

export const agentFailure = pgTable(
  "agent_failure",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    category: text("category").$type<FailureCategory>().notNull(),
    toolId: text("tool_id"),
    taskCategory: text("task_category"),
    expectation: text("expectation").notNull(),
    observed: text("observed").notNull(),
    /** True when the failure was established from structured evidence, not opinion. */
    objectivelyVerified: boolean("objectively_verified").notNull(),
    confirmedCause: text("confirmed_cause"),
    hypotheses: jsonb("hypotheses").$type<string[]>().notNull(),
    correctiveStrategy: text("corrective_strategy"),
    correctionValidated: boolean("correction_validated").notNull().default(false),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull(),
    verificationResultId: text("verification_result_id"),
    status: text("status").$type<"open" | "lesson_recorded" | "no_lesson" | "dismissed">().notNull().default("open"),
    isEvaluation: boolean("is_evaluation").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("agent_failure_user_idx").on(t.userId, t.createdAt), index("agent_failure_run_idx").on(t.runId)],
);

export const memoryStorageStatus = pgEnum("memory_storage_status", ["queued", "submitting", "pending", "stored", "failed"]);

export const learningMemory = pgTable(
  "learning_memory",
  {
    id: text("id").primaryKey(),
    /** Null for platform-level tool lessons (contain no user data). */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    scope: text("scope").$type<"user" | "platform">().notNull(),
    namespace: text("namespace").notNull(),
    memoryType: text("memory_type").$type<MemoryType>().notNull(),
    taskCategory: text("task_category"),
    relatedToolId: text("related_tool_id"),
    directive: text("directive").$type<MemoryDirective | null>(),
    summary: text("summary").notNull(),
    lesson: text("lesson").notNull(),
    evidenceReferences: jsonb("evidence_references").$type<EvidenceReference[]>().notNull(),
    verificationStatus: text("verification_status").$type<"verified" | "unverified" | "user_reported">().notNull(),
    sourceRunId: text("source_run_id"),
    sourceFailureId: text("source_failure_id"),
    /** The exact text submitted to Walrus (outbox). */
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    storageStatus: memoryStorageStatus("storage_status").notNull().default("queued"),
    walrusJobId: text("walrus_job_id"),
    walrusBlobId: text("walrus_blob_id"),
    walrusOwner: text("walrus_owner"),
    storageAttempts: integer("storage_attempts").notNull().default(0),
    lastError: text("last_error"),
    status: text("status").$type<"active" | "superseded" | "flagged" | "retracted">().notNull().default("active"),
    supersedesMemoryId: text("supersedes_memory_id"),
    supersededById: text("superseded_by_id"),
    flaggedReason: text("flagged_reason"),
    isEvaluation: boolean("is_evaluation").notNull().default(false),
    createdAt: created(),
    storedAt: ts("stored_at"),
    lastUsedAt: ts("last_used_at"),
  },
  (t) => [
    uniqueIndex("learning_memory_idem_uq").on(t.idempotencyKey),
    uniqueIndex("learning_memory_active_content_uq")
      .on(t.namespace, t.contentHash)
      .where(sql`${t.status} = 'active'`),
    index("learning_memory_user_idx").on(t.userId, t.createdAt),
    index("learning_memory_blob_idx").on(t.walrusBlobId),
    index("learning_memory_storage_idx").on(t.storageStatus),
  ],
);

export const memoryUsage = pgTable(
  "memory_usage",
  {
    id: text("id").primaryKey(),
    memoryId: text("memory_id").references(() => learningMemory.id, { onDelete: "set null" }),
    walrusBlobId: text("walrus_blob_id").notNull(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    ref: text("ref").notNull(),
    distance: real("distance"),
    /** retrieved → passed relevance filter → applied (changed a decision or was cited). */
    disposition: text("disposition").$type<"retrieved" | "filtered_out" | "considered" | "applied">().notNull(),
    filterReason: text("filter_reason"),
    influence: text("influence"),
    decisionChanged: text("decision_changed"),
    retrievedAt: ts("retrieved_at").notNull().defaultNow(),
  },
  (t) => [index("memory_usage_run_idx").on(t.runId), index("memory_usage_memory_idx").on(t.memoryId)],
);

export const memoryCorrection = pgTable(
  "memory_correction",
  {
    id: text("id").primaryKey(),
    memoryId: text("memory_id")
      .notNull()
      .references(() => learningMemory.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    note: text("note").notNull(),
    evidence: text("evidence"),
    verificationStatus: text("verification_status").$type<"verified" | "unverified" | "contradicted">().notNull(),
    verificationDetail: text("verification_detail"),
    replacementMemoryId: text("replacement_memory_id"),
    createdAt: created(),
  },
  (t) => [index("memory_correction_memory_idx").on(t.memoryId)],
);

export const runFeedback = pgTable(
  "run_feedback",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    claimRef: text("claim_ref"),
    note: text("note").notNull(),
    evidence: text("evidence"),
    verificationStatus: text("verification_status").$type<"verified" | "unverified" | "contradicted">().notNull(),
    verificationDetail: text("verification_detail"),
    failureId: text("failure_id"),
    createdAt: created(),
  },
  (t) => [index("run_feedback_run_idx").on(t.runId)],
);

/* ───────────────────────────── Tool performance ───────────────────────────── */

export const toolPerformanceObservation = pgTable(
  "tool_performance_observation",
  {
    id: text("id").primaryKey(),
    toolId: text("tool_id").notNull(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    toolExecutionId: text("tool_execution_id").notNull(),
    userId: text("user_id").notNull(),
    taskCategory: text("task_category"),
    executionStatus: text("execution_status").notNull(),
    verificationStatus: text("verification_status").$type<"verified" | "contradicted" | "not_cited" | "pending">().notNull(),
    latencyMs: integer("latency_ms"),
    quotedPriceAtomic: amount("quoted_price_atomic"),
    settledAmountAtomic: amount("settled_amount_atomic"),
    assetType: text("asset_type"),
    paymentDigest: text("payment_digest"),
    outcome: text("outcome").$type<"useful" | "not_useful" | "failed" | "unknown">().notNull(),
    isEvaluation: boolean("is_evaluation").notNull().default(false),
    recordedAt: ts("recorded_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tool_obs_execution_uq").on(t.toolExecutionId), index("tool_obs_tool_idx").on(t.toolId, t.recordedAt)],
);

export const toolReliabilitySnapshot = pgTable(
  "tool_reliability_snapshot",
  {
    id: text("id").primaryKey(),
    toolId: text("tool_id").notNull(),
    taskCategory: text("task_category"),
    sampleSize: integer("sample_size").notNull(),
    successCount: integer("success_count").notNull(),
    usefulCount: integer("useful_count").notNull(),
    contradictedCount: integer("contradicted_count").notNull(),
    failureCount: integer("failure_count").notNull(),
    /** Wilson lower bound of success rate; null when sample size is insufficient. */
    successRateLowerBound: real("success_rate_lower_bound"),
    usefulRateLowerBound: real("useful_rate_lower_bound"),
    p50LatencyMs: integer("p50_latency_ms"),
    p95LatencyMs: integer("p95_latency_ms"),
    method: text("method").notNull(),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [index("tool_snapshot_tool_idx").on(t.toolId, t.computedAt)],
);

/* ───────────────────────────── Payments (x402 on Sui) ───────────────────────────── */

export const paymentIntentStatus = pgEnum("payment_intent_status", [
  "awaiting_approval",
  "approved",
  "rejected",
  "expired",
  "settling",
  "settled",
  "failed",
  "unknown",
  "cancelled",
]);

export const paymentIntent = pgTable(
  "payment_intent",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => agentRun.id, { onDelete: "set null" }),
    toolId: text("tool_id").notNull(),
    resourceUrl: text("resource_url").notNull(),
    toolInput: jsonb("tool_input").$type<unknown>().notNull(),
    network: text("network").notNull(),
    scheme: text("scheme").notNull(),
    asset: text("asset").notNull(),
    assetDecimals: integer("asset_decimals"),
    assetSymbol: text("asset_symbol"),
    amountAtomic: amount("amount_atomic").notNull(),
    payTo: text("pay_to").notNull(),
    maxTimeoutSeconds: integer("max_timeout_seconds").notNull(),
    /** The exact PaymentRequirements the resource server returned in its 402. */
    paymentRequirements: jsonb("payment_requirements").$type<unknown>().notNull(),
    reason: text("reason").notNull(),
    alternatives: jsonb("alternatives").$type<unknown>(),
    status: paymentIntentStatus("status").notNull().default("awaiting_approval"),
    idempotencyKey: text("idempotency_key").notNull(),
    expiresAt: ts("expires_at").notNull(),
    decidedAt: ts("decided_at"),
    isEvaluation: boolean("is_evaluation").notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("payment_intent_idem_uq").on(t.idempotencyKey),
    index("payment_intent_user_idx").on(t.userId, t.createdAt),
    index("payment_intent_status_idx").on(t.status),
  ],
);

export const paymentAuthorization = pgTable("payment_authorization", {
  id: text("id").primaryKey(),
  intentId: text("intent_id")
    .notNull()
    .unique()
    .references(() => paymentIntent.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  decision: text("decision").$type<"approved" | "rejected">().notNull(),
  walletAddress: text("wallet_address"),
  /** Base64 BCS TransactionData the wallet signed. Never a private key. */
  transactionBytes: text("transaction_bytes"),
  signature: text("signature"),
  /** Digest derived locally from the signed bytes — used for reconciliation. */
  expectedDigest: text("expected_digest"),
  createdAt: created(),
});

export const paymentTransaction = pgTable(
  "payment_transaction",
  {
    id: text("id").primaryKey(),
    intentId: text("intent_id")
      .notNull()
      .references(() => paymentIntent.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    digest: text("digest").notNull(),
    facilitator: text("facilitator").notNull(),
    settleResponse: jsonb("settle_response").$type<unknown>(),
    status: text("status").$type<"submitted" | "confirmed" | "failed" | "unknown">().notNull(),
    submittedAt: ts("submitted_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_tx_digest_uq").on(t.digest), index("payment_tx_intent_idx").on(t.intentId)],
);

export const paymentSettlement = pgTable("payment_settlement", {
  id: text("id").primaryKey(),
  intentId: text("intent_id")
    .notNull()
    .unique()
    .references(() => paymentIntent.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  digest: text("digest").notNull(),
  network: text("network").notNull(),
  checkpoint: text("checkpoint"),
  executionSuccess: boolean("execution_success"),
  sender: text("sender"),
  assetVerified: boolean("asset_verified").notNull(),
  recipientVerified: boolean("recipient_verified").notNull(),
  amountVerified: boolean("amount_verified").notNull(),
  observedAmountAtomic: amount("observed_amount_atomic"),
  verifiedVia: text("verified_via").notNull(),
  finalState: text("final_state").$type<"settled" | "failed" | "mismatch" | "unknown">().notNull(),
  detail: jsonb("detail").$type<unknown>(),
  verifiedAt: ts("verified_at").notNull().defaultNow(),
});

/**
 * Seller-side ledger of the x402-protected specialist API (operated by
 * RecallIQ). One row per payment digest: replay protection and idempotent
 * re-delivery of a paid result after an ambiguous settlement.
 */
export const x402Sale = pgTable(
  "x402_sale",
  {
    id: text("id").primaryKey(),
    digest: text("digest").notNull(),
    payer: text("payer").notNull(),
    payTo: text("pay_to").notNull(),
    asset: text("asset").notNull(),
    amountAtomic: amount("amount_atomic").notNull(),
    network: text("network").notNull(),
    resource: text("resource").notNull(),
    requestHash: text("request_hash").notNull(),
    facilitator: text("facilitator").notNull(),
    status: text("status").$type<"verified" | "settled" | "settlement_pending" | "failed">().notNull(),
    settleResponse: jsonb("settle_response").$type<unknown>(),
    result: jsonb("result").$type<unknown>(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("x402_sale_digest_uq").on(t.digest)],
);

/* ───────────────────────────── Evaluation ───────────────────────────── */

export const evaluationRun = pgTable(
  "evaluation_run",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    methodology: text("methodology").notNull(),
    tasks: jsonb("tasks").$type<EvaluationTask[]>().notNull(),
    modes: jsonb("modes").$type<Array<"baseline" | "memory">>().notNull(),
    faultInjection: jsonb("fault_injection").$type<FaultInjection | null>(),
    provider: text("provider"),
    model: text("model"),
    limits: jsonb("limits").$type<RunLimitsSnapshot>().notNull(),
    status: text("status").$type<"queued" | "running" | "completed" | "failed" | "cancelled">().notNull().default("queued"),
    summary: jsonb("summary").$type<EvaluationSummary | null>(),
    createdAt: created(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("evaluation_run_user_idx").on(t.userId, t.createdAt)],
);

export const evaluationResult = pgTable(
  "evaluation_result",
  {
    id: text("id").primaryKey(),
    evaluationRunId: text("evaluation_run_id")
      .notNull()
      .references(() => evaluationRun.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    taskIndex: integer("task_index").notNull(),
    mode: text("mode").$type<"baseline" | "memory">().notNull(),
    agentRunId: text("agent_run_id"),
    status: text("status").$type<"pending" | "running" | "done" | "failed">().notNull().default("pending"),
    completed: boolean("completed"),
    verifiedClaims: integer("verified_claims"),
    contradictedClaims: integer("contradicted_claims"),
    unverifiedClaims: integer("unverified_claims"),
    toolCalls: integer("tool_calls"),
    toolFailures: integer("tool_failures"),
    paidSpendAtomic: amount("paid_spend_atomic"),
    modelCostMicroUsd: bigint("model_cost_micro_usd", { mode: "bigint" }),
    durationMs: integer("duration_ms"),
    memoriesRetrieved: integer("memories_retrieved"),
    memoriesApplied: integer("memories_applied"),
    decisionsChanged: jsonb("decisions_changed").$type<string[]>(),
    repeatedErrors: integer("repeated_errors"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("evaluation_result_uq").on(t.evaluationRunId, t.taskIndex, t.mode)],
);

/* ───────────────────────────── Operations ───────────────────────────── */

export const integrationHealthEvent = pgTable(
  "integration_health_event",
  {
    id: text("id").primaryKey(),
    integration: text("integration").$type<IntegrationName>().notNull(),
    status: text("status").$type<"ok" | "degraded" | "down" | "unconfigured">().notNull(),
    latencyMs: integer("latency_ms"),
    detail: text("detail"),
    checkedAt: ts("checked_at").notNull().defaultNow(),
  },
  (t) => [index("health_integration_idx").on(t.integration, t.checkedAt)],
);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    ipHash: text("ip_hash"),
    createdAt: created(),
  },
  (t) => [index("audit_user_idx").on(t.userId, t.createdAt), index("audit_action_idx").on(t.action)],
);

/** Durable job queue (FOR UPDATE SKIP LOCKED leasing — no Redis required). */
export const job = pgTable(
  "job",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<"queued" | "running" | "succeeded" | "failed" | "dead">().notNull().default("queued"),
    runAt: ts("run_at").notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedBy: text("locked_by"),
    lockedUntil: ts("locked_until"),
    lastError: text("last_error"),
    idempotencyKey: text("idempotency_key"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("job_idem_uq")
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("job_ready_idx").on(t.status, t.runAt),
  ],
);

export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/* ───────────────────────────── JSON column types ───────────────────────────── */

export type StepKind =
  | "state"
  | "plan"
  | "memory_recall"
  | "memory_filter"
  | "tool_selection"
  | "tool_call"
  | "tool_result"
  | "model"
  | "payment"
  | "verification"
  | "autopsy"
  | "memory_write"
  | "notice"
  | "error";

export interface RunInputs {
  addresses: string[];
  digests: string[];
  names: string[];
  objectIds: string[];
  /** Optional user-supplied window, ISO strings. */
  window?: { from?: string; to?: string } | null;
}

export interface FaultInjection {
  /** Tool to sabotage and how. Only accepted for evaluation runs. */
  toolId: string;
  mode: "timeout" | "error" | "empty";
  label: string;
}

export interface RunLimitsSnapshot {
  maxToolCalls: number;
  maxIterations: number;
  maxDurationMs: number;
  maxOutputTokens: number;
}

export interface RunCheckpoint {
  messages: unknown[];
  pendingPaymentIntentId?: string | null;
  toolCallCount: number;
  iterations: number;
  evidenceCounter: number;
  memoryContext?: unknown;
  usage?: { inputTokens: number; outputTokens: number };
}

export type ClaimKind = "observation" | "verified_fact" | "interpretation" | "hypothesis" | "unknown";

export interface FinalReport {
  answer: string;
  claims: Array<{
    ref: string;
    statement: string;
    kind: ClaimKind;
    evidenceRefs: string[];
    assertion?: unknown;
  }>;
  limitations: string[];
  toolRationale: Array<{ tool: string; why: string }>;
  memoriesApplied: Array<{ ref: string; how: string }>;
  paidAnalysis?: { intentId: string; useful: boolean; why: string } | null;
}

export interface ToolPlanRecord {
  taskCategory: string;
  candidates: Array<{
    toolId: string;
    offered: boolean;
    score: number | null;
    reasons: string[];
  }>;
  paidToolDecision: { offered: boolean; reasons: string[] } | null;
  directivesApplied: Array<{ directive: string; memoryRef: string; effect: string }>;
}

export type FailureCategory =
  | "decimal_scaling_error"
  | "direction_error"
  | "status_misread"
  | "attribution_error"
  | "asset_confusion"
  | "unsupported_claim"
  | "missing_evidence"
  | "tool_timeout"
  | "tool_error"
  | "malformed_provider_response"
  | "payment_failed"
  | "paid_tool_not_useful"
  | "execution_limit_reached"
  | "incomplete_analysis"
  | "user_reported_error";

export type MemoryType = "failure" | "success" | "tool_reliability" | "cost_efficiency" | "strategy" | "user_preference" | "correction";

/** Machine-applicable directives — an allowlist; free text never becomes policy. */
export type MemoryDirective =
  | "verify_coin_decimals"
  | "check_status_before_amounts"
  | "confirm_balance_change_direction"
  | "cross_check_sender"
  | "cite_evidence_for_every_fact"
  | "prefer_tool_for_category"
  | "avoid_tool_for_category"
  | "paid_tool_useful_for_category"
  | "paid_tool_unnecessary_for_category"
  | "tool_timeout_risk";

export interface EvidenceReference {
  kind: "run" | "transaction" | "address" | "evidence" | "verification" | "payment";
  id: string;
  label?: string;
}

export interface EvaluationTask {
  task: string;
  /** Category the operator expects; recorded for comparability only. */
  label?: string;
}

export interface EvaluationSummary {
  sampleSize: number;
  modes: Record<
    string,
    {
      runs: number;
      completed: number;
      verifiedClaims: number;
      contradictedClaims: number;
      unverifiedClaims: number;
      toolCalls: number;
      toolFailures: number;
      memoriesApplied: number;
      medianDurationMs: number | null;
      repeatedErrors: number;
    }
  >;
  conclusion: string;
  inconclusive: boolean;
}

export type IntegrationName = "database" | "tatum" | "walrus" | "llm" | "x402";
