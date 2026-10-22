"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag, PenLine, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Label, Textarea } from "@/components/ui/form-controls";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/overlays";

type Action = "flag" | "supersede" | "retract";

const COPY: Record<Action, { title: string; desc: string; cta: string }> = {
  flag: { title: "Flag as inaccurate", desc: "The memory stops being recalled. Your note is recorded as unverified feedback.", cta: "Flag memory" },
  supersede: {
    title: "Correct this lesson",
    desc: "Writes a new correction memory to Walrus (marked user-reported) and supersedes this one.",
    cta: "Save correction",
  },
  retract: {
    title: "Retract from recall",
    desc: "RecallIQ will never use this memory again. Walrus storage is append-only, so the encrypted blob remains on the network.",
    cta: "Retract",
  },
};

export function MemoryActions({ memoryId, disabled }: { memoryId: string; disabled?: boolean }) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [lesson, setLesson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action) return;
    setBusy(true);
    setError(null);
    const payload =
      action === "supersede" ? { action, note, correctedLesson: lesson } : action === "flag" ? { action, note } : { action, note: note || undefined };
    const res = await fetch(`/api/memories/${memoryId}/corrections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.issues?.[0]?.message ?? body.error ?? "Request failed");
    setAction(null);
    setNote("");
    setLesson("");
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setAction("flag")} disabled={disabled}>
          <Flag aria-hidden /> Flag
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAction("supersede")} disabled={disabled}>
          <PenLine aria-hidden /> Correct
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setAction("retract")} disabled={disabled}>
          <Undo2 aria-hidden /> Retract
        </Button>
      </div>
      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          {action && (
            <>
              <DialogTitle>{COPY[action].title}</DialogTitle>
              <DialogDescription>{COPY[action].desc}</DialogDescription>
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ma-note">{action === "retract" ? "Reason (optional)" : "What is wrong?"}</Label>
                  <Textarea id="ma-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} required={action !== "retract"} />
                </div>
                {action === "supersede" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="ma-lesson">Corrected lesson</Label>
                    <Textarea id="ma-lesson" value={lesson} onChange={(e) => setLesson(e.target.value)} maxLength={800} required minLength={20} />
                    <FieldHint>20–800 characters. Never include keys, seed phrases or credentials.</FieldHint>
                  </div>
                )}
                {error && <FieldError>{error}</FieldError>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setAction(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={busy} variant={action === "retract" ? "destructive" : "default"}>
                    {COPY[action].cta}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
