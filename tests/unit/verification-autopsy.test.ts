import { describe, expect, it } from "vitest";
import { VerificationContext, verifyAssertion, verifyClaim } from "@/lib/ai/verification/engine";
import { runAutopsy, type AutopsyClaim } from "@/lib/ai/reflection/autopsy";
import { checkPolicies, type FinalReportInput } from "@/lib/ai/orchestrator/run-agent";
import { FakeChain, fixtureAddress, fixtureDigest, fixtureTx, SUI, USDC } from "../helpers/fake-chain";

const D = fixtureDigest("transfer");
const SENDER = fixtureAddress("alice");
const RECEIVER = fixtureAddress("bob");

function chainWithTransfer() {
  return new FakeChain().addTx(
    fixtureTx({
      digest: D,
      sender: SENDER,
      balanceChanges: [
        { address: SENDER, coinType: SUI, amountAtomic: "-1502000000" },
        { address: RECEIVER, coinType: SUI, amountAtomic: "1500000000" },
        { address: RECEIVER, coinType: USDC, amountAtomic: "2500000" },
      ],
      moveCalls: [{ package: "0x" + "0".repeat(63) + "2", module: "pay", function: "split_and_transfer", typeArguments: [] }],
    }),
  );
}

describe("verification engine", () => {
  it("verifies exact display amounts with on-chain decimals", async () => {
    const ctx = new VerificationContext(chainWithTransfer());
    const ok = await verifyAssertion(ctx, { type: "balance_change_display", digest: D, address: RECEIVER, coinType: SUI, amount: "1.5" });
    expect(ok.status).toBe("VERIFIED");
    const usdc = await verifyAssertion(ctx, { type: "balance_change_display", digest: D, address: RECEIVER, coinType: USDC, amount: "2.5" });
    expect(usdc.status).toBe("VERIFIED");
  });

  it("diagnoses a decimal-scaling error as an exact power of ten", async () => {
    const ctx = new VerificationContext(chainWithTransfer());
    const r = await verifyAssertion(ctx, { type: "balance_change_display", digest: D, address: RECEIVER, coinType: SUI, amount: "1500000000" });
    expect(r.status).toBe("CONTRADICTED");
    expect(r.diagnosis).toEqual({ kind: "power_of_ten", exponent: 9, decimals: 9 });
  });

  it("diagnoses sign flips, wrong senders, wrong status and wrong assets", async () => {
    const ctx = new VerificationContext(chainWithTransfer());
    expect(
      (await verifyAssertion(ctx, { type: "balance_change", digest: D, address: RECEIVER, coinType: SUI, amountAtomic: "-1500000000" })).diagnosis,
    ).toEqual({ kind: "sign_flip" });
    expect((await verifyAssertion(ctx, { type: "tx_sender", digest: D, address: RECEIVER })).diagnosis).toEqual({ kind: "sender_mismatch" });
    expect((await verifyAssertion(ctx, { type: "tx_status", digest: D, expected: "failure" })).diagnosis).toEqual({ kind: "status_mismatch" });
    const asset = await verifyAssertion(ctx, { type: "balance_change", digest: D, address: SENDER, coinType: USDC, amountAtomic: "1" });
    expect(asset.diagnosis?.kind).toBe("asset_mismatch");
  });

  it("checks a transaction timestamp at the precision claimed", async () => {
    const ctx = new VerificationContext(chainWithTransfer()); // fixture timestamp 2026-10-21T17:10:58.273Z
    expect((await verifyAssertion(ctx, { type: "tx_timestamp", digest: D, timestamp: "2026-10-21" })).status).toBe("VERIFIED");
    expect((await verifyAssertion(ctx, { type: "tx_timestamp", digest: D, timestamp: "2026-10-21T17:10" })).status).toBe("VERIFIED");
    expect((await verifyAssertion(ctx, { type: "tx_timestamp", digest: D, timestamp: "2026-10-21T17:10:58Z" })).status).toBe("VERIFIED");
    const wrongDay = await verifyAssertion(ctx, { type: "tx_timestamp", digest: D, timestamp: "2026-10-31" });
    expect(wrongDay.status).toBe("CONTRADICTED");
    expect(wrongDay.detail).toMatch(/chain shows 2026-10-21T17:10:58.273Z/);
    expect((await verifyAssertion(ctx, { type: "tx_timestamp", digest: D, timestamp: "2026-10-21T18:10" })).status).toBe("CONTRADICTED");
  });

  it("checks a reported current checkpoint against the network head", async () => {
    const chain = chainWithTransfer();
    const ctx = new VerificationContext(chain);
    const head = chain.head.sequenceNumber;
    const fresh = await verifyAssertion(ctx, { type: "latest_checkpoint", checkpoint: (BigInt(head) - 400n).toString() }); // ~100 s behind
    expect(fresh.status).toBe("VERIFIED");
    // A checkpoint taken from an old transaction (seen live: two months behind) is not "current".
    const stale = await verifyAssertion(ctx, { type: "latest_checkpoint", checkpoint: "316019521" });
    expect(stale.status).toBe("CONTRADICTED");
    expect(stale.detail).toMatch(/not current/);
    const future = await verifyAssertion(ctx, { type: "latest_checkpoint", checkpoint: (BigInt(head) + 10n).toString() });
    expect(future.status).toBe("CONTRADICTED");
    expect(future.detail).toMatch(/does not exist yet/);
  });

  it("treats a missing transaction as contradicted, and provider outages as unavailable", async () => {
    const chain = chainWithTransfer();
    const missing = await verifyAssertion(new VerificationContext(chain), { type: "tx_status", digest: fixtureDigest("nope"), expected: "success" });
    expect(missing.status).toBe("CONTRADICTED");
    chain.failures.set("GetTransaction", new Error("socket hang up"));
    const down = await verifyAssertion(new VerificationContext(chain), { type: "tx_status", digest: D, expected: "success" });
    expect(down.status).toBe("UNAVAILABLE");
  });

  it("labels interpretations and unsupported facts honestly", async () => {
    const ctx = new VerificationContext(chainWithTransfer());
    const interp = await verifyClaim(ctx, { statement: "Looks like a routine payment", kind: "interpretation", evidenceRefs: [] }, new Set());
    expect(interp.status).toBe("UNVERIFIED");
    expect(interp.diagnosis).toBeNull();
    const fact = await verifyClaim(ctx, { statement: "Bob is an exchange", kind: "verified_fact", evidenceRefs: [] }, new Set());
    expect(fact.diagnosis).toEqual({ kind: "no_assertion" });
    const badRef = await verifyClaim(
      ctx,
      { statement: "ok", kind: "observation", evidenceRefs: ["E9"], assertion: { type: "tx_status", digest: D, expected: "success" } },
      new Set(["E1"]),
    );
    expect(badRef.status).toBe("PARTIALLY_VERIFIED");
  });
});

