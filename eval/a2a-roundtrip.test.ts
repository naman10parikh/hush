/**
 * a2a-roundtrip.test.ts — F2 packaging gate: assert ONE A2A capability (`scan`)
 * round-trips through hush.
 *
 * What "A2A round-trip" means here (PLAN §4 packaging / HARNESS-OVERRIDES A2A row):
 * an external agent reads hush's agent card (`.well-known/agent.json`), picks a
 * declared capability, and invokes it; hush executes it via the SAME engine the
 * card advertises (the `scan` capability == `node bin/hush scan` / `hush_scan` ==
 * `scanRepo`), and returns a verdict/finding — never a raw value (O-09).
 *
 * hush is a stdio-local tool-employee for C1 (no hosted A2A endpoint — PLAN HS-1),
 * so the "transport" we exercise is the local invocation path the card names. The
 * round-trip is: card declares `scan` → we invoke `scan` against a planted-key
 * fixture → we get a `rule`-bearing finding + nonzero exit (the request succeeded
 * and the response carries the expected result) → and the negative control (clean
 * repo) returns exit 0. The serialized A2A response carries NO secret-shaped value.
 *
 * Importing `scanRepo` directly (the advertised engine) keeps this test $0/offline
 * and CI-deterministic — the same reuse principle the CLI and MCP server follow.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { scanRepo, type ScanReport } from "../src/scanners/index.js";
import { containsSecret } from "../src/lib/redact.js";
// corpus.mjs materializes the planted-key fixture into an ephemeral git repo at
// the repo ROOT (out of the fixtures/ allowlist) so the scanner runs for real.
// @ts-expect-error — corpus.mjs is a plain ESM helper without a .d.ts.
import { plantedAcceptanceRepo, materializeClean } from "./fixtures/corpus.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

/** The A2A agent card, as an external caller would fetch it. */
interface AgentCard {
  readonly name: string;
  readonly capabilities: readonly string[];
  readonly skills: ReadonlyArray<{ readonly id: string; readonly mcpTool: string | null }>;
}

function loadAgentCard(): AgentCard {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, ".well-known", "agent.json"), "utf8"),
  ) as AgentCard;
}

/** An A2A response envelope: a structured result, never a raw secret value. */
interface A2AResponse {
  readonly capability: string;
  readonly ok: boolean;
  readonly result: {
    readonly exitCode: number;
    readonly findings: ScanReport["findings"];
  };
}

/**
 * The A2A dispatcher: map a declared capability to hush's engine and return a
 * structured envelope. Only `scan` is wired here (the round-trip the card promises
 * to honor); other capabilities are declared on the card and reach the same engine
 * via the CLI/MCP paths. This is the local-transport stand-in for an A2A call.
 */
function invokeCapability(capability: string, params: { path: string }): A2AResponse {
  if (capability !== "scan") {
    throw new Error(`capability not wired in this round-trip harness: ${capability}`);
  }
  const report = scanRepo({ path: params.path, history: true });
  return {
    capability,
    ok: true,
    result: { exitCode: report.exitCode, findings: report.findings },
  };
}

describe("A2A round-trip — the `scan` capability (F2 packaging gate)", () => {
  it("declares `scan` (and the other 5 capabilities) on the agent card", () => {
    const card = loadAgentCard();
    expect(card.name).toBe("hush");
    // The PLAN-required capability set.
    for (const cap of ["scan", "doctor", "advise", "remediate", "broker", "tool"]) {
      expect(card.capabilities).toContain(cap);
    }
    // The `scan` skill maps to the hush_scan MCP tool (the engine the round-trip hits).
    const scanSkill = card.skills.find((s) => s.id === "scan");
    expect(scanSkill?.mcpTool).toBe("hush_scan");
  });

  it("round-trips: invoking `scan` on a planted-key repo returns a rule-bearing finding + nonzero exit", () => {
    const repo = plantedAcceptanceRepo();
    const res = invokeCapability("scan", { path: repo });

    expect(res.capability).toBe("scan");
    expect(res.ok).toBe(true);
    // The request succeeded AND the response carries the expected result: a finding.
    expect(res.result.findings.length).toBeGreaterThan(0);
    expect(res.result.findings.some((f) => typeof f.rule === "string" && f.rule.length > 0)).toBe(true);
    // Nonzero exit on a finding — the acceptance bar (gitleaks-native contract).
    expect(res.result.exitCode).not.toBe(0);
  });

  it("negative control: invoking `scan` on a clean repo returns exit 0 / no findings", () => {
    const cleanRepo = materializeClean();
    const res = invokeCapability("scan", { path: cleanRepo });
    expect(res.result.findings.length).toBe(0);
    expect(res.result.exitCode).toBe(0);
  });

  it("O-09: the serialized A2A response carries NO raw secret value", () => {
    const repo = plantedAcceptanceRepo();
    const res = invokeCapability("scan", { path: repo });
    // Serialize the whole envelope exactly as it would cross the A2A wire.
    const wire = JSON.stringify(res);
    expect(containsSecret(wire)).toBe(false);
  });
});
