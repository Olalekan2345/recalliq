// QA stills: bundle once, render frames at the given seconds, and build a contact sheet.
//   node scripts/stills.mjs <outDir> 2.5 9 31 ...
import path from "node:path";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const require = createRequire("C:/Users/USER/Desktop/RECALL/package.json");
const sharp = require("sharp");
const ROOT = path.resolve(import.meta.dirname, "..");
const [out, ...times] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src", "index.ts"), publicDir: path.join(ROOT, "assets") });
const composition = await selectComposition({ serveUrl, id: "RecallIQDemo" });
const files = [];
for (const t of times) {
  const file = path.join(out, `t${String(t).padStart(6, "0")}.png`);
  await renderStill({ serveUrl, composition, frame: Math.round(Number(t) * composition.fps), output: file, overwrite: true });
  files.push([t, file]);
  console.log("still", t);
}
const W = 640;
const H = 360;
const tiles = await Promise.all(
  files.map(async ([t, f]) => {
    const label = Buffer.from(`<svg width="${W}" height="${H}"><rect width="110" height="34" fill="#000"/><text x="8" y="24" font-size="22" fill="#fff" font-family="Arial">${t}s</text></svg>`);
    return sharp(await sharp(f).resize(W, H).png().toBuffer()).composite([{ input: label, top: 0, left: 0 }]).png().toBuffer();
  }),
);
const cols = 3;
await sharp({ create: { width: cols * (W + 10), height: Math.ceil(tiles.length / cols) * (H + 10), channels: 3, background: "#555" } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * (W + 10), top: Math.floor(i / cols) * (H + 10) })))
  .png()
  .toFile(path.join(out, "sheet.png"));
console.log("sheet written");
