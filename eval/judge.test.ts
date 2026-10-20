/**
 * The L3 judge is available only when it is told which model to judge with: the Messages API needs a model name,
 * and hush never picks one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { judgeAvailable } from "./judge.mjs";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the L3 judge gate", () => {
  it("is unavailable with a key but no HUSH_JUDGE_MODEL", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("HUSH_JUDGE_MODEL", "");
    expect(judgeAvailable()).toBe(false);
  });

  it("is available with both", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("HUSH_JUDGE_MODEL", "judge-model-from-env");
    expect(judgeAvailable()).toBe(true);
  });
});
