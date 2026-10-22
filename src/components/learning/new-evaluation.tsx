"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Select, Switch, Textarea } from "@/components/ui/form-controls";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/overlays";

export function NewEvaluation({ freeTools, disabled }: { freeTools: Array<{ id: string; name: string }>; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tasks, setTasks] = useState("");
  const [fault, setFault] = useState(false);
  const [faultTool, setFaultTool] = useState(freeTools[0]?.id ?? "");
  const [faultMode, setFaultMode] = useState<"timeout" | "error" | "empty">("timeout");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = tasks
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/evaluations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        tasks: list.map((task) => ({ task })),
        faultInjection: fault ? { toolId: faultTool, mode: faultMode, label: `Controlled ${faultMode} injected into ${faultTool}` } : null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.issues?.[0]?.message ?? body.error ?? "Could not start the evaluation");
    setOpen(false);
    router.push(`/learning/evaluations/${body.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand" disabled={disabled}>
          <FlaskConical aria-hidden /> New evaluation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogTitle>New paired evaluation</DialogTitle>
        <DialogDescription>
          Each task runs twice against live Sui Mainnet data — once without memory (baseline) and once with Walrus memory recall — with the same model and
          limits. Evaluation runs never spend funds or write memories.
        </DialogDescription>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ev-name">Name</Label>
            <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-tasks">Tasks (one per line)</Label>
            <Textarea
              id="ev-tasks"
              value={tasks}
              onChange={(e) => setTasks(e.target.value)}
              className="min-h-32 font-mono text-xs"
              placeholder="How much SUI did 0x… receive in transaction <digest>?"
            />
            <FieldHint>{list.length} task(s) · max 12 · each runs twice. Use real digests and addresses; results depend on live chain data.</FieldHint>
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Switch id="ev-fault" checked={fault} onCheckedChange={setFault} />
              <Label htmlFor="ev-fault">Controlled fault injection</Label>
            </div>
            {fault && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-ftool" className="text-xs">
                    Tool
                  </Label>
                  <Select id="ev-ftool" value={faultTool} onChange={(e) => setFaultTool(e.target.value)}>
                    {freeTools.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-fmode" className="text-xs">
                    Fault
                  </Label>
                  <Select id="ev-fmode" value={faultMode} onChange={(e) => setFaultMode(e.target.value as typeof faultMode)}>
                    <option value="timeout">Timeout</option>
                    <option value="error">Provider error</option>
                    <option value="empty">Empty result</option>
                  </Select>
                </div>
                <FieldHint className="sm:col-span-2">
                  Applied identically in both modes, labelled in every record, and excluded from production statistics.
                </FieldHint>
              </div>
            )}
          </div>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={list.length === 0 || list.length > 12 || name.trim().length < 3}>
              Start {list.length ? `(${list.length * 2} runs)` : ""}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
