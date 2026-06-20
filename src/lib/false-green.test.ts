import { describe, it, expect } from "vitest";
import { advise } from "./false-green.js";

describe("advise — false-green detection", () => {
  it("flags `git rm --cached` as a false-green (S-01/P-06)", () => {
    const r = advise("git rm --cached fixed it");
    expect(r.verdict).toBe("false-green");
    expect(r.false_green).toBe(true);
    expect(r.doctrine.toLowerCase()).toContain("rotate");
    expect(r.brain_refs).toContain("O-04");
  });

  it("flags sops updatekeys-only as a false-green (S-05/P-09)", () => {
    const r = advise("a teammate left so I ran sops updatekeys to remove their key");
    expect(r.verdict).toBe("false-green");
    expect(r.brain_refs).toContain("P-09");
  });

  it("flags GCP 'rotation enabled' as notify-only false-green (S-09/P-08)", () => {
    const r = advise("I enabled rotation on GCP Secret Manager");
    expect(r.verdict).toBe("false-green");
    expect(r.brain_refs).toContain("P-08");
  });

  it("says rotate-first for a committed key (S-01)", () => {
    const r = advise("an API key was committed to the repo");
    expect(r.verdict).toBe("rotate-first");
    expect(r.false_green).toBe(false);
  });

  it("accepts a proven-rotated key as correct", () => {
    const r = advise("the key was rotated and the old one is revoked");
    expect(r.verdict).toBe("correct");
  });

  it("rejects overwrite-in-place for live connections (S-10/P-07)", () => {
    const r = advise("I'll just overwrite the password in place on the live production DB");
    expect(r.verdict).toBe("rotate-first");
    expect(r.brain_refs).toContain("P-07");
  });
});
