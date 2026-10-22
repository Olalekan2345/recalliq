/**
 * Normalisation of Sui gRPC (sui.rpc.v2) protobuf messages into plain,
 * JSON-safe records. All integer quantities stay as decimal strings.
 */
import { GrpcTypes } from "@mysten/sui/grpc";
import { normalizeStructTag } from "@mysten/sui/utils";

type GrpcTypesExecuted = GrpcTypes.ExecutedTransaction;
type ProtoValue = GrpcTypes.Event["json"];
type Timestamp = GrpcTypesExecuted["timestamp"];
type ExecutedTransaction = GrpcTypesExecuted;

export interface NormalizedBalanceChange {
  address: string;
  coinType: string;
  /** Signed integer in atomic units. */
  amountAtomic: string;
}

export interface NormalizedMoveCall {
  package: string;
  module: string;
  function: string;
  typeArguments: string[];
}

export interface NormalizedEvent {
  type: string;
  packageId: string | null;
  module: string | null;
  sender: string | null;
  /** Decoded JSON payload, truncated for size. Untrusted third-party data. */
  json: unknown;
}

export interface NormalizedTransaction {
  digest: string;
  checkpoint: string | null;
  timestamp: string | null;
  sender: string | null;
  kind: string | null;
  status: "success" | "failure" | "unknown";
  error: {
    description: string | null;
    kind: string | null;
    command: string | null;
    abortCode: string | null;
    location: string | null;
  } | null;
  gas: {
    owner: string | null;
    budget: string | null;
    price: string | null;
    computationCost: string;
    storageCost: string;
    storageRebate: string;
    nonRefundableStorageFee: string;
    /** computation + storage − rebate (may be negative when rebates exceed costs). */
    netGasAtomic: string;
  } | null;
  balanceChanges: NormalizedBalanceChange[];
  moveCalls: NormalizedMoveCall[];
  commands: string[];
  events: NormalizedEvent[];
  objectChanges: {
    created: number;
    mutated: number;
    deleted: number;
    createdTypes: string[];
  };
}

export function timestampToIso(ts: Timestamp | undefined): string | null {
  if (!ts || ts.seconds === undefined) return null;
  const ms = Number(ts.seconds) * 1000 + Math.floor((ts.nanos ?? 0) / 1e6);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** google.protobuf.Value → plain JSON (bounded depth/size). */
export function protoValueToJson(value: ProtoValue, depth = 0): unknown {
  if (!value || depth > 8) return null;
  const k = (value as { kind?: { oneofKind?: string } & Record<string, unknown> }).kind;
  if (!k || !k.oneofKind) return null;
  switch (k.oneofKind) {
    case "nullValue":
      return null;
    case "numberValue":
    case "stringValue":
    case "boolValue":
      return k[k.oneofKind];
    case "structValue": {
      const fields = (k.structValue as { fields?: Record<string, ProtoValue> })?.fields ?? {};
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(fields).slice(0, 40)) out[key] = protoValueToJson(v, depth + 1);
      return out;
    }
    case "listValue": {
      const values = (k.listValue as { values?: ProtoValue[] })?.values ?? [];
      return values.slice(0, 40).map((v) => protoValueToJson(v, depth + 1));
    }
    default:
      return null;
  }
}

function safeStructTag(t: string | undefined | null): string {
  if (!t) return "";
  try {
    return normalizeStructTag(t);
  } catch {
    return t;
  }
}

function truncateJson(v: unknown, max = 2_000): unknown {
  const s = JSON.stringify(v);
  if (!s || s.length <= max) return v;
  return { truncated: true, preview: s.slice(0, max) };
}

function enumName(e: Record<number | string, string | number>, v: number | undefined): string | null {
  if (v === undefined) return null;
  const n = e[v];
  return typeof n === "string" ? n : String(v);
}

