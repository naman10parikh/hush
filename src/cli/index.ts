#!/usr/bin/env node
/**
 * hush CLI — the secrets employee's hands.
 *
 * Wires the commander program and registers all 11 subcommands. Each command
 * lives in its own module under commands/ and exposes a `register(program)`.
 * The `--help`/`--version` surfaces are commander built-ins (the "12th" surface).
 *
 * HARD invariant (brain O-09): no command ever returns or prints a raw secret
 * value — only handles, verdicts, and redacted findings. Enforced in the bodies.
 */
import { Command } from "commander";
import { HUSH_VERSION } from "../version.js";

import { register as registerScan } from "./commands/scan.js";
import { register as registerDoctor } from "./commands/doctor.js";
import { register as registerAdvise } from "./commands/advise.js";
import { register as registerRemediate } from "./commands/remediate.js";
import { register as registerRotatePlan } from "./commands/rotate-plan.js";
import { register as registerInit } from "./commands/init.js";
import { register as registerEnvExample } from "./commands/env-example.js";
import { register as registerBroker } from "./commands/broker.js";
import { register as registerInject } from "./commands/inject.js";
import { register as registerTool } from "./commands/tool.js";
import { register as registerRuns } from "./commands/runs.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("hush")
    .description(
      "hush — the secrets employee. Issued, never leaked. Rotated, then proven. " +
        "Returns handles, never values.",
    )
    .version(HUSH_VERSION, "-v, --version", "print the hush version")
    .showHelpAfterError("(run `hush --help` for the command tree)");

  registerScan(program);
  registerDoctor(program);
  registerAdvise(program);
  registerRemediate(program);
  registerRotatePlan(program);
  registerInit(program);
  registerEnvExample(program);
  registerBroker(program);
  registerInject(program);
  registerTool(program);
  registerRuns(program);

  return program;
}

const program = buildProgram();
await program.parseAsync(process.argv);
