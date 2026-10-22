/**
 * RecallIQ Forensic Analyzer — the computation behind the x402-protected
 * specialist API. Operated by RecallIQ (disclosed in the UI); it is deeper
 * processing over Tatum data, not an independent third-party opinion.
 *
 * Modes
 *  - address: aggregate up to 40 recent transactions touching an address —
 *    net flows per coin (exact integer math), counterparties, Move call
 *    targets, gas, failures, cadence, and rule-based observational flags.
 *  - compare: side-by-side comparison of 2–10 transactions.
 *
 * Every flag is a deterministic rule over observed data with the digests that
 * triggered it. Flags describe patterns, never intent.
 */
import { z } from "zod";
import { SUI_DECIMALS } from "@mysten/sui/utils";
import type { ChainClient } from "@/lib/blockchain/tatum/client";
import type { NormalizedTransaction } from "@/lib/blockchain/tatum/normalize";
import { absBig, formatAtomic, toBigInt } from "@/lib/blockchain/sui/amounts";
import { normalizeAddress, sameAddress } from "@/lib/blockchain/sui/validation";

export const forensicsRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("address"),
    address: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
    limit: z.number().int().min(5).max(40).default(40),
  }),
  z.object({
    mode: z.literal("compare"),
    digests: z.array(z.string().min(43).max(44)).min(2).max(10),
  }),
]);

export type ForensicsRequest = z.infer<typeof forensicsRequestSchema>;

const ZERO = normalizeAddress("0x0")!;

interface CoinMeta {
  decimals: number | null;
  symbol: string | null;
}

async function coinMeta(chainClient: ChainClient, coinTypes: string[]): Promise<Map<string, CoinMeta>> {
  const out = new Map<string, CoinMeta>();
  // Bounded fan-out: metadata for the most relevant coin types only.
  for (const ct of coinTypes.slice(0, 12)) {
    try {
      const r = await chainClient.getCoinInfo(ct);
      out.set(ct, { decimals: r.data.decimals, symbol: r.data.symbol });
    } catch {
      out.set(ct, { decimals: null, symbol: null });
    }
  }
  return out;
}

function display(amount: bigint, meta: CoinMeta | undefined): string | null {
  return meta?.decimals !== null && meta?.decimals !== undefined ? formatAtomic(amount, meta.decimals) : null;
}

function median(values: bigint[]): bigint | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return s[Math.floor(s.length / 2)]!;
}

async function fetchTransactions(chainClient: ChainClient, digests: string[]): Promise<{ txs: NormalizedTransaction[]; missing: string[] }> {
  const txs: NormalizedTransaction[] = [];
  const missing: string[] = [];
  for (let i = 0; i < digests.length; i += 20) {
    const batch = digests.slice(i, i + 20);
    const res = await chainClient.batchGetTransactions(batch);
    for (const item of res.data) {
      if ("error" in item) missing.push(item.digest);
      else txs.push(item);
    }
  }
  return { txs, missing };
}

