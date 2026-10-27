import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FPS, GEIST, GRADIENT, GRADIENT_TEXT, MONO, SORA } from "../theme";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

/** The app's bright backdrop: frosted white with soft cyan and lavender light. */
export function Backdrop({ drift = 0 }: { drift?: number }) {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${C.bg}, ${C.ice} 55%, ${C.lavender})` }}>
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          right: -260 + drift,
          top: -380,
          borderRadius: "50%",
          background: "radial-gradient(closest-side, rgba(24,204,249,0.22), transparent)",
          filter: "blur(10px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          left: -260 - drift,
          bottom: -420,
          borderRadius: "50%",
          background: "radial-gradient(closest-side, rgba(119,84,238,0.16), transparent)",
          filter: "blur(10px)",
        }}
      />
    </AbsoluteFill>
  );
}

function Wordmark({ size = 120 }: { size?: number }) {
  return (
    <span style={{ fontFamily: SORA, fontWeight: 700, fontSize: size, letterSpacing: -size * 0.03, color: C.navy }}>
      Recall
      <span style={{ backgroundImage: GRADIENT_TEXT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>IQ</span>
    </span>
  );
}

/** Opening: glow, then the emblem rising out of depth, then the wordmark and line. */
export function LogoIntro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / FPS;
  const glow = interpolate(t, [0, 1.2], [0, 1], { extrapolateRight: "clamp", easing: ease });
  const emblem = spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 90, mass: 0.9 } });
  const word = interpolate(t, [0.7, 1.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const line = interpolate(t, [1.3, 2.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill>
      <Backdrop drift={t * 12} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "absolute",
            width: 760,
            height: 760,
            borderRadius: "50%",
            background: "radial-gradient(closest-side, rgba(24,204,249,0.35), rgba(119,84,238,0.16) 60%, transparent)",
            opacity: glow,
            transform: `scale(${0.6 + glow * 0.4})`,
            top: 40,
          }}
        />
        <Img
          src={staticFile("brand/recalliq-mark.png")}
          style={{
            width: 330,
            height: 330,
            marginTop: -120,
            transform: `perspective(900px) translateZ(${(1 - emblem) * -300}px) scale(${0.86 + emblem * 0.14})`,
            opacity: Math.min(1, emblem * 1.4),
            filter: `drop-shadow(0 34px 50px rgba(20,90,200,${0.28 * emblem}))`,
          }}
        />
        <div style={{ marginTop: 30, opacity: word, transform: `translateY(${(1 - word) * 18}px)` }}>
          <Wordmark size={112} />
        </div>
        <div style={{ marginTop: 14, opacity: line, transform: `translateY(${(1 - line) * 14}px)`, fontFamily: SORA, fontSize: 40, color: C.muted, letterSpacing: -0.6 }}>
          <span style={{ fontWeight: 300 }}>Your AI</span> <span style={{ fontWeight: 600, color: C.navy }}>remembers.</span>{" "}
          <span style={{ fontWeight: 300 }}>Your</span>{" "}
          <span style={{ fontWeight: 600, backgroundImage: GRADIENT_TEXT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            intelligence evolves.
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

const NODES = [
  { id: "q", label: "Your question", sub: "Plain language · validated inputs", x: 230, y: 470 },
  { id: "recall", label: "Recall lessons", sub: "Walrus Memory · by meaning", x: 560, y: 260, walrus: true },
  { id: "worthit", label: "WorthIt tool selection", sub: "Relevance · reliability · cost", x: 920, y: 260 },
  { id: "tatum", label: "Live Sui data", sub: "Tatum Sui gRPC (Mainnet)", x: 1280, y: 260, tatum: true },
  { id: "verify", label: "Verify every claim", sub: "Fresh chain reads · evidence refs", x: 1660, y: 470 },
  { id: "autopsy", label: "Agent Autopsy", sub: "Diagnose verified mistakes", x: 1280, y: 690 },
  { id: "store", label: "Store the lesson", sub: "Walrus Memory · blob ID", x: 920, y: 690, walrus: true },
  { id: "pay", label: "x402 on Sui", sub: "Only if worth it · you sign", x: 920, y: 475, optional: true },
] as const;

const EDGES: Array<[string, string, number, string?]> = [
  ["q", "recall", 0.6],
  ["recall", "worthit", 1.2],
  ["worthit", "tatum", 1.8],
  ["tatum", "verify", 2.4],
  ["verify", "autopsy", 3.0],
  ["autopsy", "store", 3.6],
  ["store", "recall", 4.2, "next session"],
  ["worthit", "pay", 2.1],
];

/** How the pieces fit together. Explicitly a concept diagram; every box maps to a real module. */
export function Architecture() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const at = (id: string) => NODES.find((n) => n.id === id)!;
  const shown = (start: number) => interpolate(t, [start, start + 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const nodeStart: Record<string, number> = { q: 0.2, recall: 0.7, worthit: 1.3, tatum: 1.9, verify: 2.5, autopsy: 3.1, store: 3.7, pay: 2.2 };
  return (
    <AbsoluteFill>
      <Backdrop drift={t * 8} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 70, textAlign: "center", fontFamily: SORA, fontWeight: 600, fontSize: 44, color: C.navy, letterSpacing: -0.8, opacity: shown(0) }}>
        How RecallIQ fits together
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 130, textAlign: "center", fontFamily: GEIST, fontSize: 22, color: C.muted, opacity: shown(0.1) }}>
        Concept diagram · each block is a real module in the repository
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#18ccf9" />
            <stop offset="1" stopColor="#7754ee" />
          </linearGradient>
        </defs>
        {EDGES.map(([a, b, start, label]) => {
          const A = at(a);
          const B = at(b);
          const k = interpolate(t, [start, start + 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
          const loop = a === "store" && b === "recall";
          const d = loop ? `M ${A.x - 160} ${A.y} C ${470} ${A.y + 40}, ${470} ${B.y + 150}, ${B.x - 40} ${B.y + 52}` : `M ${A.x} ${A.y} L ${B.x} ${B.y}`;
          return (
            <g key={`${a}-${b}`} opacity={k > 0 ? 1 : 0}>
              <path d={d} fill="none" stroke="url(#edge)" strokeWidth={4} strokeDasharray={b === "pay" ? "10 10" : "2000"} strokeDashoffset={b === "pay" ? 0 : 2000 * (1 - k)} opacity={b === "pay" ? 0.6 * k : 0.9} />
              {label && (
                <text x={505} y={600} fill={C.muted} fontFamily={GEIST} fontSize={22} fontWeight={600} opacity={k}>
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {NODES.map((n) => {
        const k = shown(nodeStart[n.id]!);
        const accent = "walrus" in n && n.walrus ? C.cyan : "tatum" in n && n.tatum ? C.blue : "optional" in n && n.optional ? "#f0a03a" : C.violet;
        return (
          <div
            key={n.id}
            style={{
              position: "absolute",
              left: n.x - 160,
              top: n.y - 52,
              width: 320,
              height: 104,
              borderRadius: 22,
              background: "rgba(255,255,255,0.96)",
              border: `1px solid ${C.line}`,
              borderTop: `4px solid ${accent}`,
              boxShadow: "0 24px 50px -26px rgba(16,28,68,0.45)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              paddingLeft: 24,
              opacity: k,
              transform: `translateY(${(1 - k) * 16}px) scale(${0.96 + k * 0.04})`,
            }}
          >
            <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: 26, color: C.navy }}>{n.label}</span>
            <span style={{ fontFamily: GEIST, fontSize: 19, color: C.muted, marginTop: 4 }}>{n.sub}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

/** Closing card: the emblem returns with the product, the stack and the real links. */
export function EndCard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / FPS;
  const e = spring({ frame, fps, config: { damping: 18, stiffness: 80 } });
  const rest = (d: number) => interpolate(t, [d, d + 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill>
      <Backdrop drift={t * 10} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Img
          src={staticFile("brand/recalliq-mark.png")}
          style={{ width: 230, height: 230, marginTop: -110, transform: `scale(${0.8 + e * 0.2})`, opacity: e, filter: "drop-shadow(0 30px 45px rgba(20,90,200,0.3))" }}
        />
        <div style={{ marginTop: 18, opacity: rest(0.3) }}>
          <Wordmark size={96} />
        </div>
        <div style={{ marginTop: 8, fontFamily: SORA, fontSize: 34, color: C.muted, opacity: rest(0.6) }}>
          An AI agent that learns from verified experience.
        </div>
        <div style={{ marginTop: 34, display: "flex", gap: 18, opacity: rest(0.9) }}>
          {["Walrus Memory", "Tatum Sui gRPC", "Sui Mainnet", "x402"].map((s) => (
            <span
              key={s}
              style={{
                padding: "10px 20px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.9)",
                border: `1px solid ${C.line}`,
                fontFamily: GEIST,
                fontSize: 23,
                fontWeight: 500,
                color: C.navy,
              }}
            >
              {s}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: rest(1.2) }}>
          <span style={{ fontFamily: MONO, fontSize: 30, color: C.primary }}>recalliq-seven.vercel.app</span>
          <span style={{ fontFamily: MONO, fontSize: 26, color: C.muted }}>github.com/Olalekan2345/recalliq</span>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 56,
            padding: "10px 24px",
            borderRadius: 999,
            background: GRADIENT,
            color: "white",
            fontFamily: GEIST,
            fontSize: 22,
            fontWeight: 600,
            opacity: rest(1.5),
          }}
        >
          Walrus × Tatum · Total Recall Hackathon · Smart Agents for Real Life
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
