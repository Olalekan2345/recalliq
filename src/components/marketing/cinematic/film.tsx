"use client";

/**
 * Desktop film: a sticky stage whose CSS 3D camera is driven by scroll.
 * One world holds every object (laptop on a glass desk, floating panels, the
 * memory hologram, the monitor wall, tool cards, the emblem), so scenes flow
 * into each other physically. Native scrolling throughout; a guided "Play"
 * auto-advances only when asked and stops on any user input.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { m, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import { ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollLink } from "../scene";
import { CHAPTERS, FILM_VH, FINAL, MEMORY_STORY, type Beat } from "./chapters";
import { ConvergingParticles } from "./particles";
import { RECORDED_RUN } from "./recorded-run";
import {
  AnswerPanel,
  Capsule,
  ClaimsPanel,
  EvidencePanel,
  HoloEmblem,
  HoloRings,
  MonitorFrame,
  PaidDecisionNote,
  PlanPanel,
  QuestionPanel,
  RECORDED_LABEL,
  StepsPanel,
  ToolCard,
  WorkspaceScreen,
} from "./visuals";

type MV = MotionValue<number>;
type V3 = [number, number, number];

/** Keyframed value over film progress. */
function useKF(p: MV, frames: Array<[number, number]>): MV {
  return useTransform(
    p,
    frames.map((f) => f[0]),
    frames.map((f) => f[1]),
  );
}

/* Camera path: [progress, target x, y, z, tilt (rotateX), orbit (rotateY), dolly]. */
const CAMERA: Array<[number, number, number, number, number, number, number]> = [
  [0.0, -150, -230, -30, -15, 10, -950],
  [0.12, -130, -235, -30, -6, 3, 20],
  [0.155, -90, -260, -30, -6, 0, -80],
  [0.24, 0, -360, 0, -6, -10, -560],
  [0.32, 0, -330, 60, -10, 7, -600],
  [0.4, 0, -200, 330, -28, 0, -300],
  [0.47, 0, -235, 330, -14, 0, -440],
  [0.515, 0, -240, 120, -10, 0, -440],
  [0.575, 0, -350, -1250, -4, 0, -430],
  [0.63, 0, -350, -1300, -4, 6, -650],
  [0.69, 0, -350, -1300, -4, -6, -630],
  [0.745, 0, -360, -1320, 0, 0, -760],
  [0.84, 0, -360, -1320, 0, 0, -680],
  [0.93, 0, -300, -1340, 0, 0, -260],
  [1.0, 0, -300, -1340, 0, 0, -220],
];

const SCREEN_CENTER: V3 = [0, -237, -33];
/* Over the trackpad, well in front of the screen plane (planes that intersect clip each other). */
const HOLO: V3 = [0, -235, 330];
const EMBLEM: V3 = [0, -370, -1360];

const PANELS: Array<{ key: string; node: React.ReactNode; width: number; to: V3; ry: number; capsule: V3 }> = [
  { key: "question", node: <QuestionPanel />, width: 340, to: [-640, -580, 40], ry: 16, capsule: [-330, -95, 0] },
  { key: "plan", node: <PlanPanel limit={6} />, width: 330, to: [670, -620, 0], ry: -16, capsule: [330, -105, 0] },
  { key: "query", node: <StepsPanel from={6} to={13} title="Blockchain queries" />, width: 360, to: [-760, -390, 140], ry: 22, capsule: [-320, 125, 0] },
  { key: "claims", node: <ClaimsPanel />, width: 380, to: [740, -170, 150], ry: -22, capsule: [300, 115, 0] },
  { key: "answer", node: <AnswerPanel />, width: 430, to: [230, -860, -60], ry: -6, capsule: [0, -250, 0] },
];

const CAPSULES = [
  { label: "Lessons", type: "failure", color: "#ff8fab" },
  { label: "Corrections", type: "correction", color: "#5fe0ff" },
  { label: "Strategies", type: "strategy", color: "#7ef0c1" },
  { label: "Tool experience", type: "tool_reliability", color: "#8ea6ff" },
  { label: "Spending lessons", type: "cost_efficiency", color: "#c4adff" },
];

