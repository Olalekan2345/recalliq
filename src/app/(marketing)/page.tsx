import Link from "next/link";
import { Suspense } from "react";
import { BackToTop } from "@/components/shared/back-to-top";
import { HealthBadge } from "@/components/shared/status";
import { Logo } from "@/components/shared/layout-bits";
import { MotionProvider } from "@/components/motion/motion-provider";
import { SiteHeader } from "@/components/marketing/site-header";
import { Hero } from "@/components/marketing/hero";
import { CinematicSection } from "@/components/marketing/cinematic/cinematic-section";
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
      <div className="relative min-h-dvh overflow-x-clip bg-background text-foreground">
        <SiteHeader />
        <main>
          <Hero />
          {/*
            Each below-the-fold scene is its own Suspense boundary: React hydrates the
            header and hero first and the rest in later tasks (clicks on a part not yet
            hydrated are replayed), so the page answers input sooner.
          */}
          <Suspense>
            <Problem />
          </Suspense>
          <Suspense>
            <CinematicSection />
          </Suspense>
          <Suspense>
            <InsideAgent />
          </Suspense>
          <Suspense>
            <MemoryUniverse />
          </Suspense>
          <Suspense>
            <Autopsy />
          </Suspense>
          <Suspense>
            <WorthIt tools={tools} />
          </Suspense>
          <Suspense>
            <PoweredBy />
          </Suspense>
          <Suspense>
            <LearningScene stats={stats} />
          </Suspense>

          <section
            id="faq"
            tabIndex={-1}
            className="scroll-mt-20 bg-[linear-gradient(180deg,var(--sec-white),var(--sec-frost)_14rem)] text-scene-fg outline-none"
            aria-labelledby="faq-title"
          >
            <div className="mx-auto grid max-w-6xl gap-14 px-4 py-28 md:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <h2 id="faq-title" className="font-display text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
                  Questions, answered plainly
                </h2>
                <div className="glass-scene mt-8 divide-y divide-scene-line rounded-3xl">
                  {FAQ.map((f) => (
                    <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {f.q}
                        <span
                          className="flex size-6 shrink-0 items-center justify-center rounded-full border border-scene-line text-scene-muted transition-transform group-open:rotate-45 motion-reduce:transition-none"
                          aria-hidden
                        >
                          +
                        </span>
                      </summary>
                      <p className="mt-3 text-sm leading-6 text-scene-muted">{f.a}</p>
                    </details>
                  ))}
                </div>
              </div>

              <div className="min-w-0" aria-labelledby="status-heading">
                <h2 id="status-heading" className="font-display text-xl font-semibold tracking-tight">
                  Live integration status
                </h2>
                <p className="mt-1 text-sm text-scene-muted">Recorded by the background worker from real health checks.</p>
                {health && health.length > 0 ? (
                  <ul className="mt-6 space-y-2">
                    {health.map((h) => (
                      <li key={h.integration} className="glass-scene rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{NAMES[h.integration] ?? h.integration}</span>
                          <HealthBadge status={h.status} />
                        </div>
                        <p className="mt-1 truncate text-xs text-scene-muted" title={h.detail ?? ""}>
                          {h.detail}
                        </p>
                        <p className="mt-1 text-xs text-scene-muted">checked {relativeTime(h.checkedAt)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-6 rounded-2xl border border-dashed border-scene-line p-4 text-sm text-scene-muted">
                    No health checks recorded yet on this deployment.
                  </p>
                )}
              </div>
            </div>
          </section>

          <FinalCta />
        </main>

        <footer className="border-t border-scene-line bg-sec-white text-scene-fg">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))] md:px-6">
            <div>
              <Logo />
              <p className="mt-4 max-w-sm text-sm leading-6 text-scene-muted">
                An evidence-driven investigation agent for Sui. Investigations use live Mainnet data. Nothing here is financial advice.
              </p>
            </div>
            <nav aria-label="Product">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-scene-muted">Product</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {[
                  ["/workspace", "Workspace"],
                  ["/memory", "Memory Vault"],
                  ["/learning", "Learning Lab"],
                  ["/sign-in?guest=1", "Try as guest"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link href={href!} className="text-scene-fg hover:text-scene-accent hover:underline">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Built with">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-scene-muted">Built with</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {[
                  ["https://docs.wal.app/walrus-memory/", "Walrus Memory"],
                  ["https://docs.tatum.io/", "Tatum"],
                  ["https://github.com/x402-foundation/x402", "x402"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <a href={href} target="_blank" rel="noreferrer" className="text-scene-fg hover:text-scene-accent hover:underline">
                      {label}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="border-t border-scene-line">
            <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-scene-muted md:px-6">
              Built for the Walrus × Tatum Total Recall hackathon. Product names belong to their owners.
            </p>
          </div>
        </footer>
        <BackToTop />
      </div>
    </MotionProvider>
  );
}
