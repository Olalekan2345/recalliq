// Mix the final soundtrack sample-accurately: narration (levelled per segment, 5 ms edge
// fades) over the music bed, which ducks under the voice with a smoothed gain envelope.
// Doing this offline avoids per-video-frame volume steps (zipper noise) in the renderer.
// Writes assets/audio/soundtrack.wav (48 kHz stereo), used as the video's only audio.
//   node scripts/mix-audio.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { readPcm, writePcm } from "./wav.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const FFMPEG = process.env.FFMPEG ?? "C:/Users/USER/Desktop/DATA/node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe";
const SR = 48000;
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const { total, narration } = read("src/timeline.json");
const N = Math.round(total * SR);

const TARGET_RMS_DB = -19; // speech level per segment
const MUSIC_BED = 0.34; // music gain in gaps
const MUSIC_UNDER = 0.12; // music gain under the voice
const DUCK_PAD = 0.25; // seconds of ducking before and after each segment
const ATTACK = 0.12; // seconds to duck down
const RELEASE = 0.45; // seconds to come back up

const L = new Float32Array(N);
const R = new Float32Array(N);

// Narration: resample each segment to 48 kHz with ffmpeg, level it, place it.
const tmp = path.join(ROOT, "out", "audio48");
mkdirSync(tmp, { recursive: true });
const speech = [];
for (const [id, start] of Object.entries(narration)) {
  const src = path.join(ROOT, "assets", "audio", `${id}.wav`);
  const dst = path.join(tmp, `${id}.wav`);
  execFileSync(FFMPEG, ["-v", "error", "-y", "-i", src, "-ar", String(SR), "-ac", "1", "-c:a", "pcm_s16le", dst]);
  const x = readPcm(dst).channels[0];
  // Level from the voiced frames only (20 ms windows above a silence floor).
  const W = Math.round(SR * 0.02);
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i + W <= x.length; i += W) {
    let e = 0;
    for (let j = i; j < i + W; j++) e += x[j] * x[j];
    const r = Math.sqrt(e / W);
    if (r > 0.03) {
      sum += r;
      cnt++;
    }
  }
  const gain = 10 ** ((TARGET_RMS_DB - 20 * Math.log10(sum / cnt)) / 20);
  const s0 = Math.round(start * SR);
  const fade = Math.round(SR * 0.005);
  for (let i = 0; i < x.length && s0 + i < N; i++) {
    const edge = Math.min(1, i / fade, (x.length - 1 - i) / fade);
    const v = x[i] * gain * edge;
    L[s0 + i] += v;
    R[s0 + i] += v;
  }
  speech.push([start, start + x.length / SR]);
  console.log(`${id}: ${(x.length / SR).toFixed(2)} s at ${start}s, gain ${gain.toFixed(3)}`);
}

// Music: duck under speech with a smoothed envelope; fade in and out.
const bed = readPcm(path.join(ROOT, "assets", "music", "bed.wav"));
if (bed.rate !== SR) throw new Error(`music must be ${SR} Hz`);
const aA = 1 - Math.exp(-1 / (ATTACK * SR));
const aR = 1 - Math.exp(-1 / (RELEASE * SR));
let g = MUSIC_BED;
let si = 0;
for (let s = 0; s < N; s++) {
  const t = s / SR;
  while (si < speech.length && t > speech[si][1] + DUCK_PAD) si++;
  const under = si < speech.length && t >= speech[si][0] - DUCK_PAD;
  const target = under ? MUSIC_UNDER : MUSIC_BED;
  g += (target - g) * (target < g ? aA : aR);
  const fadeIn = Math.min(1, t / 1.0);
  const fadeOut = Math.min(1, Math.max(0, (total - 0.2 - t) / 2.8));
  const k = g * fadeIn * fadeOut;
  L[s] += (bed.channels[0][s] ?? 0) * k;
  R[s] += (bed.channels[1][s] ?? 0) * k;
}

// Keep peaks under −1 dBFS (scale down only).
let peak = 0;
for (let s = 0; s < N; s++) peak = Math.max(peak, Math.abs(L[s]), Math.abs(R[s]));
const trim = Math.min(1, 10 ** (-1 / 20) / peak);
for (let s = 0; s < N; s++) {
  L[s] *= trim;
  R[s] *= trim;
}
writePcm(path.join(ROOT, "assets", "audio", "soundtrack.wav"), SR, [L, R]);
console.log(`soundtrack.wav: ${total}s, peak ${(20 * Math.log10(peak * trim)).toFixed(1)} dBFS (trim ${trim.toFixed(3)})`);
