/**
 * Exact token amount arithmetic. Raw on-chain amounts are integers in atomic
 * units; they are carried as bigint / decimal strings and converted to display
 * form with integer math only — never through floating point.
 */

export type AtomicLike = bigint | string | number;

export function toBigInt(value: AtomicLike): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new RangeError("Unsafe integer amount; pass a string or bigint");
    return BigInt(value);
  }
  const v = value.trim();
  if (!/^-?\d+$/.test(v)) throw new RangeError(`Not an integer amount: ${value}`);
  return BigInt(v);
}

/** 1500000000n, 9 → "1.5"; -1n, 9 → "-0.000000001". */
export function formatAtomic(value: AtomicLike, decimals: number, opts: { maxFractionDigits?: number; group?: boolean } = {}): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 38) throw new RangeError("Invalid decimals");
  const v = toBigInt(value);
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = decimals > 0 ? (abs % base).toString().padStart(decimals, "0") : "";
  if (opts.maxFractionDigits !== undefined && frac.length > opts.maxFractionDigits) {
    frac = frac.slice(0, opts.maxFractionDigits);
  }
  frac = frac.replace(/0+$/, "");
  const wholeStr = opts.group ? whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole.toString();
  return `${negative ? "-" : ""}${wholeStr}${frac ? `.${frac}` : ""}`;
}

/**
 * "1.5", 9 → 1500000000n. Returns null when the string is not a plain decimal
 * or has more fractional digits than the coin supports (that would silently
 * lose precision).
 */
export function parseDisplayAmount(value: string, decimals: number): bigint | null {
  const v = value.trim().replace(/,/g, "");
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(v);
  if (!m) return null;
  const [, sign, whole, fracRaw = ""] = m;
  if (fracRaw.length > decimals) {
    // Allow trailing zeros beyond precision ("1.50000000000" for 9 decimals).
    if (!/^0*$/.test(fracRaw.slice(decimals))) return null;
  }
  const frac = fracRaw.slice(0, decimals).padEnd(decimals, "0");
  const out = BigInt(whole!) * 10n ** BigInt(decimals) + (decimals > 0 ? BigInt(frac || "0") : 0n);
  return sign ? -out : out;
}

export function absBig(v: bigint): bigint {
  return v < 0n ? -v : v;
}

/**
 * If `claimed` and `observed` differ by an exact power of ten (both non-zero),
 * return the exponent (positive: claimed is larger). This is the signature of a
 * decimal-scaling mistake, e.g. reporting atomic units as whole coins.
 */
export function powerOfTenMismatch(claimed: bigint, observed: bigint): number | null {
  const a = absBig(claimed);
  const b = absBig(observed);
  if (a === 0n || b === 0n || a === b) return null;
  const [big, small, sign] = a > b ? [a, b, 1] : [b, a, -1];
  if (big % small !== 0n) return null;
  let ratio = big / small;
  let exp = 0;
  while (ratio % 10n === 0n) {
    ratio /= 10n;
    exp++;
  }
  return ratio === 1n && exp > 0 ? exp * sign : null;
}

export function sumAtomic(values: AtomicLike[]): bigint {
  return values.reduce<bigint>((acc, v) => acc + toBigInt(v), 0n);
}

export function compareAtomic(a: AtomicLike, b: AtomicLike): -1 | 0 | 1 {
  const x = toBigInt(a);
  const y = toBigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
