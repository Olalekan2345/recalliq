/**
 * Integration health. Reports the real state of each dependency — never a
 * synthetic "ok". Results are persisted as IntegrationHealthEvent rows.
 */
import { desc, eq, sql } from "drizzle-orm";
import { chain } from "@/lib/blockchain/tatum/client";
import { db, isDatabaseConfigured } from "@/lib/db/client";
import { integrationHealthEvent, type IntegrationName } from "@/lib/db/schema";
import { memwalConfig, tatumConfig, x402Config } from "@/lib/env";
import { newId } from "@/lib/security/ids";
import { safeErrorMessage } from "@/lib/security/redact";
import { memoryStore, walrusObservedFailures } from "@/lib/memory/memwal/store";
import { resolveModel } from "@/lib/ai/providers";

export interface HealthCheck {
  integration: IntegrationName;
  status: "ok" | "degraded" | "down" | "unconfigured";
  latencyMs: number | null;
  detail: string;
  meta?: Record<string, unknown>;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown; ms: number }> {
  const t = Date.now();
  try {
    return { value: await fn(), ms: Date.now() - t };
  } catch (error) {
    return { error, ms: Date.now() - t };
  }
}

export async function checkDatabase(): Promise<HealthCheck> {
  if (!isDatabaseConfigured()) return { integration: "database", status: "unconfigured", latencyMs: null, detail: "DATABASE_URL not set" };
  const r = await timed(() => db().execute(sql`select 1`));
  return r.error
    ? { integration: "database", status: "down", latencyMs: r.ms, detail: safeErrorMessage(r.error, 160) }
    : { integration: "database", status: "ok", latencyMs: r.ms, detail: "PostgreSQL reachable" };
}

export async function checkTatum(): Promise<HealthCheck> {
  const cfg = tatumConfig();
  const r = await timed(() => chain().serviceInfo());
  if (r.error)
    return {
      integration: "tatum",
      status: "down",
      latencyMs: r.ms,
      detail: safeErrorMessage(r.error, 160),
      meta: { host: cfg.host, authenticated: cfg.configured },
    };
  const info = r.value!.data;
  return {
    integration: "tatum",
    status: cfg.configured ? "ok" : "degraded",
    latencyMs: r.ms,
    detail: cfg.configured
      ? `Sui ${info.chain} · checkpoint ${info.checkpointHeight} · ${info.server}`
      : `Reachable without an API key (rate-limited) · checkpoint ${info.checkpointHeight}`,
    meta: {
      host: cfg.host,
      authenticated: cfg.configured,
      chain: info.chain,
      checkpointHeight: info.checkpointHeight,
      epoch: info.epoch,
      lowestAvailableCheckpoint: info.lowestAvailableCheckpoint,
      server: info.server,
    },
  };
}

export async function checkWalrus(): Promise<HealthCheck> {
  const cfg = memwalConfig();
  const store = memoryStore();
  if (!store)
    return {
      integration: "walrus",
      status: "unconfigured",
      latencyMs: null,
      detail: "MEMWAL_KEY / MEMWAL_ACCOUNT_ID not set",
      meta: { serverUrl: cfg.serverUrl },
    };
  const r = await timed(() => store.health());
  if (r.error) return { integration: "walrus", status: "down", latencyMs: r.ms, detail: safeErrorMessage(r.error, 160), meta: { serverUrl: cfg.serverUrl } };
  const h = r.value!;
  // /health is liveness only — also report recall/remember calls that are failing right now.
  const failing = walrusObservedFailures();
  const failingText = failing
    .map((f) => ` · ${f.op} failing${f.status ? ` (HTTP ${f.status})` : ""} since ${new Date(f.since).toISOString().slice(11, 16)} UTC`)
    .join("");
  return {
    integration: "walrus",
    status: h.status === "ok" && h.write_ready !== false && failing.length === 0 ? "ok" : "degraded",
    latencyMs: r.ms,
    detail: `Relayer ${h.status}${h.version ? ` v${h.version}` : ""}${h.write_ready === false ? " (writes not ready)" : ""}${failingText}`,
    meta: { serverUrl: cfg.serverUrl, network: cfg.network, accountId: cfg.accountId, failing },
  };
}

export function checkLlm(): HealthCheck {
  const m = resolveModel();
  return m.configured
    ? {
        integration: "llm",
        status: "ok",
        latencyMs: null,
        detail: `${m.provider} · ${m.modelId}${m.pricing ? "" : " (cost tracking unavailable)"}`,
        meta: { provider: m.provider, model: m.modelId },
      }
    : { integration: "llm", status: "unconfigured", latencyMs: null, detail: m.reason ?? "Not configured" };
}

export function checkX402(): HealthCheck {
  const cfg = x402Config();
  if (!cfg.configured) return { integration: "x402", status: "unconfigured", latencyMs: null, detail: "X402_PAY_TO / X402_FORENSICS_PRICE_ATOMIC not set" };
  return {
    integration: "x402",
    status: "ok",
    latencyMs: null,
    detail: `${cfg.network} · facilitator ${cfg.facilitatorMode === "self" ? "self (Tatum gRPC)" : cfg.facilitatorUrl}`,
    meta: { network: cfg.network, asset: cfg.asset, payTo: cfg.payTo, priceAtomic: cfg.forensicsPriceAtomic, facilitator: cfg.facilitatorMode },
  };
}

export async function runHealthChecks(persist = true): Promise<HealthCheck[]> {
  const checks = await Promise.all([checkDatabase(), checkTatum(), checkWalrus()]);
  checks.push(checkLlm(), checkX402());
  if (persist && checks[0]!.status === "ok") {
    await db()
      .insert(integrationHealthEvent)
      .values(checks.map((c) => ({ id: newId(), integration: c.integration, status: c.status, latencyMs: c.latencyMs, detail: c.detail.slice(0, 300) })))
      .catch(() => undefined);
  }
  return checks;
}

export async function latestHealth(): Promise<Array<typeof integrationHealthEvent.$inferSelect>> {
  const out: Array<typeof integrationHealthEvent.$inferSelect> = [];
  for (const name of ["database", "tatum", "walrus", "llm", "x402"] as const) {
    const [row] = await db()
      .select()
      .from(integrationHealthEvent)
      .where(eq(integrationHealthEvent.integration, name))
      .orderBy(desc(integrationHealthEvent.checkedAt))
      .limit(1);
    if (row) out.push(row);
  }
  return out;
}
