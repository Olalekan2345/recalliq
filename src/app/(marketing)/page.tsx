import Link from "next/link";
import { ArrowRight, BrainCircuit, CircleDollarSign, Database, FileSearch, Fingerprint, Lock, Repeat2, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HealthBadge } from "@/components/shared/status";
import { BrandMark, Logo } from "@/components/shared/layout-bits";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { latestHealth } from "@/server/services/health";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LOOP = [
  { title: "Previous failure", body: "A claim in an investigation is contradicted when re-checked against fresh chain data." },
  { title: "Verified correction", body: "The autopsy pins the cause from evidence — e.g. an amount off by exactly 10⁹." },
  { title: "Walrus memory write", body: "A structured lesson is submitted to Walrus Memory on Mainnet." },
  { title: "Completed storage", body: "Marked stored only when the relayer reports done with a real blob ID." },
  { title: "Future session", body: "A new, unrelated investigation starts days later." },
  { title: "Memory retrieval", body: "Semantic recall surfaces the lesson; provenance is checked before use." },
  { title: "Changed decision", body: "The learned policy is enforced in code — not just suggested to the model." },
  { title: "Verified new outcome", body: "The new claims are verified independently; the effect is measured." },
];

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
    a: "Lessons are encrypted and stored on Walrus through RecallIQ's operator MemWal account, isolated per user by namespace and server-side authorisation. They are not cryptographically owned by your wallet — we say so plainly.",
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
  const health = await loadHealth();
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="RecallIQ home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            <a href="#how" className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline-block">
              How it works
            </a>
            <a href="#faq" className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:inline-block">
              FAQ
            </a>
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
          <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-glow blur-3xl" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-20 md:px-6 md:pb-24 md:pt-28 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="lg:order-2 lg:flex lg:justify-center" aria-hidden>
              <div className="relative">
                <div className="bg-brand-glow absolute -inset-10 rounded-full blur-2xl" />
                <BrandMark size={300} className="relative hidden h-auto w-[300px] lg:block" />
                <BrandMark size={96} className="relative h-auto w-20 lg:hidden" />
              </div>
            </div>
            <div className="lg:order-1">
              <Badge tone="primary" className="mb-6">
                <Sparkles aria-hidden /> Built on Walrus Memory · Tatum Sui gRPC · x402 on Sui
              </Badge>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
                AI that remembers its mistakes. <span className="brand-gradient-text">Intelligence that knows its worth.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                RecallIQ is an evidence-driven investigation agent for Sui. It checks every claim against live chain data, learns from the errors it can prove,
                carries those lessons across sessions on Walrus, and only pays for specialist analysis when the evidence says it is worth it.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/sign-up">
                    Start an investigation <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/sign-in?guest=1">Try as guest</Link>
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">No wallet needed for read-only investigations.</p>
            </div>
          </div>
        </section>

        <section className="border-y bg-card/50">
          <div className="mx-auto grid max-w-6xl gap-px overflow-hidden px-4 py-12 md:grid-cols-3 md:px-6">
            {[
              {
                icon: ShieldCheck,
                title: "Evidence, not vibes",
                body: "Each claim carries a machine-checkable assertion that is re-verified against fresh Tatum data. Verified, contradicted and unverified are shown separately.",
              },
              {
                icon: BrainCircuit,
                title: "Learns from proof",
                body: "When a claim is contradicted, the Agent Autopsy finds the cause from evidence and stores a lesson on Walrus — only after storage is confirmed.",
              },
              {
                icon: CircleDollarSign,
                title: "Knows what's worth paying for",
                body: "WorthIt weighs relevance, measured reliability, price and your budget. You approve every payment in your own wallet.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="p-4 md:p-6">
                <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-accent">
                  <Icon className="size-5 text-primary" aria-hidden />
                </div>
                <h2 className="text-base font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">The learning loop</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Every link is a real, inspectable record</h2>
            <p className="mt-3 text-muted-foreground">
              In the Learning Lab each stage below links to the actual run, verification result, Walrus job, blob ID and later investigation it came from. If a
              stage has not happened yet, it is shown as missing — never simulated.
            </p>
          </div>
          <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LOOP.map((s, i) => (
              <li key={s.title} className="relative rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-accent font-mono text-xs font-semibold text-accent-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <h3 className="text-sm font-semibold">{s.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y bg-card/50">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2 md:px-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-primary">How tools are chosen</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Free first. Paid only when it adds verified value.</h2>
              <ul className="mt-6 space-y-4 text-sm">
                {[
                  {
                    icon: Workflow,
                    t: "Relevance × measured reliability",
                    d: "Reliability is the Wilson lower bound of real outcomes, shown only with n ≥ 5. New tools say “insufficient data”.",
                  },
                  {
                    icon: Repeat2,
                    t: "Memory changes the plan",
                    d: "If a past paid analysis added nothing for this kind of task, it is not offered again until evidence says otherwise.",
                  },
                  {
                    icon: Lock,
                    t: "Spending is trusted code",
                    d: "Per-payment, per-investigation and 24h limits, recipient and asset allowlists, replay protection and on-chain settlement checks.",
                  },
                ].map(({ icon: Icon, t, d }) => (
                  <li key={t} className="flex gap-3">
                    <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <div>
                      <p className="font-medium">{t}</p>
                      <p className="text-muted-foreground">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-primary">Verification & portability</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Chain data is the source of truth</h2>
              <ul className="mt-6 space-y-4 text-sm">
                {[
                  {
                    icon: FileSearch,
                    t: "Tatum Sui gRPC on Mainnet",
                    d: "Transactions, balances, checkpoints, objects, packages and address history — every record kept as evidence with provenance.",
                  },
                  {
                    icon: Database,
                    t: "Walrus Memory",
                    d: "Lessons are encrypted, stored on Walrus Mainnet and recalled semantically across sessions and deployments.",
                  },
                  {
                    icon: Fingerprint,
                    t: "Honest about limits",
                    d: "Observations, verified facts, interpretations and hypotheses are labelled. No identity guesses, no intent accusations.",
                  },
                ].map(({ icon: Icon, t, d }) => (
                  <li key={t} className="flex gap-3">
                    <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <div>
                      <p className="font-medium">{t}</p>
                      <p className="text-muted-foreground">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6" aria-labelledby="status-heading">
          <h2 id="status-heading" className="text-lg font-semibold tracking-tight">
            Live integration status
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Recorded by the background worker from real health checks.</p>
          {health && health.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {health.map((h) => (
                <li key={h.integration} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{NAMES[h.integration] ?? h.integration}</span>
                    <HealthBadge status={h.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground" title={h.detail ?? ""}>
                    {h.detail}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">checked {relativeTime(h.checkedAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No health checks recorded yet on this deployment.</p>
          )}
        </section>

        <section id="faq" className="scroll-mt-20 border-t">
          <div className="mx-auto max-w-3xl px-4 py-20 md:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
            <div className="mt-6 divide-y rounded-lg border bg-card">
              {FAQ.map((f) => (
                <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {f.q}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <Logo className="text-foreground" />
          <p>Investigations use live Sui Mainnet data. Nothing here is financial advice.</p>
          <nav className="flex gap-4" aria-label="Footer">
            <a className="hover:text-foreground" href="https://docs.wal.app/walrus-memory/" target="_blank" rel="noreferrer">
              Walrus Memory
            </a>
            <a className="hover:text-foreground" href="https://docs.tatum.io/" target="_blank" rel="noreferrer">
              Tatum
            </a>
            <a className="hover:text-foreground" href="https://github.com/x402-foundation/x402" target="_blank" rel="noreferrer">
              x402
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
