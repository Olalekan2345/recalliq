/**
 * LIVE: Tatum Sui Mainnet gRPC. Real network calls, no fixtures.
 * Runs with or without TATUM_API_KEY (keyless access is heavily rate-limited).
 */
import { describe, expect, it } from "vitest";
import { SuiChainClient } from "@/lib/blockchain/tatum/client";
import { VerificationContext, verifyAssertion } from "@/lib/ai/verification/engine";

const host = (process.env.TATUM_SUI_GRPC_URL ?? "sui-mainnet-grpc.gateway.tatum.io:443").replace(/^https?:\/\//, "");
const client = new SuiChainClient({
  host: host.includes(":") ? host : `${host}:443`,
  apiKey: process.env.TATUM_API_KEY,
  timeoutMs: 25_000,
  network: "mainnet",
});

describe(`LIVE Sui gRPC @ ${host} (${client.isAuthenticated ? "authenticated" : "keyless"})`, () => {
  let digest = "";
  let sender = "";

  it("connects to Sui Mainnet", async () => {
    const info = await client.serviceInfo();
    expect(info.data.chain).toBe("mainnet");
    expect(Number(info.data.checkpointHeight)).toBeGreaterThan(300_000_000);
    expect(info.provenance.provider).toBe("tatum");
  });

  it("reads a real user transaction from a recent checkpoint", async () => {
    const latest = await client.getCheckpoint(null, { includeContents: true });
    const candidates = (latest.data.transactionDigests ?? []).slice(-12);
    const batch = await client.batchGetTransactions(candidates);
    const user = batch.data.find((t) => "sender" in t && t.sender && !/^0x0+$/.test(t.sender));
    expect(user, "a non-system transaction in the latest checkpoint").toBeTruthy();
    const tx = user as Exclude<typeof user, { error: string }>;
    digest = tx!.digest;
    sender = tx!.sender!;
    const full = await client.getTransaction(digest);
    expect(full.data.status).toMatch(/success|failure/);
    expect(full.data.checkpoint).toBe(latest.data.sequenceNumber);
  });

  it("lists address history through LedgerService/ListTransactions", async () => {
    // The address index trails the chain tip and busy senders post constantly, so assert
    // the contract (newest-first, valid, non-empty) rather than a specific digest.
    const list = await client.listAddressTransactions(sender, { limit: 3 });
    expect(list.data.items.length).toBeGreaterThan(0);
    const cps = list.data.items.map((i) => BigInt(i.checkpoint ?? "0"));
    expect([...cps].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))).toEqual(cps);
    expect(list.data.items.every((i) => i.digest.length >= 43)).toBe(true);
  });

  it("returns on-chain coin decimals", async () => {
    const sui = await client.getCoinInfo("0x2::sui::SUI");
    expect(sui.data.decimals).toBe(9);
    expect(sui.data.symbol).toBe("SUI");
  });

  it("verification engine verifies a real fact and contradicts a false one", async () => {
    const ctx = new VerificationContext(client);
    const tx = (await client.getTransaction(digest)).data;
    expect((await verifyAssertion(ctx, { type: "tx_status", digest, expected: tx.status === "success" ? "success" : "failure" })).status).toBe("VERIFIED");
    expect((await verifyAssertion(ctx, { type: "tx_sender", digest, address: "0x" + "1".repeat(64) })).status).toBe("CONTRADICTED");
  });

  it("verifies the live head as current and an old checkpoint as stale", async () => {
    const ctx = new VerificationContext(client);
    const head = (await client.serviceInfo()).data.checkpointHeight!;
    expect((await verifyAssertion(ctx, { type: "latest_checkpoint", checkpoint: head })).status).toBe("VERIFIED");
    const tx = (await client.getTransaction(digest)).data;
    const old = (BigInt(tx.checkpoint!) - 100_000n).toString(); // ~7 h earlier at Mainnet cadence
    expect((await verifyAssertion(ctx, { type: "latest_checkpoint", checkpoint: old })).status).toBe("CONTRADICTED");
  });
});
