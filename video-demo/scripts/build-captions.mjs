// Caption cues from the narration script, the real voice files and the timeline. Cue
// boundaries are snapped to the actual pauses in each recording, so the captions follow the
// voice. Writes src/cues.json and subtitles/recalliq-demo.srt. (Levels are set in mix-audio.mjs.)
//   node scripts/build-captions.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const { segments } = read("scripts/narration.json");
const { narration: starts } = read("src/timeline.json");

const MAX = 80; // characters per caption: one line at 34 px

/** Split text into caption-sized chunks at sentence, then clause, then word boundaries. */
function chunk(text) {
  const sentences = text.match(/[^.?!:]+[.?!:]+["”]?|[^.?!:]+$/g).map((s) => s.trim());
  const out = [];
  for (const s of sentences) {
    if (s.length <= MAX) {
      out.push(s);
      continue;
    }
    let cur = "";
    for (const part of s.split(/(?<=,)\s+/)) {
      if ((cur + " " + part).trim().length <= MAX) cur = (cur + " " + part).trim();
      else {
        if (cur) out.push(cur);
        if (part.length <= MAX) cur = part;
        else {
          let line = "";
          for (const w of part.split(" ")) {
            if ((line + " " + w).trim().length > MAX) {
              out.push(line);
              line = w;
            } else line = (line + " " + w).trim();
          }
          cur = line;
        }
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Speech analysis of a 16-bit mono WAV: onset, offset, pause midpoints, RMS and peak. */
function analyse(file) {
  const b = readFileSync(file);
  const rate = b.readUInt32LE(24);
  const n = (b.length - 44) / 2;
  const hop = Math.round(rate * 0.02);
  const active = [];
  let peak = 0;
  let sum = 0;
  let cnt = 0;
  for (let s = 0; s + hop <= n; s += hop) {
    let e = 0;
    for (let i = 0; i < hop; i++) {
      const v = b.readInt16LE(44 + (s + i) * 2) / 32768;
      e += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    const rms = Math.sqrt(e / hop);
    active.push(rms > 0.012);
    if (rms > 0.03) {
      sum += rms;
      cnt++;
    }
  }
  const t = (i) => (i * hop) / rate;
  const onset = t(active.indexOf(true));
  const offset = t(active.lastIndexOf(true) + 1);
  const pauses = [];
  let runStart = -1;
  active.forEach((a, i) => {
    if (!a && runStart < 0) runStart = i;
    if (a && runStart >= 0) {
      if (t(i) - t(runStart) >= 0.16 && t(runStart) > onset) pauses.push((t(runStart) + t(i)) / 2);
      runStart = -1;
    }
  });
  return { onset, offset, pauses, rmsDb: 20 * Math.log10(sum / cnt), peakDb: 20 * Math.log10(peak) };
}

const cues = [];
for (const seg of segments) {
  const start = starts[seg.id];
  if (start === undefined) throw new Error(`no timeline start for ${seg.id}`);
  const a = analyse(path.join(ROOT, "assets", "audio", `${seg.id}.wav`));

  const parts = chunk(seg.text);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const span = a.offset - a.onset;
  // Proportional boundaries, each snapped to the nearest real pause within 0.9 s.
  const bounds = [a.onset];
  let acc = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    acc += parts[i].length;
    const est = a.onset + (span * acc) / total;
    const near = a.pauses.filter((p) => Math.abs(p - est) < 0.9 && p > bounds.at(-1) + 0.4).sort((x, y) => Math.abs(x - est) - Math.abs(y - est))[0];
    bounds.push(near ?? est);
  }
  bounds.push(a.offset);
  parts.forEach((p, i) => {
    cues.push({ start: Math.round((start + bounds[i]) * 1000) / 1000, end: Math.round((start + bounds[i + 1] - 0.03) * 1000) / 1000, text: p });
  });
}

writeFileSync(path.join(ROOT, "src", "cues.json"), JSON.stringify(cues, null, 2));
const ts = (s) => {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, "0")}`;
};
mkdirSync(path.join(ROOT, "subtitles"), { recursive: true });
writeFileSync(path.join(ROOT, "subtitles", "recalliq-demo.srt"), cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n"));
for (const c of cues) console.log(`${c.start.toFixed(2).padStart(7)} → ${c.end.toFixed(2).padStart(7)}  ${c.text}`);
