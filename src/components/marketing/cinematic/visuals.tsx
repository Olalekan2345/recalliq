"use client";

/**
 * Presentational pieces of the "Inside RecallIQ" film. Panels render the
 * app's own components with a real recorded run (recorded-run.ts); they are
 * decorative copies, so their containers are inert and forced to dark tokens.
 */
import Image from "next/image";
import { useSyncExternalStore } from "react";
import { ActivityFeed } from "@/components/agent/activity-feed";
import { RunProgress } from "@/components/agent/run-progress";
import { SafeText } from "@/components/agent/safe-text";
import { VerificationBadge } from "@/components/shared/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RECORDED_RUN, RECORDED_STEPS } from "./recorded-run";

const noop = () => () => {};
/** False during SSR and hydration, true afterwards. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export const RECORDED_LABEL = `Recorded run · ${RECORDED_RUN.meta.network} · ${new Date(RECORDED_RUN.meta.startedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export function GlassPanel({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      inert
      className={cn(
        "dark rounded-2xl border border-white/12 bg-[#0b112e]/90 p-4 text-left text-foreground shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9),0_0_44px_-14px_rgb(24_204_249/0.45)]",
        className,
      )}
    >
      {title && (
        <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7fe3ff]">
          <span className="size-1.5 rounded-full bg-[#5fe0ff] shadow-[0_0_8px_#5fe0ff]" />
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

/** A slice of the recorded agent activity, rendered by the app's ActivityFeed. */
export function StepsPanel({ from, to, title }: { from: number; to: number; title: string }) {
  const mounted = useMounted();
  return (
    <GlassPanel title={title}>
      {mounted ? (
        <div className="max-h-[300px] overflow-hidden">
          <ActivityFeed steps={RECORDED_STEPS.slice(from, to)} live={false} />
        </div>
      ) : (
        <div className="h-48" />
      )}
    </GlassPanel>
  );
}

