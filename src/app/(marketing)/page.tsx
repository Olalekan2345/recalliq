import Link from "next/link";
import { HealthBadge } from "@/components/shared/status";
import { Logo } from "@/components/shared/layout-bits";
import { MotionProvider } from "@/components/motion/motion-provider";
import { SiteHeader } from "@/components/marketing/site-header";
import { Hero } from "@/components/marketing/hero";
import { Problem } from "@/components/marketing/problem";
import { InsideAgent } from "@/components/marketing/inside-agent";
import { MemoryUniverse } from "@/components/marketing/memory-universe";
import { Autopsy } from "@/components/marketing/autopsy";
import { WorthIt, type PublicTool } from "@/components/marketing/worthit";
import { PoweredBy } from "@/components/marketing/powered-by";
import { LearningScene } from "@/components/marketing/learning-scene";
import { FinalCta } from "@/components/marketing/final-cta";
import { ALL_TOOLS } from "@/lib/ai/tools/registry";
import { latestHealth } from "@/server/services/health";
import { loadPublicStats } from "@/server/services/public-stats";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FAQ = [
  {
    q: "What does RecallIQ actually investigate?",
    a: "Real Sui Mainnet activity: whether a transaction succeeded and why it failed, what moved in a transfer, what an address has been doing, which contracts were called, and how several transactions compare. Every fact comes from live Tatum gRPC data.",
  },
  {
    q: "Is the AI just remembering chat history?",
    a: "No. It stores evidence-backed lessons from verified mistakes and verified successes. A lesson only changes behaviour when it is recalled, passes provenance checks, and maps to an allowlisted policy the system enforces.",
  },
  {
    q: "Can it spend my money on its own?",
    a: "No. The agent can only propose a purchase. Trusted code checks your limits, then you approve the exact asset, amount, recipient and network in your own wallet. The settlement is verified on chain before the paid result is used.",
  },
  {
    q: "Who owns the memories?",
    a: "Lessons are encrypted and stored on Walrus through RecallIQ's operator MemWal account, isolated per user by namespace and server-side authorisation. They are not cryptographically owned by your wallet, and we say so plainly.",
  },
  {
    q: "Can I delete a memory?",
    a: "You can flag, supersede or retract any memory so it is never recalled again. Walrus storage is append-only, so the encrypted blob itself remains on the network.",
  },
  {
    q: "Do I need a wallet to try it?",
    a: "No. Read-only investigations work without a wallet or crypto. A wallet is only needed to approve an optional paid analysis.",
  },
];

const NAMES: Record<string, string> = { database: "Database", tatum: "Tatum Sui gRPC", walrus: "Walrus Memory", llm: "Language model", x402: "x402 payments" };

async function loadHealth() {
  try {
    return await latestHealth();
  } catch {
    return null;
  }
}

export default async function LandingPage() {
  const [health, stats] = await Promise.all([loadHealth(), loadPublicStats()]);
  const tools: PublicTool[] = ALL_TOOLS.map((t) => ({ id: t.id, name: t.name, summary: t.summary, provider: t.provider, paid: t.pricingType === "x402" }));

  return (
    <MotionProvider>
      <div className="relative min-h-dvh overflow-x-clip bg-[#050920]">
        <SiteHeader />
        <main>
          <Hero />
          <Problem />
          <InsideAgent />
          <MemoryUniverse />
          <Autopsy />
          <WorthIt tools={tools} />
          <PoweredBy />
          <LearningScene stats={stats} />

          <section id="faq" tabIndex={-1} className="scene-midnight scroll-mt-20 outline-none" aria-labelledby="faq-title">
            <div className="mx-auto grid max-w-6xl gap-14 px-4 py-28 md:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <h2 id="faq-title" className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                  Questions, answered plainly
                </h2>
                <div className="mt-8 divide-y divide-white/10 rounded-3xl border border-white/10 bg-white/[0.03]">
                  {FAQ.map((f) => (
                    <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff]">
                        {f.q}
                        <span
                          className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-on-dark-muted transition-transform group-open:rotate-45 motion-reduce:transition-none"
                          aria-hidden
                        >
                          +
                        </span>
                      </summary>
                      <p className="mt-3 text-sm leading-6 text-on-dark-muted">{f.a}</p>
                    </details>
                  ))}
                </div>
              </div>

              <div className="min-w-0" aria-labelledby="status-heading">
                <h2 id="status-heading" className="font-display text-xl font-semibold tracking-tight">
                  Live integration status
                </h2>
                <p className="mt-1 text-sm text-on-dark-muted">Recorded by the background worker from real health checks.</p>
                {health && health.length > 0 ? (
                  <ul className="mt-6 space-y-2">
                    {health.map((h) => (
                      <li key={h.integration} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{NAMES[h.integration] ?? h.integration}</span>
                          <HealthBadge status={h.status} />
                        </div>
                        <p className="mt-1 truncate text-xs text-on-dark-muted" title={h.detail ?? ""}>
                          {h.detail}
                        </p>
                        <p className="mt-1 text-xs text-on-dark-muted">checked {relativeTime(h.checkedAt)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-6 rounded-2xl border border-dashed border-white/15 p-4 text-sm text-on-dark-muted">
                    No health checks recorded yet on this deployment.
                  </p>
                )}
              </div>
            </div>
          </section>

          <FinalCta />
        </main>

        <footer className="scene-midnight border-t border-white/10">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))] md:px-6">
            <div>
              <Logo tone="light" />
              <p className="mt-4 max-w-sm text-sm leading-6 text-on-dark-muted">
                An evidence-driven investigation agent for Sui. Investigations use live Mainnet data. Nothing here is financial advice.
              </p>
            </div>
            <nav aria-label="Product">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-on-dark-muted">Product</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {[
                  ["/workspace", "Workspace"],
                  ["/memory", "Memory Vault"],
                  ["/learning", "Learning Lab"],
                  ["/sign-in?guest=1", "Try as guest"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link href={href!} className="text-on-dark hover:underline">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Built with">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-on-dark-muted">Built with</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {[
                  ["https://docs.wal.app/walrus-memory/", "Walrus Memory"],
                  ["https://docs.tatum.io/", "Tatum"],
                  ["https://github.com/x402-foundation/x402", "x402"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <a href={href} target="_blank" rel="noreferrer" className="text-on-dark hover:underline">
                      {label}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="border-t border-white/10">
            <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-on-dark-muted md:px-6">
              Built for the Walrus × Tatum Total Recall hackathon. Product names belong to their owners.
            </p>
          </div>
        </footer>
      </div>
    </MotionProvider>
  );
}
