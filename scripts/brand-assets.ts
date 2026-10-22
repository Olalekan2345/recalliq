/**
 * Generate brand assets from the source logo (public/logo.png).
 *   pnpm brand:assets
 *
 * - Removes the white background that is connected to the image border
 *   (flood fill), so white areas inside the mark (the walrus face) stay opaque,
 *   and un-blends anti-aliased edge pixels from white.
 * - Crops the icon mark (above the wordmark) and writes:
 *     public/brand/recalliq-mark.png   512×512 transparent (UI)
 *     src/app/icon.png                 512×512 transparent (favicon)
 *     src/app/apple-icon.png           180×180 on white (iOS home screen)
 *     src/app/opengraph-image.png      1200×630 full logo on white (link previews)
 * - Prints sampled brand colours.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const SRC = path.join(root, "public", "logo.png");

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const rgb = data;
const whiteDist = (i: number) => 255 - Math.min(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!);

// Flood fill background from the border through near-white pixels.
const FILL_LIMIT = 70;
const bg = new Uint8Array(W * H);
const stack: number[] = [];
for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
while (stack.length) {
  const p = stack.pop()!;
  if (bg[p] || whiteDist(p) >= FILL_LIMIT) continue;
  bg[p] = 1;
  const x = p % W;
  if (x > 0) stack.push(p - 1);
  if (x < W - 1) stack.push(p + 1);
  if (p >= W) stack.push(p - W);
  if (p < W * (H - 1)) stack.push(p + W);
}

// RGBA with alpha from distance to white on background-connected pixels; un-blend from white.
const rgba = Buffer.alloc(W * H * 4);
for (let p = 0; p < W * H; p++) {
  let a = 1;
  // Slightly steeper than linear: trims the faint white glow at the rim without roughening edges.
  if (bg[p]) a = Math.min(1, Math.max(0, (whiteDist(p) - 10) / (FILL_LIMIT - 10))) ** 1.15;
  for (let c = 0; c < 3; c++) {
    const v = rgb[p * 3 + c]!;
    rgba[p * 4 + c] = a > 0 ? Math.round(Math.min(255, Math.max(0, (v - 255 * (1 - a)) / a))) : 0;
  }
  rgba[p * 4 + 3] = Math.round(a * 255);
}

// Find the gap between the mark and the wordmark: the first fully transparent row band below the mark.
const rowOpaque = (y: number) => {
  for (let x = 0; x < W; x++) if (rgba[(y * W + x) * 4 + 3]! > 24) return true;
  return false;
};
let top = 0;
while (top < H && !rowOpaque(top)) top++;
let y = top;
while (y < H && rowOpaque(y)) y++;
const markBottom = y; // first empty row after the mark
let left = W;
let right = 0;
for (let yy = top; yy < markBottom; yy++) {
  for (let x = 0; x < W; x++) {
    if (rgba[(yy * W + x) * 4 + 3]! > 24) {
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
}
const markW = right - left + 1;
const markH = markBottom - top;
console.log(`source ${W}×${H}; mark bbox x=${left}..${right} y=${top}..${markBottom - 1} (${markW}×${markH})`);

const full = sharp(rgba, { raw: { width: W, height: H, channels: 4 } });
const mark = await full.clone().extract({ left, top, width: markW, height: markH }).png().toBuffer();

async function square(size: number, padRatio: number, background: { r: number; g: number; b: number; alpha: number }) {
  const inner = Math.round(size * (1 - 2 * padRatio));
  const resized = await sharp(mark)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: resized, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const white = { r: 255, g: 255, b: 255, alpha: 1 };
mkdirSync(path.join(root, "public", "brand"), { recursive: true });
writeFileSync(path.join(root, "public", "brand", "recalliq-mark.png"), await square(512, 0.02, transparent));
// Favicons render at 16–64 px; 192 px keeps the file small.
writeFileSync(path.join(root, "src", "app", "icon.png"), await square(192, 0.02, transparent));
writeFileSync(path.join(root, "src", "app", "apple-icon.png"), await square(180, 0.1, white));

const og = await sharp(SRC).resize({ height: 560, fit: "inside" }).toBuffer();
writeFileSync(
  path.join(root, "src", "app", "opengraph-image.png"),
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: og, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer(),
);
writeFileSync(path.join(root, "src", "app", "opengraph-image.alt.txt"), "RecallIQ logo — a walrus inside a magnifying-glass Q");

// Sample brand colours (average of a small patch) from the opaque mark.
const sample = (sx: number, sy: number) => {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const p = (sy + dy) * W + (sx + dx);
      r += rgb[p * 3]!;
      g += rgb[p * 3 + 1]!;
      b += rgb[p * 3 + 2]!;
      n++;
    }
  const hex = (v: number) =>
    Math.round(v / n)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
};
const at = (fx: number, fy: number) => sample(Math.round(left + fx * markW), Math.round(top + fy * markH));
console.log("ring top-left (cyan):", at(0.12, 0.3));
console.log("ring left (blue):    ", at(0.03, 0.5));
console.log("ring bottom (blue):  ", at(0.4, 0.95));
console.log("tail (violet):       ", at(0.93, 0.88));
console.log("ring right (violet): ", at(0.985, 0.55));
console.log("Wrote public/brand/recalliq-mark.png, src/app/icon.png, src/app/apple-icon.png, src/app/opengraph-image.png");
