import Link from "next/link";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { walrusBlobUrl } from "@/lib/blockchain/sui/explorer";

export interface TraceInput {
  memory: {
    id: string;
    walrusJobId: string | null;
    walrusBlobId: string | null;
    storageStatus: string;
    createdAt: string;
    storedAt: string | null;
    sourceRunId: string | null;
  };
  failure: { category: string; confirmedCause: string | null; createdAt: string; runId: string } | null;
  verification: { claimRef: string; claim: string; status: string; detail: string | null } | null;
  usages: Array<{
    usage: { id: string; disposition: string; distance: number | null; decisionChanged: string | null; influence: string | null; retrievedAt: string };
    run: { id: string; task: string; createdAt: string; isEvaluation: boolean };
    outcome?: Array<{ status: string; n: number }>;
  }>;
  laterVerification?: Array<{ runId: string; status: string; n: number }>;
}

interface Stage {
  title: string;
  done: boolean;
  body: React.ReactNode;
}

export function InfluenceTrace({ trace }: { trace: TraceInput }) {
  const m = trace.memory;
  const later = trace.usages.filter((u) => u.run.id !== m.sourceRunId);
  const applied = later.filter((u) => u.usage.disposition === "applied");
  const changed = applied.filter((u) => u.usage.decisionChanged);
  const outcomeFor = (runId: string) =>
    trace.laterVerification?.filter((v) => v.runId === runId) ?? trace.usages.find((u) => u.run.id === runId)?.outcome ?? [];

  const stages: Stage[] = [
    {
      title: "Previous failure",
      done: Boolean(trace.failure),
      body: trace.failure ? (
        <>
          <span className="font-medium">{trace.failure.category.replace(/_/g, " ")}</span>
          {trace.failure.confirmedCause && <span className="block text-muted-foreground">{trace.failure.confirmedCause}</span>}
          <Link href={`/workspace/run/${trace.failure.runId}`} className="text-primary underline-offset-4 hover:underline">
            Source investigation
          </Link>
        </>
      ) : m.sourceRunId ? (
        <Link href={`/workspace/run/${m.sourceRunId}`} className="text-primary underline-offset-4 hover:underline">
          Learned from a verified success — source investigation
        </Link>
      ) : (
        "Not derived from a recorded failure (user correction or platform lesson)."
      ),
    },
    {
      title: "Verified correction",
      done: trace.verification?.status === "CONTRADICTED",
      body: trace.verification ? (
        <>
          <span className="block">
            Claim {trace.verification.claimRef}: “{trace.verification.claim}”
          </span>
          <span className="block text-muted-foreground">
            {trace.verification.status}: {trace.verification.detail}
          </span>
        </>
      ) : (
        "No contradicted claim linked."
      ),
    },
    {
      title: "Walrus memory write",
      done: Boolean(m.walrusJobId),
      body: m.walrusJobId ? <span className="font-mono text-xs">job {m.walrusJobId}</span> : `Not submitted (${m.storageStatus})`,
    },
    {
      title: "Completed storage",
      done: m.storageStatus === "stored" && Boolean(m.walrusBlobId),
      body:
        m.storageStatus === "stored" && m.walrusBlobId ? (
          <>
            <a href={walrusBlobUrl(m.walrusBlobId)} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-primary underline">
              {m.walrusBlobId}
            </a>
            <span className="block text-muted-foreground">stored {formatDateTime(m.storedAt)}</span>
          </>
        ) : (
          `Storage status: ${m.storageStatus}`
        ),
    },
    {
      title: "Future session",
      done: later.length > 0,
      body: later.length ? `${later.length} later investigation(s) retrieved this memory.` : "Not retrieved by any later investigation yet.",
    },
    {
      title: "Memory retrieval",
      done: applied.length > 0,
      body: applied.length ? (
        <ul className="space-y-1">
          {applied.slice(0, 5).map((u) => (
            <li key={u.usage.id}>
              <Link href={`/workspace/run/${u.run.id}`} className="text-primary underline-offset-4 hover:underline">
                {u.run.task.slice(0, 70)}
              </Link>
              {u.run.isEvaluation && <span className="text-muted-foreground"> (evaluation)</span>}
              {u.usage.distance !== null && <span className="font-mono text-xs text-muted-foreground"> · d={Number(u.usage.distance).toFixed(3)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        "Not yet applied (retrieved-only or filtered memories are not counted)."
      ),
    },
    {
      title: "Changed decision",
      done: changed.length > 0,
      body: changed.length
        ? changed.slice(0, 3).map((u) => (
            <span key={u.usage.id} className="block">
              {u.usage.decisionChanged}
            </span>
          ))
        : "No recorded decision change yet.",
    },
    {
      title: "Verified new outcome",
      done: applied.some((u) => outcomeFor(u.run.id).some((o) => o.status === "VERIFIED")),
      body: applied.length
        ? applied.slice(0, 3).map((u) => {
            const o = outcomeFor(u.run.id);
            const count = (s: string) => o.filter((x) => x.status === s).reduce((a, b) => a + b.n, 0);
            return (
              <span key={u.usage.id} className="block">
                {count("VERIFIED")} verified · {count("CONTRADICTED")} contradicted · {count("UNVERIFIED")} unverified
              </span>
            );
          })
        : "No later outcome recorded yet.",
    },
  ];

  return (
    <ol className="space-y-0">
      {stages.map((s, i) => (
        <li key={s.title} className="relative flex gap-3 pb-5">
          {i < stages.length - 1 && <span className={cn("absolute left-[11px] top-6 h-full w-px", s.done ? "bg-primary/50" : "bg-border")} aria-hidden />}
          {s.done ? (
            <CheckCircle2 className="relative size-6 shrink-0 text-primary" aria-label="Recorded" />
          ) : (
            <CircleDashed className="relative size-6 shrink-0 text-muted-foreground" aria-label="Not yet" />
          )}
          <div className="min-w-0 pt-0.5 text-sm">
            <p className={cn("font-medium", !s.done && "text-muted-foreground")}>{s.title}</p>
            <div className="mt-0.5 space-y-0.5">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
