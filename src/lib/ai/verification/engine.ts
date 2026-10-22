/**
 * Verification engine — independent of the model.
 *
 * Re-fetches chain state through Tatum (fresh calls, not the evidence the
 * model saw) and checks each structured assertion deterministically. An LLM's
 * agreement is never treated as verification. Results carry structured
 * provenance and a machine-readable diagnosis used by the autopsy.
 */
import { SUI_DECIMALS } from "@mysten/sui/utils";
import { ChainDataError, type ChainClient } from "@/lib/blockchain/tatum/client";
import type { NormalizedTransaction } from "@/lib/blockchain/tatum/normalize";
import { formatAtomic, parseDisplayAmount, powerOfTenMismatch, toBigInt } from "@/lib/blockchain/sui/amounts";
import { normalizeAddress, sameAddress, sameCoinType } from "@/lib/blockchain/sui/validation";
import { LATEST_CHECKPOINT_MAX_AGE_MS, type Assertion, type ClaimInput } from "./assertions";

export type VerificationStatus = "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "CONTRADICTED" | "UNAVAILABLE";

export type Diagnosis =
  | { kind: "power_of_ten"; exponent: number; decimals: number | null }
  | { kind: "sign_flip" }
  | { kind: "status_mismatch" }
  | { kind: "sender_mismatch" }
  | { kind: "asset_mismatch"; coinTypesObserved: string[] }
  | { kind: "value_mismatch" }
  | { kind: "missing_on_chain" }
  | { kind: "no_assertion" }
  | { kind: "state_changed_possible" };

export interface VerificationOutcome {
  status: VerificationStatus;
  method: string;
  sourceProvider: string | null;
  evidenceReference: string | null;
  observed: unknown;
  detail: string;
  diagnosis: Diagnosis | null;
}

/** Per-pass cache so several claims about one transaction cost one fetch. */
export class VerificationContext {
  private readonly txs = new Map<string, Promise<NormalizedTransaction>>();
  private readonly decimals = new Map<string, Promise<number | null>>();
  constructor(readonly chainClient: ChainClient) {}

  tx(digest: string): Promise<NormalizedTransaction> {
    let p = this.txs.get(digest);
    if (!p) {
      p = this.chainClient.getTransaction(digest).then((r) => r.data);
      this.txs.set(digest, p);
    }
    return p;
  }

  coinDecimals(coinType: string): Promise<number | null> {
    let p = this.decimals.get(coinType);
    if (!p) {
      p = this.chainClient
        .getCoinInfo(coinType)
        .then((r) => r.data.decimals)
        .catch(() => null);
      this.decimals.set(coinType, p);
    }
    return p;
  }
}

const PROVIDER = "tatum-grpc";

function out(
  status: VerificationStatus,
  method: string,
  ref: string | null,
  observed: unknown,
  detail: string,
  diagnosis: Diagnosis | null = null,
): VerificationOutcome {
  return { status, method, sourceProvider: PROVIDER, evidenceReference: ref, observed, detail, diagnosis };
}

function changesFor(tx: NormalizedTransaction, address: string, coinType: string) {
  return tx.balanceChanges.filter((b) => sameAddress(b.address, address) && sameCoinType(b.coinType, coinType));
}

