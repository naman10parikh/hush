/**
 * `hush doctor` — report the secret-manager wiring of the cwd repo:
 * .gitignore covers .env*+!.env.example? .env.example schema-only? .mcp.json
 * uses ${VAR} refs? scanners + .gitleaks.toml baseline present? SOPS+age
 * break-glass recipient? (the second half of the acceptance test). [JOB 1/2/6]
 *
 * B1: arg-parsing + exit-code contract only (stub body). B2 fills the checks.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";

export interface DoctorOpts {
  readonly json?: boolean;
}

export function doctorHandler(_path: string, _opts: DoctorOpts): CommandResult {
  return {
    exitCode: 0,
    json: { stub: true, command: "doctor" },
    text: "doctor: stub (B2 fills the wiring report)",
  };
}

export function register(program: Command): void {
  program
    .command("doctor")
    .description("report the secret-manager wiring of a repo")
    .argument("[path]", "repo path to inspect", ".")
    .option("--json", "machine-readable output")
    .action((path: string, opts: DoctorOpts) =>
      run(() => doctorHandler(path, opts), opts),
    );
}
