/**
 * Machine-checkable claim assertions. The agent attaches one to every factual
 * claim it can; the verification engine re-checks it against fresh chain data.
 */
import { z } from "zod";

const digest = z.string().min(43).max(44);
const address = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/);
const signedAtomic = z.string().regex(/^-?\d+$/, "signed integer in atomic units");
const signedDecimal = z.string().regex(/^-?\d+(\.\d+)?$/, "signed decimal amount in whole coin units");

export const assertionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tx_status"), digest, expected: z.enum(["success", "failure"]) }),
  z.object({ type: z.literal("tx_sender"), digest, address }),
  z.object({ type: z.literal("tx_checkpoint"), digest, checkpoint: z.string().regex(/^\d+$/) }),
  /** UTC, checked to the precision given: "2026-10-19", "2026-10-19T22:02" or "2026-10-19T22:02:22Z". */
  z.object({
    type: z.literal("tx_timestamp"),
    digest,
    timestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/, "UTC ISO date or date-time"),
  }),
  z.object({ type: z.literal("balance_change"), digest, address, coinType: z.string().min(3), amountAtomic: signedAtomic }),
  z.object({
    type: z.literal("balance_change_display"),
    digest,
    address,
    coinType: z.string().min(3),
    /** Whole-coin units as the user would read them, e.g. "-1.5". */
    amount: signedDecimal,
  }),
  z.object({ type: z.literal("move_call"), digest, package: address, module: z.string().min(1), function: z.string().min(1) }),
  z.object({ type: z.literal("event_emitted"), digest, eventTypeContains: z.string().min(3) }),
  z.object({ type: z.literal("gas_paid"), digest, netGasAtomic: signedAtomic }),
  z.object({ type: z.literal("current_balance"), address, coinType: z.string().min(3), amountAtomic: z.string().regex(/^\d+$/) }),
  z.object({ type: z.literal("object_owner"), objectId: address, owner: address }),
  z.object({ type: z.literal("tx_count_at_least"), address, minimum: z.number().int().min(1).max(50) }),
  /** "The current checkpoint is N": N exists and is within LATEST_CHECKPOINT_MAX_AGE_MS of the network head. */
  z.object({ type: z.literal("latest_checkpoint"), checkpoint: z.string().regex(/^\d{1,20}$/) }),
]);

/** How far behind the network head a reported "current" checkpoint may be when re-checked. */
export const LATEST_CHECKPOINT_MAX_AGE_MS = 15 * 60_000;

export type Assertion = z.infer<typeof assertionSchema>;

export const claimKindSchema = z.enum(["observation", "verified_fact", "interpretation", "hypothesis", "unknown"]);

export const claimSchema = z.object({
  statement: z.string().min(3).max(600),
  kind: claimKindSchema,
  evidenceRefs: z
    .array(z.string().regex(/^E\d{1,4}$/))
    .max(20)
    .default([]),
  assertion: assertionSchema.optional(),
});

export type ClaimInput = z.infer<typeof claimSchema>;
