/**
 * playwright.config.ts — E2E config for the hush cockpit (G1; PLAN §9).
 *
 * Scoped to cockpit/*.spec.ts. The spec boots cockpit/server.mjs itself (so the
 * server lifecycle is owned by the test, not a webServer block) — this keeps the
 * acceptance + unit (Vitest) suites independent of a long-running server.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./cockpit",
  testMatch: "**/*.spec.ts",
  fullyParallel: false, // the views share one cockpit server instance
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : [["list"]],
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:7793",
    trace: "off",
    screenshot: "off", // the spec captures explicit per-view screenshots
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
