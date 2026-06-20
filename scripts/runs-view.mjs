#!/usr/bin/env node
/**
 * scripts/runs-view.mjs — the observability AGGREGATOR (E2; PLAN §3 component 10,
 * HARNESS-OVERRIDES component 10).
 *
 * The WRITER is src/lib/runlog.ts (shipped in B2) — it appends ONE redacted JSON
 * line per CLI/RSI run to logs/runs.jsonl, run through `sanitize()` (strip URL
 * queries + redact secret-shaped strings) so a line carrying a secret value is
 * impossible by construction (O-12 / P-17). This script READS that log and rolls
 * it up: per-command counts, per-JTBD counts, outcomes, total findings, p50/p95
 * duration, and a redaction safety check.
 *
 * It re-applies the redaction check defensively: if any line somehow carried a
 * secret-shaped value (writer regression), this aggregator flags it and exits
 * nonzero — the O-09 invariant is enforced on BOTH ends (write and read).
 *
 * Usage:
 *   node scripts/runs-view.mjs            # human summary
 *   node scripts/runs-view.mjs --json     # machine-readable rollup
 *   node scripts/runs-view.mjs <path>     # aggregate a specific jsonl file
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const DEFAULT_LOG = join(REPO_ROOT, "logs", "runs.jsonl");

// Secret-shaped detector (mirrors src/lib/redact.ts prefixes) — the read-side
// O-09 guard. If this matches anything in the log, the writer regressed.
const SECRET_SHAPED =
  /sk-ant-[A-Za-z0-9_-]{6,}|sk-(?:proj-)?[A-Za-z0-9]{16,}|A(?:KIA|SIA)[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}/;

function parseArgs(argv) {
  const args = argv.slice(2);
  const json = args.includes("--json");
  const path = args.find((a) => !a.startsWith("--")) ?? DEFAULT_LOG;
  return { json, path };
}

/** Load + parse the jsonl log; returns { records, malformed, leaks:[] }. */
function loadLog(path) {
  if (!existsSync(path)) return { records: [], malformed: 0, leaks: [] };
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
  const records = [];
  const leaks = [];
  let malformed = 0;
  for (const line of lines) {
    if (SECRET_SHAPED.test(line)) leaks.push(line.slice(0, 80));
    try {
      records.push(JSON.parse(line));
    } catch {
      malformed++;
    }
  }
  return { records, malformed, leaks };
}

/** Percentile of a numeric array (nearest-rank). */
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function countBy(records, key) {
  const out = {};
  for (const r of records) {
    const k = String(r[key] ?? "unknown");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function aggregate(records) {
  const durations = records
    .map((r) => Number(r.duration_ms))
    .filter((n) => Number.isFinite(n));
  const findings = records
    .map((r) => Number(r.findings_count) || 0)
    .reduce((a, b) => a + b, 0);
  return {
    total_runs: records.length,
    by_command: countBy(records, "cmd"),
    by_jtbd: countBy(records, "jtbd"),
    by_outcome: countBy(records, "outcome"),
    total_findings: findings,
    duration_ms: {
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      max: durations.length ? Math.max(...durations) : 0,
    },
    first_ts: records[0]?.ts ?? null,
    last_ts: records[records.length - 1]?.ts ?? null,
  };
}

function printHuman(agg, leaks, malformed) {
  console.log(`hush runs — ${agg.total_runs} run(s) logged`);
  if (agg.first_ts) console.log(`  window: ${agg.first_ts} → ${agg.last_ts}`);
  console.log(`  total findings: ${agg.total_findings}`);
  console.log(`  duration ms: p50=${agg.duration_ms.p50}  p95=${agg.duration_ms.p95}  max=${agg.duration_ms.max}`);
  console.log("  by command:");
  for (const [cmd, n] of Object.entries(agg.by_command).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cmd.padEnd(14)} ${n}`);
  }
  console.log("  by outcome:");
  for (const [o, n] of Object.entries(agg.by_outcome)) console.log(`    ${o.padEnd(14)} ${n}`);
  if (malformed) console.log(`  ⚠ malformed lines: ${malformed}`);
  if (leaks.length) {
    console.log(`  ❌ SECRET-SHAPED VALUE(S) IN LOG (${leaks.length}) — writer regression, O-09 violated`);
  } else {
    console.log("  ✓ redaction clean (no secret-shaped value in any line)");
  }
}

function main() {
  const { json, path } = parseArgs(process.argv);
  const { records, malformed, leaks } = loadLog(path);
  const agg = aggregate(records);

  if (json) {
    console.log(JSON.stringify({ ...agg, malformed, redaction_clean: leaks.length === 0 }));
  } else {
    printHuman(agg, leaks, malformed);
  }

  // O-09 read-side guard: a secret-shaped value in the log fails the aggregator.
  process.exit(leaks.length === 0 ? 0 : 1);
}

main();
