"use client";

/**
 * Presentational pieces of the "Inside RecallIQ" film. Panels render the
 * app's own components with a real recorded run (recorded-run.ts); they are
 * decorative copies, so their containers are inert. They follow the page
 * theme: white glass in the light studio, smoked glass in dark mode.
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
        "rounded-2xl border border-scene-line bg-card/95 p-4 text-left text-card-foreground shadow-[0_30px_70px_-30px_rgb(16_28_68/0.4),0_0_44px_-18px_rgb(24_204_249/0.45)] dark:shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9),0_0_44px_-14px_rgb(24_204_249/0.45)]",
        className,
      )}
    >
      {title && (
        <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-scene-accent">
          <span className="size-1.5 rounded-full bg-brand-cyan shadow-[0_0_8px_var(--brand-cyan)]" />
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
            <p className="line-clamp-2 text-sm leading-5 wrap-anywhere">{v.claim}</p>
            <p className="font-mono text-[11px] text-muted-foreground wrap-anywhere">{v.detail}</p>
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
          <li key={e.ref} className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2">
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
      <div className="mt-4 border-t border-border pt-3">
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

const WORKSPACE_ALT = "The RecallIQ Workspace with the question “What is the current checkpoint height on Sui Mainnet?” typed in";

/**
 * The real Workspace, captured from the app in each theme
 * (public/cinematic/workspace-light.webp, workspace.webp). Only the visible
 * one loads: lazy images inside display:none are never fetched.
 */
export function WorkspaceScreen({ eager }: { eager?: boolean }) {
  const common = { width: 1440, height: 900, sizes: "(min-width: 1024px) 760px, 92vw", loading: eager ? "eager" : "lazy" } as const;
  return (
    <>
      <Image src="/cinematic/workspace-light.webp" alt={WORKSPACE_ALT} {...common} className="block h-full w-full object-cover dark:hidden" />
      <Image src="/cinematic/workspace.webp" alt={WORKSPACE_ALT} {...common} className="hidden h-full w-full object-cover dark:block" />
    </>
  );
}

/** The emblem as a hologram: projector beam, glow, scanlines, a faint flicker. */
export function HoloEmblem({ size = 220, beam = true, live = true }: { size?: number; beam?: boolean; live?: boolean }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {beam && <div className="cine-beam absolute left-1/2 top-[70%] h-[75%] w-[90%] -translate-x-1/2" aria-hidden />}
      <div
        className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgb(24_204_249/0.35),rgb(153_118_249/0.16)_60%,transparent)] blur-xl dark:bg-[radial-gradient(closest-side,rgb(24_204_249/0.45),rgb(153_118_249/0.18)_60%,transparent)]"
        aria-hidden
      />
      <div className={cn("relative size-full", live && "cine-flicker")}>
        <Image
          src="/brand/recalliq-mark.png"
          alt=""
          width={512}
          height={512}
          sizes={`${size}px`}
          className="size-full opacity-95 drop-shadow-[0_0_24px_rgb(24_204_249/0.6)] dark:opacity-90 dark:mix-blend-screen dark:drop-shadow-[0_0_24px_rgb(24_204_249/0.8)]"
        />
        {/* Static scanlines: animating background-position would repaint every frame. Screen blend only on the dark stage. */}
        <div className="cine-holo absolute inset-0 opacity-40 dark:opacity-60 dark:mix-blend-screen" aria-hidden />
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
      <circle cx="320" cy="320" r="110" fill="none" stroke="#18ccf9" strokeOpacity="0.9" strokeWidth="2" />
      <circle cx="320" cy="320" r="170" fill="none" stroke="#18ccf9" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="4 10" />
      <circle cx="320" cy="320" r="235" fill="none" stroke="#9976f9" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="2 14" />
      <circle cx="320" cy="320" r="298" fill="none" stroke="#18ccf9" strokeOpacity="0.3" strokeWidth="1" />
    </svg>
  );
}

export function Capsule({ label, type, color }: { label: string; type: string; color: string }) {
  return (
    <div className="w-max rounded-2xl border border-scene-line bg-card/90 px-3.5 py-2.5 shadow-[0_0_30px_-10px_rgb(24_204_249/0.6)]">
      <div className="flex items-center gap-2 text-sm font-medium text-scene-fg">
        <span className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-scene-muted">type: {type}</div>
    </div>
  );
}

export function MonitorFrame({ children, width, height }: { children: React.ReactNode; width: number; height: number }) {
  return (
    <div className="relative" style={{ width, height }}>
      <div className="cine-screen absolute inset-0 overflow-hidden rounded-2xl border-[10px] border-[#151a2e] bg-sec-soft dark:border-[#0a0e26] dark:bg-[#070b1f]">
        <div className="size-full p-5">{children}</div>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgb(255_255_255/0.07),transparent_35%)]" aria-hidden />
      </div>
      {/* stand */}
      <div className="cine-stand absolute left-1/2 top-full h-20 w-14 -translate-x-1/2" aria-hidden />
      <div
        className="absolute left-1/2 top-[calc(100%+76px)] h-3 w-56 -translate-x-1/2 rounded-full cine-stand shadow-[0_10px_30px_rgb(24_204_249/0.25)]"
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
        "w-64 rounded-2xl border p-4 text-left text-card-foreground",
        state === "called"
          ? "border-brand-cyan/60 bg-card shadow-[0_0_50px_-14px_rgb(24_204_249/0.7)]"
          : state === "offered"
            ? "border-border bg-card/95 shadow-[0_20px_40px_-24px_rgb(16_28_68/0.4)]"
            : "border-border bg-card/85",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{name}</span>
        {state === "called" ? (
          <Badge tone="success">Called</Badge>
        ) : state === "offered" ? (
          <Badge tone="info">Offered</Badge>
        ) : (
          <Badge tone="neutral">Held back</Badge>
        )}
      </div>
      {note && <p className="mt-2 text-xs leading-5 text-muted-foreground">{note}</p>}
    </div>
  );
}