export async function analyzeAddress(chainClient: ChainClient, addressInput: string, limit: number) {
  const address = normalizeAddress(addressInput);
  if (!address) throw new Error("Invalid address");
  const list = await chainClient.listAddressTransactions(address, { limit });
  const digests = list.data.items.map((i) => i.digest);
  const { txs, missing } = await fetchTransactions(chainClient, digests);

  const net = new Map<string, bigint>();
  const outflowsByCoin = new Map<string, Array<{ amount: bigint; digest: string }>>();
  const counterparties = new Map<string, { txs: Set<string> }>();
  const callTargets = new Map<string, { count: number; digests: string[] }>();
  const packageFirstSeen = new Map<string, string>();
  const inboundOnlyCoins = new Map<string, Set<string>>();
  let sentCount = 0;
  let failed = 0;
  let gasAsSender = 0n;
  const failedDigests: string[] = [];

  for (const tx of txs) {
    const isSender = sameAddress(tx.sender, address);
    if (isSender) {
      sentCount++;
      if (tx.gas) gasAsSender += toBigInt(tx.gas.netGasAtomic);
    }
    if (tx.status === "failure") {
      failed++;
      failedDigests.push(tx.digest);
    }
    const mine = tx.balanceChanges.filter((b) => sameAddress(b.address, address));
    for (const b of mine) {
      const amt = toBigInt(b.amountAtomic);
      net.set(b.coinType, (net.get(b.coinType) ?? 0n) + amt);
      if (amt < 0n) {
        outflowsByCoin.set(b.coinType, [...(outflowsByCoin.get(b.coinType) ?? []), { amount: -amt, digest: tx.digest }]);
      } else if (amt > 0n && !isSender) {
        const s = inboundOnlyCoins.get(b.coinType) ?? new Set<string>();
        s.add(tx.digest);
        inboundOnlyCoins.set(b.coinType, s);
      }
    }
    for (const b of tx.balanceChanges) {
      const other = normalizeAddress(b.address);
      if (!other || other === address || other === ZERO) continue;
      const cp = counterparties.get(other) ?? { txs: new Set<string>() };
      cp.txs.add(tx.digest);
      counterparties.set(other, cp);
    }
    for (const mc of isSender ? tx.moveCalls : []) {
      const key = `${mc.package}::${mc.module}::${mc.function}`;
      const t = callTargets.get(key) ?? { count: 0, digests: [] };
      t.count++;
      if (t.digests.length < 5) t.digests.push(tx.digest);
      callTargets.set(key, t);
      if (!packageFirstSeen.has(mc.package)) packageFirstSeen.set(mc.package, tx.digest);
    }
  }

  // Remove coins that also flowed out from the "inbound-only" set.
  for (const coin of outflowsByCoin.keys()) inboundOnlyCoins.delete(coin);

  const coinTypes = [...net.keys()].sort((a, b) => (absBig(net.get(b)!) > absBig(net.get(a)!) ? 1 : -1));
  const meta = await coinMeta(chainClient, coinTypes);

  const flags: Array<{ rule: string; description: string; evidence: string[] }> = [];
  for (const [coin, outs] of outflowsByCoin) {
    if (outs.length < 5) continue;
    const med = median(outs.map((o) => o.amount))!;
    const big = outs.filter((o) => med > 0n && o.amount > med * 5n);
    if (big.length > 0) {
      flags.push({
        rule: "large_outflow_vs_median",
        description: `${big.length} outflow(s) of ${meta.get(coin)?.symbol ?? coin} exceed 5× the window median outflow (${display(med, meta.get(coin)) ?? `${med} atomic`}).`,
        evidence: big.slice(0, 5).map((b) => b.digest),
      });
    }
  }
  if (txs.length >= 5 && (failed >= 3 || failed / txs.length > 0.3)) {
    flags.push({
      rule: "failure_cluster",
      description: `${failed} of ${txs.length} examined transactions failed.`,
      evidence: failedDigests.slice(0, 5),
    });
  }
  const times = txs
    .map((t) => (t.timestamp ? Date.parse(t.timestamp) : NaN))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  for (let i = 0; i + 9 < times.length; i++) {
    if (times[i + 9]! - times[i]! <= 60_000) {
      flags.push({ rule: "burst_activity", description: "10 or more transactions within 60 seconds.", evidence: txs.slice(0, 3).map((t) => t.digest) });
      break;
    }
  }
  if (inboundOnlyCoins.size >= 5) {
    flags.push({
      rule: "many_unsolicited_inbound_coin_types",
      description: `${inboundOnlyCoins.size} coin types arrived from other senders and never left in this window (common with airdropped/spam tokens).`,
      evidence: [...inboundOnlyCoins.values()].flatMap((s) => [...s]).slice(0, 5),
    });
  }

  const intervals = times.slice(1).map((t, i) => t - times[i]!);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);

  return {
    mode: "address" as const,
    address,
    examined: txs.length,
    requestedLimit: limit,
    missing,
    window: {
      fromCheckpoint: list.data.items.at(-1)?.checkpoint ?? null,
      toCheckpoint: list.data.items[0]?.checkpoint ?? null,
      from: times.length ? new Date(times[0]!).toISOString() : null,
      to: times.length ? new Date(times.at(-1)!).toISOString() : null,
      endReason: list.data.endReason,
    },
    sentByAddress: sentCount,
    failedTransactions: failed,
    gasPaidAsSenderAtomicSui: gasAsSender.toString(),
    gasPaidAsSenderSui: formatAtomic(gasAsSender, SUI_DECIMALS),
    netFlows: coinTypes.slice(0, 20).map((ct) => ({
      coinType: ct,
      symbol: meta.get(ct)?.symbol ?? null,
      decimals: meta.get(ct)?.decimals ?? null,
      netAtomic: net.get(ct)!.toString(),
      netDisplay: display(net.get(ct)!, meta.get(ct)),
    })),
    topCounterparties: [...counterparties.entries()]
      .sort((a, b) => b[1].txs.size - a[1].txs.size)
      .slice(0, 10)
      .map(([addr, v]) => ({ address: addr, sharedTransactions: v.txs.size, sampleDigests: [...v.txs].slice(0, 3) })),
    moveCallTargets: [...callTargets.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 12)
      .map(([target, v]) => ({ target, count: v.count, sampleDigests: v.digests })),
    distinctPackagesCalled: packageFirstSeen.size,
    cadence: {
      medianSecondsBetweenTransactions: sortedIntervals.length ? Math.round(sortedIntervals[Math.floor(sortedIntervals.length / 2)]! / 1000) : null,
    },
    observationalFlags: flags,
    disclaimer: "Flags are deterministic patterns over observed on-chain data in this window. They are not evidence of intent, identity, or wrongdoing.",
    digestsExamined: txs.map((t) => t.digest),
  };
}

