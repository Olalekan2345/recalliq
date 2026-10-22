import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/shared/layout-bits";
import { RunStatusBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { relativeTime, titleCase } from "@/lib/utils";
import { listInvestigations } from "@/server/services/investigations";

export const metadata = { title: "Investigations" };
export const dynamic = "force-dynamic";

export default async function InvestigationsPage() {
  const user = await requireUser();
  const rows = await listInvestigations(user.id, { limit: 200 });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Investigations"
        description="Every investigation you have run, newest first."
        actions={
          <Button asChild>
            <Link href="/workspace">New investigation</Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="No investigations yet"
          action={
            <Button asChild>
              <Link href="/workspace">Start one</Link>
            </Button>
          }
        >
          Ask about any Sui transaction, wallet or contract.
        </EmptyState>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Investigation</TH>
                <TH className="hidden md:table-cell">Category</TH>
                <TH>Status</TH>
                <TH className="hidden sm:table-cell">Tool calls</TH>
                <TH className="text-right">Updated</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="max-w-md">
                    <Link
                      href={`/investigations/${r.id}`}
                      className="line-clamp-2 font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {r.title}
                    </Link>
                  </TD>
                  <TD className="hidden md:table-cell">{r.lastRun?.taskCategory ? <Badge tone="outline">{titleCase(r.lastRun.taskCategory)}</Badge> : "—"}</TD>
                  <TD>{r.lastStatus ? <RunStatusBadge status={r.lastStatus} /> : "—"}</TD>
                  <TD className="hidden font-mono tabular-nums sm:table-cell">{r.lastRun?.toolCallCount ?? 0}</TD>
                  <TD className="text-right text-xs text-muted-foreground">{relativeTime(r.updatedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
