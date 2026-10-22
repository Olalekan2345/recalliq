"use client";

/**
 * Explicit, per-payment approval. Shows the exact asset, amount, recipient and
 * network from the seller's real 402 quote; the user's own wallet signs the
 * transfer (built server-side through Tatum); the server re-verifies the
 * signed bytes before anything is broadcast. Never auto-signs.
 */
import { useEffect, useState } from "react";
import { DAppKitProvider, useDAppKit, useWalletConnection } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { CircleDollarSign, ShieldCheck, Timer } from "lucide-react";
import { dAppKit } from "@/components/wallet/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/form-controls";
import { Badge } from "@/components/ui/badge";
import { ChainId } from "@/components/shared/chain-id";
import { formatAtomic } from "@/lib/blockchain/sui/amounts";
import { accountUrl } from "@/lib/blockchain/sui/explorer";

export interface ApprovalIntent {
  id: string;
  amountAtomic: string;
  asset: string;
  assetDecimals: number | null;
  assetSymbol: string | null;
  payTo: string;
  network: string;
  reason: string;
  expiresAt: string;
  toolId: string;
}

type Phase = "idle" | "building" | "signing" | "verifying" | "declining" | "done";

function useCountdown(to: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(to).getTime() - now);
  return { expired: ms === 0, label: `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` };
}

function ApprovalCard({ intent, onDecided }: { intent: ApprovalIntent; onDecided: () => void }) {
  const kit = useDAppKit();
  const connection = useWalletConnection();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(intent.expiresAt);
  const display =
    intent.assetDecimals !== null
      ? `${formatAtomic(intent.amountAtomic, intent.assetDecimals)} ${intent.assetSymbol ?? ""}`.trim()
      : `${intent.amountAtomic} atomic units`;

  const approve = async () => {
    if (!connection.isConnected) return;
    setError(null);
    const walletAddress = connection.account.address;
    try {
      setPhase("building");
      const prep = await fetch(`/api/payments/${intent.id}/prepare`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const prepared = await prep.json().catch(() => ({}));
      if (!prep.ok) throw new Error(prepared.error ?? "Could not build the payment");
      setPhase("signing");
      let signed: { bytes: string; signature: string };
      try {
        signed = await kit.signTransaction({ transaction: prepared.transactionBytes });
      } catch (err) {
        // A wallet rejection is a choice, not an error.
        if (/reject|denied|cancel/i.test(String((err as Error)?.message ?? err))) {
          setPhase("idle");
          return;
        }
        throw err;
      }
      setPhase("verifying");
      const auth = await fetch(`/api/payments/${intent.id}/authorize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approved", walletAddress, transactionBytes: signed.bytes, signature: signed.signature }),
      });
      const body = await auth.json().catch(() => ({}));
      if (!auth.ok) throw new Error(body.error ?? "Authorization failed");
      setPhase("done");
      onDecided();
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
    }
  };

  const decline = async () => {
    setPhase("declining");
    setError(null);
    const res = await fetch(`/api/payments/${intent.id}/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "rejected" }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Could not record your decision");
      setPhase("idle");
      return;
    }
    setPhase("done");
    onDecided();
  };

  const busy = phase !== "idle" && phase !== "done";
  const phaseText: Record<Phase, string> = {
    idle: "",
    building: "Building the exact transfer via Tatum…",
    signing: "Waiting for your signature in the wallet…",
    verifying: "Verifying the signed payment by simulation…",
    declining: "Recording your decision…",
    done: "Decision recorded. The investigation continues.",
  };

  return (
    <Card className="border-warning/50 shadow-sm">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-warning-soft">
            <CircleDollarSign className="size-4 text-warning" aria-hidden />
          </span>
          <div>
            <CardTitle>Approve paid analysis?</CardTitle>
            <p className="text-xs text-muted-foreground">x402 payment on Sui · you sign in your own wallet</p>
          </div>
        </div>
        <Badge tone={countdown.expired ? "neutral" : "warning"}>
          <Timer aria-hidden /> {countdown.expired ? "Expired" : countdown.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="text-xs text-muted-foreground">You pay exactly</p>
          <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums">{display}</p>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">{intent.amountAtomic} atomic units</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Recipient</dt>
          <dd className="min-w-0">
            <ChainId value={intent.payTo} href={accountUrl(intent.payTo)} />
          </dd>
          <dt className="text-muted-foreground">Asset</dt>
          <dd className="min-w-0">
            <ChainId value={intent.asset} head={10} tail={10} />
          </dd>
          <dt className="text-muted-foreground">Network</dt>
          <dd>{intent.network === "sui:mainnet" ? "Sui Mainnet" : intent.network}</dd>
          <dt className="text-muted-foreground">Service</dt>
          <dd>Forensic Analyzer — operated by RecallIQ</dd>
        </dl>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Why the agent asked</p>
          <p className="mt-1 text-sm">{intent.reason}</p>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
          The paid result is only released after the seller settles your exact payment and RecallIQ independently verifies the settlement on chain via Tatum.
          Declining is free; the agent continues with free tools.
        </p>
        {phaseText[phase] && (
          <p className="text-sm font-medium" role="status">
            {phaseText[phase]}
          </p>
        )}
        {error && <FieldError>{error}</FieldError>}
      </CardContent>
      <CardFooter className="flex-wrap justify-end">
        <Button variant="outline" onClick={decline} disabled={busy || phase === "done"} loading={phase === "declining"}>
          Decline
        </Button>
        {connection.isConnected ? (
          <Button
            onClick={approve}
            disabled={busy || phase === "done" || countdown.expired}
            loading={phase === "building" || phase === "signing" || phase === "verifying"}
          >
            Approve & sign
          </Button>
        ) : (
          <ConnectButton instance={dAppKit} />
        )}
      </CardFooter>
    </Card>
  );
}

export default function PaymentApprovalInner(props: { intent: ApprovalIntent; onDecided: () => void }) {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <ApprovalCard {...props} />
    </DAppKitProvider>
  );
}
