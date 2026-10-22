/**
 * Walrus Memory (MemWal) store adapter — the only place the SDK is called.
 *
 * Server-side only: the delegate key never leaves this process. Adds:
 *   • retry with backoff for transient relayer failures only (never 4xx / auth)
 *   • a shared cooldown after a 429 so we stop hammering a locked key
 *   • a narrow interface so tests inject the SDK's own MemWalMock
 *
 * When credentials are missing the store is null and memory features report
 * "not configured" — RecallIQ never simulates memory in the live app.
 */
import { MemWal } from "@mysten-incubation/memwal";
import type { HealthResult, RecallResult, RememberAcceptedResult, RememberJobStatus, RestoreResult } from "@mysten-incubation/memwal";
import { memwalConfig } from "@/lib/env";
import { logger } from "@/lib/logging/logger";

const log = logger("memwal");

export type MemoryBackend = "walrus" | "test-mock";

export interface MemoryStore {
  readonly backend: MemoryBackend;
  readonly network: string;
  remember(text: string, namespace: string, idempotencyKey: string): Promise<RememberAcceptedResult>;
  getRememberStatus(jobId: string): Promise<RememberJobStatus>;
  recall(params: { query: string; namespace: string; limit: number; maxDistance?: number }): Promise<RecallResult>;
  restore(namespace: string, limit?: number): Promise<RestoreResult>;
  health(): Promise<HealthResult>;
}

export interface MemoryError extends Error {
  status?: number;
}

export function isRetryable(err: unknown): boolean {
  const status = (err as MemoryError)?.status;
  if (status === undefined || status === 0) return true; // network error / timeout
  if (status === 408 || status === 425) return true;
  if (status === 429) return false; // retrying extends the relayer lockout
  return status >= 500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || i === attempts - 1) throw err;
      await sleep(2 ** i * 400 + Math.floor(Math.random() * 200));
    }
  }
  throw lastErr;
}

const shared = globalThis as unknown as { __recalliqWalrusCooldownUntil?: number };

export function walrusCooldownMs(): number {
  return Math.max(0, (shared.__recalliqWalrusCooldownUntil ?? 0) - Date.now());
}

function noteRateLimit(err: unknown): void {
  const e = err as MemoryError;
  if (e?.status !== 429) return;
  const seconds = Number(/retry_after_seconds\\?"?\s*:\s*(\d+)/.exec(e.message ?? "")?.[1] ?? 30);
  shared.__recalliqWalrusCooldownUntil = Date.now() + seconds * 1000;
  log.warn("relayer rate limit reached — pausing Walrus calls", { seconds });
}

/*
 * Observed outcomes of real relayer calls. The relayer's /health is a liveness
 * probe: it stays "ok" while recall or remember fail, so the health check also
 * reports what this process actually saw.
 */
export type WalrusOp = "recall" | "remember";
interface OpOutcome {
  ok: boolean;
  at: number;
  failingSince: number | null;
  status: number | null;
  message: string | null;
}
const observed = globalThis as unknown as { __recalliqWalrusObserved?: Partial<Record<WalrusOp, OpOutcome>> };

function observe(op: WalrusOp, err: unknown | null): void {
  const all = (observed.__recalliqWalrusObserved ??= {});
  const prev = all[op];
  const now = Date.now();
  const e = err as MemoryError | null;
  all[op] = err
    ? { ok: false, at: now, failingSince: prev && !prev.ok ? prev.failingSince : now, status: e?.status ?? null, message: e?.message?.slice(0, 160) ?? null }
    : { ok: true, at: now, failingSince: null, status: null, message: null };
}

/** Operations whose most recent real call failed within the window. */
export function walrusObservedFailures(windowMs = 15 * 60_000): Array<{ op: WalrusOp; since: number; status: number | null; message: string | null }> {
  const now = Date.now();
  return Object.entries(observed.__recalliqWalrusObserved ?? {}).flatMap(([op, o]) =>
    o && !o.ok && now - o.at < windowMs ? [{ op: op as WalrusOp, since: o.failingSince ?? o.at, status: o.status, message: o.message }] : [],
  );
}

/** Tests only. */
export function resetWalrusObservations(): void {
  observed.__recalliqWalrusObserved = {};
}

async function call<T>(op: WalrusOp | null, fn: () => Promise<T>, attempts = 3): Promise<T> {
  const wait = walrusCooldownMs();
  if (wait > 0) {
    const err = new Error(`Walrus Memory relayer is rate-limiting this deployment; retry in ${Math.ceil(wait / 1000)}s`) as MemoryError;
    err.status = 429;
    throw err;
  }
  try {
    const value = await withRetry(fn, attempts);
    if (op) observe(op, null);
    return value;
  } catch (err) {
    if (op) observe(op, err);
    noteRateLimit(err);
    throw err;
  }
}

type SdkClient = Pick<MemWal, "remember" | "getRememberStatus" | "recall" | "restore" | "health">;

export function wrapClient(client: SdkClient, backend: MemoryBackend, network: string): MemoryStore {
  return {
    backend,
    network,
    remember: (text, namespace, idempotencyKey) => call("remember", () => client.remember(text, namespace, { idempotencyKey }), 2),
    getRememberStatus: (jobId) => call("remember", () => client.getRememberStatus(jobId), 2),
    recall: ({ query, namespace, limit, maxDistance }) =>
      call("recall", () => client.recall({ query, namespace, limit, ...(maxDistance !== undefined ? { maxDistance } : {}) }), 2),
    restore: (namespace, limit) => call(null, () => client.restore(namespace, limit), 1),
    health: () => client.health(),
  };
}

const g = globalThis as unknown as { __recalliqMemoryStore?: MemoryStore | null; __recalliqMemoryOverride?: MemoryStore | null };

/** The configured store, or null when Walrus Memory credentials are absent. */
export function memoryStore(): MemoryStore | null {
  if (g.__recalliqMemoryOverride !== undefined) return g.__recalliqMemoryOverride;
  if (g.__recalliqMemoryStore !== undefined) return g.__recalliqMemoryStore;
  const cfg = memwalConfig();
  if (!cfg.configured) {
    g.__recalliqMemoryStore = null;
    return null;
  }
  const client = MemWal.create({
    key: cfg.key!,
    accountId: cfg.accountId!,
    serverUrl: cfg.serverUrl,
    namespace: `${cfg.namespacePrefix}-default`,
    requestTimeoutMs: 30_000,
  });
  g.__recalliqMemoryStore = wrapClient(client, "walrus", cfg.network);
  return g.__recalliqMemoryStore;
}

/** Tests only: inject a store (e.g. the SDK's MemWalMock) or null for "not configured". */
export function setMemoryStoreOverride(store: MemoryStore | null | undefined): void {
  g.__recalliqMemoryOverride = store;
}
