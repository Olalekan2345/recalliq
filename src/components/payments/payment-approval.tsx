"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/misc";

/** Client-only: the wallet kit touches browser APIs. */
export const PaymentApproval = dynamic(() => import("./payment-approval-inner"), {
  ssr: false,
  loading: () => <Skeleton className="h-80 w-full rounded-lg" />,
});
