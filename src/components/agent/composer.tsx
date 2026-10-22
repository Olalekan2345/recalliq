"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ArrowUp, ChevronDown, Fingerprint, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Switch, Textarea } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";

const STARTERS = [
  { label: "Verify a transaction", text: "Did this transaction succeed, and what exactly changed? Digest: " },
  { label: "Explain a failure", text: "Why did this transaction fail? Digest: " },
  { label: "Wallet activity", text: "Summarise the recent on-chain activity of this address and what it interacts with: " },
  { label: "Compare transactions", text: "Compare these transactions and explain the differences: " },
];

export function Composer({
  investigationId,
  compact = false,
  disabled,
  disabledReason,
}: {
  investigationId?: string;
  compact?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [task, setTask] = useState("");
  const [address, setAddress] = useState("");
  const [digest, setDigest] = useState("");
  const [memory, setMemory] = useState(true);
  const [showIds, setShowIds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (task.trim().length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: task.trim(),
          address: address.trim() || null,
          digest: digest.trim() || null,
          investigationId: investigationId ?? null,
          memoryMode: memory ? "enabled" : "disabled",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.issues?.[0]?.message ?? body.error ?? `Request failed (${res.status})`);
        setBusy(false);
        return;
      }
      router.push(`/workspace/run/${body.runId}`);
    } catch {
      setError("Network error — check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="ring-brand shadow-elevated rounded-2xl bg-card transition-shadow duration-300 focus-within:shadow-[0_0_0_4px_var(--glow),0_24px_60px_-28px_rgb(50_84_228/0.55)]"
    >
      <label htmlFor={`${id}-task`} className="sr-only">
        What should RecallIQ investigate?
      </label>
      <Textarea
        id={`${id}-task`}
        value={task}
        onChange={(e) => setTask(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        placeholder={compact ? "Ask a follow-up question…" : "Ask about a Sui transaction, wallet or contract — paste digests and addresses directly."}
        className={cn(
          "resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
          compact ? "min-h-20" : "min-h-32 text-base",
        )}
        maxLength={2000}
        disabled={disabled}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {showIds && (
        <div className="grid gap-3 border-t px-4 py-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-addr`} className="flex items-center gap-1.5 text-xs">
              <Fingerprint className="size-3.5" aria-hidden /> Wallet address (optional)
            </Label>
            <Input
              id={`${id}-addr`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x…"
              className="font-mono text-xs"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-dig`} className="flex items-center gap-1.5 text-xs">
              <Hash className="size-3.5" aria-hidden /> Transaction digest (optional)
            </Label>
            <Input
              id={`${id}-dig`}
              value={digest}
              onChange={(e) => setDigest(e.target.value)}
              placeholder="Base58 digest"
              className="font-mono text-xs"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2.5">
        <button
          type="button"
          onClick={() => setShowIds((v) => !v)}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={showIds}
        >
          Identifiers <ChevronDown className={cn("size-3.5 transition-transform", showIds && "rotate-180")} aria-hidden />
        </button>
        <div className="flex items-center gap-2">
          <Switch id={`${id}-mem`} checked={memory} onCheckedChange={setMemory} disabled={disabled} />
          <Label htmlFor={`${id}-mem`} className="text-xs font-normal text-muted-foreground">
            {memory ? "Use Walrus memory" : "Baseline (no memory)"}
          </Label>
        </div>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">Ctrl + Enter</span>
        <Button type="submit" variant="brand" size="sm" loading={busy} disabled={disabled || task.trim().length < 3}>
          {!busy && <ArrowUp aria-hidden />}
          {compact ? "Ask" : "Investigate"}
        </Button>
      </div>
      {(error || disabledReason) && (
        <div className="border-t px-4 py-2.5">{error ? <FieldError id={`${id}-err`}>{error}</FieldError> : <FieldHint>{disabledReason}</FieldHint>}</div>
      )}
      {!compact && !task && (
        <div className="flex flex-wrap gap-2 border-t px-3 py-3">
          {STARTERS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setTask(s.text)}
              className="rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
