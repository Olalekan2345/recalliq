// Minimal RIFF/WAV helpers. Gemini TTS returns a WAV whose audio is followed by a C2PA
// content-credentials chunk (provenance: "trainedAlgorithmicMedia", SynthID watermark).
// Treating everything after the 44-byte header as samples plays that chunk as a burst of
// noise, so chunks are always parsed by id and size.
import { readFileSync, writeFileSync } from "node:fs";

/** Split a RIFF/WAVE buffer into its chunks. */
export function chunks(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a RIFF/WAVE file");
  const out = [];
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const end = Math.min(buf.length, off + 8 + size);
    out.push({ id, data: buf.subarray(off + 8, end) });
    off = end + (size % 2); // chunks are word-aligned
  }
  return out;
}

/** Build a WAV from a fmt chunk, PCM data and any extra chunks (kept after the audio). */
export function build({ fmt, pcm, extra = [] }) {
  const parts = [];
  const add = (id, data) => {
    const h = Buffer.alloc(8);
    h.write(id, 0, "ascii");
    h.writeUInt32LE(data.length, 4);
    parts.push(h, data);
    if (data.length % 2) parts.push(Buffer.alloc(1));
  };
  add("fmt ", fmt);
  add("data", pcm);
  for (const c of extra) add(c.id, c.data);
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(body.length + 4, 4);
  head.write("WAVE", 8, "ascii");
  return Buffer.concat([head, body]);
}

/** 16-bit PCM fmt chunk. */
export function pcmFmt(rate, channels = 1) {
  const f = Buffer.alloc(16);
  f.writeUInt16LE(1, 0);
  f.writeUInt16LE(channels, 2);
  f.writeUInt32LE(rate, 4);
  f.writeUInt32LE(rate * channels * 2, 8);
  f.writeUInt16LE(channels * 2, 12);
  f.writeUInt16LE(16, 14);
  return f;
}

/** Read a 16-bit PCM WAV as float channels. */
export function readPcm(file) {
  const cs = chunks(readFileSync(file));
  const fmt = cs.find((c) => c.id === "fmt ")?.data;
  const data = cs.find((c) => c.id === "data")?.data;
  if (!fmt || !data) throw new Error(`${file}: missing fmt or data chunk`);
  const channels = fmt.readUInt16LE(2);
  const rate = fmt.readUInt32LE(4);
  if (fmt.readUInt16LE(14) !== 16) throw new Error(`${file}: expected 16-bit PCM`);
  const n = Math.floor(data.length / 2 / channels);
  const ch = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) ch[c][i] = data.readInt16LE((i * channels + c) * 2) / 32768;
  return { rate, channels: ch, extra: cs.filter((c) => c.id !== "fmt " && c.id !== "data") };
}

/** Write float channels as 16-bit PCM WAV. */
export function writePcm(file, rate, channels, extra = []) {
  const n = channels[0].length;
  const pcm = Buffer.alloc(n * channels.length * 2);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < channels.length; c++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), (i * channels.length + c) * 2);
  writeFileSync(file, build({ fmt: pcmFmt(rate, channels.length), pcm, extra }));
}
