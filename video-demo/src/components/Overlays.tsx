import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, FPS, GEIST, GRADIENT, SORA } from "../theme";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

function useFade(inAt: number, outAt: number) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const o = interpolate(t, [inAt, inAt + 0.4, outAt - 0.35, outAt], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(t, [inAt, inAt + 0.5], [10, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return { o, y };
}

export type SourceKind = "live" | "recorded" | "external" | "concept";
const DOT: Record<SourceKind, string> = { live: "#12b886", recorded: C.cyan, external: C.violet, concept: "#f0a03a" };

/** Where a shot comes from. Always on screen during footage, so live, recorded and concept are never confused. */
export function SourceTag({ kind, text, until }: { kind: SourceKind; text: string; until: number }) {
  const { o, y } = useFade(0.15, until);
  return (
    <div
      style={{
        position: "absolute",
        left: 28,
        top: 24,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 18px 10px 14px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.985)",
        border: `1px solid ${C.line}`,
        boxShadow: "0 10px 30px -14px rgba(16,28,68,0.45)",
        fontFamily: GEIST,
        fontSize: 22,
        fontWeight: 500,
        color: C.navy,
        opacity: o,
        transform: `translateY(${y}px)`,
      }}
    >
      <span style={{ width: 12, height: 12, borderRadius: 99, background: DOT[kind], boxShadow: `0 0 10px ${DOT[kind]}` }} />
      {text}
    </div>
  );
}

/** "Time-lapse" badge for honestly edited (sped-up) stretches of a real recording. */
export function TimeLapse({ from, to }: { from: number; to: number }) {
  const { o } = useFade(from, to);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 30,
        top: 26,
        padding: "8px 16px",
        borderRadius: 999,
        background: "rgba(16,28,68,0.86)",
        color: "white",
        fontFamily: GEIST,
        fontSize: 20,
        fontWeight: 600,
        letterSpacing: 0.4,
        opacity: o,
      }}
    >
      ⏩ Time-lapse · real run sped up
    </div>
  );
}

/** Section heading that slides in at the top centre for a few seconds. */
export function SectionTitle({ n, title, sub, until = 3.6 }: { n: number; title: string; sub?: string; until?: number }) {
  const { o, y } = useFade(0.1, until);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 14, display: "flex", justifyContent: "center", opacity: o, transform: `translateY(${y}px)` }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 26px 12px 12px",
          borderRadius: 20,
          background: "rgba(255,255,255,0.95)",
          border: `1px solid ${C.line}`,
          boxShadow: "0 24px 60px -24px rgba(16,28,68,0.5)",
        }}
      >
        <span
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            background: GRADIENT,
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: SORA,
            fontWeight: 700,
            fontSize: 26,
          }}
        >
          {n}
        </span>
        <span style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: 30, color: C.navy, letterSpacing: -0.5 }}>{title}</span>
          {sub && <span style={{ fontFamily: GEIST, fontSize: 20, color: C.muted, marginTop: 1 }}>{sub}</span>}
        </span>
      </div>
    </div>
  );
}

/** Small factual note (e.g. what was or was not executed), anchored above the captions. */
export function Note({ text, from, to }: { text: string; from: number; to: number }) {
  const { o, y } = useFade(from, to);
  if (o <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 150, display: "flex", justifyContent: "center", opacity: o, transform: `translateY(${y}px)` }}>
      <div
        style={{
          padding: "12px 22px",
          borderRadius: 14,
          background: "rgba(255,244,224,0.97)",
          border: "1px solid rgba(154,82,0,0.25)",
          color: C.warn,
          fontFamily: GEIST,
          fontSize: 23,
          fontWeight: 500,
        }}
      >
        {text}
      </div>
    </div>
  );
}

/** Burned-in captions (the same timed text is exported as subtitles/recalliq-demo.srt). */
export function Captions({ cues }: { cues: Array<{ start: number; end: number; text: string }> }) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cue = cues.find((c) => t >= c.start && t < c.end);
  if (!cue) return null;
  const o = interpolate(t, [cue.start, cue.start + 0.12, cue.end - 0.12, cue.end], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, display: "flex", justifyContent: "center", opacity: o }}>
      <div
        style={{
          maxWidth: 1560,
          padding: "12px 26px",
          borderRadius: 16,
          background: "rgba(16,28,68,0.86)",
          color: "white",
          fontFamily: GEIST,
          fontSize: 34,
          fontWeight: 500,
          lineHeight: 1.32,
          textAlign: "center",
          boxShadow: "0 12px 30px -12px rgba(16,28,68,0.6)",
        }}
      >
        {cue.text}
      </div>
    </div>
  );
}

