/**
 * Validation and extraction of Sui identifiers from user input. Pure functions,
 * safe on both client and server.
 */
import { fromBase58, isValidSuiAddress, isValidSuiNSName, normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";

export const SUI_COIN_TYPE = normalizeStructTag("0x2::sui::SUI");

/** A full 32-byte hex address / object id (0x + 64 hex). */
const FULL_HEX = /\b0x[0-9a-fA-F]{64}\b/g;
/** Base58 transaction digests are 32 bytes → 43 or 44 characters. */
const DIGEST_CANDIDATE = /\b[1-9A-HJ-NP-Za-km-z]{43,44}\b/g;
const SUINS = /(?:^|[\s,(])(@?[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9][a-z0-9-]{0,62})*\.sui|@[a-z0-9][a-z0-9-]{0,62})(?=$|[\s,.)!?])/gi;

export function isValidDigest(value: string): boolean {
  try {
    return fromBase58(value).length === 32;
  } catch {
    return false;
  }
}

export function normalizeAddress(value: string): string | null {
  const v = value.trim();
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(v)) return null;
  const n = normalizeSuiAddress(v);
  return isValidSuiAddress(n) ? n : null;
}

export function normalizeCoinType(value: string): string | null {
  try {
    return normalizeStructTag(value.trim());
  } catch {
    return null;
  }
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  return Boolean(na && nb && na === nb);
}

export function sameCoinType(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizeCoinType(a);
  const nb = normalizeCoinType(b);
  return Boolean(na && nb && na === nb);
}

export interface ExtractedIdentifiers {
  /** 0x-hex identifiers. On Sui an object id and an address share a format, so these are ambiguous until resolved. */
  hexIds: string[];
  digests: string[];
  names: string[];
}

/** Pull candidate identifiers out of free text. Every value is validated. */
export function extractIdentifiers(text: string): ExtractedIdentifiers {
  const hexIds = new Set<string>();
  for (const m of text.matchAll(FULL_HEX)) {
    const n = normalizeAddress(m[0]);
    if (n) hexIds.add(n);
  }
  const digests = new Set<string>();
  for (const m of text.matchAll(DIGEST_CANDIDATE)) {
    if (isValidDigest(m[0])) digests.add(m[0]);
  }
  const names = new Set<string>();
  for (const m of text.matchAll(SUINS)) {
    const raw = (m[1] ?? "").toLowerCase();
    if (raw && isValidSuiNSName(raw)) names.add(raw);
  }
  return { hexIds: [...hexIds], digests: [...digests], names: [...names] };
}

export function shortId(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
