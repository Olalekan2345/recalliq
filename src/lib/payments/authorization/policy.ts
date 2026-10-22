/**
 * Spending policy — trusted code, never the model. The agent may *propose* a
 * purchase; this decides whether a payment request can even be shown to the
 * user, and the authorize endpoint re-checks it before anything is signed.
 */
import { sameAddress, sameCoinType } from "@/lib/blockchain/sui/validation";
import { toBigInt } from "@/lib/blockchain/sui/amounts";

export interface SpendPolicyInput {
  amountAtomic: string;
  asset: string;
  payTo: string;
  network: string;
  /** Operator configuration. */
  configuredNetwork: string;
  configuredAsset: string;
  allowedRecipients: string[];
  platformMaxPerTxAtomic?: string;
  platformMaxPerDayAtomic?: string;
  /** User settings. */
  paidToolsEnabled: boolean;
  isGuest: boolean;
  userLimitAsset: string;
  userPerPaymentLimitAtomic?: string | null;
  userPerRunLimitAtomic?: string | null;
  userDailyLimitAtomic?: string | null;
  /** Current commitments (approved + settling + settled) in the asset. */
  committedThisRunAtomic: string;
  committed24hAtomic: string;
}

export interface SpendPolicyDecision {
  allowed: boolean;
  reasons: string[];
}

function exceeds(total: bigint, limit: string | null | undefined): boolean {
  return limit !== null && limit !== undefined && limit !== "" && total > toBigInt(limit);
}

export function evaluateSpendPolicy(i: SpendPolicyInput): SpendPolicyDecision {
  const reasons: string[] = [];
  const amount = toBigInt(i.amountAtomic);

  if (i.isGuest) reasons.push("Guest sessions cannot authorize payments");
  if (!i.paidToolsEnabled) reasons.push("Paid tools are disabled in your settings");
  if (amount <= 0n) reasons.push("Quoted amount must be positive");
  if (i.network !== i.configuredNetwork) reasons.push(`Network ${i.network} is not the configured payment network ${i.configuredNetwork}`);
  if (!sameCoinType(i.asset, i.configuredAsset)) reasons.push("Payment asset is not an allowed asset");
  if (!i.allowedRecipients.some((r) => sameAddress(r, i.payTo))) reasons.push("Recipient is not on the allowlist");

  if (exceeds(amount, i.platformMaxPerTxAtomic)) reasons.push("Exceeds the platform per-payment cap");
  if (exceeds(toBigInt(i.committed24hAtomic) + amount, i.platformMaxPerDayAtomic)) reasons.push("Exceeds the platform 24h cap");

  const userLimitsApply = sameCoinType(i.userLimitAsset, i.asset);
  const userHasLimits = Boolean(i.userPerPaymentLimitAtomic || i.userPerRunLimitAtomic || i.userDailyLimitAtomic);
  if (userHasLimits && !userLimitsApply) {
    reasons.push("Your spending limits are set in a different asset; update them in Settings first");
  } else if (userLimitsApply) {
    if (exceeds(amount, i.userPerPaymentLimitAtomic)) reasons.push("Exceeds your per-payment limit");
    if (exceeds(toBigInt(i.committedThisRunAtomic) + amount, i.userPerRunLimitAtomic)) reasons.push("Exceeds your per-investigation limit");
    if (exceeds(toBigInt(i.committed24hAtomic) + amount, i.userDailyLimitAtomic)) reasons.push("Exceeds your 24h limit");
  }

  return { allowed: reasons.length === 0, reasons };
}