export async function verifyAssertion(ctx: VerificationContext, a: Assertion): Promise<VerificationOutcome> {
  try {
    switch (a.type) {
      case "tx_status": {
        const tx = await ctx.tx(a.digest);
        const ok = tx.status === a.expected;
        return out(
          ok ? "VERIFIED" : "CONTRADICTED",
          "GetTransaction: effects.status",
          a.digest,
          { status: tx.status },
          ok ? `Status is ${tx.status}` : `Claimed ${a.expected}, chain shows ${tx.status}`,
          ok ? null : { kind: "status_mismatch" },
        );
      }
      case "tx_sender": {
        const tx = await ctx.tx(a.digest);
        const ok = sameAddress(tx.sender, a.address);
        return out(
          ok ? "VERIFIED" : "CONTRADICTED",
          "GetTransaction: transaction.sender",
          a.digest,
          { sender: tx.sender },
          ok ? "Sender matches" : `Chain sender is ${tx.sender}`,
          ok ? null : { kind: "sender_mismatch" },
        );
      }
      case "tx_checkpoint": {
        const tx = await ctx.tx(a.digest);
        const ok = tx.checkpoint === a.checkpoint;
        return out(
          ok ? "VERIFIED" : "CONTRADICTED",
          "GetTransaction: checkpoint",
          a.digest,
          { checkpoint: tx.checkpoint },
          ok ? "Checkpoint matches" : `Chain checkpoint is ${tx.checkpoint}`,
          ok ? null : { kind: "value_mismatch" },
        );
      }
      case "tx_timestamp": {
        const tx = await ctx.tx(a.digest);
        if (!tx.timestamp) return out("UNVERIFIED", "GetTransaction: timestamp", a.digest, { timestamp: null }, "The transaction has no timestamp yet");
        // Compare at the precision the claim states (date, minute or second).
        const claimed = a.timestamp.replace(/Z$/, "").replace(/\.\d+$/, "");
        const ok = tx.timestamp.slice(0, claimed.length) === claimed;
        return out(
          ok ? "VERIFIED" : "CONTRADICTED",
          "GetTransaction: timestamp (UTC)",
          a.digest,
          { timestamp: tx.timestamp },
          ok ? `Timestamp matches (${tx.timestamp})` : `Claimed ${a.timestamp}, chain shows ${tx.timestamp}`,
          ok ? null : { kind: "value_mismatch" },
        );
      }
      case "balance_change": {
        const tx = await ctx.tx(a.digest);
        const matching = changesFor(tx, a.address, a.coinType);
        if (matching.length === 0) {
          const other = tx.balanceChanges.filter((b) => sameAddress(b.address, a.address)).map((b) => b.coinType);
          return out(
            "CONTRADICTED",
            "GetTransaction: balance_changes",
            a.digest,
            { balanceChangesForAddress: other },
            "No balance change for this address and coin",
            other.length ? { kind: "asset_mismatch", coinTypesObserved: other } : { kind: "missing_on_chain" },
          );
        }
        const observed = matching.reduce((s, b) => s + toBigInt(b.amountAtomic), 0n);
        const claimed = toBigInt(a.amountAtomic);
        if (observed === claimed)
          return out(
            "VERIFIED",
            "GetTransaction: balance_changes (exact integer)",
            a.digest,
            { amountAtomic: observed.toString() },
            "Exact atomic amount matches",
          );
        const decimals = await ctx.coinDecimals(a.coinType);
        const p10 = powerOfTenMismatch(claimed, observed);
        const diagnosis: Diagnosis =
          claimed === -observed ? { kind: "sign_flip" } : p10 !== null ? { kind: "power_of_ten", exponent: p10, decimals } : { kind: "value_mismatch" };
        return out(
          "CONTRADICTED",
          "GetTransaction: balance_changes (exact integer)",
          a.digest,
          { amountAtomic: observed.toString(), decimals },
          `Claimed ${claimed} atomic, chain shows ${observed}`,
          diagnosis,
        );
      }
      case "balance_change_display": {
        const tx = await ctx.tx(a.digest);
        const decimals = await ctx.coinDecimals(a.coinType);
        const matching = changesFor(tx, a.address, a.coinType);
        if (matching.length === 0) {
          const other = tx.balanceChanges.filter((b) => sameAddress(b.address, a.address)).map((b) => b.coinType);
          return out(
            "CONTRADICTED",
            "GetTransaction: balance_changes",
            a.digest,
            { balanceChangesForAddress: other },
            "No balance change for this address and coin",
            other.length ? { kind: "asset_mismatch", coinTypesObserved: other } : { kind: "missing_on_chain" },
          );
        }
        const observed = matching.reduce((s, b) => s + toBigInt(b.amountAtomic), 0n);
        if (decimals === null) {
          return out(
            "UNVERIFIED",
            "GetCoinInfo unavailable for decimals",
            a.digest,
            { amountAtomic: observed.toString() },
            "Coin decimals are not published on chain, so a display amount cannot be checked exactly",
          );
        }
        const claimedAtomic = parseDisplayAmount(a.amount, decimals);
        const observedDisplay = formatAtomic(observed, decimals);
        if (claimedAtomic === null) {
          return out(
            "CONTRADICTED",
            "GetTransaction + GetCoinInfo (exact decimal conversion)",
            a.digest,
            { amountAtomic: observed.toString(), decimals, display: observedDisplay },
            `"${a.amount}" has more precision than the coin's ${decimals} decimals`,
            { kind: "power_of_ten", exponent: 0, decimals },
          );
        }
        if (claimedAtomic === observed) {
          return out(
            "VERIFIED",
            "GetTransaction + GetCoinInfo (exact decimal conversion)",
            a.digest,
            { amountAtomic: observed.toString(), decimals, display: observedDisplay },
            `Matches ${observedDisplay} (decimals ${decimals})`,
          );
        }
        const p10 = powerOfTenMismatch(claimedAtomic, observed);
        const diagnosis: Diagnosis =
          claimedAtomic === -observed ? { kind: "sign_flip" } : p10 !== null ? { kind: "power_of_ten", exponent: p10, decimals } : { kind: "value_mismatch" };
        return out(
          "CONTRADICTED",
          "GetTransaction + GetCoinInfo (exact decimal conversion)",
          a.digest,
          { amountAtomic: observed.toString(), decimals, display: observedDisplay },
          `Claimed ${a.amount}, chain shows ${observedDisplay}`,
          diagnosis,
        );
      }
      case "move_call": {
        const tx = await ctx.tx(a.digest);
        const ok = tx.moveCalls.some((m) => sameAddress(m.package, a.package) && m.module === a.module && m.function === a.function);
        return out(
          ok ? "VERIFIED" : "CONTRADICTED",
          "GetTransaction: programmable transaction commands",
          a.digest,
          { moveCalls: tx.moveCalls.map((m) => `${m.package}::${m.module}::${m.function}`).slice(0, 10) },
          ok ? "Move call present" : "Move call not present",
          ok ? null : { kind: "missing_on_chain" },
        );
      }
      case "event_emitted": {
        const tx = await ctx.tx(a.digest);
        const ok = tx.events.some((e) => e.type.includes(a.eventTypeContains));
        return out(
          ok ? "VERIFIED" : "CONTRADICTED",
          "GetTransaction: events",
          a.digest,
          { eventTypes: tx.events.map((e) => e.type).slice(0, 10) },
          ok ? "Event present" : "No matching event",
          ok ? null : { kind: "missing_on_chain" },
        );
      }
      case "gas_paid": {
        const tx = await ctx.tx(a.digest);
        if (!tx.gas) return out("UNAVAILABLE", "GetTransaction: effects.gas_used", a.digest, null, "Gas summary unavailable");
        const ok = toBigInt(tx.gas.netGasAtomic) === toBigInt(a.netGasAtomic);
        const p10 = ok ? null : powerOfTenMismatch(toBigInt(a.netGasAtomic), toBigInt(tx.gas.netGasAtomic));
        return out(
          ok ? "VERIFIED" : "CONTRADICTED",
          "GetTransaction: effects.gas_used (computation + storage − rebate)",
          a.digest,
          { netGasAtomic: tx.gas.netGasAtomic },
          ok ? "Net gas matches" : `Chain net gas is ${tx.gas.netGasAtomic}`,
          ok ? null : p10 !== null ? { kind: "power_of_ten", exponent: p10, decimals: SUI_DECIMALS } : { kind: "value_mismatch" },
        );
      }
      case "current_balance": {
        const res = await ctx.chainClient.getBalance(normalizeAddress(a.address) ?? a.address, a.coinType);
        const ok = res.data.balanceAtomic === a.amountAtomic;
        if (ok) return out("VERIFIED", "StateService/GetBalance", a.address, { balanceAtomic: res.data.balanceAtomic }, "Current balance matches");
        const p10 = powerOfTenMismatch(toBigInt(a.amountAtomic), toBigInt(res.data.balanceAtomic));
        // Live state can legitimately move between the tool call and verification; only a
        // power-of-ten gap is a clear contradiction.
        return p10 !== null
          ? out("CONTRADICTED", "StateService/GetBalance", a.address, { balanceAtomic: res.data.balanceAtomic }, "Power-of-ten mismatch against live balance", {
              kind: "power_of_ten",
              exponent: p10,
              decimals: await ctx.coinDecimals(a.coinType),
            })
          : out(
              "UNVERIFIED",
              "StateService/GetBalance",
              a.address,
              { balanceAtomic: res.data.balanceAtomic },
              "Live balance differs; state may have changed since it was read",
              { kind: "state_changed_possible" },
            );
      }
      case "object_owner": {
        const res = await ctx.chainClient.getObject(a.objectId);
        const ok = sameAddress(res.data.owner?.address, a.owner);
        return out(
          ok ? "VERIFIED" : "CONTRADICTED",
          "LedgerService/GetObject: owner",
          a.objectId,
          { owner: res.data.owner },
          ok ? "Owner matches" : "Owner differs",
          ok ? null : { kind: "value_mismatch" },
        );
      }
      case "tx_count_at_least": {
        const res = await ctx.chainClient.listAddressTransactions(normalizeAddress(a.address) ?? a.address, { limit: a.minimum });
        const ok = res.data.items.length >= a.minimum;
        return out(
          ok ? "VERIFIED" : "CONTRADICTED",
          "LedgerService/ListTransactions (affected address)",
          a.address,
          { found: res.data.items.length },
          ok ? `At least ${a.minimum} transactions found` : `Only ${res.data.items.length} found`,
          ok ? null : { kind: "value_mismatch" },
        );
      }
      case "latest_checkpoint": {
        const head = (await ctx.chainClient.serviceInfo()).data;
        const method = "LedgerService/GetServiceInfo + GetCheckpoint: timestamp";
        if (head.checkpointHeight !== null && BigInt(a.checkpoint) > BigInt(head.checkpointHeight)) {
          return out(
            "CONTRADICTED",
            method,
            a.checkpoint,
            { checkpointHeight: head.checkpointHeight },
            `Checkpoint ${a.checkpoint} does not exist yet; the network head is ${head.checkpointHeight}`,
            { kind: "value_mismatch" },
          );
        }
        const cp = (await ctx.chainClient.getCheckpoint(a.checkpoint)).data;
        if (!cp.timestamp) return out("UNVERIFIED", method, a.checkpoint, { checkpointHeight: head.checkpointHeight }, "Checkpoint timestamp unavailable");
        // Measure against the head's own timestamp (chain time), not this server's clock.
        const ageMs = (head.timestamp ? Date.parse(head.timestamp) : Date.now()) - Date.parse(cp.timestamp);
        const age =
          ageMs < 120_000
            ? `${Math.max(0, Math.round(ageMs / 1000))}s`
            : ageMs < 2 * 86_400_000
              ? `${Math.round(ageMs / 60_000)} min`
              : `${Math.round(ageMs / 86_400_000)} days`;
        const observed = { checkpointHeight: head.checkpointHeight, checkpointTimestamp: cp.timestamp, behindHeadMs: ageMs };
        const ok = ageMs <= LATEST_CHECKPOINT_MAX_AGE_MS;
        return out(
          ok ? "VERIFIED" : "CONTRADICTED",
          method,
          a.checkpoint,
          observed,
          ok
            ? `Checkpoint ${a.checkpoint} was ${age} behind the network head (${head.checkpointHeight}) when re-checked`
            : `Checkpoint ${a.checkpoint} is from ${cp.timestamp}, ${age} behind the network head (${head.checkpointHeight}): not current`,
          ok ? null : { kind: "value_mismatch" },
        );
      }
    }
  } catch (err) {
    if (err instanceof ChainDataError && err.code === "not_found") {
      return out("CONTRADICTED", "Lookup returned NOT_FOUND", null, null, "The referenced transaction/object does not exist on this network", {
        kind: "missing_on_chain",
      });
    }
    return {
      status: "UNAVAILABLE",
      method: "Chain lookup failed",
      sourceProvider: PROVIDER,
      evidenceReference: null,
      observed: null,
      detail: err instanceof Error ? err.message.slice(0, 200) : "Lookup failed",
      diagnosis: null,
    };
  }
}

