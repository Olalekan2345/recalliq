/**
 * LIVE: Walrus Memory on the configured relayer (Mainnet by default).
 * Requires MEMWAL_KEY (or MEMWAL_PRIVATE_KEY) and MEMWAL_ACCOUNT_ID. Writes one
 * real, clearly labelled diagnostic memory to an isolated namespace.
 */
import { describe, expect, it } from "vitest";
import { MemWal } from "@mysten-incubation/memwal";

const key = process.env.MEMWAL_KEY ?? process.env.MEMWAL_PRIVATE_KEY;
const accountId = process.env.MEMWAL_ACCOUNT_ID;
const serverUrl = process.env.MEMWAL_SERVER_URL ?? "https://relayer.memory.walrus.xyz";
const configured = Boolean(key && accountId);

describe.skipIf(!configured)("LIVE Walrus Memory", () => {
  const namespace = `${process.env.MEMWAL_NAMESPACE_PREFIX ?? "recalliq"}-live-diagnostics`;
  const client = configured ? MemWal.create({ key: key!, accountId: accountId!, serverUrl, namespace }) : null;
  const marker = `recalliq-live-check-${Date.now()}`;

  it("relayer is healthy", async () => {
    const h = await client!.health();
    expect(h.status).toBe("ok");
  });

  it("accepts a write, completes storage with a blob id, and recalls it", async () => {
    const text = `RECALLIQ live storage diagnostic ${marker}: Walrus Memory write path verified end to end.`;
    const accepted = await client!.remember(text, namespace, { idempotencyKey: marker });
    expect(accepted.job_id).toBeTruthy();
    const done = await client!.waitForRememberJob(accepted.job_id, { pollIntervalMs: 3000, timeoutMs: 110_000 } as never);
    expect(done.blob_id).toBeTruthy();
    console.info(`[live] Walrus blob ${done.blob_id} (job ${accepted.job_id})`);
    let found = false;
    for (let i = 0; i < 6 && !found; i++) {
      const r = await client!.recall({ query: `live storage diagnostic ${marker}`, namespace, limit: 5 });
      found = r.results.some((m) => m.text.includes(marker));
      if (!found) await new Promise((res) => setTimeout(res, 5000)); // index can lag behind `done`
    }
    expect(found).toBe(true);
  }, 180_000);
});
