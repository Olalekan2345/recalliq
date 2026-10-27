// Shot list for the RecallIQ demo. Every shot drives the real app; nothing is mocked.
// LOCAL = the owner's running instance (same build as production, Sui Mainnet + Walrus Mainnet);
// PROD  = the public deployment.
const LOCAL = "http://localhost:3300";
const PROD = "https://recalliq-seven.vercel.app";

// Genuine records (see evidence/evidence-manifest.md).
const RUN_A = "c6158cb4-d9c5-48c1-b281-2cf980004eeb"; // failure: contradicted claim → autopsy → lesson stored on Walrus
const RUN_B = "b4823d2e-ad83-41c7-b636-b8974b051802"; // later session: lesson recalled → report rejected → 4/4 verified
const LESSON = "50b39a3d-523b-493c-80f2-72da5c3ddc31"; // "Factual claim made without checkable evidence"
const BLOB = "qXq-A_vKJY87zubVjU5RSgV79CRokPP6cPQndbd5e2g";

export const LIVE_QUESTION = "What has this address been doing on Sui recently, and what does it interact with? 0x77776760c06997206b13fa76f127aa016d24a645f04fce516be153ece0bddf23";

/** Keep the newest activity step in view while a run streams. */
async function followActivity(page, untilDone) {
  for (;;) {
    const done = await untilDone();
    await page.evaluate(() => {
      const items = document.querySelectorAll('ol[aria-live="polite"] > li');
      const last = items[items.length - 1];
      if (!last) return;
      const target = last.getBoundingClientRect().bottom + window.scrollY - innerHeight * 0.78;
      if (Math.abs(target - window.scrollY) > 24) window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    });
    if (done) return;
    await page.waitForTimeout(700);
  }
}

