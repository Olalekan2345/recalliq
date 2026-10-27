import { AbsoluteFill, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { FPS } from "../theme";

/** A camera keyframe: at `at` seconds into the shot, zoom `scale` around source point (x, y). */
export interface Cam {
  at: number;
  scale: number;
  x: number;
  y: number;
}

/** A highlight box in source pixels (1920×1080 recording), shown from `from` to `to` seconds into the shot. */
export interface Box {
  from: number;
  to: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const ease = Easing.bezier(0.45, 0, 0.2, 1);

function camAt(cams: Cam[], t: number): Omit<Cam, "at"> {
  if (!cams.length) return { scale: 1, x: 960, y: 540 };
  if (t <= cams[0]!.at) return cams[0]!;
  for (let i = 0; i < cams.length - 1; i++) {
    const a = cams[i]!;
    const b = cams[i + 1]!;
    if (t <= b.at) {
      const k = ease((t - a.at) / Math.max(0.001, b.at - a.at));
      return { scale: a.scale + (b.scale - a.scale) * k, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return cams[cams.length - 1]!;
}

/**
 * A genuine screen recording, trimmed and optionally sped up, with an eased camera
 * (zoom about a point) and highlight boxes that move with the footage.
 */
export function Footage({
  clip,
  from,
  rate = 1,
  cams = [],
  boxes = [],
}: {
  clip: string;
  /** Start position in the source recording, in seconds. */
  from: number;
  rate?: number;
  cams?: Cam[];
  boxes?: Box[];
}) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = camAt(cams, t);
  // Bring the focus point towards the frame centre, but never further than keeps the
  // recording covering the whole frame: no cropped-in empty strips at the edges.
  const s = Math.max(1, cam.scale);
  const tx = Math.min(0, Math.max(1920 - 1920 * s, 960 - s * cam.x));
  const ty = Math.min(0, Math.max(1080 - 1080 * s, 540 - s * cam.y));
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#f8fbff" }}>
      <AbsoluteFill style={{ transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
        <OffthreadVideo src={staticFile(`captures/${clip}.mp4`)} trimBefore={Math.round(from * FPS)} playbackRate={rate} muted />
        {boxes.map((b, i) => {
          const o = interpolate(t, [b.from, b.from + 0.35, b.to - 0.3, b.to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          if (o <= 0) return null;
          const grow = interpolate(t, [b.from, b.from + 0.45], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: b.x - grow,
                top: b.y - grow,
                width: b.w + grow * 2,
                height: b.h + grow * 2,
                borderRadius: 14,
                border: "3px solid rgba(24,204,249,0.95)",
                boxShadow: "0 0 0 6px rgba(50,84,228,0.16), 0 0 28px rgba(24,204,249,0.45)",
                opacity: o,
              }}
            />
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
