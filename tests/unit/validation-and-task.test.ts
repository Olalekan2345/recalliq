import { describe, expect, it } from "vitest";
import { extractIdentifiers, isValidDigest, normalizeAddress, normalizeCoinType, sameAddress, sameCoinType } from "@/lib/blockchain/sui/validation";
import { buildRecallQuery, parseTask } from "@/lib/ai/planning/task";

// A real Sui Mainnet digest/address observed through Tatum during development.
const DIGEST = "7JhVTKW7mwTmtwzxA6S9orFiFDdiLmCwAXcjJG44Nw1P";
const ADDRESS = "0xeb3d20ca03565f2e360caee698e1c910a0096541f328bf4700f4763c23d672c8";

describe("identifier validation", () => {
  it("accepts real digests and rejects lookalikes", () => {
    expect(isValidDigest(DIGEST)).toBe(true);
    expect(isValidDigest(DIGEST.slice(0, 40))).toBe(false);
    expect(isValidDigest("0OIl" + DIGEST.slice(4))).toBe(false);
  });

  it("normalizes addresses", () => {
    expect(normalizeAddress("0x2")).toBe("0x" + "0".repeat(63) + "2");
    expect(normalizeAddress("0xZZ")).toBeNull();
    expect(sameAddress(ADDRESS.toUpperCase().replace("0X", "0x"), ADDRESS)).toBe(true);
  });

  it("normalizes coin types", () => {
    expect(normalizeCoinType("0x2::sui::SUI")).toBe("0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI");
    expect(sameCoinType("0x2::sui::SUI", "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI")).toBe(true);
  });

  it("extracts identifiers from free text", () => {
    const ids = extractIdentifiers(`Did ${DIGEST} succeed? Sender ${ADDRESS}, also check alice.sui please.`);
    expect(ids.digests).toEqual([DIGEST]);
    expect(ids.hexIds).toEqual([ADDRESS]);
    expect(ids.names).toContain("alice.sui");
  });
});

describe("task classification (deterministic)", () => {
  it.each([
    [`Did transaction ${DIGEST} succeed?`, "transaction_verification"],
    [`Why did ${DIGEST} fail?`, "failed_transaction"],
    [`How much did ${ADDRESS} receive in ${DIGEST}?`, "token_transfer"],
    [`Summarise recent activity of ${ADDRESS}`, "wallet_activity"],
    [`Is there anything unusual about ${ADDRESS}?`, "anomaly_investigation"],
    [`Which contract did ${DIGEST} call?`, "contract_interaction"],
    ["What is Sui?", "general"],
  ])("%s → %s", (task, category) => {
    expect(parseTask(task).category).toBe(category);
  });

  it("merges explicit inputs and validates them", () => {
    const p = parseTask("Explain this", { digest: DIGEST, address: ADDRESS });
    expect(p.inputs.digests).toEqual([DIGEST]);
    expect(p.inputs.addresses).toEqual([ADDRESS]);
  });

  it("recall queries never consist of raw identifiers", () => {
    const q = buildRecallQuery(`How much SUI did ${ADDRESS} get in ${DIGEST}?`, "token_transfer");
    expect(q).not.toContain(DIGEST);
    expect(q).not.toContain(ADDRESS);
    expect(q).toContain("token transfer");
  });
});
