"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Select, Switch } from "@/components/ui/form-controls";
import { formatAtomic, parseDisplayAmount } from "@/lib/blockchain/sui/amounts";

export interface SettingsValue {
  analysisDepth: "standard" | "deep";
  memoryEnabled: boolean;
  paidToolsEnabled: boolean;
  perPaymentLimitAtomic: string | null;
  perRunLimitAtomic: string | null;
  dailyLimitAtomic: string | null;
}

export function SettingsForm({
  initial,
  decimals,
  symbol,
  disabled,
}: {
  initial: SettingsValue;
  decimals: number | null;
  symbol: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const show = (v: string | null) => (v && decimals !== null ? formatAtomic(v, decimals) : (v ?? ""));
  const [depth, setDepth] = useState(initial.analysisDepth);
  const [memory, setMemory] = useState(initial.memoryEnabled);
  const [paid, setPaid] = useState(initial.paidToolsEnabled);
  const [perPayment, setPerPayment] = useState(show(initial.perPaymentLimitAtomic));
  const [perRun, setPerRun] = useState(show(initial.perRunLimitAtomic));
  const [daily, setDaily] = useState(show(initial.dailyLimitAtomic));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toAtomic = (v: string): string | null | "invalid" => {
    if (!v.trim()) return null;
    if (decimals === null) return /^\d+$/.test(v.trim()) ? v.trim() : "invalid";
    const a = parseDisplayAmount(v, decimals);
    return a === null || a < 0n ? "invalid" : a.toString();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const limits = { perPaymentLimitAtomic: toAtomic(perPayment), perRunLimitAtomic: toAtomic(perRun), dailyLimitAtomic: toAtomic(daily) };
    if (Object.values(limits).includes("invalid")) {
      setError(`Limits must be positive amounts with at most ${decimals ?? 0} decimal places.`);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analysisDepth: depth, memoryEnabled: memory, paidToolsEnabled: paid, ...limits }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Could not save settings");
    setSaved(true);
    router.refresh();
  };

  const unit = decimals !== null ? (symbol ?? "units") : "atomic units";

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="space-y-4" disabled={disabled}>
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="depth">Analysis depth</Label>
          <Select id="depth" value={depth} onChange={(e) => setDepth(e.target.value as typeof depth)}>
            <option value="standard">Standard</option>
            <option value="deep">Deep (more model effort, higher cost)</option>
          </Select>
        </div>
        <div className="flex items-start gap-3">
          <Switch id="memory" checked={memory} onCheckedChange={setMemory} />
          <div>
            <Label htmlFor="memory">Use Walrus memory</Label>
            <FieldHint>Recall lessons before investigating and store new verified lessons. Turn off to run everything as a baseline.</FieldHint>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Switch id="paid" checked={paid} onCheckedChange={setPaid} />
          <div>
            <Label htmlFor="paid">Allow paid analysis requests</Label>
            <FieldHint>When off, the agent is never offered paid tools. Every payment always needs your wallet signature.</FieldHint>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-sm font-medium">Spending limits ({unit})</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { id: "lim-pay", label: "Per payment", v: perPayment, set: setPerPayment },
            { id: "lim-run", label: "Per investigation", v: perRun, set: setPerRun },
            { id: "lim-day", label: "Rolling 24 hours", v: daily, set: setDaily },
          ].map((f) => (
            <div key={f.id} className="space-y-1.5">
              <Label htmlFor={f.id} className="text-xs">
                {f.label}
              </Label>
              <Input
                id={f.id}
                inputMode="decimal"
                value={f.v}
                onChange={(e) => f.set(e.target.value)}
                placeholder="No limit"
                className="font-mono tabular-nums"
              />
            </div>
          ))}
        </div>
        <FieldHint>
          Empty means only the platform cap applies. Limits are enforced by server code before a payment request is shown and again before it is accepted.
        </FieldHint>
      </fieldset>

      {error && <FieldError>{error}</FieldError>}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={busy} disabled={disabled}>
          Save settings
        </Button>
        {saved && (
          <span className="text-sm text-success" role="status">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
