"use client";

import { useEffect, useState } from "react";
import { FileSearch } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ChainId } from "@/components/shared/chain-id";
import { EmptyState } from "@/components/shared/layout-bits";
import { accountUrl, checkpointUrl, objectUrl, txUrl } from "@/lib/blockchain/sui/explorer";
import { formatDateTime } from "@/lib/utils";
import type { RunDetail } from "./types";

type Evidence = RunDetail["evidence"][number];

export function explorerFor(kind: string, reference: string): string | null {
  if (kind === "transaction" || kind === "paid_analysis") return txUrl(reference);
  if (kind === "checkpoint" || kind === "network_state") return checkpointUrl(reference);
  if (kind === "balances" || kind === "owned_objects" || kind === "address_transactions") return accountUrl(reference);
  if (kind === "object" || kind === "package") return objectUrl(reference);
  return null;
}

export function EvidenceDialog({ runId, evidenceRef, onClose }: { runId: string; evidenceRef: string | null; onClose: () => void }) {
  // Results are keyed by ref, so a stale response never shows under a new ref.
  const [loaded, setLoaded] = useState<{ ref: string; data?: Evidence & { data: unknown }; error?: string } | null>(null);

  useEffect(() => {
    if (!evidenceRef) return;
    let active = true;
    fetch(`/api/agent/runs/${runId}/evidence/${evidenceRef}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (active) setLoaded(r.ok ? { ref: evidenceRef, data: body } : { ref: evidenceRef, error: body.error ?? `HTTP ${r.status}` });
      })
      .catch(() => active && setLoaded({ ref: evidenceRef, error: "Network error" }));
    return () => {
      active = false;
    };
  }, [runId, evidenceRef]);

  const current = loaded?.ref === evidenceRef ? loaded : null;
  const data = current?.data ?? null;
  const error = current?.error ?? null;

  return (
    <Dialog open={Boolean(evidenceRef)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Evidence {evidenceRef}</DialogTitle>
        <DialogDescription>Raw record fetched during this investigation, with its provenance.</DialogDescription>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!data && !error && (
          <div className="space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {data && (
          <div className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Provider</dt>
              <dd>{data.provider}</dd>
              <dt className="text-muted-foreground">Method</dt>
              <dd className="font-mono text-xs">{data.method}</dd>
              <dt className="text-muted-foreground">Network</dt>
              <dd>{data.network}</dd>
              <dt className="text-muted-foreground">Reference</dt>
              <dd className="min-w-0">
                <ChainId value={data.reference} href={explorerFor(data.kind, data.reference)} head={10} tail={8} />
              </dd>
              {data.checkpoint && (
                <>
                  <dt className="text-muted-foreground">Checkpoint</dt>
                  <dd className="font-mono text-xs tabular-nums">{data.checkpoint}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Fetched</dt>
              <dd>{formatDateTime(data.fetchedAt)}</dd>
              <dt className="text-muted-foreground">SHA-256</dt>
              <dd className="truncate font-mono text-xs" title={data.dataHash}>
                {data.dataHash}
              </dd>
            </dl>
            <pre className="max-h-80 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs leading-5">{JSON.stringify(data.data, null, 2)}</pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EvidenceList({ evidence, onOpen }: { evidence: Evidence[]; onOpen: (ref: string) => void }) {
  if (evidence.length === 0) return <EmptyState icon={FileSearch} title="No evidence yet" className="py-8" />;
  return (
    <ul className="divide-y rounded-lg border">
      {evidence.map((e) => (
        <li key={e.id}>
          <button
            type="button"
            onClick={() => onOpen(e.ref)}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Badge tone="primary" className="font-mono">
              {e.ref}
            </Badge>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{e.kind.replace(/_/g, " ")}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">{e.method}</span>
            </span>
            <span className="hidden text-xs text-muted-foreground sm:block">{e.provider}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