export function normalizeTransaction(tx: GrpcTypesExecuted): NormalizedTransaction {
  const t = tx.transaction;
  const eff = tx.effects;
  const status: NormalizedTransaction["status"] = eff?.status?.success === true ? "success" : eff?.status?.success === false ? "failure" : "unknown";

  const err = eff?.status?.error;
  let abortCode: string | null = null;
  let location: string | null = null;
  if (err?.errorDetails?.oneofKind === "abort") {
    const a = err.errorDetails.abort;
    abortCode = a.abortCode !== undefined ? a.abortCode.toString() : null;
    if (a.location) {
      location = [a.location.package, a.location.module, a.location.functionName].filter(Boolean).join("::") || null;
    }
  }

  const gu = eff?.gasUsed;
  const comp = gu?.computationCost ?? 0n;
  const stor = gu?.storageCost ?? 0n;
  const reb = gu?.storageRebate ?? 0n;

  const moveCalls: NormalizedMoveCall[] = [];
  const commands: string[] = [];
  const kindData = t?.kind?.data;
  if (kindData?.oneofKind === "programmableTransaction") {
    for (const c of kindData.programmableTransaction.commands ?? []) {
      const ck = c.command.oneofKind;
      if (!ck) continue;
      commands.push(ck);
      if (ck === "moveCall") {
        const mc = (c.command as { moveCall: { package?: string; module?: string; function?: string; typeArguments?: string[] } }).moveCall;
        moveCalls.push({
          package: mc.package ?? "",
          module: mc.module ?? "",
          function: mc.function ?? "",
          typeArguments: (mc.typeArguments ?? []).slice(0, 8),
        });
      }
    }
  }

  let created = 0;
  let mutated = 0;
  let deleted = 0;
  const createdTypes = new Set<string>();
  for (const co of eff?.changedObjects ?? []) {
    const idOp = enumName(GrpcTypes.ChangedObject_IdOperation as never, co.idOperation);
    if (idOp === "CREATED") {
      created++;
      if (co.objectType && createdTypes.size < 20) createdTypes.add(co.objectType);
    } else if (idOp === "DELETED") deleted++;
    else mutated++;
  }

  return {
    digest: tx.digest ?? "",
    checkpoint: tx.checkpoint !== undefined ? tx.checkpoint.toString() : null,
    timestamp: timestampToIso(tx.timestamp),
    sender: t?.sender ?? null,
    kind: enumName(GrpcTypes.TransactionKind_Kind as never, t?.kind?.kind),
    status,
    error: err
      ? {
          description: err.description ?? null,
          kind: enumName(GrpcTypes.ExecutionError_ExecutionErrorKind as never, err.kind),
          command: err.command !== undefined ? err.command.toString() : null,
          abortCode,
          location,
        }
      : null,
    gas: gu
      ? {
          owner: t?.gasPayment?.owner ?? null,
          budget: t?.gasPayment?.budget !== undefined ? t.gasPayment.budget.toString() : null,
          price: t?.gasPayment?.price !== undefined ? t.gasPayment.price.toString() : null,
          computationCost: comp.toString(),
          storageCost: stor.toString(),
          storageRebate: reb.toString(),
          nonRefundableStorageFee: (gu.nonRefundableStorageFee ?? 0n).toString(),
          netGasAtomic: (comp + stor - reb).toString(),
        }
      : null,
    balanceChanges: (tx.balanceChanges ?? []).map((b) => ({
      address: b.address ?? "",
      coinType: safeStructTag(b.coinType),
      amountAtomic: b.amount ?? "0",
    })),
    moveCalls,
    commands,
    events: (tx.events?.events ?? []).slice(0, 50).map((e) => ({
      type: e.eventType ?? "",
      packageId: e.packageId ?? null,
      module: e.module ?? null,
      sender: e.sender ?? null,
      json: truncateJson(protoValueToJson(e.json)),
    })),
    objectChanges: { created, mutated, deleted, createdTypes: [...createdTypes] },
  };
}

export const TRANSACTION_READ_MASK = [
  "digest",
  "transaction.sender",
  "transaction.kind",
  "transaction.gas_payment",
  "effects.status",
  "effects.gas_used",
  "effects.changed_objects",
  "events",
  "checkpoint",
  "timestamp",
  "balance_changes",
];

export type { ExecutedTransaction };
