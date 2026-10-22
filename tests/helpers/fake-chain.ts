/**
 * Recorded-fixture implementation of the chain client for automated tests.
 * It implements the same interface as the Tatum client, uses REAL signature
 * verification and REAL transaction (de)serialisation, but serves chain state
 * from fixtures. Never used by the application.
 */
import { createHash } from "node:crypto";
import { bcs } from "@mysten/sui/bcs";
import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { fromBase64, normalizeSuiAddress, toBase58, toBase64 } from "@mysten/sui/utils";
import { verifyTransactionSignature } from "@mysten/sui/verify";
import { ChainDataError, type ChainClient, type ObjectInfo, type Provenance, type WithProvenance } from "@/lib/blockchain/tatum/client";
import type { NormalizedTransaction } from "@/lib/blockchain/tatum/normalize";
import { normalizeCoinType } from "@/lib/blockchain/sui/validation";

export const SUI = normalizeSuiAddress("0x2") + "::sui::SUI";
export const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

export function fixtureDigest(label: string): string {
  return toBase58(createHash("sha256").update(label).digest());
}

export function fixtureAddress(label: string): string {
  return "0x" + createHash("sha256").update(`addr:${label}`).digest("hex");
}

export function fixtureTx(over: Partial<NormalizedTransaction> & { digest: string }): NormalizedTransaction {
  return {
    checkpoint: "336551792",
    timestamp: "2026-10-21T17:10:58.273Z",
    sender: fixtureAddress("sender"),
    kind: "PROGRAMMABLE_TRANSACTION",
    status: "success",
    error: null,
    gas: {
      owner: null,
      budget: "5000000",
      price: "1000",
      computationCost: "1000000",
      storageCost: "2000000",
      storageRebate: "1000000",
      nonRefundableStorageFee: "0",
      netGasAtomic: "2000000",
    },
    balanceChanges: [],
    moveCalls: [],
    commands: ["splitCoins", "transferObjects"],
    events: [],
    objectChanges: { created: 0, mutated: 1, deleted: 0, createdTypes: [] },
    ...over,
  };
}

const prov = (method: string): Provenance => ({
  provider: "tatum",
  providerLabel: "Fixture chain (test)",
  host: "fixture",
  method,
  network: "sui:mainnet",
  fetchedAt: new Date().toISOString(),
  authenticated: true,
});

/** Parse amount + recipient from a simple splitCoins/transferObjects payment. */
function parsePayment(bytes: Uint8Array): { sender: string; recipient: string; amount: bigint } {
  const data = TransactionDataBuilder.fromBytes(bytes);
  const inputs = data.inputs;
  let amount = 0n;
  let recipient = "";
  for (const c of data.commands) {
    if (c.$kind === "SplitCoins") {
      for (const a of c.SplitCoins.amounts) {
        if (a.$kind === "Input") {
          const inp = inputs[a.Input]!;
          if (inp.$kind === "Pure") amount += BigInt(bcs.u64().parse(fromBase64(inp.Pure.bytes)));
        }
      }
    }
    if (c.$kind === "TransferObjects" && c.TransferObjects.address.$kind === "Input") {
      const inp = inputs[c.TransferObjects.address.Input]!;
      if (inp.$kind === "Pure") recipient = bcs.Address.parse(fromBase64(inp.Pure.bytes));
    }
  }
  return { sender: normalizeSuiAddress(data.sender!), recipient: normalizeSuiAddress(recipient), amount };
}

export class FakeChain implements ChainClient {
  readonly txs = new Map<string, NormalizedTransaction>();
  readonly coins = new Map<string, { decimals: number | null; symbol: string | null }>([
    [SUI, { decimals: 9, symbol: "SUI" }],
    [USDC, { decimals: 6, symbol: "USDC" }],
  ]);
  readonly addressTxs = new Map<string, string[]>();
  calls: string[] = [];
  failExecute: "none" | "ambiguous" = "none";
  /** Make specific methods throw, e.g. { GetTransaction: new ChainDataError(...) }. */
  failures = new Map<string, Error>();
  /** Network head; older checkpoints are timestamped ~4 per second before it (Mainnet cadence). */
  head = { sequenceNumber: "336551800", timestamp: "2026-10-21T17:11:00.000Z" };

