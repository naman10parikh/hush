/**
 * `hush remediate <finding|file>` — produce the ordered rotate-first plan
 * (rotate → git rm --cached + .gitignore → optional git filter-repo with
 * explicit consent); NEVER auto-rewrites history off an unverified line
 * number (P-04, S-13). [JOB 3]
 *
 * B1: arg-parsing + exit-code contract only (stub body). B2 fills the plan.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";

export interface RemediateOpts {
  readonly json?: boolean;
}

export function remediateHandler(_target: string, _opts: RemediateOpts): CommandResult {
  return {
    exitCode: 0,
    json: { stub: true, command: "remediate" },
    text: "remediate: stub (B2 fills the rotate-first plan)",
  };
}

export function register(program: Command): void {
  program
    .command("remediate")
    .description("ordered rotate-first remediation plan for a finding")
    .argument("<finding>", "a finding description or a file path")
    .option("--json", "machine-readable output")
    .action((finding: string, opts: RemediateOpts) =>
      run(() => remediateHandler(finding, opts), opts),
    );
}
