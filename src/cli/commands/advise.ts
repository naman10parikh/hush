/**
 * `hush advise "<situation>"` — verdict + the correct doctrine for a
 * remediation/rotation question; flags false-greens (git rm --cached,
 * updatekeys-only, GCP "rotation enabled"). [JOB 3/4]
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";
import { advise } from "../../lib/false-green.js";
import { appendRun, COMMAND_JTBD, HUSH_MODEL } from "../../lib/runlog.js";

export interface AdviseOpts {
  readonly json?: boolean;
}

export function adviseHandler(situation: string, _opts: AdviseOpts): CommandResult {
  const started = Date.now();
  const result = advise(situation);

  appendRun({
    cmd: "advise",
    jtbd: COMMAND_JTBD.advise ?? 3,
    model: HUSH_MODEL,
    duration_ms: Date.now() - started,
    outcome: result.false_green ? "findings" : "ok",
    findings_count: result.false_green ? 1 : 0,
  });

  const text =
    `verdict: ${result.verdict}${result.false_green ? "  ⚠ FALSE-GREEN" : ""}\n` +
    `${result.doctrine}\n` +
    `brain: ${result.brain_refs.join(", ")}`;

  return { exitCode: 0, json: result, text };
}

export function register(program: Command): void {
  program
    .command("advise")
    .description("verdict + doctrine for a remediation/rotation question")
    .argument("<situation>", "the situation in plain English")
    .option("--json", "machine-readable output")
    .action((situation: string, opts: AdviseOpts) =>
      run(() => adviseHandler(situation, opts), opts),
    );
}
