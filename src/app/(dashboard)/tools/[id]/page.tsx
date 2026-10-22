import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wrench } from "lucide-react";
import { EmptyState, PageHeader, Stat } from "@/components/shared/layout-bits";
import { StorageBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { formatDuration, relativeTime, titleCase } from "@/lib/utils";
import { listToolsWithStats, toolLessons, toolRecentObservations } from "@/server/services/tools";

export const metadata = { title: "Tool" };
export const dynamic = "force-dynamic";

export default async function ToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const tools = await listToolsWithStats(user.id);
  const tool = tools.find((t) => t.id === id);
  if (!tool) notFound();
  const [obs, lessons] = await Promise.all([toolRecentObservations(id), toolLessons(user.id, id)]);
  const s = tool.stats;
  return (
    <div className="space-y-6">
      <Link
        href="/tools"
        className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden /> Tool Intelligence
      </Link>
      <PageHeader title={tool.name} description={tool.summary} eyebrow={tool.provider} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Observations" value={s.sampleSize} hint="production runs, 90 days" />
        <Stat
          label="Succeeded"
          value={s.successCount}
          hint={s.sufficient ? `lower bound ${Math.round((s.successRateLowerBound ?? 0) * 100)}%` : "insufficient data"}
        />
        <Stat
          label="Cited by verified claims"
          value={s.usefulCount}
          hint={s.sufficient ? `lower bound ${Math.round((s.usefulRateLowerBound ?? 0) * 100)}%` : "insufficient data"}
        />
        <Stat label="Latency p50 / p95" value={`${formatDuration(s.p50LatencyMs)} / ${formatDuration(s.p95LatencyMs)}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By task category</CardTitle>
        </CardHeader>
        <CardContent>
          {tool.byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No observations yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Category</TH>
                  <TH>n</TH>
                  <TH>Succeeded</TH>
                  <TH>Useful</TH>
                  <TH>Contradicted</TH>
                  <TH>Estimate</TH>
                </TR>
              </THead>
              <TBody>
                {tool.byCategory.map((c) => (
                  <TR key={c.taskCategory ?? "-"}>
                    <TD>{c.taskCategory ? titleCase(c.taskCategory) : "—"}</TD>
                    <TD className="font-mono tabular-nums">{c.sampleSize}</TD>
                    <TD className="font-mono tabular-nums">{c.successCount}</TD>
                    <TD className="font-mono tabular-nums">{c.usefulCount}</TD>
                    <TD className="font-mono tabular-nums">{c.contradictedCount}</TD>
                    <TD className="text-xs text-muted-foreground">
                      {c.sufficient ? `success ≥ ${Math.round((c.successRateLowerBound ?? 0) * 100)}%` : "insufficient data"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent executions</CardTitle>
          </CardHeader>
          <CardContent>
            {obs.length === 0 ? (
              <EmptyState icon={Wrench} title="No executions recorded" className="py-8" />
            ) : (
              <ul className="divide-y text-sm">
                {obs.slice(0, 20).map((o, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2">
                    <span className="truncate">{o.taskCategory ? titleCase(o.taskCategory) : "—"}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone={o.outcome === "useful" ? "success" : o.outcome === "failed" ? "danger" : "neutral"}>{o.outcome.replace("_", " ")}</Badge>
                      <span className="w-16 text-right font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(o.latencyMs)}</span>
                      <span className="w-20 text-right text-xs text-muted-foreground">{relativeTime(o.recordedAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lessons about this tool</CardTitle>
          </CardHeader>
          <CardContent>
            {lessons.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lessons recorded for this tool.</p>
            ) : (
              <ul className="space-y-2">
                {lessons.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/memory/${l.id}`}
                      className="block rounded-md border p-3 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <p>{l.summary}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <StorageBadge status={l.storageStatus} />
                        {l.scope === "platform" && <Badge tone="info">Platform</Badge>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
