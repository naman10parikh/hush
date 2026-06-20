/**
 * scanners/index.ts — the scanning stack orchestrator behind `hush scan`.
 *
 * Layered (O-03): the built-in offline scanner ALWAYS runs (starvation-proof
 * core); gitleaks/trufflehog augment it when present. Returns merged, redacted
 * findings + an exit code (1 if any finding — the acceptance bar).
 */
import { builtinScan, type Finding } from "./builtin.js";
import { gitleaksScan } from "./gitleaks.js";
import { trufflehogVerify } from "./trufflehog.js";
import { scanMcpConfig } from "./mcp-config.js";

export interface ScanRequest {
  readonly path: string;
  readonly staged?: boolean;
  readonly history?: boolean;
  readonly verify?: boolean;
  readonly mcpConfig?: boolean;
}

export interface ScanReport {
  readonly findings: readonly Finding[];
  readonly exitCode: number;
  readonly scanners: {
    readonly builtin: boolean;
    readonly gitleaks: boolean;
    readonly trufflehog: boolean;
  };
  readonly notes: readonly string[];
}

/** Run the full scanning stack. */
export function scanRepo(req: ScanRequest): ScanReport {
  const findings: Finding[] = [];
  const notes: string[] = [];

  // 1) Built-in scanner — always (offline, no binary needed).
  const builtin = builtinScan(req.path, { history: req.history });
  findings.push(...builtin.findings);

  // 2) gitleaks (preferred) — protect for staged, detect otherwise.
  const gl = gitleaksScan(req.path, req.staged ? "protect" : "detect");
  findings.push(...gl.findings);
  if (gl.note) notes.push(gl.note);

  // 3) trufflehog --only-verified (opt-in via --verify).
  let thAvailable = false;
  if (req.verify) {
    const th = trufflehogVerify(req.path);
    findings.push(...th.findings);
    thAvailable = th.available;
    if (th.note) notes.push(th.note);
  }

  // 4) .mcp.json literal-secret check (always, or explicitly via --mcp-config).
  if (req.mcpConfig || req.mcpConfig === undefined) {
    const mcp = scanMcpConfig(req.path);
    findings.push(...mcp.findings);
  }

  // Dedup merged findings across scanners.
  const uniq = new Map<string, Finding>();
  for (const f of findings) {
    uniq.set(`${f.rule}:${f.file}:${f.redacted_snippet}`, f);
  }
  const merged = [...uniq.values()];

  return {
    findings: merged,
    exitCode: merged.length > 0 ? 1 : 0,
    scanners: {
      builtin: builtin.scanned_working_tree,
      gitleaks: gl.available,
      trufflehog: thAvailable,
    },
    notes,
  };
}
