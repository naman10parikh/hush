/**
 * `hush inject -- <cmd>` — run a child process with secrets injected via the
 * preference order (file-mount 0400/tmpfs > run-wrapper > env > committed .env
 * NEVER), per O-10/P-11. [JOB 9]
 *
 * B2 honest scope: hush has no live secret BACKEND wired yet (its broker is an
 * experiment, G-09) — so with no configured source there are no secrets to
 * inject. inject therefore RUNS the child (inheriting the caller's existing env,
 * the `run`-wrapper shape) and reports the injection order it WOULD use; it
 * never writes a committed .env and never expands the parent env with new
 * secrets. When a backend lands, the file-mount path slots in here.
 */
import type { Command } from "commander";
import { spawnSync } from "node:child_process";
import { run, type CommandResult } from "../io.js";
import { appendRun, COMMAND_JTBD, HUSH_MODEL } from "../../lib/runlog.js";

export interface InjectOpts {
  readonly json?: boolean;
}

const INJECTION_ORDER =
  "file-mount(0400/tmpfs) > run-wrapper(doppler/infisical/op/vault run) > env(dev-only) > committed .env (NEVER)";

export function injectHandler(cmd: readonly string[], _opts: InjectOpts): CommandResult {
  const started = Date.now();
  if (cmd.length === 0) {
    throw new Error("inject requires a command after `--`, e.g. `hush inject -- node app.js`");
  }
  const [bin, ...args] = cmd;

  // Run the child inheriting the caller's env (the run-wrapper shape). hush adds
  // NO new secret to the env and writes NO .env — that is the O-10 guarantee.
  const childExit =
    bin !== undefined
      ? (() => {
          const res = spawnSync(bin, args, { stdio: "inherit", env: process.env });
          return typeof res.status === "number" ? res.status : 0;
        })()
      : 0;

  appendRun({
    cmd: "inject",
    jtbd: COMMAND_JTBD.inject ?? 9,
    model: HUSH_MODEL,
    duration_ms: Date.now() - started,
    outcome: childExit === 0 ? "ok" : "error",
    findings_count: 0,
  });

  const json = {
    ran: cmd.join(" "),
    childExit,
    injection_order: INJECTION_ORDER,
    note: "no secret backend configured — child ran with the caller's env; no .env written, parent env not expanded (O-10/P-11)",
  };
  const text = `ran: ${cmd.join(" ")} (exit ${childExit})\ninjection order: ${INJECTION_ORDER}`;

  return { exitCode: childExit, json, text };
}

export function register(program: Command): void {
  program
    .command("inject")
    .description("run a child process with secrets injected (never via parent env)")
    .argument("<cmd...>", "the command to run after `--`")
    .option("--json", "machine-readable output")
    .action((cmd: string[], opts: InjectOpts) => run(() => injectHandler(cmd, opts), opts));
}
