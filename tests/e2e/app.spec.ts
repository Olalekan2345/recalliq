/**
 * E2E: real browser, real server, real database. External integrations are
 * whatever the target deployment has configured — the assertions check that
 * the UI reports their state honestly either way.
 */
import { expect, test, type Page } from "@playwright/test";

const password = "correct-horse-battery-staple";

/** Navigate and wait until the page has loaded its JavaScript (hydrated) before interacting. */
async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/**
 * Better Auth limits sign-up/sign-in per IP (3 per 10 s) and the suite signs up
 * often from one machine: on a 429, wait out X-Retry-After and submit again.
 */
async function submitAuth(page: Page, button: string, endpoint: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(endpoint) && r.request().method() === "POST"),
      page.getByRole("button", { name: button, exact: true }).click(),
    ]);
    if (res.status() !== 429) return page.waitForURL("**/workspace");
    await page.waitForTimeout((Number(res.headers()["x-retry-after"]) || 10) * 1000 + 500);
  }
  throw new Error(`${endpoint} stayed rate-limited`);
}

async function signUp(page: Page) {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await gotoReady(page, "/sign-up");
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await submitAuth(page, "Create account", "/api/auth/sign-up");
  return email;
}

test("landing page explains the product without fabricated stats", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your AI remembers. Your intelligence evolves.");
  await expect(page.getByRole("link", { name: "Launch RecallIQ" }).first()).toHaveAttribute("href", "/sign-up");
  await expect(page.getByRole("heading", { name: "Live integration status" })).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\b\d{1,3}(,\d{3})+\s+(users|investigations|developers)\b/i);
  expect(body).not.toMatch(/testimonial/i);
});

test("“See How It Works” takes you to Inside RecallIQ", async ({ page }) => {
  await gotoReady(page, "/");
  await page.getByRole("link", { name: "See How It Works" }).click();
  await expect(page).toHaveURL(/#inside$/);
  await expect(page.getByRole("heading", { name: "Intelligence That Learns." })).toBeInViewport();
});

test("Inside RecallIQ film: chapters, guided play, skip and CTA (desktop)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "The scroll film runs on large screens only");
  await gotoReady(page, "/");
  // The film is lazy-loaded once the page is idle and its section is near; bring it close and wait for it.
  await page.locator("#inside").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-film]")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Intelligence That Learns." })).toBeVisible();

  const rail = page.getByRole("navigation", { name: "Film chapters" });
  await rail.getByRole("button", { name: "Remember" }).click();
  await expect(rail.getByRole("button", { name: "Remember" })).toHaveAttribute("aria-current", "step", { timeout: 10_000 });

  // Guided play advances the page and stops on any key press.
  const before = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: "Play film" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 50);
  await page.keyboard.press("Shift");
  await expect(page.getByRole("button", { name: /Play film|Replay film/ })).toBeVisible();

  await expect(page.getByRole("link", { name: "Explore RecallIQ" })).toHaveAttribute("href", "/workspace");
  await page.getByRole("link", { name: "Skip film" }).click();
  await expect(page).toHaveURL(/#after-film$/);
});

test("Inside RecallIQ reads as plain chapters with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoReady(page, "/");
  await expect(page.locator("[data-film]")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Every question starts an investigation. Every experience can become a lesson." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Most AI forgets. RecallIQ remembers. Powered by Walrus Memory." })).toBeAttached();
  await expect(page.getByRole("link", { name: "Explore RecallIQ" })).toHaveAttribute("href", "/workspace");
});

test("back to top appears on long pages and returns to the heading", async ({ page }) => {
  await gotoReady(page, "/");
  const button = page.getByRole("button", { name: "Back to top" });
  await expect(button).toBeHidden();
  await page.locator("#faq").scrollIntoViewIfNeeded();
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 }).toBeLessThan(5);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(button).toBeHidden();
});

