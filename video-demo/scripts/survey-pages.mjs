// Full-page stills of every page planned for the video (planning only, not used in the edit).
//   node survey-pages.mjs <storageState.json> <outDir>
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("C:/Users/USER/Desktop/RECALL/package.json");
const { chromium } = require("@playwright/test");

const [state, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const LOCAL = "http://localhost:3300";
const pages = [
  ["memory-vault", `${LOCAL}/memory`],
  ["memory-failure-lesson", `${LOCAL}/memory/50b39a3d-523b-493c-80f2-72da5c3ddc31`],
  ["run-a-failure", `${LOCAL}/workspace/run/c6158cb4-d9c5-48c1-b281-2cf980004eeb`],
  ["run-b-recall", `${LOCAL}/workspace/run/b4823d2e-ad83-41c7-b636-b8974b051802`],
  ["learning-lab", `${LOCAL}/learning`],
  ["tools", `${LOCAL}/tools`],
  ["payments", `${LOCAL}/payments`],
  ["workspace", `${LOCAL}/workspace`],
];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, storageState: state, reducedMotion: "reduce" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
for (const [name, url] of pages) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(name, "height", h, "url", page.url().replace(LOCAL, ""));
}
console.log(JSON.stringify({ errors }));
await browser.close();
