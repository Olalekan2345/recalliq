import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { getEvaluation } from "@/server/services/learning";
import { summarize } from "@/lib/ai/evaluation/harness";

export const metadata = { title: "Evaluation" };
export const dynamic = "force-dynamic";

const METRICS: Array<{
  key: "completed" | "verifiedClaims" | "contradictedClaims" | "unverifiedClaims" | "toolCalls" | "toolFailures" | "memoriesApplied" | "repeatedErrors";
  label: string;
  better: "higher" | "lower" | "none";
}> = [
  { key: "completed", label: "Completed runs", better: "higher" },
  { key: "verifiedClaims", label: "Verified claims", better: "higher" },
  { key: "contradictedClaims", label: "Contradicted claims", better: "lower" },
  { key: "unverifiedClaims", label: "Unverified claims", better: "none" },
  { key: "repeatedErrors", label: "Repeated errors", better: "lower" },
  { key: "toolCalls", label: "Tool calls", better: "none" },
  { key: "toolFailures", label: "Tool failures", better: "lower" },
  { key: "memoriesApplied", label: "Memories applied", better: "none" },
];

function Bars({ a, b }: { a: number; b: number }) {
  const max = Math.max(a, b, 1);
  return (
    <div className="space-y-1" aria-hidden>
      <div className="h-1.5 rounded-full bg-muted-foreground/40" style={{ width: `${(a / max) * 100}%` }} />
      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(b / max) * 100}%` }} />
    </div>
  );
}

export default async function EvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ev = await getEvaluation(user.id, id);
  if (!ev) notFound();
  const summary = ev.summary ?? summarize(ev.results);
  const base = summary.modes.baseline;
  const mem = summary.modes.memory;

  return (
    <div className="space-y-6">
      <Link
        href="/learning"
        className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden /> Learning Lab
      </Link>
      <PageHeader
        title={ev.name}
        description={`${ev.tasks.length} task(s) × 2 modes · ${ev.provider} ${ev.model} · created ${formatDateTime(ev.createdAt)}`}
        actions={<Badge tone={ev.status === "completed" ? "success" : "info"}>{ev.status}</Badge>}
      />
      {ev.faultInjection && (
        <Alert tone="warning" title="Controlled fault injection">
          {ev.faultInjection.label}. Applied identically to both modes; excluded from production statistics.
        </Alert>
      )}
      <Alert tone={summary.inconclusive ? "info" : "success"} title={summary.inconclusive ? "Inconclusive" : "Measured effect"}>
        {summary.conclusion}
      </Alert>

      {base && mem && (
        <Card>
          <CardHeader>
            <CardTitle>Baseline vs memory</CardTitle>
            <p className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden /> Baseline (n={base.runs})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" aria-hidden /> Memory (n={mem.runs})
              </span>
            </p>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-4 sm:grid-cols-2">
              {METRICS.map((m) => (
                <li key={m.key} className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{m.label}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {base[m.key]} → <span className="text-foreground">{mem[m.key]}</span>
                    </span>
                  </div>
                  <Bars a={base[m.key]} b={mem[m.key]} />
                </li>
              ))}
              <li className="space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span>Median duration</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {formatDuration(base.medianDurationMs)} → <span className="text-foreground">{formatDuration(mem.medianDurationMs)}</span>
                  </span>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Per-task results</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Mode</TH>
                <TH>Status</TH>
                <TH>Verified</TH>
                <TH>Contradicted</TH>
                <TH>Repeated errors</TH>
                <TH>Memories applied</TH>
                <TH className="hidden md:table-cell">Decision changes</TH>
                <TH className="text-right">Run</TH>
              </TR>
            </THead>
            <TBody>
              {ev.results.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono tabular-nums" title={ev.tasks[r.taskIndex]?.task}>
                    {r.taskIndex + 1}
                  </TD>
                  <TD>
                    <Badge tone={r.mode === "memory" ? "primary" : "neutral"}>{r.mode}</Badge>
                  </TD>
                  <TD className="text-xs">{r.status === "done" ? (r.completed ? "completed" : "partial") : r.status}</TD>
                  <TD className="font-mono tabular-nums">{r.verifiedClaims ?? "—"}</TD>
                  <TD className="font-mono tabular-nums">{r.contradictedClaims ?? "—"}</TD>
                  <TD className="font-mono tabular-nums">{r.repeatedErrors ?? "—"}</TD>
                  <TD className="font-mono tabular-nums">{r.memoriesApplied ?? "—"}</TD>
                  <TD className="hidden max-w-xs truncate text-xs text-muted-foreground md:table-cell">{r.decisionsChanged?.join("; ") || "—"}</TD>
                  <TD className="text-right">
                    {r.agentRunId && (
                      <Link href={`/workspace/run/${r.agentRunId}`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                        Open
                      </Link>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {ev.tasks.map((t, i) => (
              <li key={i}>{t.task}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
