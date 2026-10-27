// QA: when does each recording change? Samples a small greyscale thumbnail every `step`
// seconds and prints the time ranges with motion, so overlays can be timed to the footage.
//   node scripts/motion-map.mjs [step=0.2] clip [clip...]
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire("C:/Users/USER/Desktop/RECALL/package.json");
const sharp = require("sharp");
const FF = "C:/Users/USER/Desktop/DATA/node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe";
const CAP = path.resolve(import.meta.dirname, "..", "assets", "captures");
let args = process.argv.slice(2);
const step = /^[\d.]+$/.test(args[0]) ? Number(args.shift()) : 0.2;

for (const clip of args) {
  const dir = mkdtempSync(path.join(tmpdir(), "motion-"));
  execFileSync(FF, ["-v", "error", "-i", path.join(CAP, `${clip}.mp4`), "-vf", "scale=96:54", "-r", String(1 / step), path.join(dir, "f%05d.png")]);
  const files = readdirSync(dir).sort();
  let prev = null;
  const moving = [];
  for (let i = 0; i < files.length; i++) {
    const { data } = await sharp(path.join(dir, files[i])).greyscale().raw().toBuffer({ resolveWithObject: true });
    if (prev) {
      let d = 0;
      for (let j = 0; j < data.length; j++) d += Math.abs(data[j] - prev[j]);
      moving.push(d / data.length > 0.6);
    }
    prev = data;
  }
  rmSync(dir, { recursive: true, force: true });
  const ranges = [];
  moving.forEach((m, i) => {
    const t = (i + 1) * step;
    if (!m) return;
    const last = ranges.at(-1);
    if (last && t - last[1] <= step * 1.5) last[1] = t;
    else ranges.push([t - step, t]);
  });
  console.log(`${clip} (${(files.length * step).toFixed(1)}s): ` + ranges.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)}`).join("  "));
}
