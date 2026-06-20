/**
 * builtin.ts — hush's offline, zero-dependency secret scanner.
 *
 * Why it exists: the acceptance test MUST be $0 and offline-capable (PLAN
 * Assumption 3). gitleaks/trufflehog are the preferred wired tools (O-03) but
 * may be absent (verified: neither is installed in this environment). This
 * built-in scanner guarantees the core finding (a planted `sk-ant-`/`AKIA`/
 * `ghp_` key) is caught with NO binary, NO network — making the scanner stack
 * LAYERED (builtin + gitleaks + trufflehog), which is O-03's spirit, and the
 * acceptance bar starvation-proof.
 *
 * No-FP design (GT-3 / S-12): repo scanning uses only the high-signal PREFIX
 * patterns (not entropy — a 40-char git SHA is high-entropy but not a secret),
 * and skips schema/example files (placeholders are not leaks, O-02).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SECRET_PATTERNS, redact } from "../lib/redact.js";

export interface Finding {
  readonly rule: string;
  readonly file: string;
  /** Always redacted — never the raw value (O-09). */
  readonly redacted_snippet: string;
  readonly source: "working-tree" | "history";
}

/**
 * Files that are schemas/examples/tests — placeholders + dummy fixtures, never
 * real leaks (allowlist). This is the S-12/P-03 baseline: test files routinely
 * carry secret-SHAPED dummy values (`sk-ant-DUMMY…`), and flagging them is the
 * #1302 false-positive storm. EXTEND, don't disable — real secrets in real code
 * still fire. Mirrors the `.gitleaks.toml` allowlist that `hush init` generates.
 */
const ALLOWLIST_FILE =
  /(\.example|\.sample|\.template|\.schema|\.defaults)$|(^|\/)(fixtures?|testdata)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;
/** Skip obviously-binary or oversized files (perf + FP). */
const MAX_FILE_BYTES = 1_000_000;

function git(args: readonly string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function isGitRepo(cwd: string): boolean {
  try {
    git(["rev-parse", "--is-inside-work-tree"], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Obvious dummy/placeholder markers (S-12/P-03; mirrors the dummy allowlist
 * `hush init` writes into .gitleaks.toml). A `sk-ant-DUMMY…` in source/docs is a
 * placeholder, not a leak. Applied to WORKING-TREE matches only — a secret in
 * git HISTORY is the leaked-then-removed case (S-02) and is always reported,
 * which is why the acceptance test plants its key with `--history`.
 */
const DUMMY_VALUE = /DUMMY|EXAMPLE|PLACEHOLDER|CHANGEME|REDACTED|XXXXXXXX|YOUR[_-]?KEY|FAKE|\bSAMPLE\b/i;

/** Scan one blob of text; return findings tagging each match with its rule. */
function scanText(
  text: string,
  file: string,
  source: Finding["source"],
): Finding[] {
  const found: Finding[] = [];
  const seen = new Set<string>();
  for (const { rule, regex } of SECRET_PATTERNS) {
    // Use a LOCAL clone for the exec loop: redact() below mutates the shared
    // SECRET_PATTERNS regex objects' lastIndex, which would reset this loop to
    // position 0 and spin forever (shared-global-regex aliasing). The clone is
    // independent of redact()'s side effects.
    const local = new RegExp(regex.source, regex.flags);
    let m: RegExpExecArray | null;
    while ((m = local.exec(text)) !== null) {
      const matched = m[0];
      // Skip obvious placeholders in the working tree (not in history).
      if (source === "working-tree" && DUMMY_VALUE.test(matched)) {
        if (m.index === local.lastIndex) local.lastIndex++;
        continue;
      }
      // Redact the surrounding line so the snippet is safe to print (O-09).
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      const lineEnd = text.indexOf("\n", m.index);
      const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      const key = `${rule}:${file}:${redact(line)}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({
          rule,
          file,
          redacted_snippet: redact(line).trim().slice(0, 200),
          source,
        });
      }
      // Guard against any zero-width match (defensive; current patterns are ≥1 char).
      if (m.index === local.lastIndex) local.lastIndex++;
    }
  }
  return found;
}

/** List git-tracked files in the working tree (respects .gitignore by construction). */
function trackedFiles(cwd: string): string[] {
  try {
    return git(["ls-files"], cwd)
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export interface BuiltinScanResult {
  readonly findings: readonly Finding[];
  readonly scanned_working_tree: boolean;
  readonly scanned_history: boolean;
}

/**
 * Run the built-in scanner over `path`. Always scans the working tree; scans
 * git history (`git log -p`) when `history` is true (the realistic
 * leaked-then-removed case).
 */
export function builtinScan(
  path: string,
  opts: { readonly history?: boolean } = {},
): BuiltinScanResult {
  const cwd = path;
  const findings: Finding[] = [];

  // 1) Working tree — tracked files only (skips node_modules, .env via .gitignore).
  const repo = isGitRepo(cwd);
  const files = repo ? trackedFiles(cwd) : [];
  for (const rel of files) {
    if (ALLOWLIST_FILE.test(rel)) continue;
    const full = join(cwd, rel);
    try {
      if (statSync(full).size > MAX_FILE_BYTES) continue;
      const text = readFileSync(full, "utf8");
      findings.push(...scanText(text, rel, "working-tree"));
    } catch {
      // Intentionally silent: unreadable/binary file — not a finding.
    }
  }

  // 2) History — patch content of all commits (catches leaked-then-removed secrets).
  let scannedHistory = false;
  if (opts.history && repo) {
    try {
      const patch = git(["log", "-p", "--all", "--no-color"], cwd);
      // Only scan added lines ('+') to avoid double-counting and metadata noise.
      const added = patch
        .split("\n")
        .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
        .map((l) => l.slice(1))
        .join("\n");
      findings.push(...scanText(added, "<git-history>", "history"));
      scannedHistory = true;
    } catch {
      // Intentionally silent: history scan best-effort (shallow clone / no commits).
    }
  }

  // Dedup across sources (same rule+file+snippet).
  const uniq = new Map<string, Finding>();
  for (const f of findings) {
    uniq.set(`${f.rule}:${f.file}:${f.redacted_snippet}`, f);
  }

  return {
    findings: [...uniq.values()],
    scanned_working_tree: repo,
    scanned_history: scannedHistory,
  };
}
