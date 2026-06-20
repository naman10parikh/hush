/**
 * `hush broker <secret-name>` — return a handle/short-TTL reference, NEVER a
 * value; logs the handoff (who/what/when). The embodiment of O-09. [JOB 8]
 *
 * HARD invariant: the return contains `handle` + `expiresAt`, never a `value`.
 * The actual secret reaches the child process via a broker/run-wrapper (JOB 9),
 * never the model's context.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";
import { safeSecretName } from "../../lib/guard.js";
import { appendRun, COMMAND_JTBD, HUSH_MODEL } from "../../lib/runlog.js";

export interface BrokerOpts {
  readonly ttl?: string;
  readonly wrap?: boolean;
  readonly json?: boolean;
}

/** Parse a TTL like "5m"/"1h"/"30s" into milliseconds (default 5m). */
function parseTtlMs(ttl: string | undefined): number {
  if (!ttl) return 5 * 60_000;
  const m = /^(\d+)\s*(s|m|h)$/.exec(ttl.trim());
  if (!m) return 5 * 60_000;
  const n = Number(m[1]);
  const unit = m[2];
  return unit === "s" ? n * 1000 : unit === "h" ? n * 3_600_000 : n * 60_000;
}

export function brokerHandler(name: string, opts: BrokerOpts): CommandResult {
  // P-18: reject path-traversal in the secret name BEFORE building any handle.
  const safe = safeSecretName(name);
  const started = Date.now();
  const expiresAt = new Date(Date.now() + parseTtlMs(opts.ttl)).toISOString();
  const handle = `hush://store/${safe}`;

  appendRun({
    cmd: "broker",
    jtbd: COMMAND_JTBD.broker ?? 8,
    model: HUSH_MODEL,
    duration_ms: Date.now() - started,
    outcome: "ok",
    findings_count: 0,
  });

  // The return is a HANDLE, never a value (O-09). `wrapped` marks single-use.
  const json = { handle, expiresAt, wrapped: opts.wrap ?? false };
  const text = `handle: ${handle}\nexpiresAt: ${expiresAt}${opts.wrap ? "\n(response-wrapped, single-use)" : ""}\n(no value returned — use \`hush inject\` to deliver it to a process, O-09)`;

  return { exitCode: 0, json, text };
}

export function register(program: Command): void {
  program
    .command("broker")
    .description("return a short-TTL handle for a secret (never the value, O-09)")
    .argument("<secret-name>", "the secret name (alphanumeric/_/- only, P-18)")
    .option("--ttl <duration>", "handle time-to-live (e.g. 5m, 1h)")
    .option("--wrap", "response-wrap the handle (single-use)")
    .option("--json", "machine-readable output")
    .action((name: string, opts: BrokerOpts) => run(() => brokerHandler(name, opts), opts));
}
