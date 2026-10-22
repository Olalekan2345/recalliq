/**
 * Server-side configuration. Parsed lazily (so `next build` works without
 * secrets) and validated with zod. Every integration exposes an explicit
 * "configured" flag — when a credential is missing the feature reports that
 * state honestly instead of falling back to synthetic data.
 *
 * Never import this module from client components (non-NEXT_PUBLIC values are
 * undefined in the browser bundle anyway, but secrets must never be referenced
 * from client code). It is shared with the background worker, so it does not
 * use the Next-only `server-only` guard.
 */
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "true" || v === "1"));

const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce
    .number()
    .int()
    .min(min)
    .max(max)
    .optional()
    .transform((v) => v ?? def);

/** Non-negative integer amount in atomic units, kept as a string (never a float). */
const atomic = z.string().regex(/^\d+$/, "must be a non-negative integer in atomic units").optional();

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  DATABASE_URL: optionalString,
  DATABASE_POOL_MAX: int(10, 1, 100),

  BETTER_AUTH_SECRET: optionalString,
  AUTH_SECRET: optionalString,
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3300"),
  GUEST_ACCESS_ENABLED: bool(true),

  LLM_PROVIDER: z.enum(["anthropic", "openai", "groq", "google"]).default("anthropic"),
  LLM_MODEL: optionalString,
  LLM_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  GROQ_API_KEY: optionalString,
  GOOGLE_GENERATIVE_AI_API_KEY: optionalString,
  /** Optional operator-supplied pricing for providers without a verified price table. */
  LLM_PRICE_INPUT_USD_PER_MTOK: z.coerce.number().positive().optional(),
  LLM_PRICE_OUTPUT_USD_PER_MTOK: z.coerce.number().positive().optional(),

  SUI_NETWORK: z.enum(["mainnet", "testnet"]).default("mainnet"),
  TATUM_API_KEY: optionalString,
  TATUM_SUI_GRPC_URL: z.string().default("sui-mainnet-grpc.gateway.tatum.io:443"),
  TATUM_TIMEOUT_MS: int(20_000, 1_000, 120_000),
  /** Requests per second allowed by your Tatum plan (free plan: 3). Calls are paced to stay under it. */
  TATUM_MAX_RPS: int(3, 1, 1_000),
  /**
   * Optional, disclosed fallback used ONLY when Tatum reports a method as
   * UNIMPLEMENTED (a capability gap). Never used to mask Tatum errors.
   */
  SUI_FALLBACK_GRPC_URL: optionalString,

  MEMWAL_KEY: optionalString,
  MEMWAL_PRIVATE_KEY: optionalString,
  MEMWAL_ACCOUNT_ID: optionalString,
  MEMWAL_SERVER_URL: z.string().url().default("https://relayer.memory.walrus.xyz"),
  MEMWAL_NAMESPACE_PREFIX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,30}$/)
    .default("recalliq"),
  MEMWAL_RECALL_MAX_DISTANCE: z.coerce.number().min(0).max(2).default(0.72),
  MEMWAL_MAX_WRITES_PER_RUN: int(4, 0, 20),

  X402_NETWORK: z.enum(["sui:mainnet", "sui:testnet"]).default("sui:mainnet"),
  X402_FACILITATOR_MODE: z.enum(["self", "remote"]).default("self"),
  X402_FACILITATOR_URL: optionalString,
  X402_PAY_TO: optionalString,
  X402_ALLOWED_RECIPIENTS: optionalString,
  X402_PAYMENT_ASSET: z.string().default("0x2::sui::SUI"),
  X402_FORENSICS_PRICE_ATOMIC: atomic,
  X402_MAX_TIMEOUT_SECONDS: int(300, 30, 3_600),

  PAYMENT_MAX_PER_TX_ATOMIC: atomic,
  PAYMENT_MAX_PER_DAY_ATOMIC: atomic,

  // inline: polling worker inside the web server; external: `pnpm worker` elsewhere;
  // serverless: no worker, requests drain the queue with after() (Vercel); off: nothing runs jobs.
  WORKER_MODE: z.enum(["inline", "external", "serverless", "off"]).default("inline"),
  WORKER_CONCURRENCY: int(3, 1, 16),
  // Vercel Cron sends it as a bearer token to /api/jobs/drain.
  CRON_SECRET: optionalString,

  AGENT_MAX_TOOL_CALLS: int(14, 1, 60),
  AGENT_MAX_ITERATIONS: int(12, 1, 40),
  AGENT_MAX_DURATION_MS: int(240_000, 10_000, 900_000),
  AGENT_MAX_OUTPUT_TOKENS: int(8_000, 512, 64_000),
  AGENT_MAX_CONCURRENT_RUNS_PER_USER: int(2, 1, 10),
  AGENT_MAX_RUNS_PER_HOUR_PER_USER: int(30, 1, 1_000),
  GUEST_MAX_RUNS_PER_DAY: int(5, 0, 100),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Tests only. */