  checkpointTime(seq: string): string {
    const behind = Number(BigInt(this.head.sequenceNumber) - BigInt(seq));
    return new Date(Date.parse(this.head.timestamp) - behind * 250).toISOString();
  }

  get network(): "mainnet" {
    return "mainnet";
  }
  get isAuthenticated(): boolean {
    return true;
  }

  private hit(method: string) {
    this.calls.push(method);
    const f = this.failures.get(method);
    if (f) throw f;
  }

  addTx(tx: NormalizedTransaction): this {
    this.txs.set(tx.digest, tx);
    return this;
  }

  async serviceInfo() {
    this.hit("GetServiceInfo");
    return {
      data: {
        chainId: "fixture",
        chain: "mainnet",
        epoch: "1",
        checkpointHeight: this.head.sequenceNumber,
        timestamp: this.head.timestamp,
        lowestAvailableCheckpoint: "1",
        server: "fixture",
      },
      provenance: prov("LedgerService/GetServiceInfo"),
    };
  }
  async getTransaction(digest: string) {
    this.hit("GetTransaction");
    const tx = this.txs.get(digest);
    if (!tx) throw new ChainDataError(`Transaction ${digest} not found`, "not_found", "GetTransaction", "tatum", false);
    return { data: tx, provenance: prov("LedgerService/GetTransaction") };
  }
  async batchGetTransactions(digests: string[]) {
    this.hit("BatchGetTransactions");
    return { data: digests.map((d) => this.txs.get(d) ?? { digest: d, error: "not found" }), provenance: prov("LedgerService/BatchGetTransactions") };
  }
  async getCheckpoint(sequenceNumber: string | null) {
    this.hit("GetCheckpoint");
    const seq = sequenceNumber ?? this.head.sequenceNumber;
    if (BigInt(seq) > BigInt(this.head.sequenceNumber)) throw new ChainDataError("Checkpoint not found", "not_found", "GetCheckpoint", "tatum", false);
    const digests = [...this.txs.values()].filter((t) => t.checkpoint === seq).map((t) => t.digest);
    return {
      data: { sequenceNumber: seq, digest: fixtureDigest(`cp${seq}`), epoch: "1", timestamp: this.checkpointTime(seq), transactionDigests: digests },
      provenance: prov("LedgerService/GetCheckpoint"),
    };
  }
  async getCoinInfo(coinTypeInput: string) {
    this.hit("GetCoinInfo");
    const coinType = normalizeCoinType(coinTypeInput) ?? coinTypeInput;
    const c = this.coins.get(coinType) ?? { decimals: null, symbol: null };
    return { data: { coinType, ...c, name: c.symbol }, provenance: prov("StateService/GetCoinInfo") };
  }
  async listBalances(owner: string) {
    this.hit("ListBalances");
    void owner;
    return { data: { balances: [{ coinType: SUI, balanceAtomic: "5000000000" }], truncated: false }, provenance: prov("StateService/ListBalances") };
  }
  async getBalance(_owner: string, coinType: string) {
    this.hit("GetBalance");
    return { data: { coinType, balanceAtomic: "5000000000" }, provenance: prov("StateService/GetBalance") };
  }
  async listOwnedObjects() {
    this.hit("ListOwnedObjects");
    return { data: { objects: [], hasMore: false }, provenance: prov("StateService/ListOwnedObjects") };
  }
  async getObject(objectId: string): Promise<WithProvenance<ObjectInfo>> {
    this.hit("GetObject");
    throw new ChainDataError(`Object ${objectId} not found`, "not_found", "GetObject", "tatum", false);
  }
  async listAddressTransactions(address: string, opts: { limit: number }) {
    this.hit("ListTransactions");
    const items = (this.addressTxs.get(address) ?? [])
      .slice(0, opts.limit)
      .map((d) => ({ digest: d, checkpoint: this.txs.get(d)?.checkpoint ?? null, timestamp: this.txs.get(d)?.timestamp ?? null }));
    return { data: { items, endReason: "ITEM_LIMIT" }, provenance: prov("LedgerService/ListTransactions") };
  }
  async getPackage(packageId: string) {
    this.hit("GetPackage");
    return {
      data: { packageId, version: "1", modules: [{ name: "pool", functions: ["swap"], datatypes: ["Pool"] }] },
      provenance: prov("MovePackageService/GetPackage"),
    };
  }
  async lookupName(name: string) {
    this.hit("LookupName");
    return { data: { name, targetAddress: null, expiration: null }, provenance: prov("NameService/LookupName") };
  }
  async reverseLookupName(address: string) {
    this.hit("ReverseLookupName");
    return { data: { address, name: null }, provenance: prov("NameService/ReverseLookupName") };
  }
  async simulateTransaction(transactionBytesB64: string) {
    this.hit("SimulateTransaction");
    const p = parsePayment(fromBase64(transactionBytesB64));
    return {
      data: {
        success: true,
        error: null,
        sender: p.sender,
        gasOwner: p.sender,
        balanceChanges: [
          { address: p.sender, coinType: SUI, amountAtomic: (-(p.amount + 2000000n)).toString() },
          { address: p.recipient, coinType: SUI, amountAtomic: p.amount.toString() },
        ],
      },
      provenance: prov("TransactionExecutionService/SimulateTransaction"),
    };
  }
  async buildPaymentTransaction(input: { sender: string; payTo: string; coinType: string; amountAtomic: string }) {
    this.hit("BuildPayment");
    const bytes = await buildOfflinePayment(input.sender, input.payTo, BigInt(input.amountAtomic));
    return { data: { bytesB64: toBase64(bytes), digest: TransactionDataBuilder.getDigestFromBytes(bytes) }, provenance: prov("Transaction.build") };
  }
  async verifyTransactionSignature(transactionBytesB64: string, signature: string, expectedAddress: string) {
    this.hit("VerifySignature");
    try {
      const pk = await verifyTransactionSignature(fromBase64(transactionBytesB64), signature, { address: expectedAddress });
      return {
        valid: pk.toSuiAddress() === expectedAddress,
        address: pk.toSuiAddress(),
        error: null,
        provenance: prov("SignatureVerificationService/VerifySignature"),
      };
    } catch (err) {
      return { valid: false, address: null, error: String((err as Error).message), provenance: prov("SignatureVerificationService/VerifySignature") };
    }
  }
  async executeTransaction(transactionBytesB64: string, signatures: string[]) {
    this.hit("ExecuteTransaction");
    void signatures;
    const bytes = fromBase64(transactionBytesB64);
    const digest = TransactionDataBuilder.getDigestFromBytes(bytes);
    const p = parsePayment(bytes);
    this.addTx(
      fixtureTx({
        digest,
        sender: p.sender,
        checkpoint: "336551900",
        balanceChanges: [
          { address: p.sender, coinType: SUI, amountAtomic: (-(p.amount + 2000000n)).toString() },
          { address: p.recipient, coinType: SUI, amountAtomic: p.amount.toString() },
        ],
      }),
    );
    if (this.failExecute === "ambiguous") throw new ChainDataError("deadline exceeded", "timeout", "ExecuteTransaction", "tatum", true);
    return { data: { digest, success: true, checkpoint: "336551900", error: null }, provenance: prov("TransactionExecutionService/ExecuteTransaction") };
  }
}

/** A fully specified (offline-buildable) SUI payment transaction. */
export async function buildOfflinePayment(sender: string, payTo: string, amount: bigint): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasPrice(1000);
  tx.setGasBudget(5_000_000);
  tx.setGasPayment([{ objectId: fixtureAddress(`gas:${sender}`), version: "7", digest: fixtureDigest(`gas:${sender}`) }]);
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
  tx.transferObjects([coin!], tx.pure.address(payTo));
  return tx.build();
}
