import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baselineNeeded, gitleaksScan } from "./gitleaks.js";

function hasGitleaks(): boolean {
  try {
    execFileSync("gitleaks", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("gitleaks baseline fallback (S-12/P-03)", () => {
  it("uses hush's baseline only when the repo has no gitleaks config of its own", () => {
    const repo = mkdtempSync(join(tmpdir(), "hush-gl-"));
    expect(baselineNeeded(repo, {})).toBe(true);
    expect(baselineNeeded(repo, { GITLEAKS_CONFIG: "/elsewhere/gitleaks.toml" })).toBe(false);
    expect(baselineNeeded(repo, { GITLEAKS_CONFIG_TOML: "[extend]\nuseDefault = true\n" })).toBe(false);
    writeFileSync(join(repo, ".gitleaks.toml"), "[extend]\nuseDefault = true\n");
    expect(baselineNeeded(repo, {})).toBe(false);
  });

  // The runner has no gitleaks binary, so this runs where gitleaks is installed (the case GT-3 failed on).
  it.skipIf(!hasGitleaks())("reports no finding on stopword decoys when gitleaks is installed", () => {
    const repo = mkdtempSync(join(tmpdir(), "hush-gl-decoys-"));
    const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
    git("init", "-q");
    git("config", "user.email", "decoys@hush.test");
    git("config", "user.name", "hush-decoys");
    git("config", "commit.gpgsign", "false");
    writeFileSync(
      join(repo, "main.tf"),
      'password = "password"\nadmin_password = "changeme"\ndefault_password = "secret"\n',
    );
    git("add", "main.tf");
    git("commit", "-qm", "decoys");
    const result = gitleaksScan(repo, "detect");
    expect(result.available).toBe(true);
    expect(result.findings).toHaveLength(0);
  });
});
