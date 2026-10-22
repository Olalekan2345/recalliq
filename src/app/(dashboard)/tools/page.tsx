import Link from "next/link";
import { PageHeader } from "@/components/shared/layout-bits";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { formatDuration, titleCase } from "@/lib/utils";
import { listToolsWithStats, MIN_SAMPLE } from "@/server/services/tools";

export const metadata = { title: "Tool Intelligence" };
export const dynamic = "force-dynamic";

function pct(v: number | null) {
  return v === null ? null : `${Math.round(v * 100)}%`;
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-label={label}
    >
      <div className="bg-brand-gradient h-full rounded-full" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export default async function ToolsPage() {
  const user = await requireUser();
  const tools = await listToolsWithStats(user.id);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="WorthIt Intelligence"
        title="Tool Intelligence"
        description={`Registered tools and their measured performance from real production runs (last 90 days). Rates are Wilson 95% lower bounds and appear only with at least ${MIN_SAMPLE} observations.`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {tools.map((t) => {
          const s = t.stats;
          return (
            <Card key={t.id} className="flex flex-col">
              <CardHeader className="gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/tools/${t.id}`}
                      className="font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t.name}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{t.id}</p>
                  </div>
                  <Badge tone={t.availability.status === "available" ? "success" : t.availability.status === "degraded" ? "warning" : "neutral"}>
                    {t.availability.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{t.summary}</p>
                {t.availability.detail && <p className="text-xs font-medium text-warning">{t.availability.detail}</p>}
              </CardHeader>
              <CardContent className="mt-auto space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="outline">{t.provider}</Badge>
                  <Badge tone={t.pricingType === "x402" ? "warning" : "neutral"}>
                    {t.pricingType === "free" ? "Free" : t.priceDisplay ? `x402 · ${t.priceDisplay} per call` : "x402 · price not configured"}
                  </Badge>
                  {t.lessonCount > 0 && <Badge tone="primary">{t.lessonCount} lesson(s)</Badge>}
                </div>
                {s.sufficient ? (
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>Success (lower bound)</span>
                        <span className="font-mono tabular-nums">{pct(s.successRateLowerBound)}</span>
                      </div>
                      <Meter value={s.successRateLowerBound ?? 0} label="Success rate lower bound" />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>Cited by verified claims (lower bound)</span>
                        <span className="font-mono tabular-nums">{pct(s.usefulRateLowerBound)}</span>
                      </div>
                      <Meter value={s.usefulRateLowerBound ?? 0} label="Usefulness lower bound" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      n={s.sampleSize} · {s.failureCount} failed · {s.contradictedCount} contradicted · p50 {formatDuration(s.p50LatencyMs)} · p95{" "}
                      {formatDuration(s.p95LatencyMs)}
                    </p>
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Insufficient data to estimate reliability (n={s.sampleSize}
                    {s.sampleSize > 0 ? `, ${s.successCount} succeeded` : ""}).
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Relevant to: {t.categories.slice(0, 4).map(titleCase).join(", ")}
                  {t.categories.length > 4 ? "…" : ""}
                </p>
                {t.disclosure && <p className="text-xs text-muted-foreground">{t.disclosure}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
