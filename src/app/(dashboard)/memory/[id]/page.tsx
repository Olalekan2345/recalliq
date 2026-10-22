import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/layout-bits";
import { StorageBadge } from "@/components/shared/status";
import { ChainId } from "@/components/shared/chain-id";
import { InfluenceTrace } from "@/components/learning/influence-trace";
import { MemoryActions } from "@/components/memory/memory-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { walrusBlobUrl } from "@/lib/blockchain/sui/explorer";
import { formatDateTime } from "@/lib/utils";
import { getMemoryTrace } from "@/server/services/memories";
import { toJson } from "@/types/json";

export const metadata = { title: "Memory" };
export const dynamic = "force-dynamic";

export default async function MemoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const raw = await getMemoryTrace(user.id, id);
  if (!raw) notFound();
  const t = toJson(raw);
  const m = t.memory;

  return (
    <div className="space-y-6">
      <Link
        href="/memory"
        className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden /> Memory Vault
      </Link>
      <PageHeader
        title={m.summary}
        actions={
          t.isOwn ? <MemoryActions memoryId={m.id} disabled={m.status !== "active" || user.isGuest} /> : <Badge tone="info">Platform lesson (read-only)</Badge>
        }
      />
      {m.status !== "active" && (
        <Alert tone="warning" title={`This memory is ${m.status}`}>
          {m.flaggedReason ?? "It is excluded from future recall."}
          {t.supersededBy && (
            <>
              {" "}
              Replaced by <Link href={`/memory/${t.supersededBy.id}`}>{t.supersededBy.summary}</Link>.
            </>
          )}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lesson</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6">{m.lesson}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="outline">{m.memoryType.replace(/_/g, " ")}</Badge>
                {m.directive && <Badge tone="primary">policy: {m.directive.replace(/_/g, " ")}</Badge>}
                {m.taskCategory && <Badge tone="outline">{m.taskCategory.replace(/_/g, " ")}</Badge>}
                {m.relatedToolId && <Badge tone="outline">{m.relatedToolId}</Badge>}
                <Badge tone={m.verificationStatus === "verified" ? "success" : "neutral"}>{m.verificationStatus.replace("_", " ")}</Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Exact text stored on Walrus</p>
                <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 font-mono text-xs leading-5">{m.content}</pre>
              </div>
              {m.evidenceReferences.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Evidence references</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {m.evidenceReferences.map((e, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Badge tone="neutral">{e.kind}</Badge>
                        {e.kind === "run" ? (
                          <Link href={`/workspace/run/${e.id}`} className="font-mono text-xs text-primary underline-offset-4 hover:underline">
                            {e.id}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs">
                            {e.label ? `${e.label} · ` : ""}
                            {e.id}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {t.corrections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Corrections & audit trail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {t.corrections.map((c) => (
                  <div key={c.id} className="rounded-md border p-3 text-sm">
                    <p>{c.note}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.verificationStatus} · {c.verificationDetail} · {formatDateTime(c.createdAt)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Storage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <StorageBadge status={m.storageStatus} />
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Blob ID</dt>
                <dd className="min-w-0">{m.walrusBlobId ? <ChainId value={m.walrusBlobId} href={walrusBlobUrl(m.walrusBlobId)} head={8} tail={6} /> : "—"}</dd>
                <dt className="text-muted-foreground">Job</dt>
                <dd className="truncate font-mono text-xs">{m.walrusJobId ?? "—"}</dd>
                <dt className="text-muted-foreground">Namespace</dt>
                <dd className="truncate font-mono text-xs">{m.namespace}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="text-xs">{formatDateTime(m.createdAt)}</dd>
                <dt className="text-muted-foreground">Stored</dt>
                <dd className="text-xs">{formatDateTime(m.storedAt)}</dd>
                <dt className="text-muted-foreground">Attempts</dt>
                <dd className="font-mono text-xs">{m.storageAttempts}</dd>
              </dl>
              {m.lastError && <p className="text-xs text-destructive">{m.lastError}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Influence trace</CardTitle>
            </CardHeader>
            <CardContent>
              <InfluenceTrace trace={t} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
