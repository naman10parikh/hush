/**
 * `hush scan` — run the scanning stack (gitleaks prevent/catch + trufflehog
 * verify + .mcp.json literal-secret check + base64). Exit 1 if any finding
 * (the acceptance bar). [JOB 2]
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";
import { scanRepo } from "../../scanners/index.js";
import { appendRun, COMMAND_JTBD, HUSH_MODEL } from "../../lib/runlog.js";

export interface ScanOpts {
  readonly staged?: boolean;
  readonly history?: boolean;
  readonly verify?: boolean;
  readonly mcpConfig?: boolean;
  readonly json?: boolean;
}

export function scanHandler(path: string, opts: ScanOpts): CommandResult {
  const started = Date.now();
  const report = scanRepo({
    path,
    staged: opts.staged,
    history: opts.history,
    verify: opts.verify,
    // undefined → orchestrator includes the .mcp.json check by default.
    mcpConfig: opts.mcpConfig,
  });

  appendRun({
    cmd: "scan",
    jtbd: COMMAND_JTBD.scan ?? 2,
    model: HUSH_MODEL,
    duration_ms: Date.now() - started,
    outcome: report.findings.length > 0 ? "findings" : "ok",
    findings_count: report.findings.length,
  });

  const text =
    report.findings.length === 0
      ? `clean — no findings (scanners: builtin${report.scanners.gitleaks ? "+gitleaks" : ""}${report.scanners.trufflehog ? "+trufflehog" : ""})`
      : `${report.findings.length} finding(s):\n` +
        report.findings
          .map((f) => `  [${f.rule}] ${f.file} (${f.source}) — ${f.redacted_snippet}`)
          .join("\n") +
        (report.notes.length ? `\nnotes: ${report.notes.join("; ")}` : "");

  return {
    exitCode: report.exitCode,
    json: {
      findings: report.findings,
      exitCode: report.exitCode,
      scanners: report.scanners,
      notes: report.notes,
    },
    text,
  };
}

export function register(program: Command): void {
  program
    .command("scan")
    .description("scan a repo for leaked secrets (exit 1 on any finding)")
    .argument("[path]", "repo path to scan", ".")
    .option("--staged", "scan only staged changes (gitleaks protect --staged)")
    .option("--history", "scan full git history (gitleaks detect)")
    .option("--verify", "verify findings are still live (trufflehog --only-verified)")
    .option("--mcp-config", "also check .mcp.json for literal secret values")
    .option("--json", "machine-readable output")
    .action((path: string, opts: ScanOpts) => run(() => scanHandler(path, opts), opts));
}