const TOOL_CARDS: Array<{ toolId: string; state: "called" | "offered" | "held"; pos: V3 }> = [
  { toolId: "network_status", state: "called", pos: [-470, -190, 0] },
  { toolId: "evidence_cross_checker", state: "called", pos: [470, -190, 0] },
  { toolId: "tatum_transaction_inspector", state: "offered", pos: [-560, 70, -40] },
  { toolId: "tatum_wallet_inspector", state: "offered", pos: [560, 70, -40] },
  { toolId: "balance_change_analyzer", state: "offered", pos: [-290, 235, -20] },
  { toolId: "paid_forensic_analyzer", state: "held", pos: [290, 235, -20] },
];

const toolName = (id: string) => RECORDED_RUN.plan.find((t) => t.toolId === id)?.name ?? id;

export function Film() {
  const filmRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: p } = useScroll({ target: filmRef, offset: ["start start", "end end"] });

  // Fit the 1440×900 composition to the stage.
  useEffect(() => {
    const fit = () => {
      const s = stageRef.current;
      const v = viewportRef.current;
      if (!s || !v) return;
      const k = Math.min(s.clientWidth / 1440, s.clientHeight / 900);
      v.style.scale = String(Math.max(0.68, Math.min(1.2, k)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Camera
  const stops = CAMERA.map((c) => c[0]);
  const tx = useTransform(
    p,
    stops,
    CAMERA.map((c) => -c[1]),
  );
  const ty = useTransform(
    p,
    stops,
    CAMERA.map((c) => -c[2]),
  );
  const tz = useTransform(
    p,
    stops,
    CAMERA.map((c) => -c[3]),
  );
  const tilt = useTransform(
    p,
    stops,
    CAMERA.map((c) => c[4]),
  );
  const orbit = useTransform(
    p,
    stops,
    CAMERA.map((c) => c[5]),
  );
  const dolly = useTransform(
    p,
    stops,
    CAMERA.map((c) => c[6]),
  );

  // Laptop + first desk leave as the camera flies to the workstation.
  const laptopFade = useKF(p, [
    [0, 1],
    [0.515, 1],
    [0.545, 0],
  ]);
  const stationFade = useKF(p, [
    [0.52, 0],
    [0.58, 1],
  ]);
  // The screen dims while the hologram has the stage.
  const screenFade = useKF(p, [
    [0, 1],
    [0.33, 1],
    [0.4, 0.3],
    [0.515, 0.3],
    [0.545, 0],
  ]);

  // Chapter state for the progress rail and controls.
  const [chapter, setChapter] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  useMotionValueEvent(p, "change", (v) => {
    const i = CHAPTERS.findIndex((c) => v >= c.range[0] && v < c.range[1]);
    const next = i === -1 ? CHAPTERS.length - 1 : i;
    setChapter((c) => (c === next ? c : next));
    setAtEnd((e) => (e === v > 0.97 ? e : v > 0.97));
  });

  const filmTop = () => (filmRef.current ? filmRef.current.getBoundingClientRect().top + window.scrollY : 0);
  const filmDistance = () => (filmRef.current ? filmRef.current.offsetHeight - window.innerHeight : 0);
  const goTo = (fraction: number) => window.scrollTo({ top: filmTop() + filmDistance() * fraction, behavior: "smooth" });

  // Guided play: advances the page scroll at film speed; any user input stops it.
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    setPlaying(false);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const cancel = () => stop();
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, [playing, stop]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const play = () => {
    const top = filmTop();
    const dist = filmDistance();
    let from = window.scrollY;
    if (p.get() > 0.97 || from < top || from > top + dist) from = top;
    const total = 24_000 * (1 - (from - top) / dist);
    const t0 = performance.now();
    setPlaying(true);
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / Math.max(1, total));
      window.scrollTo(0, from + (top + dist - from) * k);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else stop();
    };
    raf.current = requestAnimationFrame(step);
  };

  return (
    <div ref={filmRef} data-film="" className="relative" style={{ height: `${FILM_VH}vh` }}>
      <div ref={stageRef} className="sticky top-0 h-screen overflow-hidden bg-[#04081c]">
        <Backdrop p={p} orbit={orbit} />
        <LightLines p={p} />

        {/* 3D viewport */}
        <div ref={viewportRef} className="absolute inset-0 [perspective-origin:50%_44%] [perspective:1400px]" aria-hidden>
          <m.div className="preserve-3d absolute left-1/2 top-1/2" style={{ z: dolly, rotateX: tilt, rotateY: orbit }}>
            <m.div className="preserve-3d absolute left-0 top-0" style={{ x: tx, y: ty, z: tz }}>
              <Desk at={[0, 3, -350]} width={3200} depth={2600} fade={laptopFade} />
              <Desk at={[0, 3, -1500]} width={4200} depth={1600} fade={stationFade} />
              <Laptop fade={laptopFade} screen={screenFade} />
              {PANELS.map((panel, i) => (
                <FloatingPanel key={panel.key} p={p} index={i} panel={panel} />
              ))}
              <Hologram p={p} live={chapter === 2} />
              <Workstation p={p} />
              <ToolStage p={p} live={chapter >= 4} />
            </m.div>
          </m.div>
        </div>

        <ConvergingParticles progress={p} from={0.33} to={0.5} />

        {/* Scrim keeps the overlay copy readable over the scene */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[46%] bg-gradient-to-r from-[#04081c]/85 via-[#04081c]/40 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#04081c]/80 to-transparent" aria-hidden />

        <Copy p={p} />
        <Captions p={p} />
        <MemoryStory p={p} />
        <FinalCard p={p} onFocusCta={() => goTo(1)} />

        {/* Chapter rail */}
        <nav className="absolute right-6 top-1/2 -translate-y-1/2" aria-label="Film chapters">
          <ol className="space-y-3">
            {CHAPTERS.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => goTo(c.range[0] + 0.012)}
                  aria-current={chapter === i ? "step" : undefined}
                  className="group flex items-center justify-end gap-3 rounded-md px-1 py-0.5 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff]"
                >
                  <span
                    className={cn(
                      "text-[11px] font-medium uppercase tracking-[0.16em] transition-opacity",
                      chapter === i ? "text-on-dark opacity-100" : "text-on-dark-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                    )}
                  >
                    {c.label}
                  </span>
                  <span
                    className={cn(
                      "block rounded-full transition-all",
                      chapter === i ? "bg-brand-gradient h-6 w-1.5" : i < chapter ? "size-1.5 bg-[#7fe3ff]/70" : "size-1.5 bg-white/25",
                    )}
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {/* Controls */}
        <div className="absolute bottom-6 right-6 flex items-center gap-2">
          <button
            type="button"
            onClick={playing ? stop : play}
            className="glass-dark inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-medium text-on-dark transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff]"
          >
            {playing ? (
              <Pause className="size-3.5" aria-hidden />
            ) : atEnd ? (
              <RotateCcw className="size-3.5" aria-hidden />
            ) : (
              <Play className="size-3.5" aria-hidden />
            )}
            {playing ? "Pause" : atEnd ? "Replay film" : "Play film"}
          </button>
          <ScrollLink
            to="after-film"
            className="inline-flex h-9 items-center rounded-full px-3 text-xs font-medium text-on-dark-muted underline-offset-4 hover:text-on-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff]"
          >
            Skip film
          </ScrollLink>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Environment ───────────────────────── */

const BOKEH = [
  [6, 18, 90, "#18ccf9", 0.35],
  [14, 62, 60, "#d65cff", 0.22],
  [24, 30, 40, "#5fe0ff", 0.4],
  [33, 12, 70, "#3254e4", 0.35],
  [46, 22, 34, "#c4adff", 0.35],
  [58, 10, 80, "#18ccf9", 0.25],
  [66, 34, 46, "#d65cff", 0.2],
  [74, 16, 60, "#7b9cff", 0.32],
  [84, 40, 90, "#9976f9", 0.3],
  [92, 20, 50, "#5fe0ff", 0.35],
  [96, 58, 70, "#3254e4", 0.3],
  [40, 48, 30, "#5fe0ff", 0.25],
] as const;

function Backdrop({ p, orbit }: { p: MV; orbit: MV }) {
  const drift = useTransform(orbit, (v) => v * -9);
  const office = useKF(p, [
    [0, 1],
    [0.32, 1],
    [0.4, 0.45],
    [0.6, 0.6],
  ]);
  const memory = useKF(p, [
    [0.33, 0],
    [0.42, 1],
    [0.52, 1],
    [0.58, 0],
  ]);
  const station = useKF(p, [
    [0.53, 0],
    [0.6, 1],
    [0.7, 1],
    [0.76, 0.3],
  ]);
  const lavender = useKF(p, [
    [0.69, 0],
    [0.76, 1],
    [0.86, 0.7],
  ]);
  const reveal = useKF(p, [
    [0.84, 0],
    [0.94, 1],
  ]);
  return (
    <div className="absolute inset-0" aria-hidden>
      <m.div style={{ x: drift }} className="absolute -inset-x-24 inset-y-0">
        {BOKEH.map(([x, y, s, c, o], i) => (
          <span
            key={i}
            className="absolute rounded-full blur-[6px]"
            style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, background: `radial-gradient(circle, ${c}, transparent 70%)`, opacity: o }}
          />
        ))}
      </m.div>
      <m.div style={{ opacity: office }} className="absolute inset-0">
        <div className="absolute -left-[10%] top-[10%] h-[70%] w-[50%] rounded-full bg-[radial-gradient(closest-side,rgb(24_204_249/0.28),transparent)] blur-2xl" />
        <div className="absolute -right-[8%] top-[0%] h-[60%] w-[40%] rounded-full bg-[radial-gradient(closest-side,rgb(214_92_255/0.18),transparent)] blur-2xl" />
      </m.div>
      <m.div style={{ opacity: memory }} className="absolute inset-0">
        <div className="absolute left-1/2 top-[44%] h-[90%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(24_204_249/0.32),rgb(153_118_249/0.16)_55%,transparent)] blur-2xl" />
      </m.div>
      <m.div style={{ opacity: station }} className="absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(ellipse_60%_70%_at_50%_0%,rgb(50_84_228/0.35),transparent)]" />
      </m.div>
      <m.div style={{ opacity: lavender }} className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_45%,rgb(196_173_255/0.22),rgb(95_224_255/0.08)_55%,transparent)]" />
      </m.div>
      <m.div style={{ opacity: reveal }} className="absolute inset-0">
        <div className="absolute left-1/2 top-[40%] h-[80%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(95_224_255/0.35),rgb(50_84_228/0.18)_50%,transparent)] blur-2xl" />
      </m.div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(2_4_14/0.7))]" />
    </div>
  );
}

/** The memory hologram dissolving into lines of light the camera flies through. */
function LightLines({ p }: { p: MV }) {
  const opacity = useKF(p, [
    [0.5, 0],
    [0.535, 1],
    [0.57, 0],
  ]);
  const scale = useKF(p, [
    [0.5, 0.25],
    [0.575, 2.6],
  ]);
  return (
    <m.svg style={{ opacity, scale }} viewBox="-500 -300 1000 600" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2;
        // Rounded: Math.cos differs in the last digits between Node and browsers (hydration).
        const r = (v: number) => Math.round(v * 10) / 10;
        return (
          <line
            key={i}
            x1={r(Math.cos(a) * 40)}
            y1={r(Math.sin(a) * 26)}
            x2={r(Math.cos(a) * 520)}
            y2={r(Math.sin(a) * 340)}
            stroke={i % 3 === 0 ? "#c4adff" : "#5fe0ff"}
            strokeOpacity={0.55}
            strokeWidth={1.2}
          />
        );
      })}
    </m.svg>
  );
}