async function claim(ref: string, assertion: AutopsyClaim["assertion"], kind = "verified_fact"): Promise<AutopsyClaim> {
  const ctx = new VerificationContext(chainWithTransfer());
  const outcome = await verifyClaim(ctx, { statement: `claim ${ref}`, kind: kind as never, evidenceRefs: ["E1"], assertion }, new Set(["E1"]));
  return { ref, statement: `claim ${ref}`, kind, evidenceRefs: ["E1"], assertion, outcome, verificationResultId: `v-${ref}` };
}

const RUN = { id: "11111111-1111-4111-8111-111111111111", userId: "u1", taskCategory: "token_transfer", isEvaluation: false };

describe("agent autopsy", () => {
  it("turns a verified decimal error into one evidence-backed lesson", async () => {
    const c1 = await claim("C1", { type: "balance_change_display", digest: D, address: RECEIVER, coinType: SUI, amount: "1500000000" });
    const r = runAutopsy({
      run: RUN,
      claims: [c1],
      toolExecutions: [{ id: "x1", toolId: "tatum_transaction_inspector", status: "success", errorCode: null, evidenceRefs: ["E1"] }],
      paid: null,
      limitsHit: false,
      finalReportPresent: true,
      appliedDirectives: [],
      recentToolTimeouts: {},
    });
    expect(r.failures).toHaveLength(1);
    const f = r.failures[0]!;
    expect(f.category).toBe("decimal_scaling_error");
    expect(f.objectivelyVerified).toBe(true);
    expect(f.confirmedCause).toContain("10^9");
    expect(f.lesson?.directive).toBe("verify_coin_decimals");
    expect(f.lesson?.evidenceText).toContain(D);
    expect(r.contradictedToolExecutionIds.has("x1")).toBe(true);
  });

  it("does not create lessons for evaluation runs", async () => {
    const c1 = await claim("C1", { type: "balance_change_display", digest: D, address: RECEIVER, coinType: SUI, amount: "1500000000" });
    const r = runAutopsy({
      run: { ...RUN, isEvaluation: true },
      claims: [c1],
      toolExecutions: [],
      paid: null,
      limitsHit: false,
      finalReportPresent: true,
      appliedDirectives: [],
      recentToolTimeouts: {},
    });
    expect(r.failures[0]!.lesson).toBeNull();
  });

  it("only writes a platform timeout lesson once timeouts repeat, with no user data", () => {
    const base = { run: RUN, claims: [], paid: null, limitsHit: false, finalReportPresent: true, appliedDirectives: [] };
    const once = runAutopsy({
      ...base,
      toolExecutions: [{ id: "x1", toolId: "tatum_wallet_inspector", status: "timeout", errorCode: "timeout", evidenceRefs: [] }],
      recentToolTimeouts: { tatum_wallet_inspector: 1 },
    });
    expect(once.failures[0]!.lesson).toBeNull();
    const twice = runAutopsy({
      ...base,
      toolExecutions: [{ id: "x1", toolId: "tatum_wallet_inspector", status: "timeout", errorCode: "timeout", evidenceRefs: [] }],
      recentToolTimeouts: { tatum_wallet_inspector: 3 },
    });
    const lesson = twice.failures[0]!.lesson!;
    expect(lesson.scope).toBe("platform");
    expect(lesson.userId).toBeNull();
    expect(lesson.directive).toBe("tool_timeout_risk");
  });

  it("records whether paid analysis was worth it", async () => {
    const c1 = await claim("C1", { type: "tx_status", digest: D, expected: "success" });
    const base = { run: RUN, limitsHit: false, finalReportPresent: true, appliedDirectives: [], recentToolTimeouts: {} };
    const notCited = runAutopsy({
      ...base,
      claims: [c1],
      toolExecutions: [
        { id: "free", toolId: "tatum_transaction_inspector", status: "success", errorCode: null, evidenceRefs: ["E1"] },
        { id: "paid", toolId: "paid_forensic_analyzer", status: "success", errorCode: null, evidenceRefs: ["E7"] },
      ],
      paid: { intentId: "p1", status: "settled", toolExecutionId: "paid" },
    });
    expect(notCited.failures.find((f) => f.category === "paid_tool_not_useful")?.lesson?.directive).toBe("paid_tool_unnecessary_for_category");
    const cited = runAutopsy({
      ...base,
      claims: [{ ...c1, evidenceRefs: ["E7"] }],
      toolExecutions: [{ id: "paid", toolId: "paid_forensic_analyzer", status: "success", errorCode: null, evidenceRefs: ["E7"] }],
      paid: { intentId: "p1", status: "settled", toolExecutionId: "paid" },
    });
    expect(cited.lessons.find((l) => l.directive === "paid_tool_useful_for_category")).toBeTruthy();
  });

  it("validates an applied learned policy with a success memory", async () => {
    const c1 = await claim("C1", { type: "balance_change_display", digest: D, address: RECEIVER, coinType: SUI, amount: "1.5" });
    const c2 = await claim("C2", { type: "tx_status", digest: D, expected: "success" });
    const r = runAutopsy({
      run: RUN,
      claims: [c1, c2],
      toolExecutions: [],
      paid: null,
      limitsHit: false,
      finalReportPresent: true,
      appliedDirectives: [{ directive: "verify_coin_decimals", memoryRef: "M1", memoryId: "m1" }],
      recentToolTimeouts: {},
    });
    expect(r.failures).toHaveLength(0);
    expect(r.lessons).toEqual([expect.objectContaining({ memoryType: "success", directive: "verify_coin_decimals" })]);
  });

  describe("proven strategies", () => {
    const execs = [
      { id: "x1", toolId: "tatum_transaction_inspector", status: "success", errorCode: null, evidenceRefs: ["E1"] },
      { id: "x2", toolId: "resolve_suins_name", status: "error", errorCode: "invalid_input", evidenceRefs: [] },
      { id: "x3", toolId: "balance_change_analyzer", status: "success", errorCode: null, evidenceRefs: ["E2"] },
      { id: "x4", toolId: "tatum_wallet_inspector", status: "success", errorCode: null, evidenceRefs: ["E3"] },
      { id: "x5", toolId: "evidence_cross_checker", status: "success", errorCode: null, evidenceRefs: [] },
    ];
    const verifiedClaims = async () => [
      await claim("C1", { type: "tx_status", digest: D, expected: "success" }),
      { ...(await claim("C2", { type: "balance_change_display", digest: D, address: RECEIVER, coinType: SUI, amount: "1.5" })), evidenceRefs: ["E2"] },
    ];
    const autopsy = async (over: Partial<Parameters<typeof runAutopsy>[0]> = {}) =>
      runAutopsy({
        run: RUN,
        claims: await verifiedClaims(),
        toolExecutions: execs,
        paid: null,
        limitsHit: false,
        finalReportPresent: true,
        appliedDirectives: [],
        recentToolTimeouts: {},
        ...over,
      });

    it("records which tools produced the verified evidence, in order, without user data", async () => {
      const lesson = (await autopsy()).lessons.find((l) => l.memoryType === "strategy")!;
      expect(lesson).toMatchObject({
        scope: "user",
        directive: "prefer_tool_for_category",
        relatedToolId: "tatum_transaction_inspector",
        taskCategory: "token_transfer",
        verificationStatus: "verified",
      });
      expect(lesson.summary).toBe("Verified approach for token transfer: tatum_transaction_inspector → balance_change_analyzer");
      expect(lesson.lesson).toContain("cross-checked by evidence_cross_checker");
      expect(lesson.lesson).toContain("2 verified claims");
      // Uncited (wallet inspector) and failed (SuiNS) tools are not part of the strategy.
      expect(lesson.lesson).not.toMatch(/wallet_inspector|suins/);
      expect(`${lesson.summary} ${lesson.lesson}`).not.toMatch(/0x[0-9a-f]{6,}|[1-9A-HJ-NP-Za-km-z]{43,44}/);
      expect(lesson.evidenceReferences).toEqual(expect.arrayContaining([{ kind: "verification", id: "v-C1", label: "C1" }]));
    });

    it("is not recorded for runs with any doubt", async () => {
      const strategy = (r: ReturnType<typeof runAutopsy>) => r.lessons.some((l) => l.memoryType === "strategy");
      const contradicted = await claim("C3", { type: "tx_status", digest: D, expected: "failure" });
      const factWithoutAssertion = await claim("C3", undefined);
      const [c1] = await verifiedClaims();
      expect(strategy(await autopsy())).toBe(true);
      expect(strategy(await autopsy({ claims: [...(await verifiedClaims()), contradicted] }))).toBe(false);
      expect(strategy(await autopsy({ claims: [...(await verifiedClaims()), factWithoutAssertion] }))).toBe(false);
      expect(strategy(await autopsy({ claims: [c1!] }))).toBe(false); // a single verified claim is not enough
      expect(strategy(await autopsy({ limitsHit: true }))).toBe(false);
      expect(strategy(await autopsy({ ungroundedValues: [{ kind: "date", value: "2026-10-29" }] }))).toBe(false);
      expect(strategy(await autopsy({ run: { ...RUN, isEvaluation: true } }))).toBe(false);
    });
  });

  it("turns ungrounded answer values into one unsupported-claim failure with a lesson", () => {
    const r = runAutopsy({
      run: RUN,
      claims: [],
      toolExecutions: [],
      paid: null,
      limitsHit: false,
      finalReportPresent: true,
      ungroundedValues: [
        { kind: "date", value: "Oct 29, 2026" },
        { kind: "amount", value: "1.5 SUI" },
      ],
      appliedDirectives: [],
      recentToolTimeouts: {},
    });
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatchObject({ category: "unsupported_claim", objectivelyVerified: true });
    expect(r.failures[0]!.observed).toContain("date Oct 29, 2026, amount 1.5 SUI");
    expect(r.failures[0]!.lesson).toMatchObject({ directive: "cite_evidence_for_every_fact", memoryType: "failure", scope: "user" });
  });
});

