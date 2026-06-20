/**
 * `hush inject -- <cmd>` — run a child process with secrets injected via the
 * preference order (file-mount/run-wrapper), NEVER exporting into the parent
 * env or a committed .env (O-10/P-11). [JOB 9]
 *
 * B1: arg-parsing + exit-code contract only (stub body). B2 fills the run-wrapper.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";

export interface InjectOpts {
  readonly json?: boolean;
}

export function injectHandler(cmd: readonly string[], _opts: InjectOpts): CommandResult {
  return {
    exitCode: 0,
    json: { stub: true, command: "inject", forwarded: cmd },
    text: "inject: stub (B2 fills the file-mount/run-wrapper injection)",
  };
}

export function register(program: Command): void {
  program
    .command("inject")
    .description("run a child process with secrets injected (never via parent env)")
    .argument("<cmd...>", "the command to run after `--`")
    .option("--json", "machine-readable output")
    .action((cmd: string[], opts: InjectOpts) =>
      run(() => injectHandler(cmd, opts), opts),
    );
}
