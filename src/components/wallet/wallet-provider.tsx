"use client";

/**
 * Sui wallet connectivity (Wallet Standard via @mysten/dapp-kit-react).
 * The wallet only ever signs bytes the server built through Tatum; RecallIQ
 * never sees keys or seed phrases. The browser client below is used by the
 * wallet kit itself (public Sui fullnode); investigation data never uses it.
 */
import { createDAppKit, DAppKitProvider } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";

export const dAppKit = createDAppKit({
  networks: ["mainnet"],
  defaultNetwork: "mainnet",
  autoConnect: true,
  createClient: (network) => new SuiGrpcClient({ network, baseUrl: "https://fullnode.mainnet.sui.io:443" }),
});

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return <DAppKitProvider dAppKit={dAppKit}>{children}</DAppKitProvider>;
}
