import Link from "next/link";
import { CheckCircle2, CircleDollarSign, XCircle } from "lucide-react";
import { EmptyState, PageHeader, Section } from "@/components/shared/layout-bits";
import { PaymentStatusBadge } from "@/components/shared/status";
import { ChainId } from "@/components/shared/chain-id";
import { WalletPanel } from "@/components/payments/wallet-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { formatAtomic } from "@/lib/blockchain/sui/amounts";
import { chain } from "@/lib/blockchain/tatum/client";
import { txUrl } from "@/lib/blockchain/sui/explorer";
import { x402Config } from "@/lib/env";
import { formatDateTime } from "@/lib/utils";
import { listPayments, paymentTotals } from "@/server/services/payments-read";
import { getSettings } from "@/server/services/settings";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

function amount(atomic: string, decimals: number | null, symbol: string | null) {
  return decimals !== null ? `${formatAtomic(atomic, decimals)} ${symbol ?? ""}`.trim() : `${atomic} atomic`;
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      {ok ? <CheckCircle2 className="size-3.5 text-success" aria-hidden /> : <XCircle className="size-3.5 text-destructive" aria-hidden />}
      {label}
    </span>
  );
}

export default async function PaymentsPage() {
  const user = await requireUser();
  const [payments, totals, settings] = await Promise.all([listPayments(user.id), paymentTotals(user.id), getSettings(user.id)]);
  const cfg = x402Config();
  const byAsset = new Map<string, { settled: bigint; inFlight: bigint; decimals: number | null; symbol: string | null }>();
  for (const t of totals) {
    const e = byAsset.get(t.asset) ?? { settled: 0n, inFlight: 0n, decimals: t.decimals, symbol: t.symbol };
    if (t.status === "settled") e.settled += BigInt(t.total);
    if (t.status === "approved" || t.status === "settling" || t.status === "unknown") e.inFlight += BigInt(t.total);
    byAsset.set(t.asset, e);
  }
  const pending = payments.filter((p) => p.intent.status === "awaiting_approval");
  const limitMeta = await chain()
    .getCoinInfo(settings.limitAsset)
    .then((r) => ({ decimals: r.data.decimals, symbol: r.data.symbol }))
    .catch(() => ({ decimals: null as number | null, symbol: null as string | null }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="x402 on Sui"
        title="Payment Center"
        description="Every paid analysis the agent proposed, what you decided, and what actually settled on chain."
      />

      {user.isGuest && (
        <Alert tone="info" title="Guest sessions cannot make payments.">
          Create an account to approve paid analyses.
        </Alert>
      )}
      {!cfg.configured && (
        <Alert tone="info" title="Paid analysis is not configured on this deployment">
          The agent will only use free tools.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Wallet</CardTitle>
          </CardHeader>
          <CardContent>
            <WalletPanel />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spending</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {byAsset.size === 0 ? (
              <p className="text-muted-foreground">No spending yet.</p>
            ) : (
              [...byAsset.entries()].map(([asset, v]) => (
                <div key={asset} className="space-y-1">
                  <p className="font-mono text-xl font-semibold tabular-nums">{amount(v.settled.toString(), v.decimals, v.symbol)}</p>
                  <p className="text-xs text-muted-foreground">settled and verified on chain</p>
                  {v.inFlight > 0n && <p className="text-xs">+ {amount(v.inFlight.toString(), v.decimals, v.symbol)} authorized, not yet settled</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Paid tools: <Badge tone={settings.paidToolsEnabled ? "success" : "neutral"}>{settings.paidToolsEnabled ? "enabled" : "disabled"}</Badge>
            </p>
            <p className="text-muted-foreground">Approval: every payment requires your explicit signature.</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
              <dt>Per payment</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {settings.perPaymentLimitAtomic ? amount(settings.perPaymentLimitAtomic, limitMeta.decimals, limitMeta.symbol) : "platform cap only"}
              </dd>
              <dt>Per investigation</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {settings.perRunLimitAtomic ? amount(settings.perRunLimitAtomic, limitMeta.decimals, limitMeta.symbol) : "—"}
              </dd>
              <dt>Rolling 24h</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {settings.dailyLimitAtomic ? amount(settings.dailyLimitAtomic, limitMeta.decimals, limitMeta.symbol) : "—"}
              </dd>
            </dl>
            <p className="text-muted-foreground">
              Accepted asset: <span className="font-mono text-xs">{cfg.asset}</span> on {cfg.network}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings">Edit limits</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {pending.length > 0 && (
        <Section title="Waiting for your approval">
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.intent.id}>
                <Link
                  href={`/workspace/run/${p.intent.runId}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-card p-4 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-sm">{p.intent.reason}</span>
                  <span className="font-mono text-sm tabular-nums">{amount(p.intent.amountAtomic, p.intent.assetDecimals, p.intent.assetSymbol)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="History">
        {payments.length === 0 ? (
          <EmptyState icon={CircleDollarSign} title="No payments yet">
            When the agent proposes a paid analysis, the request and its on-chain settlement appear here.
          </EmptyState>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <THead>
                <TR>
                  <TH>Requested</TH>
                  <TH>Amount</TH>
                  <TH>Status</TH>
                  <TH>Transaction</TH>
                  <TH className="hidden lg:table-cell">On-chain checks</TH>
                  <TH className="text-right">Run</TH>
                </TR>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.intent.id}>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(p.intent.createdAt)}</TD>
                    <TD className="whitespace-nowrap font-mono tabular-nums">{amount(p.intent.amountAtomic, p.intent.assetDecimals, p.intent.assetSymbol)}</TD>
                    <TD>
                      <PaymentStatusBadge status={p.intent.status} />
                    </TD>
                    <TD>
                      {p.settlement?.digest || p.transactions[0]?.digest ? (
                        <ChainId
                          value={(p.settlement?.digest || p.transactions[0]?.digest)!}
                          href={txUrl((p.settlement?.digest || p.transactions[0]?.digest)!)}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TD>
                    <TD className="hidden lg:table-cell">
                      {p.settlement ? (
                        <div className="flex flex-wrap gap-2">
                          <Check ok={p.settlement.recipientVerified} label="recipient" />
                          <Check ok={p.settlement.assetVerified} label="asset" />
                          <Check ok={p.settlement.amountVerified} label="amount" />
                          <Check ok={p.settlement.executionSuccess === true} label="success" />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">not settled</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      {p.intent.runId && (
                        <Link href={`/workspace/run/${p.intent.runId}`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                          Open
                        </Link>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
