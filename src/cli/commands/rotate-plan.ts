/**
 * `hush rotate-plan <secret-ref>` — emit the ISSUE→DEPLOY→VERIFY→REVOKE plan;
 * alternating-users for live connections; warns GCP is notify-only. [JOB 4]
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";
import { rotationPlan } from "../../lib/doctrine.js";
import { appendRun, COMMAND_JTBD, HUSH_MODEL } from "../../lib/runlog.js";

export interface RotatePlanOpts {
  readonly liveConnections?: boolean;
  readonly json?: boolean;
}

export function rotatePlanHandler(secretRef: string, opts: RotatePlanOpts): CommandResult {
  const started = Date.now();
  const plan = rotationPlan(secretRef, opts.liveConnections ?? false);

  appendRun({
    cmd: "rotate-plan",
    jtbd: COMMAND_JTBD["rotate-plan"] ?? 4,
    model: HUSH_MODEL,
    duration_ms: Date.now() - started,
    outcome: "ok",
    findings_count: 0,
  });

  const text =
    `rotation plan for "${secretRef}" — pattern: ${plan.pattern}` +
    (plan.alternating_users ? " (alternating-users)" : "") +
    `\n` +
    plan.steps.map((s) => `  ${s}`).join("\n") +
    `\n⚠ ${plan.gcp_notify_only_warning}\nbrain: ${plan.brain_refs.join(", ")}`;

  return { exitCode: 0, json: plan, text };
}

export function register(program: Command): void {
  program
    .command("rotate-plan")
    .description("ISSUE→DEPLOY→VERIFY→REVOKE rotation plan for a secret")
    .argument("<secret-ref>", "the secret reference to rotate")
    .option("--live-connections", "secret has live connections (alternating-users)")
    .option("--json", "machine-readable output")
    .action((secretRef: string, opts: RotatePlanOpts) =>
      run(() => rotatePlanHandler(secretRef, opts), opts),
    );
}
