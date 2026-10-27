import { AbsoluteFill, Img, staticFile } from "remotion";
import { Backdrop } from "./components/Brand";
import { C, GEIST, GRADIENT, GRADIENT_TEXT, SORA } from "./theme";

/** Video thumbnail: the brand, the claim, and a real frame from the recorded live run (not a mock-up). */
export function Thumbnail() {
  return (
    <AbsoluteFill>
      <Backdrop />
      <div style={{ position: "absolute", left: 96, top: 150, width: 820 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Img src={staticFile("brand/recalliq-mark.png")} style={{ width: 120, height: 120 }} />
          <span style={{ fontFamily: SORA, fontWeight: 700, fontSize: 84, color: C.navy, letterSpacing: -2.5 }}>
            Recall<span style={{ backgroundImage: GRADIENT_TEXT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>IQ</span>
          </span>
        </div>
        <div style={{ marginTop: 46, fontFamily: SORA, fontSize: 76, lineHeight: 1.05, letterSpacing: -2.4, color: C.navy }}>
          <span style={{ fontWeight: 300 }}>An AI agent that</span>{" "}
          <span style={{ fontWeight: 700 }}>remembers its mistakes</span>
        </div>
        <div style={{ marginTop: 28, fontFamily: GEIST, fontSize: 34, color: C.muted, lineHeight: 1.35 }}>
          Lessons stored on Walrus Memory · claims verified with Tatum on Sui Mainnet
        </div>
        <div
          style={{
            marginTop: 40,
            display: "inline-block",
            padding: "14px 28px",
            borderRadius: 999,
            background: GRADIENT,
            color: "white",
            fontFamily: GEIST,
            fontWeight: 600,
            fontSize: 30,
          }}
        >
          Real product demo · Walrus × Tatum Total Recall
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: -120,
          top: 170,
          width: 1080,
          height: 608,
          borderRadius: 30,
          overflow: "hidden",
          border: "10px solid #151a2e",
          boxShadow: "0 50px 90px -40px rgba(16,28,68,0.6)",
          transform: "perspective(1800px) rotateY(-12deg)",
        }}
      >
        <Img src={staticFile("brand/thumb-frame.png")} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "right top" }} />
      </div>
    </AbsoluteFill>
  );
}
