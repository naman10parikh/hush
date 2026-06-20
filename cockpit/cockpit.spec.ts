/**
 * cockpit/cockpit.spec.ts — Playwright E2E for the hush cockpit (G1; PLAN §9
 * "E2E: Playwright on the cockpit", PLAN §10 verify line).
 *
 * Boots cockpit/server.mjs on an ephemeral port, drives all FOUR views, asserts
 * each renders its real data, and captures a screenshot of each into
 * content/screenshots/hush-cockpit-<date>/ (the chairman's review path).
 *
 * It also asserts the cockpit's load-bearing invariants from the UI:
 *   - O-09: no live secret-shaped string is ever painted to the DOM.
 *   - the ask flow returns a `false-green` verdict for the git-rm-cached situation.
 *   - the eval board shows the acceptance task (GT-15).
 *
 * Run: pnpm exec playwright test cockpit/cockpit.spec.ts
 */
import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const PORT = 7793; // ephemeral, distinct from the default 7780
const BASE = `http://127.0.0.1:${PORT}`;

const STAMP = new Date().toISOString().slice(0, 10);
const SHOT_DIR = join(REPO_ROOT, "..", "energy", "content", "screenshots", `hush-cockpit-${STAMP}`);

// Secret-shaped detector — the DOM-side O-09 assertion.
const SECRET_SHAPED =
  /sk-ant-[A-Za-z0-9_-]{20,}|A(?:KIA|SIA)[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}/;

let server: ChildProcess;

test.beforeAll(async () => {
  mkdirSync(SHOT_DIR, { recursive: true });
  server = spawn(process.execPath, [join(HERE, "server.mjs")], {
    cwd: REPO_ROOT,
    env: { ...process.env, HUSH_COCKPIT_PORT: String(PORT) },
    stdio: "ignore",
  });
  // poll until the server answers /api/health
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error("cockpit server did not boot");
    await new Promise((r) => setTimeout(r, 250));
  }
});

test.afterAll(() => {
  server?.kill();
});

test("1. brain browser renders the doctrine + wikilink graph", async ({ page }) => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await expect(page.locator(".rail button.active")).toContainText("Brain");
  // the index lists the 6 doctrine files
  await expect(page.locator(".brain-card")).toHaveCount(6, { timeout: 10000 });
  // the reader renders rendered markdown (a heading appears)
  await expect(page.locator(".brain-reader h2").first()).toBeVisible();
  // the wikilink graph panel has nodes
  await expect(page.locator(".graph-node").first()).toBeVisible();
  await page.screenshot({ path: join(SHOT_DIR, "1-brain.png"), fullPage: true });

  // O-09: no secret-shaped string painted
  const body = await page.locator("body").innerText();
  expect(SECRET_SHAPED.test(body)).toBeFalsy();
});

test("2. run log shows redacted runs + redaction-clean note", async ({ page }) => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('.rail button[data-view="runs"]').click();
  await expect(page.locator("#view-runs")).toHaveClass(/active/);
  // the summary bento renders metric cards
  await expect(page.locator("#runs-summary .metric-card").first()).toBeVisible({ timeout: 10000 });
  // the redaction note is present (clean or flagged)
  await expect(page.locator("#runs-redact-note")).toContainText(/Redaction clean|withheld/);
  await page.screenshot({ path: join(SHOT_DIR, "2-runs.png"), fullPage: true });

  const body = await page.locator("body").innerText();
  expect(SECRET_SHAPED.test(body)).toBeFalsy();
});

test("3. eval board shows the golden tasks incl. acceptance GT-15", async ({ page }) => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('.rail button[data-view="evals"]').click();
  await expect(page.locator("#view-evals")).toHaveClass(/active/);
  // the runner is spawned server-side — wait for the board to populate
  await expect(page.locator(".eval-cell").first()).toBeVisible({ timeout: 60000 });
  // the acceptance task (GT-15) is on the board
  await expect(page.locator(".eval-cell .ec-id", { hasText: "GT-15" })).toBeVisible();
  // the banner reports a CI status
  await expect(page.locator(".eval-banner .eb-title")).toContainText(/evals/i);
  await page.screenshot({ path: join(SHOT_DIR, "3-evals.png"), fullPage: true });
});

test("4. ask the employee returns a false-green verdict (no value)", async ({ page }) => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator('.rail button[data-view="ask"]').click();
  await expect(page.locator("#view-ask")).toHaveClass(/active/);
  await page.fill("#ask-input", "I committed a .env with our API key. Does git rm --cached fix it?");
  await page.locator("#ask-send").click();
  // the verdict card appears with the false-green badge
  await expect(page.locator(".verdict-badge")).toContainText("false-green", { timeout: 15000 });
  // brain refs are surfaced
  await expect(page.locator(".ref-chip").first()).toBeVisible();
  await page.screenshot({ path: join(SHOT_DIR, "4-ask.png"), fullPage: true });

  // O-09: the verdict carries doctrine, never a value
  const answer = await page.locator(".ask-answer").innerText();
  expect(SECRET_SHAPED.test(answer)).toBeFalsy();
});
