/**
 * gitleaks.ts — wrapper around the gitleaks binary (the preferred prevent/catch
 * scanner, O-03). Pinned to 8.30.1 (brain TOOL-MATRIX; pin + checksum in CI per
 * P-05). DEGRADES GRACEFULLY: if gitleaks is not installed, returns
 * `{ available:false }` so the built-in scanner still satisfies the bar — never
 * crashes (PLAN §9 chaos: no-binary case).
 */
import { execFileSync } from "node:child_process";
import { redact } from "../lib/redact.js";
import type { Finding } from "./builtin.js";

export const GITLEAKS_PINNED_VERSION = "8.30.1";

export interface GitleaksResult {
  readonly available: boolean;
  readonly findings: readonly Finding[];
  readonly note?: string;
}

function which(bin: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [bin], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

interface GitleaksRawFinding {
  readonly RuleID?: string;
  readonly File?: string;
  readonly Match?: string;
  readonly Secret?: string;
}

/**
 * Run gitleaks over `path`. `mode` = "detect" (history) or "protect" (staged).
 * Returns findings with secrets REDACTED (gitleaks emits raw secrets in JSON —
 * we strip them before they touch our output, O-09).
 */
export function gitleaksScan(
  path: string,
  mode: "detect" | "protect",
): GitleaksResult {
  if (!which("gitleaks")) {
    return {
      available: false,
      findings: [],
      note: `gitleaks not installed (pin ${GITLEAKS_PINNED_VERSION}); built-in scanner used instead`,
    };
  }
  try {
    // gitleaks exits 1 when findings exist — capture stdout regardless.
    const args =
      mode === "protect"
        ? ["protect", "--staged", "--report-format", "json", "--report-path", "-", "-s", path]
        : ["detect", "--report-format", "json", "--report-path", "-", "-s", path];
    let stdout = "";
    try {
      stdout = execFileSync("gitleaks", args, { encoding: "utf8" });
    } catch (err: unknown) {
      // gitleaks exit 1 = findings; its JSON is still on stdout.
      const e = err as { stdout?: string };
      stdout = typeof e.stdout === "string" ? e.stdout : "";
    }
    const raw = stdout.trim() ? (JSON.parse(stdout) as GitleaksRawFinding[]) : [];
    const findings: Finding[] = raw.map((r) => ({
      rule: r.RuleID ?? "gitleaks-finding",
      file: r.File ?? "<unknown>",
      redacted_snippet: redact(r.Match ?? r.Secret ?? "").slice(0, 200),
      source: mode === "protect" ? "working-tree" : "history",
    }));
    return { available: true, findings };
  } catch (err) {
    return {
      available: true,
      findings: [],
      note: `gitleaks run failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
