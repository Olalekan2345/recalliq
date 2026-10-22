"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/misc";

/** The official dApp Kit connect button (a web component) — client-only. */
export const WalletConnectButton = dynamic(
  async () => {
    const mod = await import("@mysten/dapp-kit-react/ui");
    const { dAppKit } = await import("./wallet-provider");
    function Btn() {
      return <mod.ConnectButton instance={dAppKit} />;
    }
    return Btn;
  },
  { ssr: false, loading: () => <Skeleton className="h-10 w-36" /> },
);
