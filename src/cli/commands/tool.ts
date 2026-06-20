/**
 * `hush tool <job>` — recommend the portfolio/layer for a job (OpenBao default;
 * SOPS+age for git; the alts + when); NEVER quotes a single price (G-01). [JOB 12]
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";
import { recommendTool } from "../../lib/doctrine.js";
import { appendRun, COMMAND_JTBD, HUSH_MODEL } from "../../lib/runlog.js";

export interface ToolOpts {
  readonly json?: boolean;
}

export function toolHandler(job: string, _opts: ToolOpts): CommandResult {
  const started = Date.now();
  const rec = recommendTool(job);

  appendRun({
    cmd: "tool",
    jtbd: COMMAND_JTBD.tool ?? 12,
    model: HUSH_MODEL,
    duration_ms: Date.now() - started,
    outcome: "ok",
    findings_count: 0,
  });

  const text =
    `portfolio for "${job}":\n` +
    `  default: ${rec.default}\n` +
    `  alts:    ${rec.alts.join(" · ")}\n` +
    `  when:    ${rec.when_alt}\n` +
    `  billing: ${rec.billing_note}\n` +
    `  brain:   ${rec.brain_refs.join(", ")}`;

  return { exitCode: 0, json: rec, text };
}

export function register(program: Command): void {
  program
    .command("tool")
    .description("recommend the secrets portfolio/layer for a job (never a price, G-01)")
    .argument("<job>", "the job (e.g. rotation, scanning, at-rest, broker)")
    .option("--json", "machine-readable output")
    .action((job: string, opts: ToolOpts) => run(() => toolHandler(job, opts), opts));
}
