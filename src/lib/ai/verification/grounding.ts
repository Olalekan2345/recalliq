/**
 * Answer grounding — deterministic, independent of the model.
 *
 * Every transaction digest, full address, date and coin amount written in the
 * answer text must appear in something this investigation actually fetched
 * (tool output, the user's request, payment settlements). Claims are verified
 * against the chain separately; this catches values that only live in the
 * prose, such as a misremembered date.
 *
 * Accepted forms: exact values, roundings/truncations of a fetched display
 * amount, and SUI display amounts converted from fetched MIST integers with the
 * protocol constant SUI_DECIMALS. Everything else is reported as ungrounded.
 */
import { SUI_DECIMALS } from "@mysten/sui/utils";
import { formatAtomic } from "@/lib/blockchain/sui/amounts";
import { isValidDigest, normalizeAddress } from "@/lib/blockchain/sui/validation";

export interface UngroundedValue {
  kind: "digest" | "address" | "date" | "amount";
  value: string;
}

const B58 = "1-9A-HJ-NP-Za-km-z";
const DIGEST_RE = new RegExp(`(?<![${B58}])[${B58}]{43,44}(?![${B58}])`, "g");
const ADDRESS_RE = /0x[0-9a-fA-F]{40,64}(?![0-9a-fA-F])/g;
const ANY_HEX_RE = /0x[0-9a-fA-F]{1,64}(?![0-9a-fA-F])/g;
const NUMBER_RE = /(?<![\w.])-?\d+(?:\.\d+)?(?![\w.]*\d)/g;
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/g;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
// Case-sensitive: "Oct 19" is a date, "may 5" is usually not.
const MONTH_FIRST_RE = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "g");
const DAY_FIRST_RE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\.?,?(?:\\s+(\\d{4}))?\\b`, "g");
const ATOMIC_UNITS = new Set(["MIST", "atomic", "atomic unit", "atomic units"]);
const MAX_ROUNDING_DIGITS = 9;

/** "1,500.50" → "1500.5"; sign dropped (direction is checked by claim verification). */
export function canonicalNumber(raw: string): string | null {
  const s = raw.replace(/[,+]/g, "").replace(/^-/, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  const i = int!.replace(/^0+(?=\d)/, "");
  const f = frac.replace(/0+$/, "");
  return f ? `${i}.${f}` : i;
}

/** The value itself plus every half-up rounding and truncation to fewer decimals. */
function withRoundings(canon: string, into: Set<string>): void {
  into.add(canon);
  const [int, frac = ""] = canon.split(".");
  if (!frac) return;
  const scaled = BigInt(int! + frac);
  for (let d = Math.max(0, frac.length - MAX_ROUNDING_DIGITS); d < frac.length; d++) {
    const divisor = 10n ** BigInt(frac.length - d);
    const truncated = scaled / divisor;
    const rounded = (scaled % divisor) * 2n >= divisor ? truncated + 1n : truncated;
    for (const q of [truncated, rounded]) {
      const c = canonicalNumber(formatAtomic(q, d));
      if (c) into.add(c);
    }
  }
}

export class GroundingCorpus {
  readonly digests = new Set<string>();
  readonly addresses = new Set<string>();
  readonly dates = new Set<string>();
  readonly minutes = new Set<string>();
  readonly monthDays = new Set<string>();
  readonly integers = new Set<string>();
  readonly amounts = new Set<string>();
  readonly suiAmounts = new Set<string>();
  readonly symbols = new Set<string>(["SUI"]);

  constructor(texts: string[], now: Date) {
    const text = texts.join("\n");
    for (const m of text.matchAll(DIGEST_RE)) this.digests.add(m[0]);
    for (const m of text.matchAll(ANY_HEX_RE)) {
      const a = normalizeAddress(m[0]);
      if (a) this.addresses.add(a);
    }
    for (const m of text.matchAll(ISO_RE)) {
      this.addDate(m[1]!, m[2]!, m[3]!);
      if (m[4]) this.minutes.add(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`);
    }
    const today = now.toISOString();
    this.addDate(today.slice(0, 4), today.slice(5, 7), today.slice(8, 10));
    for (const m of text.matchAll(NUMBER_RE)) {
      const c = canonicalNumber(m[0]);
      if (!c) continue;
      withRoundings(c, this.amounts);
      if (!c.includes(".")) {
        this.integers.add(c);
        withRoundings(canonicalNumber(formatAtomic(BigInt(c), SUI_DECIMALS))!, this.suiAmounts);
      }
    }
    for (const m of text.matchAll(/"symbol"\s*:\s*"([A-Za-z][A-Za-z0-9]{0,11})"/g)) this.symbols.add(m[1]!);
    for (const m of text.matchAll(/::[A-Za-z0-9_]+::([A-Z][A-Z0-9_]{0,15})\b/g)) this.symbols.add(m[1]!);
  }

  private addDate(y: string, mo: string, d: string) {
    this.dates.add(`${y}-${mo}-${d}`);
    this.monthDays.add(`${mo}-${d}`);
  }

  amountGrounded(canon: string, unit: string): boolean {
    if (ATOMIC_UNITS.has(unit)) return this.integers.has(canon);
    return this.amounts.has(canon) || (unit === "SUI" && this.suiAmounts.has(canon));
  }
}

