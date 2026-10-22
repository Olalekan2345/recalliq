import { PageHeader } from "@/components/shared/layout-bits";
import { ChainId } from "@/components/shared/chain-id";
import { HealthBadge } from "@/components/shared/status";
import { SettingsForm } from "@/components/settings/settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { chain } from "@/lib/blockchain/tatum/client";
import { accountUrl } from "@/lib/blockchain/sui/explorer";
import { memwalConfig } from "@/lib/env";
import { userNamespace } from "@/lib/memory/namespaces";
import { formatDateTime } from "@/lib/utils";
import { runHealthChecks } from "@/server/services/health";
import { listWallets } from "@/server/services/payments-read";
import { getSettings } from "@/server/services/settings";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const NAMES: Record<string, string> = { database: "Database", tatum: "Tatum Sui gRPC", walrus: "Walrus Memory", llm: "Language model", x402: "x402 payments" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, wallets, health] = await Promise.all([getSettings(user.id), listWallets(user.id), runHealthChecks(false)]);
  const meta = await chain()
    .getCoinInfo(settings.limitAsset)
    .then((r) => ({ decimals: r.data.decimals, symbol: r.data.symbol }))
    .catch(() => ({ decimals: null as number | null, symbol: null as string | null }));
  const mem = memwalConfig();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Investigation behaviour, spending controls, wallets and the state of every integration." />
      {user.isGuest && (
        <Alert tone="info" title="Guest session">
          Create an account to change settings, keep memory and approve payments.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agent & spending</CardTitle>
              <CardDescription>Applied to new investigations.</CardDescription>
            </CardHeader>
            <CardContent>
              <SettingsForm
                initial={{
                  analysisDepth: settings.analysisDepth,
                  memoryEnabled: settings.memoryEnabled,
                  paidToolsEnabled: settings.paidToolsEnabled,
                  perPaymentLimitAtomic: settings.perPaymentLimitAtomic,
                  perRunLimitAtomic: settings.perRunLimitAtomic,
                  dailyLimitAtomic: settings.dailyLimitAtomic,
                }}
                decimals={meta.decimals}
                symbol={meta.symbol}
                disabled={user.isGuest}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Privacy & retention</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Investigations, evidence and payment records are stored in RecallIQ&apos;s PostgreSQL database and are visible only to your account.</p>
              <p>
                Lessons are encrypted and written to Walrus Mainnet through the operator&apos;s MemWal account in your private namespace. Walrus is append-only:
                retracting a memory stops it being recalled, but the encrypted blob stays on the network.
              </p>
              <p>Lessons never include keys, seed phrases or credentials — every write is checked and rejected if it looks like one.</p>
              <p>Wallet signatures authorize single payments only. RecallIQ never stores private keys.</p>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{user.isGuest ? "Guest" : user.name}</p>
              {!user.isGuest && <p className="text-muted-foreground">{user.email}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Wallets</CardTitle>
              <CardDescription>Addresses that signed a payment for this account.</CardDescription>
            </CardHeader>
            <CardContent>
              {wallets.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="space-y-1">
                  {wallets.map((w) => (
                    <li key={w.id} className="text-sm">
                      <ChainId value={w.address} href={accountUrl(w.address)} />
                      <p className="text-xs text-muted-foreground">verified {formatDateTime(w.verifiedAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Memory storage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{mem.configured ? `Walrus ${mem.network} via ${mem.serverUrl.replace("https://", "")}` : "Not configured"}</p>
              {mem.configured && !user.isGuest && (
                <p className="truncate font-mono text-xs text-muted-foreground">namespace {userNamespace(mem.namespacePrefix, user.id)}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
              <CardDescription>Checked live just now.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {health.map((h) => (
                  <li key={h.integration} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{NAMES[h.integration]}</span>
                      <HealthBadge status={h.status} />
                    </div>
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      {h.detail}
                      {h.latencyMs !== null ? ` · ${h.latencyMs} ms` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
