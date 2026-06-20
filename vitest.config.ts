/**
 * vitest.config.ts — scope Vitest to the unit/integration suite (`*.test.ts`).
 *
 * The repo's convention: Vitest tests are `*.test.ts` (src/**, eval/*.test.ts);
 * the cockpit's Playwright E2E is a `.spec.ts` and is run separately via
 * `pnpm exec playwright test`. Without this scope, Vitest's default glob picks up
 * the Playwright spec and fails on the `test.beforeAll` API mismatch. Excluding
 * the spec glob keeps the two runners cleanly separated.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "**/*.spec.ts"],
  },
});