function Desk({ at, width, depth, fade }: { at: V3; width: number; depth: number; fade: MV }) {
  return (
    <m.div
      className="cine-desk absolute rounded-[40px]"
      style={{ width, height: depth, left: -width / 2, top: -depth / 2, x: at[0], y: at[1], z: at[2], rotateX: 90, opacity: fade }}
    />
  );
}

/* ───────────────────────── Laptop ───────────────────────── */

function Laptop({ fade, screen }: { fade: MV; screen: MV }) {
  const reflection = useTransform(screen, (v) => v * 0.22);
  return (
    <div className="preserve-3d absolute left-0 top-0">
      {/* Screen: stands on the hinge, tilted back */}
      <m.div className="absolute" style={{ width: 760, height: 475, left: -380, top: -475, originY: 1, rotateX: 8, opacity: screen }}>
        <div className="cine-screen size-full overflow-hidden rounded-[18px] border-[9px] border-[#0b0f26] bg-[#070b1f]">
          <WorkspaceScreen />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgb(255_255_255/0.08),transparent_40%)]" />
        </div>
      </m.div>
      {/* Reflection on the glass desk */}
      <m.div
        className="absolute overflow-hidden rounded-[18px] [mask-image:linear-gradient(to_bottom,black,transparent_65%)]"
        style={{ width: 760, height: 475, left: -380, top: 6, originY: 0, rotateX: -8, opacity: reflection }}
      >
        <div className="size-full -scale-y-100">
          <WorkspaceScreen />
        </div>
      </m.div>
      {/* Deck with keyboard and trackpad, lying flat toward the viewer */}
      <m.div
        className="absolute rounded-b-[28px] rounded-t-md border border-white/10 bg-gradient-to-b from-[#1a2052] to-[#0c1030]"
        style={{ width: 820, height: 520, left: -410, top: 0, originY: 0, rotateX: 90, opacity: fade }}
      >
        <div className="cine-keys absolute inset-x-12 top-10 h-[200px] rounded-lg" />
        <div className="absolute left-1/2 top-[270px] h-[170px] w-[300px] -translate-x-1/2 rounded-xl border border-white/10 bg-[#12184a]" />
      </m.div>
    </div>
  );
}

