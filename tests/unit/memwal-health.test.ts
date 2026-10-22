/**
 * The relayer's /health stays "ok" while recall fails (seen live: HTTP 500 on
 * every recall). The health check must report what real calls observed.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetWalrusObservations, setMemoryStoreOverride, walrusObservedFailures, wrapClient } from "@/lib/memory/memwal/store";
import { checkWalrus } from "@/server/services/health";

function relayerError(status: number) {
  return Object.assign(new Error(`Walrus Memory server error (${status})`), { status });
}

let recallFails = true;
const client = {
  remember: async () => ({ job_id: "j1", status: "pending" }),
  getRememberStatus: async () => ({ job_id: "j1", status: "done" }),
  recall: async () => {
    if (recallFails) throw relayerError(500);
    return { results: [], total: 0 };
  },
  restore: async () => ({ restored: 0, skipped: 0, total: 0, namespace: "n", owner: "o" }),
  health: async () => ({ status: "ok", version: "0.1.0" }),
};
const store = wrapClient(client as unknown as Parameters<typeof wrapClient>[0], "test-mock", "test");

beforeEach(() => {
  resetWalrusObservations();
  setMemoryStoreOverride(store);
});
afterAll(() => setMemoryStoreOverride(undefined));

describe("Walrus health reflects observed failures", () => {
  it("is degraded while recall fails, even though /health says ok", async () => {
    recallFails = true;
    await expect(store.recall({ query: "q", namespace: "n", limit: 1 })).rejects.toThrow(/500/);
    expect(walrusObservedFailures()).toEqual([expect.objectContaining({ op: "recall", status: 500 })]);
    const check = await checkWalrus();
    expect(check.status).toBe("degraded");
    expect(check.detail).toMatch(/recall failing \(HTTP 500\)/);
  });

  it("recovers to ok after a successful recall", async () => {
    recallFails = true;
    await expect(store.recall({ query: "q", namespace: "n", limit: 1 })).rejects.toThrow();
    recallFails = false;
    await store.recall({ query: "q", namespace: "n", limit: 1 });
    expect(walrusObservedFailures()).toEqual([]);
    expect((await checkWalrus()).status).toBe("ok");
  });

  it("records client errors without retrying them", async () => {
    let calls = 0;
    const s = wrapClient(
      {
        ...client,
        recall: async () => {
          calls++;
          throw relayerError(400);
        },
      } as unknown as Parameters<typeof wrapClient>[0],
      "test-mock",
      "test",
    );
    await expect(s.recall({ query: "q", namespace: "n", limit: 1 })).rejects.toThrow();
    expect(calls).toBe(1);
    expect(walrusObservedFailures()[0]).toMatchObject({ op: "recall", status: 400 });
  });
});
