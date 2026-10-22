"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BrainCircuit, CircleDollarSign, ExternalLink, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { RunStatusBadge, PaymentStatusBadge, StorageBadge } from "@/components/shared/status";
import { ChainId } from "@/components/shared/chain-id";
import { PaymentApproval } from "@/components/payments/payment-approval";
import { formatAtomic } from "@/lib/blockchain/sui/amounts";
import { txUrl, walrusBlobUrl } from "@/lib/blockchain/sui/explorer";
import { formatDuration, microUsdToString, titleCase } from "@/lib/utils";
import { ActivityFeed } from "./activity-feed";
import { Composer } from "./composer";
import { EvidenceDialog, EvidenceList } from "./evidence";
import { ResultPanel } from "./result-panel";
import { TERMINAL, type RunDetail, type RunStep } from "./types";

export function RunView({ initial }: { initial: RunDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState<RunDetail>(initial);
  const [steps, setSteps] = useState<RunStep[]>(initial.steps);
  const [status, setStatus] = useState(initial.run.status);
  const [evidenceRef, setEvidenceRef] = useState<string | null>(null);
  const [busy, setBusy] = useState<"cancel" | "retry" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const runId = initial.run.id;
  const live = !TERMINAL.has(status);
  const lastId = useRef<number>(initial.steps.at(-1)?.id ?? 0);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/agent/runs/${runId}`, { cache: "no-store" });
    if (res.ok) {
      const d = (await res.json()) as RunDetail;
      setDetail(d);
      setStatus(d.run.status);
      setSteps((prev) => (d.steps.length >= prev.length ? d.steps : prev));
      lastId.current = Math.max(lastId.current, d.steps.at(-1)?.id ?? 0);
    }
  }, [runId]);

  useEffect(() => {
    if (!live) return;
    const es = new EventSource(`/api/agent/runs/${runId}/events?after=${lastId.current}`);
    es.addEventListener("step", (e) => {
      const step = JSON.parse((e as MessageEvent).data) as RunStep;
      if (step.id <= lastId.current) return;
      lastId.current = step.id;
      setSteps((prev) => [...prev, step]);
    });
    es.addEventListener("status", (e) => {
      const s = JSON.parse((e as MessageEvent).data) as { status: string };
      setStatus(s.status as RunDetail["run"]["status"]);
      void refresh();
    });
    es.addEventListener("end", () => {
      es.close();
      void refresh();
    });
    return () => es.close();
  }, [live, runId, refresh]);

  // While a payment is settling the run stays AWAITING_APPROVAL — poll the payment state.
  const pendingPayment = detail.payments.find((p) => ["approved", "settling", "unknown"].includes(p.intent.status));
  useEffect(() => {
    if (!pendingPayment) return;
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [pendingPayment, refresh]);

  const cancel = async () => {
    setBusy("cancel");
    setActionError(null);
    const res = await fetch(`/api/agent/runs/${runId}/cancel`, { method: "POST" });
    setBusy(null);
    if (!res.ok) setActionError((await res.json().catch(() => ({}))).error ?? "Could not cancel");
    void refresh();
  };

  const retry = async () => {
    setBusy("retry");
    setActionError(null);
    const res = await fetch(`/api/agent/runs/${runId}/retry`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setActionError(body.error ?? "Could not retry");
    router.push(`/workspace/run/${body.runId}`);
  };

  const run = detail.run;
  const awaiting = detail.payments.find((p) => p.intent.status === "awaiting_approval");
  const considered = detail.memoryUsage.filter((m) => m.usage.disposition !== "filtered_out");
  const plan = run.toolPlan;

  const toolsUsed = useMemo(() => {
    const map = new Map<string, { n: number; failed: number; ms: number }>();
    for (const t of detail.tools) {
      const e = map.get(t.toolId) ?? { n: 0, failed: 0, ms: 0 };
      e.n++;
      if (t.status !== "success") e.failed++;
      e.ms += t.latencyMs ?? 0;
      map.set(t.toolId, e);
    }
    return [...map.entries()];
  }, [detail.tools]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b pb-6">
        <Link
          href="/workspace"
          className="inline-flex w-fit items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden /> Workspace
        </Link>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{run.task}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <RunStatusBadge status={status} />
              {run.taskCategory && <Badge tone="outline">{titleCase(run.taskCategory)}</Badge>}
              <Badge tone={run.memoryMode === "enabled" ? "primary" : "neutral"}>
                <BrainCircuit aria-hidden /> {run.memoryMode === "enabled" ? "Memory on" : "Baseline (memory off)"}
              </Badge>
              {run.isEvaluation && <Badge tone="warning">Evaluation run</Badge>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {live && (
              <Button variant="outline" onClick={cancel} loading={busy === "cancel"}>
                <Square aria-hidden /> Cancel
              </Button>
            )}
            {!live && !run.isEvaluation && (
              <Button variant="outline" onClick={retry} loading={busy === "retry"}>
                <RotateCcw aria-hidden /> Run again
              </Button>
            )}
          </div>
        </div>
        {actionError && <Alert tone="danger" title={actionError} />}
        {status === "FAILED" && run.error && (
          <Alert tone="danger" title="This investigation failed">
            {run.error}
          </Alert>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {awaiting && (
            <PaymentApproval
              intent={{
                id: awaiting.intent.id,
                amountAtomic: awaiting.intent.amountAtomic,
                asset: awaiting.intent.asset,
                assetDecimals: awaiting.intent.assetDecimals,
                assetSymbol: awaiting.intent.assetSymbol,
                payTo: awaiting.intent.payTo,
                network: awaiting.intent.network,
                reason: awaiting.intent.reason,
                expiresAt: awaiting.intent.expiresAt,
                toolId: awaiting.intent.toolId,
              }}
              onDecided={() => void refresh()}
            />
          )}
          {pendingPayment && (
            <Alert tone="info" title="Payment approved — settling on Sui">
              The seller is verifying and settling your signed payment. RecallIQ will verify the settlement on chain before the investigation continues.
            </Alert>
          )}

          {run.finalReport ? (
            <ResultPanel detail={detail} onEvidence={setEvidenceRef} onRefresh={() => void refresh()} />
          ) : (
            !live && (
              <Alert tone="warning" title="No final report">
                The agent did not produce a report for this run{run.error ? ` (${run.error})` : ""}.
              </Alert>
            )
          )}

          <Card>
            <CardHeader>
              <CardTitle>Agent activity</CardTitle>
              <p className="text-xs text-muted-foreground">Every step below was recorded by the backend as it happened.</p>
            </CardHeader>
            <CardContent>
              <ActivityFeed steps={steps} live={live} />
            </CardContent>
          </Card>

          {!live && !run.isEvaluation && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Follow up in this investigation</h2>
              <Composer investigationId={run.investigationId} compact />
            </div>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Run</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Model</dt>
                <dd className="truncate font-mono text-xs" title={run.model ?? ""}>
                  {run.provider ? `${run.provider} · ${run.model}` : "—"}
                </dd>
                <dt className="text-muted-foreground">Tool calls</dt>
                <dd className="font-mono tabular-nums">
                  {run.toolCallCount} / {run.limits.maxToolCalls}
                </dd>
                <dt className="text-muted-foreground">Model steps</dt>
                <dd className="font-mono tabular-nums">
                  {run.modelIterations} / {run.limits.maxIterations}
                </dd>
                <dt className="text-muted-foreground">Tokens</dt>
                <dd className="font-mono tabular-nums">{run.inputTokens !== null ? `${run.inputTokens} in · ${run.outputTokens ?? 0} out` : "—"}</dd>
                <dt className="text-muted-foreground">Model cost</dt>
                <dd className="font-mono tabular-nums">{microUsdToString(run.modelCostMicroUsd) ?? "unknown"}</dd>
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="font-mono tabular-nums">
                  {run.startedAt && run.completedAt ? formatDuration(new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) : "—"}
                </dd>
              </dl>
            </CardContent>
          </Card>

          <Tabs defaultValue="evidence">
            <TabsList className="w-full">
              <TabsTrigger value="evidence" className="flex-1">
                Evidence
              </TabsTrigger>
              <TabsTrigger value="memory" className="flex-1">
                Memory
              </TabsTrigger>
              <TabsTrigger value="tools" className="flex-1">
                Tools
              </TabsTrigger>
            </TabsList>
            <TabsContent value="evidence">
              <EvidenceList evidence={detail.evidence} onOpen={setEvidenceRef} />
            </TabsContent>
            <TabsContent value="memory" className="space-y-3">
              {detail.memoryUsage.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {run.memoryMode === "disabled" ? "Memory was disabled for this run." : "No memories were retrieved for this run."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {detail.memoryUsage.map(({ usage, memory }) => (
                    <li key={usage.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{usage.ref}</span>
                        <Badge tone={usage.disposition === "applied" ? "success" : usage.disposition === "filtered_out" ? "neutral" : "info"}>
                          {usage.disposition.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-1">{memory?.summary ?? "Memory from another deployment (no local provenance)"}</p>
                      {usage.influence && <p className="mt-1 text-xs text-muted-foreground">Influence: {usage.influence}</p>}
                      {usage.decisionChanged && <p className="mt-1 text-xs font-medium text-primary">Changed decision: {usage.decisionChanged}</p>}
                      {usage.filterReason && <p className="mt-1 text-xs text-muted-foreground">{usage.filterReason}</p>}
                      <div className="mt-1 flex items-center gap-1">
                        {usage.distance !== null && (
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">distance {Number(usage.distance).toFixed(3)}</span>
                        )}
                        {memory?.id && (
                          <Link href={`/memory/${memory.id}`} className="ml-auto text-xs font-medium text-primary underline-offset-4 hover:underline">
                            Trace
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {considered.length > 0 && <p className="text-xs text-muted-foreground">{considered.length} relevant after filtering.</p>}
              {detail.memoriesWritten.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Lessons from this run</h3>
                  {detail.memoriesWritten.map((m) => (
                    <Link
                      key={m.id}
                      href={`/memory/${m.id}`}
                      className="block rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <p>{m.summary}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <StorageBadge status={m.storageStatus} />
                        {m.walrusBlobId && <span className="truncate font-mono text-xs text-muted-foreground">{m.walrusBlobId.slice(0, 12)}…</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="tools" className="space-y-3">
              {toolsUsed.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No tools called yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {toolsUsed.map(([id, s]) => (
                    <li key={id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                      <span className="truncate font-mono text-xs">{id}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                        {s.n}× · {s.failed ? `${s.failed} failed · ` : ""}
                        {formatDuration(Math.round(s.ms / Math.max(1, s.n)))} avg
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {plan?.paidToolDecision && (
                <div className="rounded-lg border p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium">
                    <CircleDollarSign className="size-4" aria-hidden /> Paid analysis {plan.paidToolDecision.offered ? "offered" : "not offered"}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {plan.paidToolDecision.reasons.slice(0, 5).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {plan?.directivesApplied && plan.directivesApplied.length > 0 && (
                <div className="rounded-lg border border-primary/30 bg-accent/40 p-3 text-sm">
                  <p className="font-medium">Memory changed the tool plan</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {plan.directivesApplied.map((d, i) => (
                      <li key={i}>
                        <span className="font-mono">{d.memoryRef}</span> · {d.effect}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {detail.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {detail.payments.map((p) => (
                  <div key={p.intent.id} className="space-y-1.5 rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono tabular-nums">
                        {p.intent.assetDecimals !== null
                          ? `${formatAtomic(p.intent.amountAtomic, p.intent.assetDecimals)} ${p.intent.assetSymbol ?? ""}`
                          : `${p.intent.amountAtomic} atomic`}
                      </span>
                      <PaymentStatusBadge status={p.intent.status} />
                    </div>
                    {p.settlement && (
                      <div className="text-xs text-muted-foreground">
                        <ChainId value={p.settlement.digest} href={txUrl(p.settlement.digest)} />
                        <p>
                          {p.settlement.finalState === "settled" ? "Recipient, asset and exact amount verified" : p.settlement.finalState} · checkpoint{" "}
                          {p.settlement.checkpoint ?? "—"}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                <Link href="/payments" className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline">
                  Payment center <ExternalLink className="size-3" aria-hidden />
                </Link>
              </CardContent>
            </Card>
          )}

          {detail.memoriesWritten.some((m) => m.walrusBlobId) && (
            <p className="text-xs text-muted-foreground">
              Stored lessons can be inspected on{" "}
              <a
                className="text-primary underline"
                href={walrusBlobUrl(detail.memoriesWritten.find((m) => m.walrusBlobId)!.walrusBlobId!)}
                target="_blank"
                rel="noreferrer"
              >
                Walruscan
              </a>{" "}
              (content is Seal-encrypted).
            </p>
          )}
        </aside>
      </div>

      <EvidenceDialog runId={runId} evidenceRef={evidenceRef} onClose={() => setEvidenceRef(null)} />
    </div>
  );
}
