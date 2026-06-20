#!/usr/bin/env node
/**
 * secret-scan-gate.js — hush's PreToolUse secret-LEAK gate (brain O-09 / P-16 / P-17).
 *
 * The productized form of the inherited `protect-secrets.js`. That hook blocks
 * credential *files* (`.env`, `id_rsa`, …) by PATH. This one blocks secret
 * *strings* by VALUE — the gap that file-path matching can't cover:
 *   (a) a secret-shaped string about to enter a commit / a Write (entropy +
 *       high-signal prefix `sk-ant-`/`AKIA`/`ghp_`/… — the 2026 modal leak), and
 *   (b) a Write of a non-`${VAR}` literal secret into `.mcp.json` (P-16; the
 *       GitGuardian "24,008 secrets in MCP config files" surface).
 * Both hooks are KEPT (CP123 Q-13 / Karpathy surgical — don't delete working code).
 *
 * ES module (the repo is `"type": "module"`) so `node .claude/hooks/secret-scan-gate.js`
 * runs with NO build step from the repo root. The detection logic intentionally
 * mirrors `src/lib/redact.ts` (one definition of "secret-shaped" across hush) —
 * if you change one, change the other.
 *
 * Two input modes on stdin (auto-detected):
 *   1. Claude Code PreToolUse envelope: `{ "tool_name", "tool_input": {...} }`
 *      → inspect the command / file content; emit the PreToolUse deny JSON.
 *   2. Raw text (anything that isn't that envelope) → treat the whole stdin as
 *      the candidate string (the CI verify lines pipe `printf 'sk-ant-…' | node`).
 * Exit code is the load-bearing contract: NONZERO (2) on a finding, 0 on clean —
 * so `… ; test $? -ne 0` passes on a planted key and `test $? -eq 0` on clean.
 *
 * Setup (wired in .claude/settings.json):
 *   "PreToolUse": [{ "matcher": "Write|Edit|Bash",
 *     "hooks": [{ "type": "command",
 *       "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/secret-scan-gate.js\"" }] }]
 */

