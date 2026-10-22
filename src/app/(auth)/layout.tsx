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
      {/* Brand panel (large screens): the homepage's pastel light and the mascot, never in the way of the form. */}
      <aside
        className="relative isolate hidden overflow-hidden border-r border-scene-line bg-[linear-gradient(150deg,var(--sec-ice),var(--sec-lavender)_60%,var(--sec-aqua))] text-scene-fg lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14"
        aria-label="About RecallIQ"
      >
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="aurora-drift absolute -left-1/4 -top-1/4 h-[70%] w-[80%] rounded-full bg-[radial-gradient(closest-side,rgb(24_204_249/0.2),transparent)] blur-2xl" />
          <div className="aurora-drift absolute -bottom-1/4 -right-1/4 h-[70%] w-[80%] rounded-full bg-[radial-gradient(closest-side,rgb(119_84_238/0.16),transparent)] blur-2xl" />
          <div className="bg-grid-scene absolute inset-0 opacity-70" />
        </div>
        <Link href="/" className="w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="RecallIQ home">
          <Logo />
        </Link>
        <div className="mx-auto w-full max-w-md">
          <div className="relative mx-auto w-full max-w-[16rem]">
            <div className="gloss-iridescent absolute inset-[4%] -rotate-12 rounded-[2rem] opacity-70" aria-hidden />
            <figure className="float-slow relative overflow-hidden rounded-[2rem] border border-white/70 shadow-[0_34px_70px_-34px_rgb(16_28_68/0.55)]">
              <Mascot variant="hoodie" eager sizes="256px" className="h-auto w-full" />
            </figure>
          </div>
          <h2 className="mt-10 font-display text-3xl leading-tight tracking-[-0.03em]">
            <span className="font-light">Your AI</span> <span className="font-semibold">remembers.</span> <span className="font-light">Your</span>{" "}
            <span className="brand-gradient-text font-semibold">intelligence evolves.</span>
          </h2>
          <ul className="mt-6 space-y-3 text-sm text-scene-muted">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="bg-brand-gradient flex size-8 shrink-0 items-center justify-center rounded-lg shadow-[0_8px_18px_-8px_rgb(49_86_227/0.8)]">
                  <Icon className="size-4 text-white" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-scene-muted">Investigations use live Sui Mainnet data. Nothing here is financial advice.</p>
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