export async function verifyClaim(ctx: VerificationContext, claim: ClaimInput, knownEvidenceRefs: Set<string>): Promise<VerificationOutcome> {
  const missingRefs = claim.evidenceRefs.filter((r) => !knownEvidenceRefs.has(r));
  if (!claim.assertion) {
    if (claim.kind === "interpretation" || claim.kind === "hypothesis" || claim.kind === "unknown") {
      return {
        status: "UNVERIFIED",
        method: "Not deterministically checkable (interpretation/hypothesis)",
        sourceProvider: null,
        evidenceReference: null,
        observed: null,
        detail: "Labelled as non-factual; shown as interpretation",
        diagnosis: null,
      };
    }
    return {
      status: "UNVERIFIED",
      method: "No machine-checkable assertion supplied",
      sourceProvider: null,
      evidenceReference: claim.evidenceRefs[0] ?? null,
      observed: null,
      detail: claim.evidenceRefs.length ? `Cites ${claim.evidenceRefs.join(", ")} but no assertion to check` : "Factual claim without evidence or assertion",
      diagnosis: { kind: "no_assertion" },
    };
  }
  const outcome = await verifyAssertion(ctx, claim.assertion);
  if (outcome.status === "VERIFIED" && missingRefs.length) {
    return { ...outcome, status: "PARTIALLY_VERIFIED", detail: `${outcome.detail}; cited evidence ${missingRefs.join(", ")} does not exist in this run` };
  }
  return outcome;
}
