/**
 * Redaction of secrets before anything is logged, persisted as an error
 * message, or written to Walrus Memory.
 */

const PATTERNS: Array<[RegExp, string]> = [
  // Sui bech32 private keys
  [/suiprivkey1[0-9a-z]{20,}/gi, "[redacted-sui-private-key]"],
  // Bearer / API key headers
  [/(authorization|x-api-key|api[-_]?key|apikey)(["'\s:=]+)[^\s"',}]+/gi, "$1$2[redacted]"],
  // Anthropic / OpenAI / Groq / Google key shapes
  [/sk-ant-[a-z0-9_-]{10,}/gi, "[redacted-key]"],
  [/sk-[a-z0-9_-]{20,}/gi, "[redacted-key]"],
  [/gsk_[a-z0-9]{20,}/gi, "[redacted-key]"],
  [/AIza[0-9a-z_-]{30,}/gi, "[redacted-key]"],
  // Postgres URLs with credentials
  [/(postgres(?:ql)?:\/\/)[^:@/\s]+:[^@/\s]+@/gi, "$1[redacted]@"],
  // Long hex strings that could be raw private keys (64 hex chars not prefixed by 0x).
  // Sui addresses / digests are 0x-prefixed or base58 and are kept.
  [/(?<![0-9a-fx])[0-9a-f]{64}(?![0-9a-f])/gi, "[redacted-hex]"],
];

export function redact(input: string): string {
  let out = input;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

/** Twelve-plus word sequences that look like a BIP-39 mnemonic. */
const MNEMONIC = /\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/i;

/**
 * True when text contains something that must never be stored in memory or
 * sent to third parties: private keys, seed phrases, credentials.
 */
export function containsSecret(text: string): boolean {
  if (/suiprivkey1[0-9a-z]{20,}/i.test(text)) return true;
  if (/(?<![0-9a-fx])[0-9a-f]{64}(?![0-9a-f])/i.test(text)) return true;
  if (/sk-(ant-)?[a-z0-9_-]{20,}|gsk_[a-z0-9]{20,}|AIza[0-9a-z_-]{30,}/i.test(text)) return true;
  if (/(seed|mnemonic|recovery)\s*(phrase|words)?\s*[:=]/i.test(text)) return true;
  if (MNEMONIC.test(text) && /\b(seed|mnemonic|recovery|phrase|wallet words)\b/i.test(text)) return true;
  return false;
}

/** Error → short, secret-free message suitable for persistence and UI. */
export function safeErrorMessage(err: unknown, max = 400): string {
  const status = (err as { status?: number; code?: string | number } | null)?.status;
  const code = (err as { code?: string | number } | null)?.code;
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
  const msg = redact(String(raw ?? "Unknown error")).slice(0, max);
  const prefix = status ? `${status}: ` : code && typeof code === "string" ? `${code}: ` : "";
  return `${prefix}${msg}`;
}
