/**
 * `hush runs [--view]` — show the runs.jsonl observability log.
 *
 * B1: arg-parsing + exit-code contract only (stub body). B2 reads logs/runs.jsonl.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";

export interface RunsOpts {
  readonly view?: boolean;
  readonly json?: boolean;
}

export function runsHandler(_opts: RunsOpts): CommandResult {
  return {
    exitCode: 0,
    json: { stub: true, command: "runs" },
    text: "runs: stub (B2 reads logs/runs.jsonl)",
  };
}

export function register(program: Command): void {
  program
    .command("runs")
    .description("show the runs.jsonl observability log")
    .option("--view", "aggregate view of recent runs")
    .option("--json", "machine-readable output")
    .action((opts: RunsOpts) => run(() => runsHandler(opts), opts));
}