export async function compareTransactions(chainClient: ChainClient, digests: string[]) {
  const { txs, missing } = await fetchTransactions(chainClient, digests);
  const coinTypes = [...new Set(txs.flatMap((t) => t.balanceChanges.map((b) => b.coinType)))];
  const meta = await coinMeta(chainClient, coinTypes);
  const senders = new Set(txs.map((t) => t.sender));
  const targetSets = txs.map((t) => new Set(t.moveCalls.map((m) => `${m.package}::${m.module}::${m.function}`)));
  const sharedTargets = targetSets.length ? [...targetSets[0]!].filter((x) => targetSets.every((s) => s.has(x))) : [];
  const addressSets = txs.map((t) => new Set(t.balanceChanges.map((b) => normalizeAddress(b.address)).filter((a): a is string => Boolean(a) && a !== ZERO)));
  const sharedAddresses = addressSets.length ? [...addressSets[0]!].filter((x) => addressSets.every((s) => s.has(x))) : [];
  return {
    mode: "compare" as const,
    missing,
    transactions: txs.map((t) => ({
      digest: t.digest,
      status: t.status,
      checkpoint: t.checkpoint,
      timestamp: t.timestamp,
      sender: t.sender,
      netGasAtomicSui: t.gas?.netGasAtomic ?? null,
      moveCalls: t.moveCalls.map((m) => `${m.package}::${m.module}::${m.function}`).slice(0, 8),
      balanceChanges: t.balanceChanges.slice(0, 12).map((b) => ({
        address: b.address,
        coinType: b.coinType,
        symbol: meta.get(b.coinType)?.symbol ?? null,
        amountAtomic: b.amountAtomic,
        amountDisplay: display(toBigInt(b.amountAtomic), meta.get(b.coinType)),
      })),
      error: t.error?.description ?? null,
    })),
    sameSender: senders.size === 1,
    sharedMoveCallTargets: sharedTargets,
    sharedBalanceChangeAddresses: sharedAddresses,
    statusSummary: { success: txs.filter((t) => t.status === "success").length, failure: txs.filter((t) => t.status === "failure").length },
  };
}

export async function runForensics(chainClient: ChainClient, req: ForensicsRequest) {
  return req.mode === "address" ? analyzeAddress(chainClient, req.address, req.limit) : compareTransactions(chainClient, req.digests);
}
