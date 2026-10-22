import Link from "next/link";
import { BrainCircuit, ShieldCheck, Wallet } from "lucide-react";
import { Logo } from "@/components/shared/layout-bits";
import { Mascot } from "@/components/brand/mascot";

const POINTS = [
  { icon: ShieldCheck, text: "Every claim re-checked against live Sui Mainnet data" },
  { icon: BrainCircuit, text: "Lessons from verified mistakes kept on Walrus Memory" },
  { icon: Wallet, text: "Nothing is ever paid without your wallet signature" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Brand panel (large screens): atmosphere and mascot, never in the way of the form. */}
      <aside
        className="scene-midnight relative isolate hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14"
        aria-label="About RecallIQ"
      >
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="aurora-drift absolute -left-1/4 -top-1/4 h-[70%] w-[80%] rounded-full bg-[radial-gradient(closest-side,rgb(24_204_249/0.3),transparent)] blur-2xl" />
          <div className="aurora-drift absolute -bottom-1/4 -right-1/4 h-[70%] w-[80%] rounded-full bg-[radial-gradient(closest-side,rgb(153_118_249/0.3),transparent)] blur-2xl" />
          <div className="bg-grid-dark absolute inset-0 opacity-60" />
        </div>
        <Link href="/" className="w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff]" aria-label="RecallIQ home">
          <Logo tone="light" />
        </Link>
        <div className="mx-auto w-full max-w-md">
          <figure className="float-slow ring-brand relative mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] shadow-[0_40px_120px_-40px_rgb(24_204_249/0.55)]">
            <Mascot variant="hoodie" eager sizes="384px" className="h-auto w-full" />
          </figure>
          <h2 className="mt-10 font-display text-3xl font-semibold leading-tight tracking-tight">
            AI that remembers. <span className="brand-gradient-text-light">Intelligence that evolves.</span>
          </h2>
          <ul className="mt-6 space-y-3 text-sm text-on-dark-muted">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="glass-dark flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-4 text-[#7fe3ff]" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-on-dark-muted">Investigations use live Sui Mainnet data. Nothing here is financial advice.</p>
      </aside>

      <div className="relative flex min-h-dvh flex-col">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <header className="relative flex h-16 items-center px-4 md:px-8 lg:hidden">
          <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="RecallIQ home">
            <Logo />
          </Link>
        </header>
        <main className="relative flex flex-1 items-start justify-center px-4 pb-16 pt-8 md:pt-16 lg:items-center lg:pt-0">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}
