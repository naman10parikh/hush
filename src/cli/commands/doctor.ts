/**
 * `hush doctor` — report the secret-manager wiring of the cwd repo (the second
 * half of the acceptance test). Reports BOOLEANS about wiring, never values. [JOB 1/2/6]
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";
import { doctor } from "../../lib/doctor.js";
import { appendRun, COMMAND_JTBD, HUSH_MODEL } from "../../lib/runlog.js";

export interface DoctorOpts {
  readonly json?: boolean;
}

export function doctorHandler(path: string, _opts: DoctorOpts): CommandResult {
  const started = Date.now();
  const report = doctor(path);

  appendRun({
    cmd: "doctor",
    jtbd: COMMAND_JTBD.doctor ?? 1,
    model: HUSH_MODEL,
    duration_ms: Date.now() - started,
    outcome: report.score === 1 ? "ok" : "findings",
    findings_count: report.gaps.length,
  });

  const text =
    `wiring score: ${report.score}\n` +
    `  gitignore_ok:            ${report.gitignore_ok}\n` +
    `  env_example_schema_only: ${report.env_example_schema_only}\n` +
    `  mcp_refs_ok:             ${report.mcp_refs_ok}\n` +
    `  scanners_present:        ${report.scanners_present}\n` +
    `  sops_breakglass:         ${report.sops_breakglass}` +
    (report.gaps.length ? `\ngaps:\n${report.gaps.map((g) => `  - ${g}`).join("\n")}` : "");

  // doctor is advisory — exit 0 (the acceptance test asserts the JSON fields, not the code).
  return { exitCode: 0, json: report, text };
}

export function register(program: Command): void {
  program
    .command("doctor")
    .description("report the secret-manager wiring of a repo")
    .argument("[path]", "repo path to inspect", ".")
    .option("--json", "machine-readable output")
    .action((path: string, opts: DoctorOpts) => run(() => doctorHandler(path, opts), opts));
}