test("mobile navigation drawer opens and closes with Escape", async ({ page }) => {
  await signUp(page);
  const open = page.getByRole("button", { name: "Open navigation" });
  test.skip(!(await open.isVisible()), "Sidebar is always visible at this width");
  await open.click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer.getByRole("link", { name: "Memory Vault" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("protected pages require a session", async ({ page }) => {
  await page.goto("/memory");
  await page.waitForURL("**/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("sign up, sign out and sign back in", async ({ page }) => {
  const email = await signUp(page);
  await expect(page.getByRole("heading", { name: "What should we investigate?" })).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await gotoReady(page, "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await submitAuth(page, "Sign in", "/api/auth/sign-in");
});

test("wrong password shows an inline error", async ({ page }) => {
  await gotoReady(page, "/sign-in");
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Either the credential error or Better Auth's sign-in rate limit — both must render inline.
  await expect(page.locator("form").getByRole("alert")).toContainText(/incorrect|too many requests/i);
});

test("dashboard pages render real empty states", async ({ page }) => {
  await signUp(page);
  const checks: Array<[string, RegExp]> = [
    ["/investigations", /No investigations yet/],
    ["/memory", /No memories yet/],
    ["/tools", /Insufficient data to estimate reliability/],
    ["/payments", /No payments yet/],
    ["/learning", /No evaluations yet/],
    ["/settings", /Integrations/],
  ];
  for (const [path, text] of checks) {
    await page.goto(path);
    await expect(page.locator("main")).toContainText(text);
  }
});

test("workspace reports integration state honestly and validates input", async ({ page }) => {
  await signUp(page);
  const res = await page.request.get("/api/integrations/health");
  const { checks } = (await res.json()) as { checks: Array<{ integration: string; status: string }> };
  const llm = checks.find((c) => c.integration === "llm")!;
  if (llm.status !== "ok") {
    await expect(page.getByText("The AI model is not configured on this deployment")).toBeVisible();
    await expect(page.getByRole("button", { name: "Investigate" })).toBeDisabled();
  } else {
    await page.getByLabel("What should RecallIQ investigate?").fill("Check this");
    await page.getByRole("button", { name: "Identifiers" }).click();
    await page.getByLabel("Transaction digest (optional)").fill("not-a-digest");
    await page.getByRole("button", { name: "Investigate" }).click();
    // Scope to the form: Next.js also renders a route announcer with role="alert".
    await expect(page.locator("form").getByRole("alert")).toContainText(/not a valid Sui digest/i);
  }
});

test("starting an investigation shows live backend activity (requires a configured LLM)", async ({ page }) => {
  const res = await page.request.get("/api/integrations/health");
  const { checks } = (await res.json()) as { checks: Array<{ integration: string; status: string }> };
  test.skip(checks.find((c) => c.integration === "llm")?.status !== "ok", "LLM not configured on this deployment");
  await signUp(page);
  await page.getByLabel("What should RecallIQ investigate?").fill("What is the current checkpoint height on Sui Mainnet, and what does a checkpoint contain?");
  await page.getByRole("button", { name: "Investigate" }).click();
  await page.waitForURL("**/workspace/run/**");
  // The run page renders a freshly created run from the database; allow for a busy server.
  await expect(page.getByText("Agent activity")).toBeVisible({ timeout: 15_000 });
  // Both steps appear once the worker picks the run up; either proves real backend activity.
  await expect(page.getByText(/Understanding the request|Investigation queued/).first()).toBeVisible({ timeout: 30_000 });
});

test("guest access is limited and labelled", async ({ page }) => {
  await page.goto("/sign-in?guest=1");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await page.waitForURL("**/workspace");
  await expect(page.getByText(/Guest session: a few read-only investigations per day/)).toBeVisible();
  await page.goto("/payments");
  await expect(page.locator("main")).toContainText("Guest sessions cannot make payments");
});

test("opens in the light theme even when the OS prefers dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  for (const path of ["/", "/sign-up", "/sign-in?guest=1"]) {
    await gotoReady(page, path);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  }
  // …and the dashboard, the first time a (guest) user lands in it.
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await page.waitForURL("**/workspace");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("dark mode is an optional setting that persists", async ({ page }) => {
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitemradio", { name: "dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await gotoReady(page, "/sign-in");
  await expect(page.locator("html")).toHaveClass(/dark/);
});
