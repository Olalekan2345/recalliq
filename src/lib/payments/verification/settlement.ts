/**
 * Independent settlement verification. Whatever a facilitator or resource
 * server reports, a payment is only "settled" after Tatum returns the
 * transaction and every expectation below holds on chain.
 */
import { ChainDataError, type ChainClient } from "@/lib/blockchain/tatum/client";
import { sameAddress, sameCoinType } from "@/lib/blockchain/sui/validation";
import { toBigInt } from "@/lib/blockchain/sui/amounts";

export interface SettlementExpectation {
  digest: string;
  network: "sui:mainnet" | "sui:testnet";
  payTo: string;
  asset: string;
  amountAtomic: string;
  expectedSender: string | null;
}

export interface SettlementCheck {
  finalState: "settled" | "failed" | "mismatch" | "unknown";
  digest: string;
  network: string;
  checkpoint: string | null;
  executionSuccess: boolean | null;
  sender: string | null;
  assetVerified: boolean;
  recipientVerified: boolean;
  amountVerified: boolean;
  senderVerified: boolean;
  observedAmountAtomic: string | null;
  verifiedVia: string;
  detail: string;
}

export async function verifySettlement(chainClient: ChainClient, exp: SettlementExpectation): Promise<SettlementCheck> {
  const base = {
    digest: exp.digest,
    network: exp.network,
    verifiedVia: `tatum-grpc:LedgerService/GetTransaction`,
  };
  if (`sui:${chainClient.network}` !== exp.network) {
    return {
      ...base,
      finalState: "unknown",
      checkpoint: null,
      executionSuccess: null,
      sender: null,
      assetVerified: false,
      recipientVerified: false,
      amountVerified: false,
      senderVerified: false,
      observedAmountAtomic: null,
      detail: "Chain client network does not match payment network",
    };
  }
  let tx;
  try {
    const res = await chainClient.getTransaction(exp.digest);
    tx = res.data;
    base.verifiedVia = `${res.provenance.provider}-grpc:${res.provenance.method}`;
  } catch (err) {
    const notFound = err instanceof ChainDataError && err.code === "not_found";
    return {
      ...base,
      finalState: "unknown",
      checkpoint: null,
      executionSuccess: null,
      sender: null,
      assetVerified: false,
      recipientVerified: false,
      amountVerified: false,
      senderVerified: false,
      observedAmountAtomic: null,
      detail: notFound ? "Transaction not found on chain (yet)" : `Lookup failed: ${(err as Error).message.slice(0, 160)}`,
    };
  }

  const credited = tx.balanceChanges
    .filter((b) => sameAddress(b.address, exp.payTo) && sameCoinType(b.coinType, exp.asset))
    .reduce((acc, b) => acc + toBigInt(b.amountAtomic), 0n);
  const recipientVerified = tx.balanceChanges.some((b) => sameAddress(b.address, exp.payTo) && toBigInt(b.amountAtomic) > 0n);
  const assetVerified = credited > 0n;
  const amountVerified = credited === toBigInt(exp.amountAtomic);
  const senderVerified = exp.expectedSender ? sameAddress(tx.sender, exp.expectedSender) : true;
  const executionSuccess = tx.status === "success";

  let finalState: SettlementCheck["finalState"];
  let detail: string;
  if (!executionSuccess) {
    finalState = "failed";
    detail = `Transaction executed with status ${tx.status}${tx.error?.description ? `: ${tx.error.description}` : ""}`;
  } else if (assetVerified && amountVerified && senderVerified && tx.checkpoint) {
    finalState = "settled";
    detail = `Recipient credited exactly ${credited} atomic units in checkpoint ${tx.checkpoint}`;
  } else {
    finalState = "mismatch";
    detail = [
      !recipientVerified ? "recipient not credited" : null,
      !assetVerified ? "asset mismatch" : null,
      !amountVerified ? `amount mismatch (observed ${credited}, expected ${exp.amountAtomic})` : null,
      !senderVerified ? "unexpected sender" : null,
      !tx.checkpoint ? "no checkpoint yet" : null,
    ]
      .filter(Boolean)
      .join("; ");
  }
  return {
    ...base,
    finalState,
    checkpoint: tx.checkpoint,
    executionSuccess,
    sender: tx.sender,
    assetVerified,
    recipientVerified,
    amountVerified,
    senderVerified,
    observedAmountAtomic: credited.toString(),
    detail,
  };
}
