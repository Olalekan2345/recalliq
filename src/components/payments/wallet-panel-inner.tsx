"use client";

import { useEffect, useState } from "react";
import { DAppKitProvider, useWalletConnection } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { dAppKit } from "@/components/wallet/wallet-provider";
import { ChainId } from "@/components/shared/chain-id";
import { Skeleton } from "@/components/ui/misc";
import { accountUrl } from "@/lib/blockchain/sui/explorer";

function Panel() {
  const conn = useWalletConnection();
  const [loaded, setLoaded] = useState<{
    address: string;
    balance?: { display: string | null; balanceAtomic: string; provider: string };
    error?: string;
  } | null>(null);
  const address = conn.isConnected ? conn.account.address : null;

  useEffect(() => {
    if (!address) return;
    let active = true;
    fetch(`/api/wallet/balance?address=${encodeURIComponent(address)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (active) setLoaded(r.ok ? { address, balance: body } : { address, error: body.error ?? "Unavailable" });
      })
      .catch(() => active && setLoaded({ address, error: "Network error" }));
    return () => {
      active = false;
    };
  }, [address]);

  const current = loaded?.address === address ? loaded : null;
  const balance = current?.balance ?? null;
  const error = current?.error ?? null;

  if (!conn.isConnected) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">Connect a Sui wallet to approve paid analyses. RecallIQ never asks for seed phrases or private keys.</p>
        <ConnectButton instance={dAppKit} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="size-2 rounded-full bg-success" aria-hidden />
        <span>{conn.wallet.name}</span>
        <ChainId value={conn.account.address} href={accountUrl(conn.account.address)} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Balance in the payment asset</p>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : balance ? (
          <>
            <p className="font-mono text-2xl font-semibold tabular-nums">{balance.display ?? `${balance.balanceAtomic} atomic`}</p>
            <p className="text-xs text-muted-foreground">via {balance.provider}</p>
          </>
        ) : (
          <Skeleton className="h-8 w-40" />
        )}
      </div>
    </div>
  );
}

export default function WalletPanelInner() {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <Panel />
    </DAppKitProvider>
  );
}
