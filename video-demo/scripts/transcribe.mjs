// QA: transcribe a narration WAV with Gemini to confirm exactly what was spoken.
//   node transcribe.mjs <file.wav> [...]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire("C:/Users/USER/Desktop/RECALL/package.json");
require("dotenv").config({ path: "C:/Users/USER/Desktop/RECALL/.env", quiet: true });
const KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const MODEL = process.env.STT_MODEL ?? "gemini-3.5-flash";

for (const file of process.argv.slice(2)) {
  const data = readFileSync(file).toString("base64");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inlineData: { mimeType: "audio/wav", data } },
            { text: "Transcribe this audio verbatim. Output only the spoken words, nothing else." },
          ],
        },
      ],
    }),
  });
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? JSON.stringify(j).slice(0, 300);
  console.log(`${file.split(/[\\/]/).pop()}: ${text.trim()}`);
}
