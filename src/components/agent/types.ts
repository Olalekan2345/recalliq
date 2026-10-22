import type { getRunDetail } from "@/server/services/investigations";
import type { Jsonify } from "@/types/json";

export type RunDetail = Jsonify<NonNullable<Awaited<ReturnType<typeof getRunDetail>>>>;
export type RunStep = RunDetail["steps"][number];
export type RunPayment = RunDetail["payments"][number];

export const TERMINAL = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"]);
