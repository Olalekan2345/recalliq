/** The shape a value takes after JSON serialisation (Date/bigint → string). */
export type Jsonify<T> = T extends Date
  ? string
  : T extends bigint
    ? string
    : T extends (infer U)[]
      ? Jsonify<U>[]
      : T extends object
        ? { [K in keyof T]: Jsonify<T[K]> }
        : T;

export function toJson<T>(value: T): Jsonify<T> {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as Jsonify<T>;
}
