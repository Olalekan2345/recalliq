"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {error.message?.includes("DATABASE_URL") ? "The database is not configured on this deployment." : "The page could not be loaded. Your data is safe."}
        {error.digest && <span className="mt-1 block font-mono text-xs">ref {error.digest}</span>}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
