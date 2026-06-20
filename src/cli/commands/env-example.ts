/**
 * `hush env-example [path]` — generate .env.example from the repo's real var
 * schema (only vars the code reads, placeholders only) — replaces the
 * copy-a-stale-superset anti-pattern. [JOB 1, S-14]
 *
 * B1: arg-parsing + exit-code contract only (stub body). B2 fills the schema extractor.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";

export interface EnvExampleOpts {
  readonly write?: boolean;
  readonly json?: boolean;
}

export function envExampleHandler(
  _path: string,
  _opts: EnvExampleOpts,
): CommandResult {
  return {
    exitCode: 0,
    json: { stub: true, command: "env-example" },
    text: "env-example: stub (B2 fills the schema extractor)",
  };
}

export function register(program: Command): void {
  program
    .command("env-example")
    .description("generate .env.example from the repo's real var schema (S-14)")
    .argument("[path]", "repo path to scan for env vars", ".")
    .option("--write", "write .env.example to disk (default: print to stdout)")
    .option("--json", "machine-readable output")
    .action((path: string, opts: EnvExampleOpts) =>
      run(() => envExampleHandler(path, opts), opts),
    );
}