export const SHOTS = {
  "prod-home": {
    url: `${PROD}/`,
    async run({ wait, scrollTo }) {
      await wait(4200);
      await scrollTo(380, 2600);
      await wait(1600);
    },
  },

  "prod-status": {
    url: `${PROD}/`,
    async before({ page }) {
      await page.evaluate(() => document.getElementById("faq")?.scrollIntoView());
      await page.waitForTimeout(1500);
    },
    async run({ page, wait, moveTo }) {
      await wait(800);
      await moveTo(page.getByRole("heading", { name: "Live integration status" }), 900);
      await wait(4200);
    },
  },

  "live-run": {
    url: `${LOCAL}/workspace`,
    auth: true,
    async run({ page, wait, clickOn }) {
      await wait(900);
      await clickOn(page.getByLabel("What should RecallIQ investigate?"));
      await page.keyboard.type(LIVE_QUESTION, { delay: 22 });
      await wait(700);
      await clickOn(page.getByRole("button", { name: "Investigate", exact: true }));
      await page.waitForURL("**/workspace/run/**", { timeout: 60_000 });
      await wait(1200);
      const finished = page.getByText(/^Investigation (complete|partially complete)$/);
      await followActivity(page, async () => (await finished.count()) > 0);
      await wait(1800);
    },
    meta: async (page) => ({ runUrl: page.url() }),
  },

  "live-result": {
    get url() {
      if (!process.env.LIVE_RUN_URL) throw new Error("set LIVE_RUN_URL");
      return process.env.LIVE_RUN_URL;
    },
    auth: true,
    async run({ page, wait, scrollTo, clickOn }) {
      await wait(2200);
      await scrollTo('text="Claims & verification"', 1800);
      await wait(2600);
      await scrollTo(0, 1400);
      await wait(600);
      await clickOn(page.getByRole("tab", { name: "Memory" }));
      await wait(3600);
      await clickOn(page.getByRole("tab", { name: "Tools" }));
      await wait(3600);
    },
  },

  // The live run's Memory tab, scrolled to the recalled lessons and their Walrus blob IDs, then its Tools tab.
  "live-memory": {
    get url() {
      if (!process.env.LIVE_RUN_URL) throw new Error("set LIVE_RUN_URL");
      return process.env.LIVE_RUN_URL;
    },
    auth: true,
    async run({ page, wait, scrollTo, clickOn }) {
      await wait(900);
      await clickOn(page.getByRole("tab", { name: "Memory" }));
      await wait(700);
      await scrollTo('text="Recalled from Walrus blob"', 1800, 330);
      await wait(3600);
      await scrollTo(await page.evaluate(() => window.scrollY + 520), 1600);
      await wait(2800);
      await scrollTo(0, 1200);
      await wait(400);
      await clickOn(page.getByRole("tab", { name: "Tools" }));
      await wait(700);
      await scrollTo('text="Paid analysis not offered"', 1600, 380);
      await wait(3600);
    },
  },

  "run-a": {
    url: `${LOCAL}/workspace/run/${RUN_A}`,
    auth: true,
    async run({ page, wait, scrollTo, clickOn }) {
      await wait(2200);
      await scrollTo('text="Claims & verification"', 1800);
      await wait(1200);
      await clickOn(page.getByRole("button", { name: "Toggle verification details" }).nth(1));
      await wait(3800);
      await scrollTo('text="Running agent autopsy"', 2000, 260);
      await wait(4200);
    },
  },

  "run-a-worthit": {
    url: `${LOCAL}/workspace/run/${RUN_A}`,
    auth: true,
    async run({ page, wait, clickOn }) {
      await wait(1200);
      await clickOn(page.getByRole("tab", { name: "Tools" }));
      await wait(4200);
    },
  },

  lesson: {
    url: `${LOCAL}/memory/${LESSON}`,
    auth: true,
    async run({ page, wait, scrollTo, moveTo }) {
      await wait(2000);
      await moveTo(page.getByText("Stored on Walrus").first(), 900);
      await wait(2600);
      await scrollTo('text="Future session"', 2200, 160);
      await wait(2200);
      await scrollTo('text="Changed decision"', 1800, 200);
      await wait(3600);
    },
  },

  walruscan: {
    url: `https://walruscan.com/mainnet/blob/${BLOB}`,
    async run({ wait }) {
      await wait(6000);
    },
  },

  "run-b": {
    url: `${LOCAL}/workspace/run/${RUN_B}`,
    auth: true,
    async run({ wait, scrollTo }) {
      await wait(1800);
      await scrollTo('text="Recalled 2 memories (2 relevant)"', 2000, 220);
      await wait(2400);
      await scrollTo('text="Learned policy enforced: report rejected (cite_evidence_for_every_fact)"', 1800, 260);
      await wait(3200);
      await scrollTo('text="Running agent autopsy"', 2000, 260);
      await wait(3400);
    },
  },

  payments: {
    url: `${LOCAL}/payments`,
    auth: true,
    async run({ page, wait, moveTo }) {
      await wait(1800);
      await moveTo(page.getByText("Approval: every payment requires your explicit signature.").first(), 1000);
      await wait(3600);
    },
  },

  vault: {
    url: `${LOCAL}/memory`,
    auth: true,
    async run({ wait, scrollTo }) {
      await wait(2600);
      await scrollTo(330, 2400);
      await wait(2600);
    },
  },

  tools: {
    url: `${LOCAL}/tools`,
    auth: true,
    async run({ wait, scrollTo }) {
      await wait(2600);
      await scrollTo('text="Forensic Analyzer (paid, x402)"', 3200, 330);
      await wait(3000);
    },
  },

  learning: {
    url: `${LOCAL}/learning`,
    auth: true,
    async run({ wait, scrollTo }) {
      await wait(2400);
      await scrollTo('text="Memory influence traces"', 2600, 110);
      await wait(3000);
      await scrollTo('text="Error recurrence"', 3000, 120);
      await wait(2600);
    },
  },
};
