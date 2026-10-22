import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/layout-bits";
import { RunStatusBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Composer } from "@/components/agent/composer";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime, titleCase } from "@/lib/utils";
import { getInvestigation } from "@/server/services/investigations";

export const metadata = { title: "Investigation" };
export const dynamic = "force-dynamic";

export default async function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getInvestigation(user.id, id);
  if (!data) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title={data.investigation.title}
        description={`${data.runs.length} run${data.runs.length === 1 ? "" : "s"} · started ${formatDateTime(data.investigation.createdAt)}`}
      />
      <ol className="space-y-2">
        {data.runs.map((r, i) => (
          <li key={r.id}>
            <Link
              href={`/workspace/run/${r.id}`}
              className="flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center"
            >
              <span className="font-mono text-xs text-muted-foreground tabular-nums">#{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{r.task}</span>
              <span className="flex shrink-0 items-center gap-2">
                {r.taskCategory && <Badge tone="outline">{titleCase(r.taskCategory)}</Badge>}
                <Badge tone={r.memoryMode === "enabled" ? "primary" : "neutral"}>{r.memoryMode === "enabled" ? "Memory" : "Baseline"}</Badge>
                <RunStatusBadge status={r.status} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {!data.investigation.isEvaluation && <Composer investigationId={id} compact />}
    </div>
  );
}
