/**
 * `hush advise "<situation>"` — verdict + the correct doctrine for a
 * remediation/rotation question; flags false-greens (git rm --cached,
 * updatekeys-only, GCP "rotation enabled"). [JOB 3/4]
 *
 * B1: arg-parsing + exit-code contract only (stub body). B2 fills the verdict logic.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";

export interface AdviseOpts {
  readonly json?: boolean;
}

export function adviseHandler(_situation: string, _opts: AdviseOpts): CommandResult {
  return {
    exitCode: 0,
    json: { stub: true, command: "advise" },
    text: "advise: stub (B2 fills the verdict + doctrine)",
  };
}

export function register(program: Command): void {
  program
    .command("advise")
    .description("verdict + doctrine for a remediation/rotation question")
    .argument("<situation>", "the situation in plain English")
    .option("--json", "machine-readable output")
    .action((situation: string, opts: AdviseOpts) =>
      run(() => adviseHandler(situation, opts), opts),
    );
}
