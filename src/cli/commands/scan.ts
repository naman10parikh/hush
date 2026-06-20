/**
 * `hush scan` — run the scanning stack (gitleaks prevent/catch + trufflehog
 * verify + .mcp.json literal-secret check + base64). Exit 1 if any finding
 * (the acceptance bar). [JOB 2]
 *
 * B1: arg-parsing + exit-code contract only (stub body). B2 fills the scanner drive.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";

export interface ScanOpts {
  readonly staged?: boolean;
  readonly history?: boolean;
  readonly verify?: boolean;
  readonly mcpConfig?: boolean;
  readonly json?: boolean;
}

export function scanHandler(_path: string, _opts: ScanOpts): CommandResult {
  return {
    exitCode: 0,
    json: { stub: true, command: "scan" },
    text: "scan: stub (B2 fills the scanner stack)",
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
    .action((path: string, opts: ScanOpts) =>
      run(() => scanHandler(path, opts), opts),
    );
}
