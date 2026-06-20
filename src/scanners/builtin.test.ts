import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtinScan } from "./builtin.js";

function gitRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "hush-scan-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@hush.local"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "hush"], { cwd: dir });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "x"], { cwd: dir });
  return dir;
}

describe("builtinScan (GT-3: no-FN AND no-FP)", () => {
  let plantedDir: string;
  let cleanDir: string;

  beforeAll(() => {
    plantedDir = gitRepo({
      "leaked.env": "ANTHROPIC_API_KEY=sk-ant-DUMMYDUMMYDUMMYDUMMYDUMMYDUMMY00\n",
    });
    cleanDir = gitRepo({
      "README.md": "# project\nok\n",
      "test.txt": 'password = "password"\nconst sha = "a".repeat(40)\n',
    });
  });

  afterAll(() => {
    rmSync(plantedDir, { recursive: true, force: true });
    rmSync(cleanDir, { recursive: true, force: true });
  });

  it("finds the planted key (no false-negative)", () => {
    const r = builtinScan(plantedDir, { history: true });
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings.some((f) => f.rule === "anthropic-api-key")).toBe(true);
  });

  it("redacts the secret in the finding (O-09)", () => {
    const r = builtinScan(plantedDir, { history: true });
    const blob = JSON.stringify(r.findings);
    expect(blob).not.toMatch(/sk-ant-[A-Za-z]/);
  });

  it("does NOT flag a clean repo (no false-positive storm, S-12)", () => {
    const r = builtinScan(cleanDir, { history: true });
    expect(r.findings.length).toBe(0);
  });
});
