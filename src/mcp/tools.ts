/**
 * tools.ts — the MCP tool surface (PLAN §4 MCP list). Each tool REUSES the B2
 * library logic (scanners/index, lib/doctrine, lib/false-green, lib/doctor,
 * lib/guard) rather than reimplementing it — the CLI and the MCP server are two
 * faces of the same engine.
 *
 * Why the libs and not the CLI `*Handler`s: the handlers call `appendRun` (writes
 * logs/runs.jsonl) and the CLI `run()` wrapper writes to stdout + sets
 * process.exitCode. On the MCP stdio transport, stdout is the JSON-RPC channel —
 * any stray write corrupts it. So this layer calls the pure data functions.
 *
 * HARD invariant (brain O-09): every tool result is a handle/reference or a
 * verdict. NO tool returns a `value` field or a secret-shaped string. The broker
 * tool returns `{ handle, expiresAt }`, never `{ value }`. Defence in depth: every
 * return is passed through `redact()` before it leaves the process.
 */
import { scanRepo } from "../scanners/index.js";
import { doctor } from "../lib/doctor.js";
import { advise } from "../lib/false-green.js";
import { remediationPlan, rotationPlan, recommendTool } from "../lib/doctrine.js";
import { safeSecretName } from "../lib/guard.js";
import { redactValue } from "../lib/redact.js";

/** JSON Schema (draft-07 subset) for an MCP tool's input. */
interface InputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
}

/** An MCP tool descriptor for `tools/list`. */
export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: InputSchema;
}

const STR = { type: "string" } as const;
const BOOL = { type: "boolean" } as const;

/** The seven hush tools (PLAN §4). Names are `hush_*` so the verify grep matches. */
export const TOOL_DESCRIPTORS: readonly ToolDescriptor[] = [
  {
    name: "hush_scan",
    description:
      "Scan a repo for leaked secrets (gitleaks prevent/catch + trufflehog verify + .mcp.json + base64). Returns redacted findings + exitCode (1 if any finding). Never returns a raw value.",
    inputSchema: {
      type: "object",
      properties: { path: STR, staged: BOOL, history: BOOL, verify: BOOL, mcpConfig: BOOL },
      required: ["path"],
    },
  },
  {
    name: "hush_doctor",
    description:
      "Report the secret-manager wiring of a repo: gitignore_ok, env_example_schema_only, mcp_refs_ok, scanners_present, sops_breakglass, score. Booleans only, never values.",
    inputSchema: { type: "object", properties: { path: STR }, required: ["path"] },
  },
  {
    name: "hush_advise",
    description:
      "Verdict + doctrine for a remediation/rotation situation; flags false-greens (git rm --cached, updatekeys-only, GCP 'rotation enabled'). Returns { verdict, doctrine, false_green, brain_refs }.",
    inputSchema: { type: "object", properties: { situation: STR }, required: ["situation"] },
  },
  {
    name: "hush_remediate",
    description:
      "Produce the ordered rotate-first remediation plan for a finding. rotate_first:true, consent_required_for_scrub:true; never auto-rewrites history off an unverified line number (P-04).",
    inputSchema: { type: "object", properties: { finding: STR }, required: ["finding"] },
  },
  {
    name: "hush_rotate_plan",
    description:
      "Emit the ISSUE→DEPLOY→VERIFY→REVOKE rotation plan; alternating-users for live connections; warns GCP is notify-only.",
    inputSchema: {
      type: "object",
      properties: { secretRef: STR, liveConnections: BOOL },
      required: ["secretRef"],
    },
  },
  {
    name: "hush_broker",
    description:
      "Return a short-TTL HANDLE for a secret — never the value (O-09). Returns { handle:'hush://store/<name>', expiresAt }. Use `hush inject` to deliver the value to a child process.",
    inputSchema: {
      type: "object",
      properties: { secretName: STR, ttl: STR, wrap: BOOL },
      required: ["secretName"],
    },
  },
  {
    name: "hush_tool",
    description:
      "Recommend the secrets portfolio/layer for a job (OpenBao default; SOPS+age for git). Never quotes a single price (G-01). Returns { default, alts, when_alt, billing_note, brain_refs }.",
    inputSchema: { type: "object", properties: { job: STR }, required: ["job"] },
  },
];

/** Result of a tool call: structured content + an isError flag for the JSON-RPC layer. */
export interface ToolCallResult {
  readonly content: unknown;
  readonly isError: boolean;
}

/** Parse a TTL like "5m"/"1h"/"30s" into ms (default 5m). Mirrors broker.ts. */
function parseTtlMs(ttl: unknown): number {
  if (typeof ttl !== "string") return 5 * 60_000;
  const m = /^(\d+)\s*(s|m|h)$/.exec(ttl.trim());
  if (!m) return 5 * 60_000;
  const n = Number(m[1]);
  return m[2] === "s" ? n * 1000 : m[2] === "h" ? n * 3_600_000 : n * 60_000;
}

function asString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`'${field}' must be a non-empty string`);
  }
  return v;
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

/**
 * Dispatch a tool call to the reused B2 library logic. Throws on an unknown tool
 * or bad args (the JSON-RPC layer maps the throw to an error result). The result
 * object is later redacted by the server before it is serialized.
 */
export function callTool(name: string, args: Record<string, unknown>): ToolCallResult {
  switch (name) {
    case "hush_scan": {
      const report = scanRepo({
        path: asString(args.path, "path"),
        staged: asBool(args.staged),
        history: asBool(args.history),
        verify: asBool(args.verify),
        mcpConfig: asBool(args.mcpConfig),
      });
      return {
        content: {
          findings: report.findings,
          exitCode: report.exitCode,
          scanners: report.scanners,
          notes: report.notes,
        },
        isError: false,
      };
    }
    case "hush_doctor":
      return { content: doctor(asString(args.path, "path")), isError: false };

    case "hush_advise":
      return { content: advise(asString(args.situation, "situation")), isError: false };

    case "hush_remediate":
      return { content: remediationPlan(asString(args.finding, "finding")), isError: false };

    case "hush_rotate_plan":
      return {
        content: rotationPlan(asString(args.secretRef, "secretRef"), asBool(args.liveConnections) ?? false),
        isError: false,
      };

    case "hush_broker": {
      // P-18 guard runs BEFORE building any handle; O-09 — return a handle, never a value.
      const safe = safeSecretName(asString(args.secretName, "secretName"));
      const expiresAt = new Date(Date.now() + parseTtlMs(args.ttl)).toISOString();
      return {
        content: {
          handle: `hush://store/${safe}`,
          expiresAt,
          wrapped: asBool(args.wrap) ?? false,
          note: "no value returned — deliver via `hush inject` (O-09)",
        },
        isError: false,
      };
    }
    case "hush_tool":
      return { content: recommendTool(asString(args.job, "job")), isError: false };

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

/**
 * The O-09 enforcement gate: run any tool result through a deep redact so that —
 * even if a future tool body regressed — no secret-shaped string can leave the
 * MCP surface. This is the mechanical guarantee behind the HARD invariant.
 */
export function redactResult(content: unknown): unknown {
  return redactValue(content);
}