export function resetEnvCache(): void {
  cached = undefined;
}

export function authSecret(): string | undefined {
  const e = env();
  return e.BETTER_AUTH_SECRET ?? e.AUTH_SECRET;
}

export function memwalConfig() {
  const e = env();
  const key = e.MEMWAL_KEY ?? e.MEMWAL_PRIVATE_KEY;
  return {
    configured: Boolean(key && e.MEMWAL_ACCOUNT_ID),
    key,
    accountId: e.MEMWAL_ACCOUNT_ID,
    serverUrl: e.MEMWAL_SERVER_URL,
    namespacePrefix: e.MEMWAL_NAMESPACE_PREFIX,
    maxDistance: e.MEMWAL_RECALL_MAX_DISTANCE,
    maxWritesPerRun: e.MEMWAL_MAX_WRITES_PER_RUN,
    network: e.MEMWAL_SERVER_URL.includes("staging") ? "testnet" : "mainnet",
  } as const;
}

export function tatumConfig() {
  const e = env();
  return {
    /** Keyless access works but is rate-limited within a handful of calls. */
    configured: Boolean(e.TATUM_API_KEY),
    apiKey: e.TATUM_API_KEY,
    host: e.TATUM_SUI_GRPC_URL.replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .includes(":")
      ? e.TATUM_SUI_GRPC_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")
      : `${e.TATUM_SUI_GRPC_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}:443`,
    timeoutMs: e.TATUM_TIMEOUT_MS,
    network: e.SUI_NETWORK,
    fallbackHost: e.SUI_FALLBACK_GRPC_URL?.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    maxRps: e.TATUM_MAX_RPS,
  } as const;
}

export function x402Config() {
  const e = env();
  const allowed = (e.X402_ALLOWED_RECIPIENTS ?? e.X402_PAY_TO ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return {
    configured: Boolean(e.X402_PAY_TO && e.X402_FORENSICS_PRICE_ATOMIC && e.X402_FORENSICS_PRICE_ATOMIC !== "0"),
    network: e.X402_NETWORK,
    facilitatorMode: e.X402_FACILITATOR_MODE,
    facilitatorUrl: e.X402_FACILITATOR_URL,
    payTo: e.X402_PAY_TO?.toLowerCase(),
    allowedRecipients: allowed,
    asset: e.X402_PAYMENT_ASSET,
    forensicsPriceAtomic: e.X402_FORENSICS_PRICE_ATOMIC,
    maxTimeoutSeconds: e.X402_MAX_TIMEOUT_SECONDS,
    maxPerTxAtomic: e.PAYMENT_MAX_PER_TX_ATOMIC,
    maxPerDayAtomic: e.PAYMENT_MAX_PER_DAY_ATOMIC,
  } as const;
}

export function agentLimits() {
  const e = env();
  return {
    maxToolCalls: e.AGENT_MAX_TOOL_CALLS,
    maxIterations: e.AGENT_MAX_ITERATIONS,
    maxDurationMs: e.AGENT_MAX_DURATION_MS,
    maxOutputTokens: e.AGENT_MAX_OUTPUT_TOKENS,
    maxConcurrentRunsPerUser: e.AGENT_MAX_CONCURRENT_RUNS_PER_USER,
    maxRunsPerHourPerUser: e.AGENT_MAX_RUNS_PER_HOUR_PER_USER,
    guestMaxRunsPerDay: e.GUEST_MAX_RUNS_PER_DAY,
  } as const;
}

export type AgentLimits = ReturnType<typeof agentLimits>;
