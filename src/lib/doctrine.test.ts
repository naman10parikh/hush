import { describe, it, expect } from "vitest";
import { recommendTool, rotationPlan, remediationPlan } from "./doctrine.js";

describe("recommendTool (G-01: never a single price)", () => {
  it("recommends a portfolio, not a single brand, for rotation", () => {
    const r = recommendTool("rotation");
    expect(r.default.length).toBeGreaterThan(0);
    expect(r.brain_refs.length).toBeGreaterThan(0);
  });

  it("never returns a dollar figure in any field (G-01)", () => {
    for (const job of ["rotation", "scanning", "at-rest", "runtime", "broker", "k8s", "unknown"]) {
      const r = recommendTool(job);
      const blob = JSON.stringify(r);
      expect(blob).not.toMatch(/\$\s?\d/);
    }
  });
});

describe("rotationPlan", () => {
  it("uses ISSUE→DEPLOY→VERIFY→REVOKE and warns on GCP notify-only", () => {
    const p = rotationPlan("db-cred", false);
    expect(p.pattern).toBe("ISSUE→DEPLOY→VERIFY→REVOKE");
    expect(p.gcp_notify_only_warning.toLowerCase()).toContain("notify-only");
  });

  it("adds alternating-users for live connections (S-10/P-07)", () => {
    const p = rotationPlan("db-cred", true);
    expect(p.alternating_users).toBe(true);
    expect(p.steps.join(" ").toLowerCase()).toContain("alternating");
  });
});

describe("remediationPlan (S-13/P-04)", () => {
  it("is rotate-first, consent-gated, and refuses blind line-number surgery", () => {
    const p = remediationPlan("leaked.env");
    expect(p.rotate_first).toBe(true);
    expect(p.consent_required_for_scrub).toBe(true);
    expect(p.warning.toLowerCase()).toContain("line number");
    expect(p.ordered_steps[0]?.toLowerCase()).toContain("rotate");
  });
});