const pad = (n: string | number) => String(n).padStart(2, "0");
const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Values in `answer` that nothing fetched during the run supports. Pure. */
export function findUngroundedValues(answer: string, corpus: GroundingCorpus): UngroundedValue[] {
  const out: UngroundedValue[] = [];
  const seen = new Set<string>();
  const add = (kind: UngroundedValue["kind"], value: string) => {
    if (seen.has(`${kind}|${value}`)) return;
    seen.add(`${kind}|${value}`);
    out.push({ kind, value });
  };
  const text = answer.replace(/[*_`~]/g, "");

  for (const m of text.matchAll(DIGEST_RE)) if (isValidDigest(m[0]) && !corpus.digests.has(m[0])) add("digest", m[0]);
  for (const m of text.matchAll(ADDRESS_RE)) {
    const a = normalizeAddress(m[0]);
    if (a && !corpus.addresses.has(a)) add("address", m[0]);
  }

  for (const m of text.matchAll(ISO_RE)) {
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    const grounded = m[4] ? corpus.minutes.has(`${date}T${m[4]}:${m[5]}`) : corpus.dates.has(date);
    if (!grounded) add("date", m[0]);
  }
  const checkNamed = (raw: string, month: string, day: string, year: string | undefined) => {
    const md = `${pad(monthIndex(month))}-${pad(day)}`;
    if (year ? !corpus.dates.has(`${year}-${md}`) : !corpus.monthDays.has(md)) add("date", raw.trim());
  };
  for (const m of text.matchAll(MONTH_FIRST_RE)) checkNamed(m[0], m[1]!, m[2]!, m[3]);
  for (const m of text.matchAll(DAY_FIRST_RE)) checkNamed(m[0], m[2]!, m[1]!, m[3]);

  const units = [...corpus.symbols, ...ATOMIC_UNITS].sort((a, b) => b.length - a.length).map(escape);
  const amountRe = new RegExp(`(?<![\\w.:])([-+]?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|[-+]?\\d+(?:\\.\\d+)?)\\s*(${units.join("|")})(?![\\w])`, "g");
  for (const m of text.matchAll(amountRe)) {
    const canon = canonicalNumber(m[1]!);
    if (canon && !corpus.amountGrounded(canon, m[2]!)) add("amount", `${m[1]} ${m[2]}`);
  }
  return out;
}

export function describeUngrounded(values: UngroundedValue[], max = 8): string {
  const shown = values.slice(0, max).map((v) => `${v.kind} ${v.value}`);
  return shown.join(", ") + (values.length > max ? ` and ${values.length - max} more` : "");
}
