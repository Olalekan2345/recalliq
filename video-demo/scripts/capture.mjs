// Records genuine full-motion footage of the running app with Chromium's screencast
// (CDP Page.startScreencast), then encodes a constant-30-fps H.264 clip with ffmpeg.
//   node capture.mjs <shot> [<shot>...]        shots are defined in ./shots.mjs
// Env: DEMO_STATE (Playwright storage state for the local demo session), FFMPEG (path).
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { SHOTS } from "./shots.mjs";

const require = createRequire("C:/Users/USER/Desktop/RECALL/package.json");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "assets", "captures");
const TMP = path.join(ROOT, "out", "frames");
const FFMPEG = process.env.FFMPEG ?? "C:/Users/USER/Desktop/DATA/node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe";
mkdirSync(OUT, { recursive: true });

/** A visible pointer for viewers (the headless browser has none). Presentation only. */
const CURSOR = `
  (() => {
    const make = () => {
      if (document.getElementById("__demo_cursor")) return;
      const c = document.createElement("div");
      c.id = "__demo_cursor";
      c.style.cssText = "position:fixed;left:-40px;top:-40px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(19,113,201,.28);border:2px solid rgba(19,113,201,.85);box-shadow:0 2px 10px rgba(16,28,68,.25);z-index:2147483647;pointer-events:none;transition:transform .12s ease";
      document.documentElement.appendChild(c);
      addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
      addEventListener("mousedown", () => { c.style.transform = "scale(.7)"; }, true);
      addEventListener("mouseup", () => { c.style.transform = ""; }, true);
    };
    if (document.readyState === "loading") addEventListener("DOMContentLoaded", make); else make();
  })();`;

/** Helpers handed to each shot. */
function helpers(page) {
  return {
    page,
    wait: (ms) => page.waitForTimeout(ms),
    /** Eased scroll of the window to an absolute y or to an element's top (minus an offset). */
    async scrollTo(target, ms = 1400, offset = 90) {
      const y =
        typeof target === "number"
          ? target
          : await page.locator(target).first().evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
      await page.evaluate(
        ({ y, ms }) =>
          new Promise((done) => {
            const from = window.scrollY;
            const to = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
            const t0 = performance.now();
            const step = (now) => {
              const k = Math.min(1, (now - t0) / ms);
              const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
              window.scrollTo(0, from + (to - from) * e);
              if (k < 1) requestAnimationFrame(step);
              else done();
            };
            requestAnimationFrame(step);
          }),
        { y, ms },
      );
    },
    /** Glide the pointer to an element's centre, then click it. */
    async clickOn(locator, ms = 700) {
      const box = await locator.boundingBox();
      if (!box) throw new Error("element not visible");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: Math.max(8, Math.round(ms / 16)) });
      await page.waitForTimeout(150);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    },
    async moveTo(locator, ms = 700) {
      const box = await locator.boundingBox();
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: Math.max(8, Math.round(ms / 16)) });
    },
  };
}

async function record(browser, name, shot) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 810 },
    deviceScaleFactor: 4 / 3, // 1920×1080 device pixels: larger, readable UI in a 1080p frame
    storageState: shot.auth ? process.env.DEMO_STATE : undefined,
    colorScheme: "light",
  });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(shot.url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.mouse.move(1300, 700);
  if (shot.before) await shot.before(helpers(page));

  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    // Timestamp on arrival: the screencast's own metadata.timestamp does not track wall time
    // (clips came out up to 1.6× longer than the real interaction).
    void metadata;
    frames.push({ t: performance.now() / 1000, data });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = Date.now();
  await shot.run(helpers(page));
  await page.waitForTimeout(400);
  await cdp.send("Page.stopScreencast");
  const wall = (Date.now() - t0) / 1000;
  const meta = shot.meta ? await shot.meta(page) : {};
  await ctx.close();

  // Frames → constant 30 fps clip: each frame is held until the next one arrived.
  const dir = path.join(TMP, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const lines = [];
  frames.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(f.data, "base64"));
    // Real capture timestamps: frames arrive in bursts while scrolling, so any minimum
    // duration here would stretch the clip into slow motion. ffmpeg's -r 30 drops extras.
    const dur = i < frames.length - 1 ? Math.max(0.0005, frames[i + 1].t - f.t) : 0.5;
    lines.push(`file '${file.replace(/\\/g, "/")}'`, `duration ${dur.toFixed(4)}`);
  });
  if (frames.length) lines.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, "0")}.jpg`).replace(/\\/g, "/")}'`);
  writeFileSync(path.join(dir, "list.txt"), lines.join("\n"));
  const out = path.join(OUT, `${name}.mp4`);
  const r = spawnSync(
    FFMPEG,
    ["-y", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"), "-vf", "scale=1920:1080:flags=lanczos", "-fps_mode", "cfr", "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${name}: ${r.stderr.slice(-600)}`);
  rmSync(dir, { recursive: true, force: true });
  const size = frames.length ? (() => { const b = Buffer.from(frames[0].data, "base64"); for (let i = 2; i < b.length; ) { const m = b[i + 1]; const len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc2) return `${b.readUInt16BE(i + 7)}x${b.readUInt16BE(i + 5)}`; i += 2 + len; } return "?"; })() : "-";
  console.log(JSON.stringify({ shot: name, frameSize: size, frames: frames.length, seconds: Math.round(wall * 10) / 10, out: path.relative(ROOT, out), errors, ...meta }));
}

// Render at 4/3 device scale so the screencast delivers true 1920×1080 frames of a 1440×810 layout.
const browser = await chromium.launch({ args: ["--force-device-scale-factor=1.3333333"] });
for (const name of process.argv.slice(2)) {
  const shot = SHOTS[name];
  if (!shot) throw new Error(`unknown shot ${name}`);
  await record(browser, name, shot);
}
await browser.close();