/* ───────────────────────── Chapter 2: panels leave the screen ───────────────────────── */

function FloatingPanel({ p, index, panel }: { p: MV; index: number; panel: (typeof PANELS)[number] }) {
  const d = index * 0.012;
  const pos = (axis: 0 | 1 | 2): Array<[number, number]> => {
    const capsule = [HOLO[0] + panel.capsule[0], HOLO[1] + panel.capsule[1], HOLO[2] + panel.capsule[2]][axis]!;
    return [
      [0.16 + d, SCREEN_CENTER[axis]],
      [0.215 + d, panel.to[axis]],
      [0.32, panel.to[axis]],
      [0.385, capsule],
    ];
  };
  const x = useKF(p, pos(0));
  const y = useKF(p, pos(1));
  const z = useKF(p, pos(2));
  const rotateY = useKF(p, [
    [0.16 + d, 0],
    [0.215 + d, panel.ry],
    [0.32, panel.ry],
    [0.385, 0],
  ]);
  const scale = useKF(p, [
    [0.16 + d, 0.25],
    [0.215 + d, 1],
    [0.32, 1],
    [0.385, 0.3],
  ]);
  const opacity = useKF(p, [
    [0.16 + d, 0],
    [0.19 + d, 1],
    [0.36, 1],
    [0.385, 0],
  ]);
  return (
    <m.div className="absolute" style={{ width: panel.width, left: -panel.width / 2, top: -120, x, y, z, rotateY, scale, opacity }}>
      {panel.node}
    </m.div>
  );
}

