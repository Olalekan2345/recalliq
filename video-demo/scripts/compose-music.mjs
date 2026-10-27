// Original background music, synthesised from scratch (no samples, no third-party audio),
// so the soundtrack carries no licensing questions.
//   node compose-music.mjs [seconds=175]   → assets/music/bed.wav (48 kHz stereo)
// Ambient electronic in D major at 96 BPM: chorused pads, warm bass, a plucked arpeggio that
// enters after the intro, a soft pulse in the middle section, Schroeder reverb, fades.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SECONDS = Number(process.argv[2] ?? 175);
const SR = 48000;
const N = Math.round(SECONDS * SR);
const OUT = path.resolve(import.meta.dirname, "..", "assets", "music");
mkdirSync(OUT, { recursive: true });

const L = new Float32Array(N);
const R = new Float32Array(N);
const sendL = new Float32Array(N); // reverb send
const sendR = new Float32Array(N);

const TABLE = 8192;
const SINE = new Float32Array(TABLE + 1);
for (let i = 0; i <= TABLE; i++) SINE[i] = Math.sin((2 * Math.PI * i) / TABLE);
const sinAt = (phase) => {
  const x = (phase - Math.floor(phase)) * TABLE;
  const i = x | 0;
  return SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i);
};
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x));

const BEAT = 60 / 96;
const BAR = 4 * BEAT;
const CHORD_LEN = 2 * BAR; // 5 s
const CHORDS = [
  [50, 57, 61, 64, 66], // Dmaj9
  [47, 54, 57, 61, 62], // Bm9
  [43, 50, 54, 57, 59], // Gmaj9
  [45, 52, 54, 59, 61], // A6/9
];

// Section intensity over time (0..1): quiet intro, settle under the voice, lift at the close.
const intensity = (t) => {
  if (t < 14) return 0.45 + 0.25 * (t / 14);
  if (t < SECONDS - 32) return 0.7;
  return 0.7 + 0.3 * smooth((t - (SECONDS - 32)) / 10);
};

// Pads: each chord note is five harmonics on two oscillators detuned ±4 cents (one per side).
for (let c = 0; c * CHORD_LEN < SECONDS + CHORD_LEN; c++) {
  const notes = CHORDS[c % CHORDS.length];
  const start = c * CHORD_LEN - 1.2; // overlap the previous chord
  const len = CHORD_LEN + 2.4;
  const s0 = Math.max(0, Math.round(start * SR));
  const s1 = Math.min(N, Math.round((start + len) * SR));
  for (const midi of notes) {
    const f = hz(midi);
    const detune = Math.pow(2, 4 / 1200);
    const phases = [Math.random(), Math.random()];
    for (let s = s0; s < s1; s++) {
      const t = s / SR;
      const local = (t - start) / len;
      const env = smooth(local / 0.3) * smooth((1 - local) / 0.3);
      if (env <= 0) continue;
      const bright = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.07 * t);
      let l = 0;
      let r = 0;
      for (let k = 1; k <= 5; k++) {
        const a = Math.pow(k, -1.7) * (k === 1 ? 1 : bright);
        l += a * sinAt(phases[0] + (f / detune) * k * (s / SR));
        r += a * sinAt(phases[1] + f * detune * k * (s / SR));
      }
      const amp = 0.055 * env * intensity(t);
      L[s] += l * amp;
      R[s] += r * amp;
      sendL[s] += l * amp * 0.5;
      sendR[s] += r * amp * 0.5;
    }
  }
}

// Bass: chord root an octave down, soft swell per bar.
for (let s = 0; s < N; s++) {
  const t = s / SR;
  const c = Math.floor(t / CHORD_LEN) % CHORDS.length;
  const f = hz(CHORDS[c][0] - 12);
  const inBar = (t % BAR) / BAR;
  const env = 0.55 + 0.45 * smooth(inBar / 0.15) * smooth((1 - inBar) / 0.6);
  const v = (sinAt(f * t) + 0.25 * sinAt(2 * f * t)) * 0.06 * env * intensity(t);
  L[s] += v;
  R[s] += v;
}

