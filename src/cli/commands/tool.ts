/**
 * `hush tool <job>` — recommend the portfolio/layer for a job (OpenBao default;
 * SOPS+age for git; the alts + when); NEVER quotes a single price (G-01). [JOB 12]
 *
 * B1: arg-parsing + exit-code contract only (stub body). B2 fills the matrix.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";

export interface ToolOpts {
  readonly json?: boolean;
}

export function toolHandler(_job: string, _opts: ToolOpts): CommandResult {
  return {
    exitCode: 0,
    json: { stub: true, command: "tool" },
    text: "tool: stub (B2 fills the portfolio recommendation)",
  };
}

export function register(program: Command): void {
  program
    .command("tool")
    .description("recommend the secrets portfolio/layer for a job (never a price, G-01)")
    .argument("<job>", "the job (e.g. rotation, scanning, at-rest, broker)")
    .option("--json", "machine-readable output")
    .action((job: string, opts: ToolOpts) => run(() => toolHandler(job, opts), opts));
}
