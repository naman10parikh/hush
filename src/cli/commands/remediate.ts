/**
 * `hush remediate <finding|file>` — produce the ordered rotate-first plan;
 * NEVER auto-rewrites history off an unverified line number (P-04, S-13). [JOB 3]
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";
import { remediationPlan } from "../../lib/doctrine.js";
import { appendRun, COMMAND_JTBD, HUSH_MODEL } from "../../lib/runlog.js";

export interface RemediateOpts {
  readonly json?: boolean;
}

export function remediateHandler(target: string, _opts: RemediateOpts): CommandResult {
  const started = Date.now();
  const plan = remediationPlan(target);

  appendRun({
    cmd: "remediate",
    jtbd: COMMAND_JTBD.remediate ?? 3,
    model: HUSH_MODEL,
    duration_ms: Date.now() - started,
    outcome: "ok",
    findings_count: 0,
  });

  const text =
    `rotate-first plan for "${target}" (consent required before any history rewrite):\n` +
    plan.ordered_steps.map((s) => `  ${s}`).join("\n") +
    `\n⚠ ${plan.warning}\nbrain: ${plan.brain_refs.join(", ")}`;

  return { exitCode: 0, json: plan, text };
}

export function register(program: Command): void {
  program
    .command("remediate")
    .description("ordered rotate-first remediation plan for a finding")
    .argument("<finding>", "a finding description or a file path")
    .option("--json", "machine-readable output")
    .action((finding: string, opts: RemediateOpts) =>
      run(() => remediateHandler(finding, opts), opts),
    );
}
