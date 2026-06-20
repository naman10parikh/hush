/**
 * `hush init` — scaffold what hush SHIPS: a tuned .pre-commit-config.yaml +
 * .gitleaks.toml baseline + CI workflow + .sops.yaml+age-keygen with
 * break-glass + the .gitignore/.env.example fix. [JOB 1/2/6]
 *
 * B1: arg-parsing + exit-code contract only (stub body). B2 fills the scaffolders.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";

export interface InitOpts {
  readonly scanner?: boolean;
  readonly sops?: boolean;
  readonly gitignore?: boolean;
  readonly envExample?: boolean;
  readonly json?: boolean;
}

export function initHandler(_opts: InitOpts): CommandResult {
  return {
    exitCode: 0,
    json: { stub: true, command: "init" },
    text: "init: stub (B2 fills the scaffolders)",
  };
}

export function register(program: Command): void {
  program
    .command("init")
    .description("scaffold scanner/SOPS/gitignore/.env.example setup")
    .option("--scanner", "scaffold gitleaks + trufflehog + pre-commit + CI")
    .option("--sops", "scaffold .sops.yaml + age key with break-glass recipient")
    .option("--gitignore", "fix .gitignore to exclude .env* (keep !.env.example)")
    .option("--env-example", "generate .env.example from the repo's real schema")
    .option("--json", "machine-readable output")
    .action((opts: InitOpts) => run(() => initHandler(opts), opts));
}
