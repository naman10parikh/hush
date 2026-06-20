/**
 * redact.ts — the shared anti-leak filter (the cross-cluster logger lib).
 *
 * Single source of truth for "what is secret-shaped" across hush: the scanners
 * (src/scanners/builtin.ts), the run logger (E2 reuses this), the MCP layer
 * (C1), and the cockpit (G1) all import from here. Encodes brain O-12 / P-17:
 * NEVER log a secret; strip URL query strings before logging.
 *
 * HARD invariant (O-09): no hush surface emits a raw secret value. This module
 * is how that is enforced mechanically — `redact()` runs over everything that
 * leaves the process (logs, findings snippets, tool returns).
 */

/**
 * Secret-shaped prefix patterns. Each carries the provider it fingerprints so a
 * finding can name the rule (S-12 grader needs a `rule`). Order is not
 * significant; all are tried. These are intentionally high-signal prefixes
 * (low false-positive), complemented by entropy for prefix-less secrets.
 */
export interface SecretPattern {
  readonly rule: string;
  readonly regex: RegExp;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { rule: "anthropic-api-key", regex: /sk-ant-[A-Za-z0-9_-]{8,}/g },
  { rule: "openai-api-key", regex: /sk-(?:proj-)?[A-Za-z0-9]{16,}/g },
  { rule: "aws-access-key-id", regex: /A(?:KIA|SIA|GPA|IDA|ROA|IPA|NPA|NVA)[0-9A-Z]{16}/g },
  { rule: "github-pat", regex: /gh[pousr]_[A-Za-z0-9]{16,}/g },
  { rule: "github-fine-grained-pat", regex: /github_pat_[A-Za-z0-9_]{20,}/g },
  { rule: "slack-token", regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { rule: "google-api-key", regex: /AIza[0-9A-Za-z_-]{35}/g },
  { rule: "stripe-secret-key", regex: /(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/g },
  { rule: "private-key-block", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
  { rule: "jwt", regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
];

/** Shannon entropy (bits per char) of a string — high entropy flags secret-like tokens. */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Default entropy threshold (bits/char) above which a long token is suspicious. */
export const ENTROPY_THRESHOLD = 4.0;
/** Minimum token length considered for entropy-based detection. */
export const ENTROPY_MIN_LEN = 20;

const TOKEN_RE = /[A-Za-z0-9+/_=-]{20,}/g;

/**
 * True if `text` matches a high-signal secret PREFIX pattern (sk-ant-, AKIA, …).
 * Prefix-only = near-zero false positives — safe for contexts where ordinary
 * high-entropy tokens are common (package names, file paths, git SHAs), e.g. the
 * .mcp.json scan (P-16: flag a pasted secret value, not `@scope/pkg-name`).
 */
export function containsSecretByPrefix(text: string): boolean {
  for (const { regex } of SECRET_PATTERNS) {
    const local = new RegExp(regex.source, regex.flags);
    if (local.test(text)) return true;
  }
  return false;
}

/**
 * True if `text` contains a secret-shaped string — by prefix pattern OR by a
 * high-entropy long token. Used by the hook gate (single-string check, lower FP
 * risk than a whole-repo scan).
 */
export function containsSecret(text: string): boolean {
  if (containsSecretByPrefix(text)) return true;
  for (const token of text.match(TOKEN_RE) ?? []) {
    if (token.length >= ENTROPY_MIN_LEN && shannonEntropy(token) >= ENTROPY_THRESHOLD) {
      return true;
    }
  }
  return false;
}

/** A redaction note describing what was masked (never the value itself). */
export interface RedactionHit {
  readonly rule: string;
}

/**
 * Replace every secret-shaped substring with a `[REDACTED:<rule>]` marker.
 * Pattern hits name their rule; entropy hits are `[REDACTED:high-entropy]`.
 * The result is always safe to log/return (O-12).
 */
export function redact(text: string): string {
  let out = text;
  for (const { rule, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    out = out.replace(regex, `[REDACTED:${rule}]`);
  }
  out = out.replace(TOKEN_RE, (token) =>
    token.length >= ENTROPY_MIN_LEN && shannonEntropy(token) >= ENTROPY_THRESHOLD
      ? "[REDACTED:high-entropy]"
      : token,
  );
  return out;
}

/**
 * Strip the query string from any URL in `text`, keeping origin+pathname only
 * (P-17 — URLs can carry session tokens / OAuth codes in query params).
 */
export function stripUrlQuery(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>)]+/g, (raw) => {
    try {
      const u = new URL(raw);
      return `${u.origin}${u.pathname}`;
    } catch {
      // Intentionally tolerant: a malformed URL is left as-is (it carried no parseable query).
      return raw;
    }
  });
}

/** Full safe-for-logging transform: strip URL queries, then redact secrets. */
export function sanitize(text: string): string {
  return redact(stripUrlQuery(text));
}
