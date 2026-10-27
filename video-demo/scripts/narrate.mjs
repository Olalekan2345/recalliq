// Synthesised narration with Gemini TTS (the project owner's API key; output usable under
// Google's API terms). One WAV per segment plus durations.json for the edit and subtitles.
//   node narrate.mjs [segmentId...]      (default: all segments)
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build, chunks, pcmFmt } from "./wav.mjs";

const require = createRequire("C:/Users/USER/Desktop/RECALL/package.json");
require("dotenv").config({ path: "C:/Users/USER/Desktop/RECALL/.env", quiet: true });

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "assets", "audio");
const MODEL = process.env.TTS_MODEL ?? "gemini-3.8-flash-tts";
const KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!KEY) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
mkdirSync(OUT, { recursive: true });

const { voice, style, segments } = JSON.parse(readFileSync(path.join(import.meta.dirname, "narration.json"), "utf8"));
const only = new Set(process.argv.slice(2));

const durationsFile = path.join(OUT, "durations.json");
let durations = {};
try {
  durations = JSON.parse(readFileSync(durationsFile, "utf8"));
} catch {}

for (const seg of segments) {
  if (only.size && !only.has(seg.id)) continue;
  const body = {
    // A style instruction makes these models read far slower, so the text is sent on its own.
    contents: [{ parts: [{ text: style ? `${style}\n\n${seg.text}` : seg.text }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  };
  let json;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify(body),
    });
    json = await res.json();
    if (res.ok) break;
    console.log(`${seg.id}: attempt ${attempt} failed (${res.status}) ${JSON.stringify(json).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  const part = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`${seg.id}: no audio in response`);
  const raw = Buffer.from(part.inlineData.data, "base64");
  // Either a complete WAV (audio followed by a C2PA provenance chunk) or raw 16-bit PCM
  // ("audio/L16;rate=…"). Chunks are parsed by id so only the audio is played; the
  // provenance chunk is kept after it.
  let rate;
  let pcm;
  let extra = [];
  if (raw.toString("ascii", 0, 4) === "RIFF") {
    const cs = chunks(raw);
    rate = cs.find((c) => c.id === "fmt ").data.readUInt32LE(4);
    pcm = cs.find((c) => c.id === "data").data;
    extra = cs.filter((c) => c.id !== "fmt " && c.id !== "data");
  } else {
    rate = Number(/rate=(\d+)/i.exec(part.inlineData.mimeType)?.[1] ?? 24000);
    pcm = raw;
  }
  writeFileSync(path.join(OUT, `${seg.id}.wav`), build({ fmt: pcmFmt(rate), pcm, extra }));
  durations[seg.id] = Math.round((pcm.length / 2 / rate) * 1000) / 1000;
  console.log(`${seg.id}: ${durations[seg.id]} s (${part.inlineData.mimeType})`);
}
writeFileSync(durationsFile, JSON.stringify(durations, null, 2));
console.log("total speech", Object.values(durations).reduce((a, b) => a + b, 0).toFixed(1), "s");
