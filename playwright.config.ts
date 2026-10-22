import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a running RecallIQ server (default http://localhost:3300) backed
 * by a real PostgreSQL database. Start it with `pnpm build && pnpm start`
 * (and `pnpm dev:db` locally), or point E2E_BASE_URL at a deployment.
 */
export default defineConfig({
  testDir: "tests/e2e",
  // Room for waiting out the auth rate limit (see submitAuth in tests/e2e/app.spec.ts).
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3300",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
