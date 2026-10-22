"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/form-controls";

/** Filters live in the URL so views are shareable and survive refresh. */
export function MemoryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update("q", q);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor="mem-q" className="sr-only">
          Search memories
        </label>
        <Input id="mem-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lessons or blob IDs" className="pl-9" />
      </div>
      <label className="sr-only" htmlFor="mem-type">
        Memory type
      </label>
      <Select id="mem-type" value={params.get("type") ?? ""} onChange={(e) => update("type", e.target.value)} className="sm:w-44">
        <option value="">All types</option>
        {["failure", "success", "tool_reliability", "cost_efficiency", "strategy", "user_preference", "correction"].map((t) => (
          <option key={t} value={t}>
            {t.replace(/_/g, " ")}
          </option>
        ))}
      </Select>
      <label className="sr-only" htmlFor="mem-storage">
        Storage status
      </label>
      <Select id="mem-storage" value={params.get("storage") ?? ""} onChange={(e) => update("storage", e.target.value)} className="sm:w-44">
        <option value="">Any storage state</option>
        <option value="stored">Stored on Walrus</option>
        <option value="pending">Pending</option>
        <option value="queued">Queued</option>
        <option value="failed">Failed</option>
      </Select>
      <label className="sr-only" htmlFor="mem-status">
        Status
      </label>
      <Select id="mem-status" value={params.get("status") ?? ""} onChange={(e) => update("status", e.target.value)} className="sm:w-36">
        <option value="">Any status</option>
        <option value="active">Active</option>
        <option value="superseded">Superseded</option>
        <option value="flagged">Flagged</option>
        <option value="retracted">Retracted</option>
      </Select>
    </div>
  );
}