// Arpeggio: eighth notes over the chord tones, two octaves up, enters after the intro.
const ARP_START = 13.5;
const step = BEAT / 2;
const pattern = [0, 2, 3, 4, 2, 3, 1, 4];
for (let i = 0; ARP_START + i * step < SECONDS - 3; i++) {
  const t0 = ARP_START + i * step;
  const c = Math.floor(t0 / CHORD_LEN) % CHORDS.length;
  const midi = CHORDS[c][pattern[i % pattern.length]] + 24;
  const f = hz(midi);
  const pan = i % 2 ? 0.35 : -0.35;
  const vel = (0.75 + 0.25 * ((i % 4) === 0 ? 1 : 0)) * smooth((t0 - ARP_START) / 6);
  const s0 = Math.round(t0 * SR);
  const s1 = Math.min(N, s0 + Math.round(1.4 * SR));
  for (let s = s0; s < s1; s++) {
    const dt = (s - s0) / SR;
    const env = Math.min(1, dt / 0.005) * Math.exp(-dt / 0.3);
    const v = (sinAt(f * dt) + 0.3 * sinAt(2 * f * dt) + 0.08 * sinAt(3 * f * dt)) * env * 0.045 * vel * intensity(t0);
    L[s] += v * (1 - pan);
    R[s] += v * (1 + pan);
    sendL[s] += v * 0.8;
    sendR[s] += v * 0.8;
  }
}

// Pulse: a soft low thump on beats 1 and 3 through the middle section.
const PULSE_FROM = 28;
const PULSE_TO = SECONDS - 7;
for (let b = Math.ceil(PULSE_FROM / BEAT); b * BEAT < PULSE_TO; b++) {
  if (b % 2) continue;
  const t0 = b * BEAT;
  const fadeIn = smooth((t0 - PULSE_FROM) / 8) * smooth((PULSE_TO - t0) / 6);
  const s0 = Math.round(t0 * SR);
  let phase = 0;
  for (let s = s0; s < Math.min(N, s0 + Math.round(0.35 * SR)); s++) {
    const dt = (s - s0) / SR;
    const f = 48 + 42 * Math.exp(-dt / 0.03);
    phase += f / SR;
    const v = sinAt(phase) * Math.exp(-dt / 0.12) * 0.11 * fadeIn * intensity(t0);
    L[s] += v;
    R[s] += v;
  }
}

// Schroeder reverb on the send.
function reverb(input, offset) {
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.round(((d + offset) * SR) / 44100));
  const out = new Float32Array(N);
  for (const d of combs) {
    const buf = new Float32Array(d);
    let idx = 0;
    let low = 0;
    for (let s = 0; s < N; s++) {
      const y = buf[idx];
      low = y * 0.6 + low * 0.4; // damping
      buf[idx] = input[s] + low * 0.8;
      out[s] += y;
      idx = (idx + 1) % d;
    }
  }
  for (const d of [225, 556].map((x) => Math.round(((x + offset) * SR) / 44100))) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let s = 0; s < N; s++) {
      const b = buf[idx];
      const y = -out[s] + b;
      buf[idx] = out[s] + b * 0.5;
      out[s] = y;
      idx = (idx + 1) % d;
    }
  }
  return out;
}
const wetL = reverb(sendL, 0);
const wetR = reverb(sendR, 23);

// Mix, fades, soft clip, normalise to −6 dBFS peak.
let peak = 0;
for (let s = 0; s < N; s++) {
  const t = s / SR;
  const fade = smooth(t / 1.5) * smooth((SECONDS - t) / 5);
  L[s] = Math.tanh((L[s] + wetL[s] * 0.09) * fade * 1.4);
  R[s] = Math.tanh((R[s] + wetR[s] * 0.09) * fade * 1.4);
  peak = Math.max(peak, Math.abs(L[s]), Math.abs(R[s]));
}
const gain = 0.5 / peak;
const pcm = Buffer.alloc(N * 4);
for (let s = 0; s < N; s++) {
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[s] * gain)) * 32767), s * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[s] * gain)) * 32767), s * 4 + 2);
}
const h = Buffer.alloc(44);
h.write("RIFF", 0);
h.writeUInt32LE(36 + pcm.length, 4);
h.write("WAVEfmt ", 8);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(2, 22);
h.writeUInt32LE(SR, 24);
h.writeUInt32LE(SR * 4, 28);
h.writeUInt16LE(4, 32);
h.writeUInt16LE(16, 34);
h.write("data", 36);
h.writeUInt32LE(pcm.length, 40);
writeFileSync(path.join(OUT, "bed.wav"), Buffer.concat([h, pcm]));
console.log(`bed.wav: ${SECONDS}s, peak before gain ${peak.toFixed(3)}`);
