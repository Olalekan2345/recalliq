"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn, truncateMiddle } from "@/lib/utils";

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
    >
      {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}

/** Monospace identifier with copy + optional explorer link (separate controls). */
export function ChainId({
  value,
  href,
  head = 6,
  tail = 4,
  full = false,
  className,
}: {
  value: string;
  href?: string | null;
  head?: number;
  tail?: number;
  full?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-0.5", className)}>
      <span className="truncate font-mono text-xs tabular-nums" title={value}>
        {full ? value : truncateMiddle(value, head, tail)}
      </span>
      <CopyButton value={value} label="Copy identifier" />
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open in explorer"
          title="Open in explorer"
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
    </span>
  );
}
