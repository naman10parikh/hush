/**
 * `hush init` — scaffold what hush SHIPS: a tuned .pre-commit-config.yaml +
 * .gitleaks.toml baseline + CI workflow + .sops.yaml+age with break-glass + the
 * .gitignore/.env.example fix. Non-destructive (existing files skipped). [JOB 1/2/6]
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";
import { scaffold } from "../../lib/scaffold.js";
import { appendRun, COMMAND_JTBD, HUSH_MODEL } from "../../lib/runlog.js";

export interface InitOpts {
  readonly scanner?: boolean;
  readonly sops?: boolean;
  readonly gitignore?: boolean;
  readonly envExample?: boolean;
  readonly json?: boolean;
}

export function initHandler(opts: InitOpts): CommandResult {
  const started = Date.now();
  const steps = scaffold(process.cwd(), {
    scanner: opts.scanner,
    sops: opts.sops,
    gitignore: opts.gitignore,
    envExample: opts.envExample,
  });

  appendRun({
    cmd: "init",
    jtbd: COMMAND_JTBD.init ?? 1,
    model: HUSH_MODEL,
    duration_ms: Date.now() - started,
    outcome: "ok",
    findings_count: 0,
  });

  const text = steps
    .map((s) => `  [${s.status}] ${s.file}${s.note ? ` — ${s.note}` : ""}`)
    .join("\n");

  return { exitCode: 0, json: { steps }, text: `hush init:\n${text}` };
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
