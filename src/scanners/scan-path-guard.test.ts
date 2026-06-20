/**
 * scan-path-guard.test.ts — regression net for the T-user finding:
 * `hush scan <nonexistent-or-non-git-path>` MUST NOT report a false "all clear".
 *
 * A typo'd path returning {findings:[], exitCode:0} is the most dangerous
 * false-negative for a secrets scanner (the same false-green class hush exists to
 * prevent). The fix in scanners/index.ts: a missing/non-dir path → nonzero exit +
 * an explicit "this is NOT an all-clear" note; a non-git dir → a clear warning
 * note that 0 findings does not mean clean.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo } from "./index.js";

describe("scanRepo path guard (T-user: no false all-clear)", () => {
  it("a nonexistent path → nonzero exit + explicit not-all-clear note", () => {
    const r = scanRepo({ path: join(tmpdir(), "hush-no-such-dir-xyz123") });
    expect(r.exitCode).not.toBe(0);
    expect(r.findings.length).toBe(0);
    expect(r.notes.join(" ")).toMatch(/not.*all.?clear/i);
  });

  it("a file (not a directory) → nonzero exit, not a silent pass", () => {
    // package.json always exists at the repo root when tests run.
    const r = scanRepo({ path: join(process.cwd(), "package.json") });
    expect(r.exitCode).not.toBe(0);
  });

  describe("a non-git directory", () => {
    let plainDir: string;
    beforeAll(() => {
      plainDir = mkdtempSync(join(tmpdir(), "hush-nongit-"));
    });
    afterAll(() => {
      rmSync(plainDir, { recursive: true, force: true });
    });

    it("warns that 0 findings does NOT mean clean (no git history scanned)", () => {
      const r = scanRepo({ path: plainDir });
      expect(r.notes.join(" ")).toMatch(/not a git repository/i);
    });
  });

  it("a real git repo still scans normally (no regression)", () => {
    const dir = mkdtempSync(join(tmpdir(), "hush-realrepo-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: dir });
      const r = scanRepo({ path: dir });
      // exists + is a git dir → the path guard does NOT fire; an empty clean repo
      // is exit 0 with no "all-clear" warning note.
      expect(r.exitCode).toBe(0);
      expect(r.notes.join(" ")).not.toMatch(/not.*all.?clear/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
