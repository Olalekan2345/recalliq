import Link from "next/link";
import { History } from "lucide-react";
import { Composer } from "@/components/agent/composer";
import { EmptyState, PageHeader, Section } from "@/components/shared/layout-bits";
import { RunStatusBadge } from "@/components/shared/status";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { relativeTime, titleCase } from "@/lib/utils";
import { listInvestigations } from "@/server/services/investigations";
import { checkLlm, checkX402 } from "@/server/services/health";
import { memwalConfig, tatumConfig } from "@/lib/env";

export const metadata = { title: "Workspace" };
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await requireUser();
  const [investigations, llm] = await Promise.all([listInvestigations(user.id, { limit: 8 }), Promise.resolve(checkLlm())]);
  const tatum = tatumConfig();
  const memwal = memwalConfig();
  const x402 = checkX402();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Agent workspace"
        title="What should we investigate?"
        description="RecallIQ queries Sui Mainnet through Tatum, verifies every claim it can, and learns from the mistakes it can prove."
      />

      <div className="space-y-3">
        {llm.status !== "ok" && (
          <Alert tone="danger" title="The AI model is not configured on this deployment">
            Investigations cannot run until an LLM provider key is set ({llm.detail}). Nothing is simulated in the meantime.
          </Alert>
        )}
        {!tatum.configured && (
          <Alert tone="warning" title="Tatum is running without an API key">
            Chain queries use Tatum&apos;s keyless gateway, which rate-limits after a few calls. Set TATUM_API_KEY for reliable investigations.
          </Alert>
        )}
        {!memwal.configured && (
          <Alert tone="info" title="Walrus Memory is not configured">
            Investigations still run, but lessons cannot be stored on or recalled from Walrus until MEMWAL_KEY and MEMWAL_ACCOUNT_ID are set.
          </Alert>
        )}
        {x402.status !== "ok" && user.isGuest === false && (
          <Alert tone="info" title="Paid specialist analysis is unavailable">
            The x402 paid tool is not configured on this deployment, so the agent will use free tools only.
          </Alert>
        )}
      </div>

      <Composer
        disabled={llm.status !== "ok"}
        disabledReason={llm.status !== "ok" ? "Investigations are disabled until the AI model is configured." : undefined}
      />

      <Section
        title="Recent investigations"
        actions={
          investigations.length > 0 ? (
            <Link href="/investigations" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              View all
            </Link>
          ) : null
        }
      >
        {investigations.length === 0 ? (
          <EmptyState icon={History} title="No investigations yet">
            Your investigations, their evidence and any lessons learned will appear here.
          </EmptyState>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {investigations.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={inv.lastRunId ? `/workspace/run/${inv.lastRunId}` : `/investigations/${inv.id}`}
                  className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{inv.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {inv.lastRun?.taskCategory && <Badge tone="outline">{titleCase(inv.lastRun.taskCategory)}</Badge>}
                    {inv.lastStatus && <RunStatusBadge status={inv.lastStatus} />}
                    <span className="w-24 text-right text-xs text-muted-foreground">{relativeTime(inv.updatedAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
