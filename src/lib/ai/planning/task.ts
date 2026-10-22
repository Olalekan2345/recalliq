/**
 * Deterministic task understanding: identifier extraction/validation and task
 * categorisation. Reproducible (same input → same category), which keeps tool
 * selection and evaluation comparable across runs. The LLM still interprets
 * the request freely; this only frames it.
 */
import { extractIdentifiers, isValidDigest, normalizeAddress } from "@/lib/blockchain/sui/validation";
import type { RunInputs } from "@/lib/db/schema";

export const TASK_CATEGORIES = [
  "transaction_verification",
  "failed_transaction",
  "transaction_explanation",
  "transaction_comparison",
  "wallet_activity",
  "balance_changes",
  "token_transfer",
  "contract_interaction",
  "anomaly_investigation",
  "payment_settlement",
  "general",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export interface ParsedTask {
  inputs: RunInputs;
  category: TaskCategory;
  signals: string[];
}

const has = (text: string, re: RegExp) => re.test(text);

export function parseTask(task: string, explicit: { address?: string | null; digest?: string | null } = {}): ParsedTask {
  const ids = extractIdentifiers(task);
  const addresses = new Set(ids.hexIds);
  const digests = new Set(ids.digests);
  if (explicit.address) {
    const a = normalizeAddress(explicit.address);
    if (a) addresses.add(a);
  }
  if (explicit.digest && isValidDigest(explicit.digest.trim())) digests.add(explicit.digest.trim());

  const t = task.toLowerCase();
  const signals: string[] = [];
  let category: TaskCategory = "general";
  const nd = digests.size;
  const na = addresses.size + ids.names.length;

  if (nd >= 2 && has(t, /\b(compare|comparison|differ|difference|versus|vs\.?)\b/)) category = "transaction_comparison";
  else if (nd >= 1 && has(t, /\b(x402|payment|paid|settle|settlement|invoice)\b/)) category = "payment_settlement";
  else if (nd >= 1 && has(t, /\b(fail|failed|failure|error|abort|revert|why did)\b/)) category = "failed_transaction";
  else if (nd >= 1 && has(t, /\b(verify|confirm|succeed|success|successful|went through|go through|status|finali[sz]ed|did it)\b/))
    category = "transaction_verification";
  else if (has(t, /\b(unusual|anomal|suspicious|odd|weird|pattern|spike|irregular)\b/)) category = "anomaly_investigation";
  else if (has(t, /\b(contract|package|module|move call|function call|interact|dapp|protocol)\b/)) category = "contract_interaction";
  else if (has(t, /\b(transfer|sent|send|received|receive|token amount|how much|amount)\b/) && nd >= 1) category = "token_transfer";
  else if (has(t, /\b(balance|holdings|holds|portfolio|net change|gained|lost)\b/)) category = nd >= 1 ? "balance_changes" : "wallet_activity";
  else if (na >= 1 && has(t, /\b(activity|recent|history|investigate|explain|what (has|did)|doing|summary|summari[sz]e|overview)\b/))
    category = "wallet_activity";
  else if (nd >= 1) category = "transaction_explanation";
  else if (na >= 1) category = "wallet_activity";

  if (nd) signals.push(`${nd} transaction digest(s)`);
  if (addresses.size) signals.push(`${addresses.size} address/object id(s)`);
  if (ids.names.length) signals.push(`${ids.names.length} SuiNS name(s)`);

  return {
    inputs: {
      addresses: [...addresses].slice(0, 10),
      digests: [...digests].slice(0, 10),
      names: ids.names.slice(0, 5),
      objectIds: [],
      window: null,
    },
    category,
    signals,
  };
}

/** Context-aware recall query: category + intent words, never raw identifiers alone. */
export function buildRecallQuery(task: string, category: TaskCategory): string {
  const stripped = task
    .replace(/0x[0-9a-fA-F]{6,}/g, "")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{43,44}\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return `Lessons for ${category.replace(/_/g, " ")} investigations on Sui: ${stripped}`;
}
