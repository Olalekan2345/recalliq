/**
 * Tatum Sui Mainnet gRPC client.
 *
 * Transport: native gRPC over HTTP/2 + TLS (@grpc/grpc-js via protobuf-ts),
 * authenticated with Tatum's `x-api-key` metadata header, using the official
 * sui.rpc.v2 protobuf service clients shipped in @mysten/sui.
 *
 * Guarantees
 *  - Requests are built with the generated `.create()` and pre-serialised, so a
 *    malformed message can never reach the transport.
 *  - Errors are classified (auth / rate limit / timeout / not found /
 *    unimplemented / invalid input / unavailable) with a retryable flag.
 *  - Only reads are retried. `executeTransaction` is never retried here: an
 *    ambiguous outcome is reconciled by digest instead.
 *  - Every result carries provenance (provider, host, method, time).
 *  - A fallback host is used only for UNIMPLEMENTED methods and only when the
 *    operator configured SUI_FALLBACK_GRPC_URL; provenance discloses it.
 */
import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import type { RpcOptions } from "@protobuf-ts/runtime-rpc";
import { GrpcTypes, SuiGrpcClient } from "@mysten/sui/grpc";
import { coinWithBalance, Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { verifyTransactionSignature } from "@mysten/sui/verify";
import { tatumConfig } from "@/lib/env";
import { normalizeCoinType } from "@/lib/blockchain/sui/validation";
import { logger } from "@/lib/logging/logger";
import { normalizeTransaction, timestampToIso, TRANSACTION_READ_MASK, type NormalizedTransaction } from "./normalize";

const log = logger("tatum");

export type ChainErrorCode = "auth_failed" | "rate_limited" | "timeout" | "not_found" | "unsupported" | "invalid_input" | "unavailable" | "provider_error";

export class ChainDataError extends Error {
  constructor(
    message: string,
    readonly code: ChainErrorCode,
    readonly method: string,
    readonly provider: string,
    readonly retryable: boolean,
    readonly grpcCode?: string,
  ) {
    super(message);
    this.name = "ChainDataError";
  }
}

export interface Provenance {
  provider: "tatum" | "sui-fallback";
  providerLabel: string;
  host: string;
  method: string;
  network: string;
  fetchedAt: string;
  authenticated: boolean;
}

export interface WithProvenance<T> {
  data: T;
  provenance: Provenance;
}

interface Endpoint {
  id: Provenance["provider"];
  label: string;
  host: string;
  authenticated: boolean;
  client: SuiGrpcClient;
}

export function classifyGrpcError(err: unknown, method: string, provider: string): ChainDataError {
  if (err instanceof ChainDataError) return err;
  const e = err as { code?: string; message?: string; name?: string };
  const code = String(e?.code ?? "");
  const msg = String(e?.message ?? err ?? "unknown error").slice(0, 300);
  const mk = (c: ChainErrorCode, retryable: boolean) => new ChainDataError(msg, c, method, provider, retryable, code || undefined);
  if (/429|rate.?limit|too many requests|resource_exhausted/i.test(msg) || code === "RESOURCE_EXHAUSTED") return mk("rate_limited", true);
  if (code === "UNAUTHENTICATED" || code === "PERMISSION_DENIED" || /401|403|unauthori[sz]ed|forbidden|api key/i.test(msg)) return mk("auth_failed", false);
  if (code === "DEADLINE_EXCEEDED" || /deadline|timed? ?out/i.test(msg)) return mk("timeout", true);
  if (code === "NOT_FOUND" || /not found/i.test(msg)) return mk("not_found", false);
  if (code === "UNIMPLEMENTED") return mk("unsupported", false);
  if (code === "INVALID_ARGUMENT" || code === "FAILED_PRECONDITION" || code === "OUT_OF_RANGE") return mk("invalid_input", false);
  if (code === "UNAVAILABLE" || code === "ABORTED" || /ECONNRESET|ENOTFOUND|EAI_AGAIN|socket|503|502|504/i.test(msg)) return mk("unavailable", true);
  return mk("provider_error", code === "INTERNAL" || code === "UNKNOWN");
}

function makeEndpoint(
  id: Endpoint["id"],
  label: string,
  host: string,
  apiKey: string | undefined,
  timeoutMs: number,
  network: "mainnet" | "testnet",
): Endpoint {
  const transport = new GrpcTransport({
    host,
    channelCredentials: ChannelCredentials.createSsl(),
    meta: apiKey ? { "x-api-key": apiKey } : {},
    timeout: timeoutMs,
  });
  return { id, label, host, authenticated: Boolean(apiKey), client: new SuiGrpcClient({ network, transport }) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Process-wide request pacing per host, so bursts (parallel tool calls,
 * concurrent runs, transaction building) stay under the provider's
 * requests-per-second limit instead of tripping HTTP 429s.
 */
class Pacer {
  private next = 0;
  constructor(private readonly intervalMs: number) {}
  async acquire(): Promise<void> {
    const now = Date.now();
    const start = Math.max(now, this.next);
    this.next = start + this.intervalMs;
    if (start > now) await sleep(start - now);
  }
}

const pacers = new Map<string, Pacer>();
function pacerFor(host: string, maxRps: number): Pacer {
  const key = `${host}|${maxRps}`;
  let p = pacers.get(key);
  if (!p) {
    p = new Pacer(Math.ceil(1000 / Math.max(1, maxRps)));
    pacers.set(key, p);
  }
  return p;
}

/** Message types we construct requests for. Pre-serialising rejects invalid messages before the transport sees them. */
type MessageTypeLike<T extends object> = { create(value?: Partial<T>): T; toBinary(message: T): Uint8Array };

function build<T extends object>(type: MessageTypeLike<T>, value: Partial<T>): T {
  const msg = type.create(value);
  type.toBinary(msg);
  return msg;
}

export interface CoinInfo {
  coinType: string;
  decimals: number | null;
  symbol: string | null;
  name: string | null;
}

export interface BalanceEntry {
  coinType: string;
  balanceAtomic: string;
}

export interface OwnedObjectEntry {
  objectId: string;
  objectType: string | null;
  version: string | null;
}

export interface ObjectInfo {
  objectId: string;
  version: string | null;
  digest: string | null;
  objectType: string | null;
  owner: { kind: string | null; address: string | null } | null;
}

export interface CheckpointInfo {
  sequenceNumber: string;
  digest: string | null;
  epoch: string | null;
  timestamp: string | null;
  transactionDigests: string[] | null;
}

export interface AddressTransactionRef {
  digest: string;
  checkpoint: string | null;
  timestamp: string | null;
}

export interface PackageInfo {
  packageId: string;
  version: string | null;
  modules: Array<{ name: string; functions: string[]; datatypes: string[] }>;
}

export class SuiChainClient {
  private readonly primary: Endpoint;
  private readonly fallback: Endpoint | null;
  private readonly coinCache = new Map<string, { info: CoinInfo; at: number }>();

  constructor(
    private readonly opts: {
      host: string;
      apiKey?: string;
      timeoutMs: number;
      network: "mainnet" | "testnet";
      fallbackHost?: string;
      /** Requests per second allowed by the provider plan (Tatum free plan: 3). */
      maxRps?: number;
    },
  ) {
    this.primary = makeEndpoint("tatum", "Tatum Sui gRPC", opts.host, opts.apiKey, opts.timeoutMs, opts.network);
    this.fallback = opts.fallbackHost
      ? makeEndpoint("sui-fallback", `Sui fullnode gRPC (${opts.fallbackHost})`, opts.fallbackHost, undefined, opts.timeoutMs, opts.network)
      : null;
  }

  get network(): "mainnet" | "testnet" {
    return this.opts.network;
  }

  get isAuthenticated(): boolean {
    return this.primary.authenticated;
  }

  private pace(ep: Endpoint): Promise<void> {
    return pacerFor(ep.host, this.opts.maxRps ?? 3).acquire();
  }

  private provenance(ep: Endpoint, method: string): Provenance {
    return {
      provider: ep.id,
      providerLabel: ep.label,
      host: ep.host,
      method,
      network: `sui:${this.opts.network}`,
      fetchedAt: new Date().toISOString(),
      authenticated: ep.authenticated,
    };
  }

  /** Read call with retry (reads only) and capability-gap fallback. */
  private async read<T>(method: string, fn: (c: SuiGrpcClient, o: RpcOptions) => Promise<T>, signal?: AbortSignal): Promise<WithProvenance<T>> {
    const attempt = async (ep: Endpoint): Promise<WithProvenance<T>> => {
      let last: ChainDataError | undefined;
      for (let i = 0; i < 3; i++) {
        if (signal?.aborted) throw new ChainDataError("Request cancelled", "unavailable", method, ep.id, false);
        await this.pace(ep);
        const started = Date.now();
        try {
          const data = await fn(ep.client, { timeout: this.opts.timeoutMs, abort: signal });
          log.debug("grpc ok", { method, provider: ep.id, ms: Date.now() - started });
          return { data, provenance: this.provenance(ep, method) };
        } catch (err) {
          last = classifyGrpcError(err, method, ep.id);
          log.warn("grpc error", { method, provider: ep.id, code: last.code, grpcCode: last.grpcCode, attempt: i + 1 });
          if (!last.retryable || i === 2) break;
          await sleep(last.code === "rate_limited" ? 1200 * (i + 1) : 400 * 2 ** i);
        }
      }
      throw last!;
    };
    try {
      return await attempt(this.primary);
    } catch (err) {
      if (err instanceof ChainDataError && err.code === "unsupported" && this.fallback) {
        log.warn("capability gap — using disclosed fallback", { method });
        return attempt(this.fallback);
      }
      throw err;
    }
  }

  async serviceInfo(signal?: AbortSignal) {
    return this.read(
      "LedgerService/GetServiceInfo",
      async (c, o) => {
        const r = await c.ledgerService.getServiceInfo(build(GrpcTypes.GetServiceInfoRequest, {}), o);
        const res = r.response;
        return {
          chainId: res.chainId ?? null,
          chain: res.chain ?? null,
          epoch: res.epoch?.toString() ?? null,
          checkpointHeight: res.checkpointHeight?.toString() ?? null,
          timestamp: timestampToIso(res.timestamp),
          lowestAvailableCheckpoint: res.lowestAvailableCheckpoint?.toString() ?? null,
          server: res.server ?? null,
        };
      },
      signal,
    );
  }

  async getTransaction(digest: string, signal?: AbortSignal): Promise<WithProvenance<NormalizedTransaction>> {
    return this.read(
      "LedgerService/GetTransaction",
      async (c, o) => {
        const r = await c.ledgerService.getTransaction(build(GrpcTypes.GetTransactionRequest, { digest, readMask: { paths: TRANSACTION_READ_MASK } }), o);
        if (!r.response.transaction) throw new ChainDataError(`Transaction ${digest} not found`, "not_found", "GetTransaction", "tatum", false);
        return normalizeTransaction(r.response.transaction);
      },
      signal,
    );
  }

  async batchGetTransactions(
    digests: string[],
    signal?: AbortSignal,
  ): Promise<WithProvenance<Array<NormalizedTransaction | { digest: string; error: string }>>> {
    return this.read(
      "LedgerService/BatchGetTransactions",
      async (c, o) => {
        const r = await c.ledgerService.batchGetTransactions(
          build(GrpcTypes.BatchGetTransactionsRequest, { digests, readMask: { paths: TRANSACTION_READ_MASK } }),
          o,
        );
        return r.response.transactions.map((res, i) => {
          const result = res.result;
          if (result.oneofKind === "transaction") return normalizeTransaction(result.transaction);
          const errMsg = result.oneofKind === "error" ? (result.error.message ?? "error") : "missing";
          return { digest: digests[i] ?? "", error: errMsg };
        });
      },
      signal,
    );
  }

  async getCheckpoint(sequenceNumber: string | null, opts: { includeContents?: boolean } = {}, signal?: AbortSignal): Promise<WithProvenance<CheckpointInfo>> {
    const paths = ["sequence_number", "digest", "summary.epoch", "summary.timestamp"];
    if (opts.includeContents) paths.push("contents");
    return this.read(
      "LedgerService/GetCheckpoint",
      async (c, o) => {
        const req = build(GrpcTypes.GetCheckpointRequest, {
          checkpointId: sequenceNumber !== null ? { oneofKind: "sequenceNumber", sequenceNumber: BigInt(sequenceNumber) } : { oneofKind: undefined },
          readMask: { paths },
        });
        const r = await c.ledgerService.getCheckpoint(req, o);
        const cp = r.response.checkpoint;
        if (!cp) throw new ChainDataError("Checkpoint not found", "not_found", "GetCheckpoint", "tatum", false);
        return {
          sequenceNumber: cp.sequenceNumber?.toString() ?? sequenceNumber ?? "",
          digest: cp.digest ?? null,
          epoch: cp.summary?.epoch?.toString() ?? null,
          timestamp: timestampToIso(cp.summary?.timestamp),
          transactionDigests: opts.includeContents ? (cp.contents?.transactions ?? []).map((t) => t.transaction ?? "").filter(Boolean) : null,
        };
      },
      signal,
    );
  }

  async getCoinInfo(coinTypeInput: string, signal?: AbortSignal): Promise<WithProvenance<CoinInfo>> {
    // One canonical form for both the request and the cache key ("0x2::sui::SUI" ≡ long form).
    const coinType = normalizeCoinType(coinTypeInput) ?? coinTypeInput;
    const cached = this.coinCache.get(coinType);
    if (cached && Date.now() - cached.at < 6 * 3600_000) {
      return { data: cached.info, provenance: { ...this.provenance(this.primary, "StateService/GetCoinInfo"), fetchedAt: new Date(cached.at).toISOString() } };
    }
    const res = await this.read(
      "StateService/GetCoinInfo",
      async (c, o) => {
        const r = await c.stateService.getCoinInfo(build(GrpcTypes.GetCoinInfoRequest, { coinType }), o);
        const m = r.response.metadata;
        return {
          coinType: r.response.coinType ?? coinType,
          decimals: m?.decimals ?? null,
          symbol: m?.symbol ?? null,
          name: m?.name ?? null,
        } satisfies CoinInfo;
      },
      signal,
    );
    if (res.data.decimals !== null) this.coinCache.set(coinType, { info: res.data, at: Date.now() });
    return res;
  }

  async listBalances(owner: string, limit = 50, signal?: AbortSignal): Promise<WithProvenance<{ balances: BalanceEntry[]; truncated: boolean }>> {
    return this.read(
      "StateService/ListBalances",
      async (c, o) => {
        const balances: BalanceEntry[] = [];
        let pageToken: Uint8Array | undefined;
        let truncated = false;
        for (let page = 0; page < 5; page++) {
          const r = await c.stateService.listBalances(build(GrpcTypes.ListBalancesRequest, { owner, pageSize: 50, pageToken }), o);
          for (const b of r.response.balances) {
            balances.push({ coinType: b.coinType ?? "", balanceAtomic: (b.balance ?? 0n).toString() });
          }
          pageToken = r.response.nextPageToken;
          if (!pageToken || pageToken.length === 0) break;
          if (balances.length >= limit) {
            truncated = true;
            break;
          }
        }
        return { balances: balances.slice(0, limit), truncated: truncated || balances.length > limit };
      },
      signal,
    );
  }

  async getBalance(owner: string, coinType: string, signal?: AbortSignal): Promise<WithProvenance<BalanceEntry>> {
    return this.read(
      "StateService/GetBalance",
      async (c, o) => {
        const r = await c.stateService.getBalance(build(GrpcTypes.GetBalanceRequest, { owner, coinType }), o);
        return { coinType: r.response.balance?.coinType ?? coinType, balanceAtomic: (r.response.balance?.balance ?? 0n).toString() };
      },
      signal,
    );
  }

  async listOwnedObjects(
    owner: string,
    limit = 25,
    objectType?: string,
    signal?: AbortSignal,
  ): Promise<WithProvenance<{ objects: OwnedObjectEntry[]; hasMore: boolean }>> {
    return this.read(
      "StateService/ListOwnedObjects",
      async (c, o) => {
        const r = await c.stateService.listOwnedObjects(
          build(GrpcTypes.ListOwnedObjectsRequest, {
            owner,
            pageSize: Math.min(limit, 50),
            objectType,
            readMask: { paths: ["object_id", "version", "object_type"] },
          }),
          o,
        );
        return {
          objects: r.response.objects.map((ob) => ({
            objectId: ob.objectId ?? "",
            objectType: ob.objectType ?? null,
            version: ob.version?.toString() ?? null,
          })),
          hasMore: Boolean(r.response.nextPageToken && r.response.nextPageToken.length > 0),
        };
      },
      signal,
    );
  }

  async getObject(objectId: string, signal?: AbortSignal): Promise<WithProvenance<ObjectInfo>> {
    return this.read(
      "LedgerService/GetObject",
      async (c, o) => {
        const r = await c.ledgerService.getObject(
          build(GrpcTypes.GetObjectRequest, { objectId, readMask: { paths: ["object_id", "version", "digest", "object_type", "owner"] } }),
          o,
        );
        const ob = r.response.object;
        if (!ob) throw new ChainDataError(`Object ${objectId} not found`, "not_found", "GetObject", "tatum", false);
        return {
          objectId: ob.objectId ?? objectId,
          version: ob.version?.toString() ?? null,
          digest: ob.digest ?? null,
          objectType: ob.objectType ?? null,
          owner: ob.owner
            ? {
                kind: typeof ob.owner.kind === "number" ? (GrpcTypes.Owner_OwnerKind[ob.owner.kind] ?? String(ob.owner.kind)) : null,
                address: ob.owner.address ?? null,
              }
            : null,
        };
      },
      signal,
    );
  }

  /**
   * Recent transactions that touched an address, newest first, via the
   * indexed LedgerService/ListTransactions stream (affected-address or sender filter).
   */
  async listAddressTransactions(
    address: string,
    opts: { limit: number; role?: "affected" | "sender" },
    signal?: AbortSignal,
  ): Promise<WithProvenance<{ items: AddressTransactionRef[]; endReason: string | null }>> {
    return this.read(
      "LedgerService/ListTransactions",
      async (c, o) => {
        const predicate =
          opts.role === "sender"
            ? { oneofKind: "sender" as const, sender: { address } }
            : { oneofKind: "affectedAddress" as const, affectedAddress: { address } };
        const req = build(GrpcTypes.ListTransactionsRequest, {
          filter: { terms: [{ literals: [{ negated: false, predicate }] }] },
          options: { limit: Math.min(Math.max(opts.limit, 1), 50), ordering: GrpcTypes.Ordering.DESCENDING },
          readMask: { paths: ["digest", "checkpoint", "timestamp"] },
        });
        const call = c.ledgerService.listTransactions(req, o);
        const items: AddressTransactionRef[] = [];
        let endReason: string | null = null;
        for await (const frame of call.responses) {
          if (frame.transaction?.digest) {
            items.push({
              digest: frame.transaction.digest,
              checkpoint: frame.transaction.checkpoint?.toString() ?? null,
              timestamp: timestampToIso(frame.transaction.timestamp),
            });
          }
          if (frame.end) {
            endReason = GrpcTypes.QueryEndReason[frame.end.reason ?? 0] ?? String(frame.end.reason);
          }
          if (items.length >= opts.limit) break;
        }
        return { items, endReason };
      },
      signal,
    );
  }

  async getPackage(packageId: string, signal?: AbortSignal): Promise<WithProvenance<PackageInfo>> {
    return this.read(
      "MovePackageService/GetPackage",
      async (c, o) => {
        const r = await c.movePackageService.getPackage(build(GrpcTypes.GetPackageRequest, { packageId }), o);
        const p = r.response.package;
        if (!p) throw new ChainDataError(`Package ${packageId} not found`, "not_found", "GetPackage", "tatum", false);
        return {
          packageId: p.storageId ?? packageId,
          version: p.version?.toString() ?? null,
          modules: (p.modules ?? []).slice(0, 60).map((m) => ({
            name: m.name ?? "",
            functions: (m.functions ?? []).slice(0, 80).map((f) => f.name ?? ""),
            datatypes: (m.datatypes ?? []).slice(0, 80).map((d) => d.name ?? ""),
          })),
        };
      },
      signal,
    );
  }

  async lookupName(name: string, signal?: AbortSignal) {
    return this.read(
      "NameService/LookupName",
      async (c, o) => {
        const r = await c.nameService.lookupName(build(GrpcTypes.LookupNameRequest, { name }), o);
        const rec = r.response.record;
        return {
          name: rec?.name ?? name,
          targetAddress: rec?.targetAddress ?? null,
          expiration: timestampToIso(rec?.expirationTimestamp),
        };
      },
      signal,
    );
  }

  async reverseLookupName(address: string, signal?: AbortSignal) {
    return this.read(
      "NameService/ReverseLookupName",
      async (c, o) => {
        const r = await c.nameService.reverseLookupName(build(GrpcTypes.ReverseLookupNameRequest, { address }), o);
        return { address, name: r.response.record?.name ?? null };
      },
      signal,
    );
  }

  /** Dry-run signed payment bytes (x402 verification). Read-only. */
  async simulateTransaction(transactionBytesB64: string, signal?: AbortSignal) {
    return this.read(
      "TransactionExecutionService/SimulateTransaction",
      async (c) => {
        const res = await c.core.simulateTransaction({
          transaction: fromBase64(transactionBytesB64),
          include: { balanceChanges: true, effects: true, transaction: true },
          signal,
        });
        const t = res.$kind === "Transaction" ? res.Transaction : res.FailedTransaction;
        return {
          success: res.$kind === "Transaction" && t.status.success,
          error: t.status.success ? null : JSON.stringify(t.status.error).slice(0, 400),
          sender: t.transaction?.sender ?? null,
          gasOwner: t.transaction?.gasData?.owner ?? null,
          balanceChanges: (t.balanceChanges ?? []).map((b) => ({ address: b.address, coinType: b.coinType, amountAtomic: b.amount })),
        };
      },
      signal,
    );
  }

  /**
   * Build (not sign) an exact-amount transfer for an x402 payment, using Tatum
   * for coin selection, reference gas price and budget estimation. The user's
   * wallet signs these bytes; nothing here can move funds on its own.
   */
  async buildPaymentTransaction(input: {
    sender: string;
    payTo: string;
    coinType: string;
    amountAtomic: string;
  }): Promise<WithProvenance<{ bytesB64: string; digest: string }>> {
    const method = "Transaction.build (StateService/ListOwnedObjects + SimulateTransaction)";
    // Building only reads chain state (coins, gas price, dry-run budget), so a
    // transient failure (e.g. a 429 during the internal burst of calls) is safe to retry.
    let last: ChainDataError | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.pace(this.primary);
      try {
        const tx = new Transaction();
        tx.setSender(input.sender);
        tx.transferObjects([coinWithBalance({ type: input.coinType, balance: BigInt(input.amountAtomic) })], input.payTo);
        const bytes = await tx.build({ client: this.primary.client });
        return {
          data: { bytesB64: toBase64(bytes), digest: TransactionDataBuilder.getDigestFromBytes(bytes) },
          provenance: this.provenance(this.primary, method),
        };
      } catch (err) {
        last = classifyGrpcError(err, method, this.primary.id);
        log.warn("payment build failed", { code: last.code, attempt: attempt + 1 });
        if (!last.retryable) break;
        await sleep(1500 * (attempt + 1));
      }
    }
    throw last!;
  }

  /**
   * Verify a user signature over transaction bytes. Ed25519/secp256k1/r1 and
   * multisig verify locally; zkLogin (e.g. Slush social login) is verified
   * through Tatum's SignatureVerificationService via the core client.
   */
  async verifyTransactionSignature(
    transactionBytesB64: string,
    signature: string,
    expectedAddress: string,
  ): Promise<{ valid: boolean; address: string | null; error: string | null; provenance: Provenance }> {
    const method = "SignatureVerificationService/VerifySignature";
    try {
      await this.pace(this.primary);
      const pk = await verifyTransactionSignature(fromBase64(transactionBytesB64), signature, {
        client: this.primary.client,
        address: expectedAddress,
      });
      const address = pk.toSuiAddress();
      return {
        valid: address === expectedAddress,
        address,
        error: address === expectedAddress ? null : "Signer does not match sender",
        provenance: this.provenance(this.primary, method),
      };
    } catch (err) {
      return { valid: false, address: null, error: String((err as Error)?.message ?? err).slice(0, 200), provenance: this.provenance(this.primary, method) };
    }
  }

  /**
   * Broadcast a signed transaction. NOT retried: on any ambiguous failure the
   * caller must reconcile by the locally computed digest before doing anything else.
   */
  async executeTransaction(
    transactionBytesB64: string,
    signatures: string[],
  ): Promise<WithProvenance<{ digest: string; success: boolean; checkpoint: string | null; error: string | null }>> {
    const method = "TransactionExecutionService/ExecuteTransaction";
    try {
      await this.pace(this.primary);
      const res = await this.primary.client.core.executeTransaction({
        transaction: fromBase64(transactionBytesB64),
        signatures,
        include: { effects: true },
      });
      const t = res.$kind === "Transaction" ? res.Transaction : res.FailedTransaction;
      return {
        data: {
          digest: t.digest,
          success: res.$kind === "Transaction" && t.status.success,
          checkpoint: t.checkpoint,
          error: t.status.success ? null : JSON.stringify(t.status.error).slice(0, 400),
        },
        provenance: this.provenance(this.primary, method),
      };
    } catch (err) {
      throw classifyGrpcError(err, method, this.primary.id);
    }
  }
}

/** Public surface of the chain client (lets tests inject a recorded-fixture implementation). */
export type ChainClient = { [K in keyof SuiChainClient]: SuiChainClient[K] };

const g = globalThis as unknown as { __recalliqChain?: SuiChainClient; __recalliqChainOverride?: ChainClient };

export function chain(): ChainClient {
  if (g.__recalliqChainOverride) return g.__recalliqChainOverride;
  if (!g.__recalliqChain) {
    const cfg = tatumConfig();
    g.__recalliqChain = new SuiChainClient({
      host: cfg.host,
      apiKey: cfg.apiKey,
      timeoutMs: cfg.timeoutMs,
      network: cfg.network,
      fallbackHost: cfg.fallbackHost,
      maxRps: cfg.maxRps,
    });
  }
  return g.__recalliqChain;
}

/** Tests only. */
export function setChainOverride(client: ChainClient | undefined): void {
  g.__recalliqChainOverride = client;
}
