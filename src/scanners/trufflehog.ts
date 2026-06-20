/**
 * trufflehog.ts — wrapper around the trufflehog binary (the verify-with-proof
 * layer, O-03 — `--only-verified` confirms a finding is still LIVE against the
 * provider API → near-zero false positives). Pinned 3.95.5 (P-05). DEGRADES
 * GRACEFULLY when absent or offline (PLAN §9 chaos: provider-dependent steps
 * degrade to a clear skip, never hang).
 *
 * Line-number caution (P-04/S-13): trufflehog line attribution is wrong for
 * some detectors — hush treats it as a hint, NEVER auto-surgery. We do not act
 * on the reported line, only report the finding.
 */
import { execFileSync } from "node:child_process";
import { redact } from "../lib/redact.js";
import type { Finding } from "./builtin.js";

export const TRUFFLEHOG_PINNED_VERSION = "3.95.5";

export interface TrufflehogResult {
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

interface TrufflehogRaw {
  readonly DetectorName?: string;
  readonly Verified?: boolean;
  readonly SourceMetadata?: { readonly Data?: { readonly Filesystem?: { readonly file?: string } } };
}

/** Run trufflehog `filesystem --only-verified` over `path`. */
export function trufflehogVerify(path: string): TrufflehogResult {
  if (!which("trufflehog")) {
    return {
      available: false,
      findings: [],
      note: `trufflehog not installed (pin ${TRUFFLEHOG_PINNED_VERSION}); verify step skipped — plan-only`,
    };
  }
  try {
    let stdout = "";
    try {
      stdout = execFileSync(
        "trufflehog",
        ["filesystem", path, "--only-verified", "--json", "--no-update"],
        { encoding: "utf8" },
      );
    } catch (err: unknown) {
      const e = err as { stdout?: string };
      stdout = typeof e.stdout === "string" ? e.stdout : "";
    }
    const findings: Finding[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as TrufflehogRaw;
        if (r.Verified) {
          findings.push({
            rule: `verified:${r.DetectorName ?? "unknown"}`,
            file: r.SourceMetadata?.Data?.Filesystem?.file ?? "<unknown>",
            redacted_snippet: redact(`verified ${r.DetectorName ?? ""} credential`).slice(0, 200),
            source: "working-tree",
          });
        }
      } catch {
        // Intentionally silent: non-JSON progress line.
      }
    }
    return { available: true, findings };
  } catch (err) {
    return {
      available: true,
      findings: [],
      note: `trufflehog run failed (offline?): ${err instanceof Error ? err.message : String(err)} — plan-only`,
    };
  }
}
