/**
 * `hush broker <secret-name>` — return a handle/short-TTL reference, NEVER a
 * value; logs the handoff (who/what/when). The embodiment of O-09. [JOB 8]
 *
 * HARD invariant: the return contains `handle` + `expiresAt`, never a `value`.
 *
 * B1: arg-parsing + exit-code contract only (stub body). B2 fills the handle mint.
 */
import type { Command } from "commander";
import { run, type CommandResult } from "../io.js";

export interface BrokerOpts {
  readonly ttl?: string;
  readonly wrap?: boolean;
  readonly json?: boolean;
}

export function brokerHandler(_name: string, _opts: BrokerOpts): CommandResult {
  return {
    exitCode: 0,
    json: { stub: true, command: "broker" },
    text: "broker: stub (B2 mints handles — never values)",
  };
}

export function register(program: Command): void {
  program
    .command("broker")
    .description("return a short-TTL handle for a secret (never the value, O-09)")
    .argument("<secret-name>", "the secret name (alphanumeric/_/- only, P-18)")
    .option("--ttl <duration>", "handle time-to-live (e.g. 5m, 1h)")
    .option("--wrap", "response-wrap the handle (single-use)")
    .option("--json", "machine-readable output")
    .action((name: string, opts: BrokerOpts) =>
      run(() => brokerHandler(name, opts), opts),
    );
}