/* ───────────────────────── Chapter 3: Walrus Memory hologram ───────────────────────── */

function Hologram({ p, live }: { p: MV; live: boolean }) {
  const rings = useKF(p, [
    [0.35, 0],
    [0.4, 1],
    [0.5, 1],
    [0.535, 0],
  ]);
  const rise = useKF(p, [
    [0.37, 130],
    [0.44, 0],
  ]);
  const emblem = useKF(p, [
    [0.37, 0],
    [0.43, 1],
    [0.505, 1],
    [0.535, 0],
  ]);
  const emblemScale = useKF(p, [
    [0.37, 0.45],
    [0.44, 1],
  ]);
  const capsules = useKF(p, [
    [0.37, 0],
    [0.405, 1],
    [0.5, 1],
    [0.53, 0],
  ]);
  const links = useKF(p, [
    [0.4, 0],
    [0.46, 1],
  ]);
  return (
    <>
      {/* Projector rings lying on the trackpad */}
      <m.div className="absolute" style={{ left: -230, top: -230, x: HOLO[0], y: -4, z: HOLO[2], rotateX: 90, opacity: rings }}>
        <div className={live ? "cine-orbit" : undefined}>
          <HoloRings size={460} />
        </div>
      </m.div>
      {/*
        Upright plane above the projector, facing the viewer. It has an explicit
        box with every child at positive coordinates: with mix-blend-mode inside a
        3D transform, Chrome clips an isolated group's negative overflow.
      */}
      <m.div className="absolute" style={{ width: 760, height: 640, left: -380, top: -320, x: HOLO[0], y: HOLO[1], z: HOLO[2] }}>
        <svg className="absolute left-0 top-0 overflow-visible" width="760" height="640" viewBox="-380 -320 760 640" aria-hidden>
          <defs>
            <linearGradient id="cine-link" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5fe0ff" />
              <stop offset="1" stopColor="#c4adff" />
            </linearGradient>
          </defs>
          {PANELS.map((panel) => (
            <m.path
              key={panel.key}
              d={`M ${panel.capsule[0]} ${panel.capsule[1]} Q ${panel.capsule[0] * 0.4} ${panel.capsule[1] * 0.4 - 60} 0 0`}
              fill="none"
              stroke="url(#cine-link)"
              strokeWidth={1.5}
              style={{ pathLength: links, opacity: capsules }}
            />
          ))}
        </svg>
        <m.div className="absolute left-[250px] top-[190px]" style={{ y: rise, scale: emblemScale, opacity: emblem }}>
          <HoloEmblem size={260} live={live} />
        </m.div>
        {CAPSULES.map((c, i) => (
          <m.div
            key={c.type}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: 380 + PANELS[i]!.capsule[0], top: 320 + PANELS[i]!.capsule[1], opacity: capsules }}
          >
            <Capsule label={c.label} type={c.type} color={c.color} />
          </m.div>
        ))}
      </m.div>
    </>
  );
}

