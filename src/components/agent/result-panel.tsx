"use client";

import { useState } from "react";
import { ChevronDown, Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, FieldHint, Label, Textarea } from "@/components/ui/form-controls";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/overlays";
import { Alert } from "@/components/ui/misc";
import { VerificationBadge } from "@/components/shared/status";
import { cn } from "@/lib/utils";
import { SafeText } from "./safe-text";
import type { RunDetail } from "./types";

const KIND_LABEL: Record<string, string> = {
  observation: "Observation",
  verified_fact: "Verified fact",
  interpretation: "Interpretation",
  hypothesis: "Hypothesis",
  unknown: "Unknown",
};

function FeedbackDialog({
  runId,
  claimRef,
  open,
  onClose,
  onDone,
}: {
  runId: string;
  claimRef: string | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ verificationStatus: string; detail: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agent/runs/${runId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claimRef: claimRef ?? undefined, note }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not submit feedback");
    setResult(body);
    onDone();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setNote("");
          setResult(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogTitle>Report {claimRef ? `claim ${claimRef}` : "this answer"} as incorrect</DialogTitle>
        <DialogDescription>
          Feedback is never accepted as fact automatically. If the claim has a checkable assertion, RecallIQ re-verifies it against fresh chain data; only a
          confirmed error becomes a lesson.
        </DialogDescription>
        {result ? (
          <Alert
            tone={result.verificationStatus === "verified" ? "success" : "info"}
            title={result.verificationStatus === "verified" ? "Error confirmed on chain" : "Recorded as unconfirmed feedback"}
          >
            {result.detail}
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fb-note">What is wrong?</Label>
              <Textarea id="fb-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} required />
              <FieldHint>Include the correct value or a transaction digest if you have one.</FieldHint>
            </div>
            {error && <FieldError>{error}</FieldError>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={note.trim().length < 3}>
                Submit
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ResultPanel({ detail, onEvidence, onRefresh }: { detail: RunDetail; onEvidence: (ref: string) => void; onRefresh: () => void }) {
  const report = detail.run.finalReport;
  const [openClaims, setOpenClaims] = useState<Record<string, boolean>>({});
  const [feedbackFor, setFeedbackFor] = useState<{ ref: string | null } | null>(null);
  if (!report) return null;
  const vByRef = new Map(detail.verifications.map((v) => [v.claimRef, v]));
  const counts = {
    verified: detail.verifications.filter((v) => v.status === "VERIFIED" || v.status === "PARTIALLY_VERIFIED").length,
    contradicted: detail.verifications.filter((v) => v.status === "CONTRADICTED").length,
    unverified: detail.verifications.filter((v) => v.status === "UNVERIFIED" || v.status === "UNAVAILABLE").length,
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Answer</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Written by the model; every factual claim below is checked separately.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setFeedbackFor({ ref: null })}>
            <Flag aria-hidden /> Report issue
          </Button>
        </CardHeader>
        <CardContent>
          <SafeText text={report.answer} onEvidence={onEvidence} />
        </CardContent>
      </Card>

      {report.claims.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Claims & verification</CardTitle>
            <div className="flex flex-wrap gap-2 pt-1 text-xs">
              <Badge tone="success">{counts.verified} verified</Badge>
              <Badge tone={counts.contradicted ? "danger" : "neutral"}>{counts.contradicted} contradicted</Badge>
              <Badge tone="neutral">{counts.unverified} unverified</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y border-t">
              {report.claims.map((c) => {
                const v = vByRef.get(c.ref);
                const open = openClaims[c.ref];
                return (
                  <li key={c.ref} className={cn("px-5 py-3", v?.status === "CONTRADICTED" && "bg-danger-soft/50")}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">{c.ref}</span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-sm">{c.statement}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="outline">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
                          {v ? <VerificationBadge status={v.status} /> : <Badge tone="neutral">Pending verification</Badge>}
                          {c.evidenceRefs.map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => onEvidence(r)}
                              className="inline-flex h-6 items-center rounded border bg-accent px-1.5 font-mono text-xs text-accent-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                        {open && v && (
                          <div className="rounded-md bg-muted p-2.5 text-xs leading-5">
                            <p>
                              <span className="font-medium">Method:</span> {v.verificationMethod}
                            </p>
                            {v.detail && (
                              <p>
                                <span className="font-medium">Result:</span> {v.detail}
                              </p>
                            )}
                            {v.sourceProvider && (
                              <p>
                                <span className="font-medium">Source:</span> {v.sourceProvider} · {new Date(v.verifiedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {v && (
                          <Button variant="ghost" size="sm" onClick={() => setOpenClaims((s) => ({ ...s, [c.ref]: !s[c.ref] }))} aria-expanded={Boolean(open)}>
                            <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden />
                            <span className="sr-only">Toggle verification details</span>
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setFeedbackFor({ ref: c.ref })} aria-label={`Report claim ${c.ref} as incorrect`}>
                          <Flag aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {(report.limitations.length > 0 || report.toolRationale.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {report.toolRationale.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Why these tools</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {report.toolRationale.map((t, i) => (
                    <li key={i}>
                      <span className="font-mono text-xs">{t.tool}</span>
                      <p className="text-muted-foreground">{t.why}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {report.limitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Limitations</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                  {report.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {detail.feedback.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.feedback.map((f) => (
              <div key={f.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2">
                  {f.claimRef && <span className="font-mono text-xs">{f.claimRef}</span>}
                  <Badge tone={f.verificationStatus === "verified" ? "success" : "neutral"}>
                    {f.verificationStatus === "verified"
                      ? "Confirmed on chain"
                      : f.verificationStatus === "contradicted"
                        ? "Chain supports original"
                        : "Unverified"}
                  </Badge>
                </div>
                <p className="mt-1">{f.note}</p>
                {f.verificationDetail && <p className="mt-1 text-xs text-muted-foreground">{f.verificationDetail}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <FeedbackDialog
        runId={detail.run.id}
        claimRef={feedbackFor?.ref ?? null}
        open={feedbackFor !== null}
        onClose={() => setFeedbackFor(null)}
        onDone={onRefresh}
      />
    </div>
  );
}
