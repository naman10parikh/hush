/**
 * `hush rotate-plan <secret-ref>` — emit the ISSUE→DEPLOY→VERIFY→REVOKE plan;
 * alternating-users for live connections; warns GCP is notify-only. [JOB 4]
 *
 * B1: arg-parsing + exit-code contract only (stub body). B2 fills the plan.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";

export interface RotatePlanOpts {
  readonly liveConnections?: boolean;
  readonly json?: boolean;
}

export function rotatePlanHandler(
  _secretRef: string,
  _opts: RotatePlanOpts,
): CommandResult {
  return {
    exitCode: 0,
    json: { stub: true, command: "rotate-plan" },
    text: "rotate-plan: stub (B2 fills the ISSUE→DEPLOY→VERIFY→REVOKE plan)",
  };
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
