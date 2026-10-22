"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/misc";

export const WalletPanel = dynamic(() => import("./wallet-panel-inner"), { ssr: false, loading: () => <Skeleton className="h-24 w-full" /> });
