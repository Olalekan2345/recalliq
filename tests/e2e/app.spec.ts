/**
 * E2E: real browser, real server, real database. External integrations are
 * whatever the target deployment has configured — the assertions check that
 * the UI reports their state honestly either way.
 */
import { expect, test, type Page } from "@playwright/test";

const password = "correct-horse-battery-staple";

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
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await submitAuth(page, "Create account", "/api/auth/sign-up");
  return email;
}

test("landing page explains the product without fabricated stats", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AI that remembers its mistakes");
  await expect(page.getByRole("heading", { name: "Live integration status" })).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\b\d{1,3}(,\d{3})+\s+(users|investigations|developers)\b/i);
  expect(body).not.toMatch(/testimonial/i);
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
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await submitAuth(page, "Sign in", "/api/auth/sign-in");
});

test("wrong password shows an inline error", async ({ page }) => {
  await page.goto("/sign-in");
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
  await expect(page.getByText("Agent activity")).toBeVisible();
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

test("dark mode toggles", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitemradio", { name: "dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
