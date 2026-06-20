/**
 * `hush runs [--view]` — show the runs.jsonl observability log (already redacted
 * by the writer, O-12). `--view` gives a quick aggregate; the full aggregator is
 * `scripts/runs-view.mjs` (Cluster E2).
 */
import type { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { run, type CommandResult } from "../io.js";
import { LOG_FILE_PATH } from "../../lib/runlog.js";

export interface RunsOpts {
  readonly view?: boolean;
  readonly json?: boolean;
}

interface LoggedRun {
  readonly ts?: string;
  readonly cmd?: string;
  readonly outcome?: string;
  readonly findings_count?: number;
  readonly duration_ms?: number;
}

function readRuns(): LoggedRun[] {
  if (!existsSync(LOG_FILE_PATH)) return [];
  return readFileSync(LOG_FILE_PATH, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l) as LoggedRun;
      } catch {
        return {} as LoggedRun;
      }
    });
}

export function runsHandler(opts: RunsOpts): CommandResult {
  const runs = readRuns();

  if (opts.view) {
    const byCmd = new Map<string, number>();
    let findings = 0;
    for (const r of runs) {
      if (r.cmd) byCmd.set(r.cmd, (byCmd.get(r.cmd) ?? 0) + 1);
      findings += r.findings_count ?? 0;
    }
    const summary = {
      total: runs.length,
      by_command: Object.fromEntries(byCmd),
      total_findings: findings,
    };
    const text =
      `${runs.length} run(s), ${findings} finding(s) total\n` +
      [...byCmd.entries()].map(([c, n]) => `  ${c}: ${n}`).join("\n");
    return { exitCode: 0, json: summary, text };
  }

  const text =
    runs.length === 0
      ? "no runs logged yet"
      : runs
          .map((r) => `${r.ts ?? "?"}  ${r.cmd ?? "?"}  ${r.outcome ?? "?"}  (${r.findings_count ?? 0} findings)`)
          .join("\n");
  return { exitCode: 0, json: { runs }, text };
}

export function register(program: Command): void {
  program
    .command("runs")
    .description("show the runs.jsonl observability log")
    .option("--view", "aggregate view of recent runs")
    .option("--json", "machine-readable output")
    .action((opts: RunsOpts) => run(() => runsHandler(opts), opts));
}
