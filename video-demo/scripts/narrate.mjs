// Synthesised narration with Gemini TTS (the project owner's API key; output usable under
// Google's API terms). One WAV per segment plus durations.json for the edit and subtitles.
//   node narrate.mjs [segmentId...]      (default: all segments)
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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

function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

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
  // The API returns either a complete WAV or raw 16-bit PCM ("audio/L16;rate=…").
  const isWav = raw.toString("ascii", 0, 4) === "RIFF";
  const rate = isWav ? raw.readUInt32LE(24) : Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? 24000);
  const pcm = isWav ? raw.subarray(44) : raw;
  writeFileSync(path.join(OUT, `${seg.id}.wav`), wav(pcm, rate));
  durations[seg.id] = Math.round((pcm.length / 2 / rate) * 1000) / 1000;
  console.log(`${seg.id}: ${durations[seg.id]} s (${part.inlineData.mimeType})`);
}
writeFileSync(durationsFile, JSON.stringify(durations, null, 2));
console.log("total speech", Object.values(durations).reduce((a, b) => a + b, 0).toFixed(1), "s");
