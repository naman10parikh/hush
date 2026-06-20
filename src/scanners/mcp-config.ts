/**
 * mcp-config.ts — the 2026 agent-leak surface: a `.mcp.json` (or
 * claude_desktop_config.json) that hardcodes a real secret value instead of a
 * `${VAR}` reference (brain P-16; GitGuardian: 24,008 secrets in MCP config
 * files). hush flags any value that is BOTH not a `${VAR}` ref AND secret-shaped.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { containsSecretByPrefix, redact } from "../lib/redact.js";
import type { Finding } from "./builtin.js";

const VAR_REF = /^\$\{[A-Z0-9_]+\}$|^\$[A-Z0-9_]+$/;

/**
 * Recursively collect string values that look like literal secrets (not refs).
 * Uses PREFIX-only detection (P-16): a pasted `ghp_…`/`sk-ant-…` value is a leak,
 * but a high-entropy package name (`@modelcontextprotocol/server-github`) or a
 * file path is NOT — entropy here would false-positive on hush's own correct
 * config (dogfood gate: confirm it stays correct, don't regrade it).
 */
function walk(node: unknown, path: string, out: Finding[], file: string): void {
  if (typeof node === "string") {
    if (!VAR_REF.test(node) && containsSecretByPrefix(node)) {
      out.push({
        rule: "mcp-config-literal-secret",
        file: `${file}:${path}`,
        redacted_snippet: redact(node).slice(0, 200),
        source: "working-tree",
      });
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, out, file));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      walk(v, path ? `${path}.${k}` : k, out, file);
    }
  }
}

export interface McpConfigResult {
  readonly present: boolean;
  /** True iff every value is a ${VAR} ref / non-secret (the correct pattern, P-16 ✅). */
  readonly refs_ok: boolean;
  readonly findings: readonly Finding[];
}

/** Check `<path>/.mcp.json` for literal secret values. */
export function scanMcpConfig(repoPath: string): McpConfigResult {
  const file = join(repoPath, ".mcp.json");
  if (!existsSync(file)) {
    return { present: false, refs_ok: true, findings: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const findings: Finding[] = [];
    walk(parsed, "", findings, ".mcp.json");
    return { present: true, refs_ok: findings.length === 0, findings };
  } catch (err) {
    // A malformed .mcp.json is a corrupt-input case — report, don't crash (PLAN §9).
    return {
      present: true,
      refs_ok: false,
      findings: [
        {
          rule: "mcp-config-unparseable",
          file: ".mcp.json",
          redacted_snippet: `could not parse: ${err instanceof Error ? err.message : String(err)}`,
          source: "working-tree",
        },
      ],
    };
  }
}
