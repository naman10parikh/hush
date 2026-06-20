/**
 * `hush env-example [path]` — generate .env.example from the repo's real var
 * schema (only vars the code reads, placeholders only) — replaces the
 * copy-a-stale-superset anti-pattern. [JOB 1, S-14]
 */
import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { run, type CommandResult } from "../io.js";
import { generateEnvExample } from "../../lib/env-example.js";
import { appendRun, COMMAND_JTBD, HUSH_MODEL } from "../../lib/runlog.js";

export interface EnvExampleOpts {
  readonly write?: boolean;
  readonly json?: boolean;
}

export function envExampleHandler(path: string, opts: EnvExampleOpts): CommandResult {
  const started = Date.now();
  const { body, vars } = generateEnvExample(path);

  let written = false;
  if (opts.write) {
    writeFileSync(join(path, ".env.example"), body, "utf8");
    written = true;
  }

  appendRun({
    cmd: "env-example",
    jtbd: COMMAND_JTBD["env-example"] ?? 1,
    model: HUSH_MODEL,
    duration_ms: Date.now() - started,
    outcome: "ok",
    findings_count: 0,
  });

  const text = opts.write
    ? `wrote .env.example with ${vars.length} var(s): ${vars.join(", ")}`
    : body;

  return { exitCode: 0, json: { vars, written, body }, text };
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