/** The memory chapter's concept steps, as a readable 2D list beside the scene. */
function MemoryStory({ p }: { p: MV }) {
  return (
    <ol className="pointer-events-none absolute bottom-[18%] right-[8%] space-y-2" aria-hidden>
      {MEMORY_STORY.map((s, i) => (
        <StoryChip key={s} p={p} at={[0.42 + i * 0.02, 0.432 + i * 0.02]} end={0.505} index={i} text={s} />
      ))}
    </ol>
  );
}

function StoryChip({ p, at, end, index, text }: { p: MV; at: readonly [number, number]; end: number; index: number; text: string }) {
  const opacity = useKF(p, [
    [at[0], 0],
    [at[1], 1],
    [end, 1],
    [end + 0.02, 0],
  ]);
  return (
    <m.li style={{ opacity }} className="flex items-center gap-2 rounded-full border border-white/15 bg-[#0b112e]/85 px-3 py-1.5 text-xs text-on-dark">
      <span className="bg-brand-gradient flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-white">{index + 1}</span>
      {text}
    </m.li>
  );
}

/* ───────────────────────── Chapter 4: verification workstation ───────────────────────── */

const MONITORS: Array<{ key: string; pos: V3; ry: number; w: number; h: number; node: React.ReactNode }> = [
  { key: "steps", pos: [-680, -380, -1230], ry: 24, w: 560, h: 420, node: <StepsPanel from={4} to={16} title="Agent execution" /> },
  { key: "claims", pos: [0, -400, -1420], ry: 0, w: 760, h: 460, node: <ClaimsPanel /> },
  { key: "evidence", pos: [680, -380, -1230], ry: -24, w: 560, h: 420, node: <EvidencePanel /> },
];

/* Evidence traces lying on the desk between the monitor feet (desk plane coordinates). */
const TRACE_Z = -1300;

function Monitor({ mon, on, rise }: { mon: (typeof MONITORS)[number]; on: MV; rise: MV }) {
  const y = useTransform(rise, (r) => mon.pos[1] + r);
  return (
    <m.div className="absolute" style={{ left: -mon.w / 2, top: -mon.h / 2, x: mon.pos[0], y, z: mon.pos[2], rotateY: mon.ry, opacity: on }}>
      <MonitorFrame width={mon.w} height={mon.h}>
        {mon.node}
      </MonitorFrame>
    </m.div>
  );
}

function Workstation({ p }: { p: MV }) {
  const on = useKF(p, [
    [0.555, 0],
    [0.6, 1],
    [0.69, 1],
    [0.725, 0],
  ]);
  const rise = useKF(p, [
    [0.555, 60],
    [0.6, 0],
  ]);
  const link = useKF(p, [
    [0.6, 0],
    [0.65, 1],
  ]);
  return (
    <>
      {MONITORS.map((mon) => (
        <Monitor key={mon.key} mon={mon} on={on} rise={rise} />
      ))}
      {/* Flat on the desk: local y = z - TRACE_Z + 300 (rotateX 90 around the centre). */}
      <m.svg
        className="absolute overflow-visible drop-shadow-[0_0_6px_rgb(95_224_255/0.9)]"
        style={{ left: -900, top: -300, y: -3, z: TRACE_Z, rotateX: 90, opacity: on }}
        width={1800}
        height={600}
        viewBox="0 0 1800 600"
        aria-hidden
      >
        <m.path d="M 220 370 C 480 370, 620 180, 900 180" fill="none" stroke="#5fe0ff" strokeWidth={3} style={{ pathLength: link }} />
        <m.path d="M 1580 370 C 1320 370, 1180 180, 900 180" fill="none" stroke="#c4adff" strokeWidth={3} style={{ pathLength: link }} />
        <m.circle cx={900} cy={180} r={7} fill="#5fe0ff" style={{ opacity: link }} />
      </m.svg>
    </>
  );
}

