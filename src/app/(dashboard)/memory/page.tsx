import Link from "next/link";
import { Suspense } from "react";
import { BrainCircuit } from "lucide-react";
import { EmptyState, PageHeader, Stat } from "@/components/shared/layout-bits";
import { StorageBadge } from "@/components/shared/status";
import { MemoryFilters } from "@/components/memory/memory-filters";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { memwalConfig } from "@/lib/env";
import { relativeTime } from "@/lib/utils";
import { listMemories, memoryCounts, memoryFilterSchema } from "@/server/services/memories";
import { checkWalrus } from "@/server/services/health";

export const metadata = { title: "Memory Vault" };
export const dynamic = "force-dynamic";

export default async function MemoryVaultPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const parsed = memoryFilterSchema.safeParse(sp);
  const filter = parsed.success ? parsed.data : memoryFilterSchema.parse({});
  const [memories, counts, walrus] = await Promise.all([listMemories(user.id, filter), memoryCounts(user.id), checkWalrus()]);
  const cfg = memwalConfig();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Walrus Memory"
        title="Memory Vault"
        description="Lessons RecallIQ learned from verified outcomes. A memory counts as stored only after Walrus confirms the write and returns a blob ID."
      />

      {walrus.status === "unconfigured" ? (
        <Alert tone="warning" title="Walrus Memory is not configured on this deployment">
          Lessons are kept in the local outbox and are not stored on or recalled from Walrus until MEMWAL_KEY and MEMWAL_ACCOUNT_ID are set.
        </Alert>
      ) : walrus.status !== "ok" ? (
        <Alert tone="danger" title={`Walrus relayer ${walrus.status}`}>
          {walrus.detail}
        </Alert>
      ) : (
        <Alert tone="info" title="Ownership model">
          Lessons are encrypted and stored on Walrus Mainnet through RecallIQ&apos;s operator MemWal account ({cfg.serverUrl.replace("https://", "")}), in a
          private namespace derived from your account. They are isolated by server-side authorisation, not by your wallet&apos;s keys. Walrus storage is
          append-only: retracting a memory stops it being recalled; the encrypted blob remains on the network.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Stored on Walrus" value={counts.stored ?? 0} />
        <Stat label="Pending confirmation" value={(counts.pending ?? 0) + (counts.submitting ?? 0)} />
        <Stat label="Queued (outbox)" value={counts.queued ?? 0} />
        <Stat label="Storage failed" value={counts.failed ?? 0} />
      </div>

      <Suspense>
        <MemoryFilters />
      </Suspense>

      {memories.length === 0 ? (
        <EmptyState icon={BrainCircuit} title={Object.values(sp).some(Boolean) ? "No memories match these filters" : "No memories yet"}>
          {Object.values(sp).some(Boolean)
            ? "Try a different filter."
            : "RecallIQ only stores a lesson when an investigation produces a verified mistake or a verified success worth remembering."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {memories.map((m) => (
            <li key={m.id}>
              <Link
                href={`/memory/${m.id}`}
                className="flex h-full flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="outline">{m.memoryType.replace(/_/g, " ")}</Badge>
                  {m.scope === "platform" && <Badge tone="info">Platform lesson</Badge>}
                  <StorageBadge status={m.storageStatus} />
                  {m.status !== "active" && <Badge tone="warning">{m.status}</Badge>}
                  <Badge tone={m.verificationStatus === "verified" ? "success" : "neutral"}>{m.verificationStatus.replace("_", " ")}</Badge>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.summary}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.lesson}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {m.taskCategory && <span>{m.taskCategory.replace(/_/g, " ")}</span>}
                  {m.relatedToolId && <span className="font-mono">{m.relatedToolId}</span>}
                  <span>
                    retrieved {m.retrievedCount}× · applied {m.appliedCount}×
                  </span>
                  <span className="ml-auto">{relativeTime(m.createdAt)}</span>
                </div>
                {m.walrusBlobId && <p className="truncate font-mono text-xs text-muted-foreground">blob {m.walrusBlobId}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
