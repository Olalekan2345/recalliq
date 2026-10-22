import Link from "next/link";
import { GitBranch, Repeat2 } from "lucide-react";
import { EmptyState, PageHeader, Section } from "@/components/shared/layout-bits";
import { InfluenceTrace } from "@/components/learning/influence-trace";
import { NewEvaluation } from "@/components/learning/new-evaluation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { FREE_TOOLS } from "@/lib/ai/tools/chain-tools";
import { METHODOLOGY } from "@/lib/ai/evaluation/harness";
import { formatDateTime, relativeTime, titleCase } from "@/lib/utils";
import { influenceTraces, listEvaluations, recurrence } from "@/server/services/learning";
import { toJson } from "@/types/json";

export const metadata = { title: "Learning Lab" };
export const dynamic = "force-dynamic";

export default async function LearningLabPage() {
  const user = await requireUser();
  const [evaluations, traces, recur] = await Promise.all([listEvaluations(user.id), influenceTraces(user.id), recurrence(user.id)]);
  const allTraces = toJson(traces);
  const isApplied = (t: (typeof allTraces)[number]) => t.usages.some((u) => u.usage.disposition === "applied" && u.run.id !== t.memory.sourceRunId);
  const appliedTraces = allTraces.filter(isApplied);
  const pendingTraces = allTraces.filter((t) => !isApplied(t)).slice(0, 4);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Learning Lab"
        title="Does memory change outcomes?"
        description="Measured on real executions only. Sample sizes are always shown, and anything the data cannot support is labelled inconclusive."
        actions={<NewEvaluation freeTools={FREE_TOOLS.map((t) => ({ id: t.id, name: t.name }))} disabled={user.isGuest} />}
      />

      <Section title="Paired evaluations" description="Baseline (memory off) vs Walrus memory recall on the same tasks, model and limits.">
        {evaluations.length === 0 ? (
          <EmptyState mascot="hackathon" title="No evaluations yet">
            Create one with tasks that resemble mistakes the agent has made before — that is where stored lessons should make a difference.
          </EmptyState>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <THead>
                <TR>
                  <TH>Evaluation</TH>
                  <TH>Status</TH>
                  <TH className="hidden md:table-cell">Model</TH>
                  <TH>Pairs</TH>
                  <TH className="hidden lg:table-cell">Conclusion</TH>
                  <TH className="text-right">Created</TH>
                </TR>
              </THead>
              <TBody>
                {evaluations.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <Link
                        href={`/learning/evaluations/${e.id}`}
                        className="font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {e.name}
                      </Link>
                      {e.faultInjection && (
                        <Badge tone="warning" className="ml-2">
                          fault injection
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={e.status === "completed" ? "success" : e.status === "failed" ? "danger" : "info"}>{e.status}</Badge>
                    </TD>
                    <TD className="hidden font-mono text-xs md:table-cell">{e.model}</TD>
                    <TD className="font-mono tabular-nums">
                      {e.summary?.sampleSize ?? `${(e.results.filter((r) => r.status === "done").length / 2) | 0}/${e.tasks.length}`}
                    </TD>
                    <TD className="hidden max-w-sm lg:table-cell">
                      {e.summary ? (
                        <span className="text-xs">
                          <Badge tone={e.summary.inconclusive ? "neutral" : "success"} className="mr-1">
                            {e.summary.inconclusive ? "inconclusive" : "significant"}
                          </Badge>
                          {e.summary.conclusion.slice(0, 110)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">running…</span>
                      )}
                    </TD>
                    <TD className="text-right text-xs text-muted-foreground">{relativeTime(e.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Section>

      <Section
        title="Memory influence traces"
        description="Failure → verified correction → Walrus write → stored → later recall → changed decision → verified outcome. Every stage links to a real record."
      >
        {appliedTraces.length === 0 && pendingTraces.length === 0 ? (
          <EmptyState icon={GitBranch} title="No lessons yet">
            A trace starts when an investigation produces a verified mistake or a validated strategy.
          </EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {[...appliedTraces, ...pendingTraces].slice(0, 6).map((t) => (
              <Card key={t.memory.id}>
                <CardHeader>
                  <CardTitle className="text-sm">
                    <Link href={`/memory/${t.memory.id}`} className="hover:text-primary">
                      {t.memory.summary}
                    </Link>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">recorded {formatDateTime(t.memory.createdAt)}</p>
                </CardHeader>
                <CardContent>
                  <InfluenceTrace
                    trace={{
                      memory: t.memory,
                      failure: t.failure,
                      verification: null,
                      usages: t.usages,
                    }}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Error recurrence"
        description="Production failure categories before and after a lesson for them was stored. Observational — not a controlled comparison."
      >
        {recur.length === 0 ? (
          <EmptyState icon={Repeat2} title="No failures recorded">
            Failures appear here once the autopsy has evidence of a mistake.
          </EmptyState>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <THead>
                <TR>
                  <TH>Category</TH>
                  <TH>Total</TH>
                  <TH>Lesson stored</TH>
                  <TH>Before</TH>
                  <TH>After</TH>
                </TR>
              </THead>
              <TBody>
                {recur.map((r) => (
                  <TR key={r.category}>
                    <TD>{titleCase(r.category)}</TD>
                    <TD className="font-mono tabular-nums">{r.total}</TD>
                    <TD className="text-xs text-muted-foreground">{r.lessonStoredAt ? formatDateTime(r.lessonStoredAt) : "no stored lesson"}</TD>
                    <TD className="font-mono tabular-nums">{r.before}</TD>
                    <TD className="font-mono tabular-nums">{r.after ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="Methodology">
        <Card>
          <CardContent className="pt-5">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {METHODOLOGY.split("\n").map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
