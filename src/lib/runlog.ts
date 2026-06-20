/**
 * runlog.ts — append-only observability log (brain O-12 / P-17; HARNESS-OVERRIDES
 * component 10). Every CLI run writes ONE redacted JSON line to logs/runs.jsonl.
 *
 * HARD (the OVERRIDE): the line is run through `sanitize()` (strip URL queries +
 * redact secret-shaped strings) before it is written — a runs.jsonl line
 * carrying a secret value is an automatic fail.
 *
 * Boundary note: B2 ships this minimal redacting WRITER (it owns src/lib/redact.ts,
 * the load-bearing filter). Cluster E2 owns the `scripts/runs-view.mjs` AGGREGATOR
 * and may extend the schema — this is the shared base it builds on.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitize } from "./redact.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist/lib/runlog.js → repo root is two levels up.
const REPO_ROOT = join(here, "..", "..");
const LOG_PATH = join(REPO_ROOT, "logs", "runs.jsonl");

export interface RunRecord {
  readonly cmd: string;
  readonly jtbd: number;
  readonly model: string;
  readonly duration_ms: number;
  readonly outcome: "ok" | "findings" | "error" | "skip";
  readonly findings_count: number;
}

/** Map a CLI command to its primary JTBD (EXPERTISE-MAP) — also used by dispatch. */
export const COMMAND_JTBD: Readonly<Record<string, number>> = {
  scan: 2,
  doctor: 1,
  advise: 3,
  remediate: 3,
  "rotate-plan": 4,
  init: 1,
  "env-example": 1,
  broker: 8,
  inject: 9,
  tool: 12,
  runs: 0,
};

/**
 * Append one redacted run record. Best-effort: a logging failure must never
 * break the command (the run already happened). Model defaults to the CP123 pin.
 */
export function appendRun(rec: RunRecord): void {
  const line = {
    ts: new Date().toISOString(),
    cmd: rec.cmd,
    jtbd: rec.jtbd,
    model: rec.model,
    duration_ms: rec.duration_ms,
    outcome: rec.outcome,
    findings_count: rec.findings_count,
  };
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    // sanitize the serialized line (defense in depth — no field should ever
    // carry a secret, but enforce it mechanically anyway).
    appendFileSync(LOG_PATH, sanitize(JSON.stringify(line)) + "\n", "utf8");
  } catch (err) {
    console.warn(
      "[runlog] could not append run record:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export const LOG_FILE_PATH = LOG_PATH;

/** The model hush runs under (CP123 D12/D14: always Opus 4.8, max). Recorded per run. */
export const HUSH_MODEL = "claude-opus-4-8[1m]";
