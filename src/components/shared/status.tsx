import { AlertTriangle, Ban, CheckCircle2, CircleDashed, CircleHelp, Clock, Loader2, ShieldCheck, ShieldQuestion, ShieldX, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "outline";

const RUN: Record<string, { tone: Tone; label: string; live?: boolean }> = {
  CREATED: { tone: "neutral", label: "Queued", live: true },
  PLANNING: { tone: "info", label: "Planning", live: true },
  RECALLING_MEMORY: { tone: "info", label: "Recalling memory", live: true },
  SELECTING_TOOLS: { tone: "info", label: "Selecting tools", live: true },
  EXECUTING: { tone: "info", label: "Investigating", live: true },
  AWAITING_APPROVAL: { tone: "warning", label: "Awaiting approval" },
  VERIFYING: { tone: "info", label: "Verifying", live: true },
  REFLECTING: { tone: "info", label: "Reflecting", live: true },
  SAVING_MEMORY: { tone: "info", label: "Saving memory", live: true },
  COMPLETED: { tone: "success", label: "Completed" },
  PARTIALLY_COMPLETED: { tone: "warning", label: "Partially completed" },
  FAILED: { tone: "danger", label: "Failed" },
  CANCELLED: { tone: "neutral", label: "Cancelled" },
};

export function RunStatusBadge({ status }: { status: string }) {
  const s = RUN[status] ?? { tone: "neutral" as Tone, label: status };
  const Icon = s.live
    ? Loader2
    : status === "COMPLETED"
      ? CheckCircle2
      : status === "FAILED"
        ? XCircle
        : status === "CANCELLED"
          ? Ban
          : status === "AWAITING_APPROVAL"
            ? Clock
            : AlertTriangle;
  return (
    <Badge tone={s.tone}>
      <Icon className={s.live ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden />
      {s.label}
    </Badge>
  );
}

const VER: Record<string, { tone: Tone; label: string; icon: typeof ShieldCheck }> = {
  VERIFIED: { tone: "success", label: "Verified", icon: ShieldCheck },
  PARTIALLY_VERIFIED: { tone: "warning", label: "Partially verified", icon: ShieldCheck },
  UNVERIFIED: { tone: "neutral", label: "Unverified", icon: ShieldQuestion },
  CONTRADICTED: { tone: "danger", label: "Contradicted", icon: ShieldX },
  UNAVAILABLE: { tone: "neutral", label: "Unavailable", icon: CircleHelp },
};

export function VerificationBadge({ status }: { status: string }) {
  const v = VER[status] ?? VER.UNVERIFIED!;
  const Icon = v.icon;
  return (
    <Badge tone={v.tone}>
      <Icon aria-hidden />
      {v.label}
    </Badge>
  );
}

const STORAGE: Record<string, { tone: Tone; label: string }> = {
  queued: { tone: "neutral", label: "Queued" },
  submitting: { tone: "info", label: "Submitting" },
  pending: { tone: "warning", label: "Pending on Walrus" },
  stored: { tone: "success", label: "Stored on Walrus" },
  failed: { tone: "danger", label: "Storage failed" },
};

export function StorageBadge({ status }: { status: string }) {
  const s = STORAGE[status] ?? { tone: "neutral" as Tone, label: status };
  const Icon = status === "stored" ? CheckCircle2 : status === "failed" ? XCircle : status === "pending" || status === "submitting" ? Loader2 : CircleDashed;
  return (
    <Badge tone={s.tone}>
      <Icon className={status === "pending" || status === "submitting" ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden />
      {s.label}
    </Badge>
  );
}

const PAY: Record<string, { tone: Tone; label: string }> = {
  awaiting_approval: { tone: "warning", label: "Awaiting approval" },
  approved: { tone: "info", label: "Approved — settling" },
  settling: { tone: "info", label: "Settling" },
  settled: { tone: "success", label: "Settled · verified" },
  rejected: { tone: "neutral", label: "Declined" },
  expired: { tone: "neutral", label: "Expired" },
  failed: { tone: "danger", label: "Failed" },
  unknown: { tone: "warning", label: "Reconciling" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const p = PAY[status] ?? { tone: "neutral" as Tone, label: status };
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

export function HealthBadge({ status }: { status: string }) {
  const tone: Tone = status === "ok" ? "success" : status === "degraded" ? "warning" : status === "down" ? "danger" : "neutral";
  const label = status === "ok" ? "Operational" : status === "degraded" ? "Degraded" : status === "down" ? "Down" : "Not configured";
  return <Badge tone={tone}>{label}</Badge>;
}