/** WorthIt's real decision for the recorded run. */
export function PlanPanel({ limit }: { limit?: number }) {
  const plan = RECORDED_RUN.plan.slice(0, limit);
  return (
    <GlassPanel title="Tool selection · WorthIt">
      <ul className="space-y-1.5">
        {plan.map((t) => (
          <li key={t.toolId} className="flex items-center justify-between gap-3 text-sm">
            <span className={cn("truncate", !t.offered && "text-muted-foreground")}>{t.name}</span>
            {t.used ? <Badge tone="success">Called</Badge> : t.offered ? <Badge tone="info">Offered</Badge> : <Badge tone="neutral">Not offered</Badge>}
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}

export function PaidDecisionNote({ className, inline }: { className?: string; inline?: boolean }) {
  const Tag = inline ? "span" : "p";
  return (
    <Tag className={cn("text-xs leading-5 text-muted-foreground", className)}>
      Paid analysis held back: {RECORDED_RUN.paidDecision.reasons.map((r) => r.charAt(0).toLowerCase() + r.slice(1)).join("; ")}.
    </Tag>
  );
}

/** Claims and their independent verification, from the recorded run. */
export function ClaimsPanel() {
  return (
    <GlassPanel title="Claims & verification">
      <ul className="space-y-3">
        {RECORDED_RUN.verifications.map((v) => (
          <li key={v.ref} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{v.ref}</span>
              <VerificationBadge status={v.status} />
            </div>
            <p className="line-clamp-2 text-sm leading-5">{v.claim}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{v.detail}</p>
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}

/** Evidence records the agent fetched, with their source methods. */
export function EvidencePanel() {
  return (
    <GlassPanel title="Evidence · Tatum Sui gRPC">
      <ul className="space-y-2">
        {RECORDED_RUN.evidence.map((e) => (
          <li key={e.ref} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-[11px] text-accent-foreground">{e.ref}</span>
            <span className="min-w-0">
              <span className="block text-sm">{e.kind.replace(/_/g, " ")}</span>
              <span className="block truncate font-mono text-[11px] text-muted-foreground">{e.method}</span>
            </span>
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}

/** The agent's answer (opening lines) and its finished lifecycle. */
export function AnswerPanel() {
  return (
    <GlassPanel title="Agent result">
      <RunProgress status="COMPLETED" steps={RECORDED_STEPS} />
      <div className="mt-4 border-t border-white/10 pt-3">
        <SafeText text={RECORDED_RUN.answer} />
      </div>
    </GlassPanel>
  );
}

export function QuestionPanel() {
  return (
    <GlassPanel title="Request">
      <p className="text-sm leading-6">{RECORDED_RUN.meta.question}</p>
      <p className="mt-2 text-xs text-muted-foreground">Category: {RECORDED_RUN.meta.category} · Sui Mainnet</p>
    </GlassPanel>
  );
}

/** The real Workspace, captured from the app (public/cinematic/workspace.webp). */
export function WorkspaceScreen({ eager }: { eager?: boolean }) {
  return (
    <Image
      src="/cinematic/workspace.webp"
      alt="The RecallIQ Workspace with the question “What is the current checkpoint height on Sui Mainnet?” typed in"
      width={1440}
      height={900}
      sizes="(min-width: 1024px) 760px, 92vw"
      loading={eager ? "eager" : "lazy"}
      className="block h-full w-full object-cover"
    />
  );
}

/** The emblem as a hologram: projector beam, glow, scanlines, a faint flicker. */
export function HoloEmblem({ size = 220, beam = true, live = true }: { size?: number; beam?: boolean; live?: boolean }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {beam && <div className="cine-beam absolute left-1/2 top-[70%] h-[75%] w-[90%] -translate-x-1/2" aria-hidden />}
      <div
        className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgb(24_204_249/0.45),rgb(153_118_249/0.18)_60%,transparent)] blur-xl"
        aria-hidden
      />
      <div className={cn("relative size-full", live && "cine-flicker")}>
        <Image
          src="/brand/recalliq-mark.png"
          alt=""
          width={512}
          height={512}
          sizes={`${size}px`}
          className="size-full opacity-90 mix-blend-screen drop-shadow-[0_0_24px_rgb(24_204_249/0.8)]"
        />
        {/* Static scanlines: animating background-position would repaint every frame. */}
        <div className="cine-holo absolute inset-0 opacity-60 mix-blend-screen" aria-hidden />
      </div>
    </div>
  );
}

/** Concentric projector rings, drawn flat; the film lays them on the keyboard plane. */
export function HoloRings({ size = 640 }: { size?: number }) {
  return (
    <svg viewBox="0 0 640 640" width={size} height={size} aria-hidden>
      <defs>
        <radialGradient id="cine-ring-fill" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#18ccf9" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#3254e4" stopOpacity="0.08" />
          <stop offset="1" stopColor="#9976f9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="320" cy="320" r="300" fill="url(#cine-ring-fill)" />
      <circle cx="320" cy="320" r="110" fill="none" stroke="#5fe0ff" strokeOpacity="0.9" strokeWidth="2" />
      <circle cx="320" cy="320" r="170" fill="none" stroke="#7fe3ff" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 10" />
      <circle cx="320" cy="320" r="235" fill="none" stroke="#c4adff" strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="2 14" />
      <circle cx="320" cy="320" r="298" fill="none" stroke="#5fe0ff" strokeOpacity="0.25" strokeWidth="1" />
    </svg>
  );
}

export function Capsule({ label, type, color }: { label: string; type: string; color: string }) {
  return (
    <div className="w-max rounded-2xl border border-white/15 bg-[#0b112e]/85 px-3.5 py-2.5 shadow-[0_0_30px_-8px_rgb(24_204_249/0.6)]">
      <div className="flex items-center gap-2 text-sm font-medium text-on-dark">
        <span className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-on-dark-muted">type: {type}</div>
    </div>
  );
}

export function MonitorFrame({ children, width, height }: { children: React.ReactNode; width: number; height: number }) {
  return (
    <div className="relative" style={{ width, height }}>
      <div className="cine-screen absolute inset-0 overflow-hidden rounded-2xl border-[10px] border-[#0a0e26] bg-[#070b1f]">
        <div className="size-full p-5">{children}</div>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgb(255_255_255/0.07),transparent_35%)]" aria-hidden />
      </div>
      {/* stand */}
      <div className="absolute left-1/2 top-full h-20 w-14 -translate-x-1/2 bg-gradient-to-b from-[#141a40] to-[#0a0e26]" aria-hidden />
      <div
        className="absolute left-1/2 top-[calc(100%+76px)] h-3 w-56 -translate-x-1/2 rounded-full bg-[#0d1236] shadow-[0_10px_30px_rgb(24_204_249/0.25)]"
        aria-hidden
      />
    </div>
  );
}

export type ToolCardState = "called" | "offered" | "held";

export function ToolCard({ name, state, note }: { name: string; state: ToolCardState; note?: string }) {
  return (
    <div
      inert
      className={cn(
        "dark w-64 rounded-2xl border p-4 text-left",
        state === "called"
          ? "border-[#5fe0ff]/50 bg-[#0e1a44]/95 shadow-[0_0_50px_-10px_rgb(24_204_249/0.7)]"
          : state === "offered"
            ? "border-white/12 bg-[#0b112e]/90"
            : "border-white/10 bg-[#0b112e]/80",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-on-dark">{name}</span>
        {state === "called" ? (
          <Badge tone="success">Called</Badge>
        ) : state === "offered" ? (
          <Badge tone="info">Offered</Badge>
        ) : (
          <Badge tone="neutral">Held back</Badge>
        )}
      </div>
      {note && <p className="mt-2 text-xs leading-5 text-on-dark-muted">{note}</p>}
    </div>
  );
}