describe("learned-policy enforcement", () => {
  const report = (claims: FinalReportInput["claims"]): FinalReportInput => ({
    answer: "x".repeat(30),
    claims,
    limitations: [],
    toolRationale: [],
    memoriesApplied: [],
  });
  const amountClaim = {
    statement: "Bob received 1.5 SUI",
    kind: "verified_fact" as const,
    evidenceRefs: ["E1"],
    assertion: { type: "balance_change_display" as const, digest: D, address: RECEIVER, coinType: SUI, amount: "1.5" },
  };

  it("rejects amount claims before balance_change_analyzer when verify_coin_decimals is active", () => {
    const v = checkPolicies(report([amountClaim]), ["verify_coin_decimals"], [{ toolId: "tatum_transaction_inspector", args: { digest: D } }]);
    expect(v).toHaveLength(1);
    expect(v[0]!.directive).toBe("verify_coin_decimals");
  });

  it("accepts once the analyzer ran for that transaction", () => {
    expect(checkPolicies(report([amountClaim]), ["verify_coin_decimals"], [{ toolId: "balance_change_analyzer", args: { digest: D } }])).toEqual([]);
  });

  it("does nothing without active policies (baseline)", () => {
    expect(checkPolicies(report([amountClaim]), [], [])).toEqual([]);
  });

  it("enforces evidence citation", () => {
    const v = checkPolicies(report([{ ...amountClaim, evidenceRefs: [] }]), ["cite_evidence_for_every_fact"], []);
    expect(v[0]!.directive).toBe("cite_evidence_for_every_fact");
  });
});
