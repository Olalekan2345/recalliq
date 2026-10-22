/**
 * Lesson text format stored on Walrus. Plain text (MemWal embeds it for
 * semantic recall) with a strict, versioned header so recalled memories can be
 * linked back to provenance. Recalled text is always treated as untrusted
 * data: only allowlisted header values are ever interpreted.
 */
import type { MemoryDirective, MemoryType } from "@/lib/db/schema";

export const MEMORY_TYPES: readonly MemoryType[] = [
  "failure",
  "success",
  "tool_reliability",
  "cost_efficiency",
  "strategy",
  "user_preference",
  "correction",
] as const;

export const MEMORY_DIRECTIVES: readonly MemoryDirective[] = [
  "verify_coin_decimals",
  "check_status_before_amounts",
  "confirm_balance_change_direction",
  "cross_check_sender",
  "cite_evidence_for_every_fact",
  "prefer_tool_for_category",
  "avoid_tool_for_category",
  "paid_tool_useful_for_category",
  "paid_tool_unnecessary_for_category",
  "tool_timeout_risk",
] as const;

export interface LessonHeader {
  version: 1;
  memoryId: string;
  type: MemoryType;
  category: string | null;
  tool: string | null;
  directive: MemoryDirective | null;
  verification: "verified" | "unverified" | "user_reported";
  recorded: string;
}

export interface ComposedLesson {
  header: LessonHeader;
  summary: string;
  lesson: string;
  evidence: string;
}

const MAGIC = "RECALLIQ-LESSON v1";

function clean(s: string, max: number): string {
  return s
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function composeMemoryText(input: ComposedLesson): string {
  const h = input.header;
  return [
    MAGIC,
    `id: ${h.memoryId}`,
    `type: ${h.type}`,
    `category: ${h.category ?? "-"}`,
    `tool: ${h.tool ?? "-"}`,
    `directive: ${h.directive ?? "-"}`,
    `verification: ${h.verification}`,
    `recorded: ${h.recorded}`,
    `summary: ${clean(input.summary, 200)}`,
    `lesson: ${clean(input.lesson, 800)}`,
    `evidence: ${clean(input.evidence, 600)}`,
  ].join("\n");
}

const ID_RE = /^[0-9a-f-]{36}$/;
const TOKEN_RE = /^[a-z0-9_:.-]{1,80}$/;

/** Strict parse. Returns null for anything that is not a well-formed RecallIQ lesson. */
export function parseMemoryText(text: string): ComposedLesson | null {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== MAGIC) return null;
  const fields: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const m = /^([a-z]+):\s?(.*)$/.exec(line);
    if (m) fields[m[1]!] = m[2]!.trim();
  }
  const type = fields.type as MemoryType;
  if (!MEMORY_TYPES.includes(type)) return null;
  if (!fields.id || !ID_RE.test(fields.id)) return null;
  const directiveRaw = fields.directive && fields.directive !== "-" ? fields.directive : null;
  const directive = directiveRaw && (MEMORY_DIRECTIVES as readonly string[]).includes(directiveRaw) ? (directiveRaw as MemoryDirective) : null;
  const category = fields.category && fields.category !== "-" && TOKEN_RE.test(fields.category) ? fields.category : null;
  const tool = fields.tool && fields.tool !== "-" && TOKEN_RE.test(fields.tool) ? fields.tool : null;
  const verification = (["verified", "unverified", "user_reported"] as const).find((v) => v === fields.verification) ?? "unverified";
  return {
    header: {
      version: 1,
      memoryId: fields.id,
      type,
      category,
      tool,
      directive,
      verification,
      recorded: fields.recorded ?? "",
    },
    summary: fields.summary ?? "",
    lesson: fields.lesson ?? "",
    evidence: fields.evidence ?? "",
  };
}