/* ───────────────────────── Chapters 5–6: WorthIt cards, then the emblem ───────────────────────── */

function ToolStage({ p, live }: { p: MV; live: boolean }) {
  const emblemOn = useKF(p, [
    [0.7, 0],
    [0.745, 1],
  ]);
  const emblemScale = useKF(p, [
    [0.7, 0.7],
    [0.84, 0.85],
    [0.93, 1.4],
  ]);
  const rings = useKF(p, [
    [0.84, 0],
    [0.9, 1],
  ]);
  const consent = useKF(p, [
    [0.79, 0],
    [0.805, 1],
    [0.84, 1],
    [0.855, 0],
  ]);
  return (
    <>
      <m.div className="absolute" style={{ left: -380, top: -380, x: EMBLEM[0], y: EMBLEM[1], z: EMBLEM[2] - 60, opacity: rings }}>
        <div className={live ? "cine-orbit-reverse" : undefined}>
          <HoloRings size={760} />
        </div>
      </m.div>
      <m.div className="absolute" style={{ left: -130, top: -130, x: EMBLEM[0], y: EMBLEM[1], z: EMBLEM[2], scale: emblemScale, opacity: emblemOn }}>
        <div className={live ? "float-slow" : undefined}>
          <HoloEmblem size={260} beam={false} live={live} />
        </div>
      </m.div>
      {TOOL_CARDS.map((card, i) => (
        <ToolCardIn3D key={card.toolId} p={p} index={i} card={card} />
      ))}
      <m.div className="absolute w-72" style={{ left: -144, top: -40, x: EMBLEM[0] + 600, y: EMBLEM[1] + 250, z: EMBLEM[2] + 60, opacity: consent }}>
        <div className="dark rounded-2xl border border-[#ffd166]/40 bg-[#1a1530]/95 p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#ffd166]">Concept · approval</p>
          <p className="mt-1.5 text-sm text-on-dark">When a paid analysis is worth it, you approve the exact payment in your own wallet.</p>
          <p className="mt-1.5 text-xs text-on-dark-muted">Nothing is paid in this film.</p>
        </div>
      </m.div>
    </>
  );
}

function ToolCardIn3D({ p, index, card }: { p: MV; index: number; card: (typeof TOOL_CARDS)[number] }) {
  const d = index * 0.006;
  const focusZ = card.state === "called" ? 150 : card.state === "offered" ? -120 : -260;
  const focusOpacity = card.state === "called" ? 1 : card.state === "offered" ? 0.6 : 0.45;
  const x = useKF(p, [
    [0.7 + d, EMBLEM[0]],
    [0.745 + d, EMBLEM[0] + card.pos[0]],
    [0.845, EMBLEM[0] + card.pos[0]],
    [0.885, EMBLEM[0]],
  ]);
  const y = useKF(p, [
    [0.7 + d, EMBLEM[1]],
    [0.745 + d, EMBLEM[1] + card.pos[1]],
    [0.845, EMBLEM[1] + card.pos[1]],
    [0.885, EMBLEM[1]],
  ]);
  const z = useKF(p, [
    [0.7 + d, EMBLEM[2]],
    [0.745 + d, EMBLEM[2] + card.pos[2]],
    [0.76, EMBLEM[2] + card.pos[2]],
    [0.79, EMBLEM[2] + card.pos[2] + focusZ],
    [0.845, EMBLEM[2] + card.pos[2] + focusZ],
    [0.885, EMBLEM[2]],
  ]);
  const opacity = useKF(p, [
    [0.7 + d, 0],
    [0.73 + d, 1],
    [0.76, 1],
    [0.79, focusOpacity],
    [0.85, focusOpacity],
    [0.885, 0],
  ]);
  const scale = useKF(p, [
    [0.7 + d, 0.4],
    [0.745 + d, 1],
    [0.845, 1],
    [0.885, 0.2],
  ]);
  const note =
    card.state === "held" ? RECORDED_RUN.paidDecision.reasons.join(" · ") : card.state === "called" ? "Called in the recorded run" : "Offered, not needed";
  return (
    <m.div className="absolute" style={{ left: -128, top: -48, x, y, z, opacity, scale }}>
      <ToolCard name={toolName(card.toolId)} state={card.state} note={note} />
    </m.div>
  );
}

/* ───────────────────────── Overlay copy ───────────────────────── */