// ── "what is secret-shaped" — kept in lockstep with src/lib/redact.ts ────────
// High-signal PREFIX patterns (near-zero false positives). Each names the rule
// so a block message can cite it. Prefix detection is what fires on the planted
// `sk-ant-DUMMY…` key (its entropy is low — all-repeating — so prefixes, not
// entropy, are the load-bearing path for placeholder-shaped real prefixes).
export const SECRET_PATTERNS = [
  { rule: "anthropic-api-key", regex: /sk-ant-[A-Za-z0-9_-]{8,}/ },
  { rule: "openai-api-key", regex: /sk-(?:proj-)?[A-Za-z0-9]{16,}/ },
  { rule: "aws-access-key-id", regex: /A(?:KIA|SIA|GPA|IDA|ROA|IPA|NPA|NVA)[0-9A-Z]{16}/ },
  { rule: "github-pat", regex: /gh[pousr]_[A-Za-z0-9]{16,}/ },
  { rule: "github-fine-grained-pat", regex: /github_pat_[A-Za-z0-9_]{20,}/ },
  { rule: "slack-token", regex: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { rule: "google-api-key", regex: /AIza[0-9A-Za-z_-]{35}/ },
  { rule: "stripe-secret-key", regex: /(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/ },
  { rule: "private-key-block", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { rule: "jwt", regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

const ENTROPY_THRESHOLD = 4.0; // bits/char above which a long token is suspicious
const ENTROPY_MIN_LEN = 20; // shortest token considered for entropy detection
const TOKEN_RE = /[A-Za-z0-9+/_=-]{20,}/g;

/** Shannon entropy (bits/char) — high entropy flags secret-like prefix-less tokens. */
export function shannonEntropy(s) {
  if (s.length === 0) return 0;
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** First secret-shaped hit in `text` → { rule } | null. Prefix first, then entropy. */
export function findSecret(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  for (const { rule, regex } of SECRET_PATTERNS) {
    if (regex.test(text)) return { rule };
  }
  for (const token of text.match(TOKEN_RE) || []) {
    if (token.length >= ENTROPY_MIN_LEN && shannonEntropy(token) >= ENTROPY_THRESHOLD) {
      return { rule: "high-entropy" };
    }
  }
  return null;
}

// ── .mcp.json literal-secret check (P-16) — non-${VAR} secret-shaped value ────
const VAR_REF = /^\$\{[A-Z0-9_]+\}$|^\$[A-Z0-9_]+$/;

/** True if a string is a hardcoded literal secret (not a ${VAR} ref). Prefix-only
 *  (P-16): a high-entropy package name (`@scope/server-x`) / path is NOT a leak. */
export function isLiteralSecretValue(str) {
  if (VAR_REF.test(str)) return false;
  for (const { regex } of SECRET_PATTERNS) {
    if (regex.test(str)) return true;
  }
  return false;
}

/** Walk parsed JSON for any literal secret value → { rule, path } | null. */
export function findMcpLiteralSecret(node, path) {
  if (typeof node === "string") {
    return isLiteralSecretValue(node) ? { rule: "mcp-config-literal-secret", path } : null;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const hit = findMcpLiteralSecret(node[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const hit = findMcpLiteralSecret(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

// ── decision logic ────────────────────────────────────────────────────────────

/** Path looks like an MCP config file (.mcp.json / claude_desktop_config.json). */
export function isMcpConfigPath(p) {
  return typeof p === "string" && /(^|\/)(\.mcp\.json|claude_desktop_config\.json)$/.test(p);
}

/**
 * Inspect a PreToolUse envelope. Returns a block {rule, reason} or null (allow).
 *  - Write/Edit to an .mcp.json with a literal secret value → block (P-16).
 *  - Write/Edit content / Bash command carrying a secret-shaped string → block.
 */
export function inspectEnvelope(tool, input) {
  if (!input) return null;
  const filePath = input.file_path;
  const content =
    typeof input.content === "string"
      ? input.content
      : typeof input.new_string === "string"
        ? input.new_string
        : "";

  // (b) MCP-config literal secret (the specific P-16 surface). For an .mcp.json
  // write the structured ${VAR}-aware, PREFIX-only walk is AUTHORITATIVE — we do
  // NOT also run the generic entropy scan on this file, because a correct
  // `${GITHUB_PERSONAL_ACCESS_TOKEN}` ref / a package name is high-entropy but
  // NOT a leak (P-16 dogfood: never false-flag hush's own correct config).
  if ((tool === "Write" || tool === "Edit") && isMcpConfigPath(filePath) && content) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = undefined; // unparseable JSON → fall through to the generic scan
    }
    if (parsed !== undefined) {
      const hit = findMcpLiteralSecret(parsed, "");
      if (hit) {
        return {
          rule: hit.rule,
          reason: `literal secret in ${filePath} at ${hit.path || "<root>"} — use a \${VAR} reference, never a pasted value (brain P-16; 24,008 secrets leaked via MCP config files in 2026).`,
        };
      }
      return null; // valid .mcp.json with only ${VAR} refs / non-secrets → allow
    }
  }

  // (a) Generic secret-shaped string in Write/Edit content or a Bash command.
  const candidate = tool === "Bash" ? input.command : content;
  const hit = findSecret(typeof candidate === "string" ? candidate : "");
  if (hit) {
    return {
      rule: hit.rule,
      reason: `a [${hit.rule}] secret-shaped string is about to enter ${tool === "Bash" ? "a command" : filePath || "a file"}. Do NOT commit the value — reference it via a \${VAR}/broker handle (brain O-09: hush returns handles, never values; P-17: never log/commit a secret).`,
    };
  }
  return null;
}

/** Emit the PreToolUse deny payload + a nonzero exit (the dual contract). */
function blockHook(rule, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `🔒 [hush:secret-scan-gate:${rule}] Blocked: ${reason}`,
      },
    }),
  );
  process.exit(2);
}

/** Emit a nonzero exit for a raw-text (non-envelope) finding. */
function blockRaw(rule) {
  process.stderr.write(`🔒 [hush:secret-scan-gate:${rule}] secret-shaped string detected — blocked.\n`);
  process.exit(2);
}

export async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;

  // Mode 1: Claude Code PreToolUse envelope.
  let envelope = null;
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object" && typeof parsed.tool_name === "string") {
      envelope = parsed;
    }
  } catch {
    // Not JSON → raw-text mode (mode 2) below.
  }

  if (envelope) {
    // Only gate the mutating tools; everything else is allowed through.
    if (!["Write", "Edit", "Bash"].includes(envelope.tool_name)) {
      process.stdout.write("{}");
      return;
    }
    const block = inspectEnvelope(envelope.tool_name, envelope.tool_input);
    if (block) blockHook(block.rule, block.reason);
    process.stdout.write("{}"); // allow
    return;
  }

  // Mode 2: raw piped text (CI verify lines) — the whole stdin is the candidate.
  const hit = findSecret(input);
  if (hit) blockRaw(hit.rule);
  // Clean → exit 0 (default), no output needed.
}

// Run when invoked directly (not when imported by a test). `import.meta.main`
// isn't universal yet, so compare the resolved entry URL to this module's URL.
import { argv } from "node:process";
import { pathToFileURL } from "node:url";
const isMain = import.meta.url === pathToFileURL(argv[1] ?? "").href;
if (isMain) {
  main().catch((e) => {
    // Fail OPEN on an internal hook error (never wedge the agent on a hook bug),
    // but surface it on stderr so the failure is visible.
    process.stderr.write(`[secret-scan-gate] internal error: ${e && e.message}\n`);
    process.stdout.write("{}");
  });
}