function Copy({ p }: { p: MV }) {
  return (
    <div className="pointer-events-none absolute bottom-[14%] left-[6%] w-[44%]">
      {CHAPTERS.map((c) => (
        <div key={c.id}>
          <h3 className="sr-only">{c.label}</h3>
          <p className="sr-only">{c.summary}</p>
          {c.beats.map((b) => (
            <BeatLine key={b.text} p={p} beat={b} />
          ))}
        </div>
      ))}
    </div>
  );
}

function BeatLine({ p, beat }: { p: MV; beat: Beat }) {
  const [a, b, c, d] = beat.at;
  const opacity = useKF(p, [
    [a, 0],
    [b, 1],
    [c, 1],
    [d, 0],
  ]);
  const y = useKF(p, [
    [a, 26],
    [b, 0],
    [c, 0],
    [d, -18],
  ]);
  return (
    <m.p
      style={{ opacity, y }}
      className={cn(
        "absolute bottom-0 left-0 font-display text-5xl font-semibold leading-[1.05] tracking-tight xl:text-6xl [@media(max-height:760px)]:text-4xl",
        beat.accent ? "brand-gradient-text-light" : "text-on-dark",
      )}
    >
      {beat.text}
    </m.p>
  );
}

function Captions({ p }: { p: MV }) {
  const recordedA = useKF(p, [
    [0.15, 0],
    [0.17, 1],
    [0.31, 1],
    [0.33, 0],
  ]);
  const concept = useKF(p, [
    [0.34, 0],
    [0.36, 1],
    [0.5, 1],
    [0.52, 0],
  ]);
  const recordedB = useKF(p, [
    [0.555, 0],
    [0.575, 1],
    [0.68, 1],
    [0.7, 0],
  ]);
  const decision = useKF(p, [
    [0.7, 0],
    [0.72, 1],
    [0.83, 1],
    [0.85, 0],
  ]);
  const pill =
    "absolute left-[6%] top-[12%] flex items-center gap-2 rounded-full border border-white/12 bg-[#0b112e]/80 px-3 py-1.5 text-xs text-on-dark-muted";
  return (
    <div className="pointer-events-none" aria-hidden>
      <m.p style={{ opacity: recordedA }} className={pill}>
        <span className="size-1.5 rounded-full bg-success" /> {RECORDED_LABEL} · panels are the app’s own components
      </m.p>
      <m.p style={{ opacity: concept }} className={pill}>
        <span className="size-1.5 rounded-full bg-[#c4adff]" /> Concept illustration of how lessons are kept, not a storage event
      </m.p>
      <m.p style={{ opacity: recordedB }} className={pill}>
        <span className="size-1.5 rounded-full bg-success" /> {RECORDED_LABEL} · claims re-checked against fresh chain reads
      </m.p>
      <m.p style={{ opacity: decision }} className={pill}>
        <span className="size-1.5 rounded-full bg-success" /> WorthIt’s decision in the recorded run ·{" "}
        <PaidDecisionNote inline className="text-on-dark-muted" />
      </m.p>
    </div>
  );
}

function FinalCard({ p, onFocusCta }: { p: MV; onFocusCta: () => void }) {
  const opacity = useKF(p, [
    [0.9, 0],
    [0.945, 1],
  ]);
  const y = useKF(p, [
    [0.9, 24],
    [0.945, 0],
  ]);
  const [live, setLive] = useState(false);
  useMotionValueEvent(opacity, "change", (v) => setLive((l) => (l === v > 0.5 ? l : v > 0.5)));
  return (
    <m.div style={{ opacity, y }} className={cn("absolute inset-x-0 bottom-[9%] flex flex-col items-center text-center", !live && "pointer-events-none")}>
      <p className="font-display text-2xl font-bold tracking-tight text-on-dark">
        Recall<span className="brand-gradient-text-light">IQ</span>
      </p>
      <h3 className="mt-3 font-display text-5xl font-semibold tracking-tight text-on-dark [@media(max-height:760px)]:text-4xl">{FINAL.headline}</h3>
      <p className="mt-4 max-w-xl text-base leading-7 text-on-dark-muted">{FINAL.body}</p>
      <Link
        href={FINAL.cta.href}
        onFocus={onFocusCta}
        className="bg-brand-gradient group mt-7 inline-flex h-12 items-center gap-2 rounded-full px-7 text-base font-semibold text-white shadow-[0_14px_40px_-12px_rgb(50_84_228/0.9)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#04081c]"
      >
        {FINAL.cta.label}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </m.div>
  );
}
