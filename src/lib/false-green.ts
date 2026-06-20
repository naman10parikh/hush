/**
 * false-green.ts — the verdict engine behind `hush advise`.
 *
 * A "false-green" is a fix that turns CI green while the secret stays live
 * (brain O-04 / P-06 / P-08 / P-09). hush refuses to call any of these
 * "remediated". This module classifies a free-text situation into a verdict and
 * attaches the correct doctrine + brain anchors — no LLM, deterministic, so it
 * is unit-testable and the eval grades it against the scenario success-criteria.
 */

export type Verdict =
  | "false-green"
  | "rotate-first"
  | "correct"
  | "needs-context";

export interface AdviseResult {
  readonly verdict: Verdict;
  readonly doctrine: string;
  /** True iff the situation describes (or proposes) a false-green move. */
  readonly false_green: boolean;
  readonly brain_refs: readonly string[];
}

interface Rule {
  readonly test: RegExp;
  readonly verdict: Verdict;
  readonly false_green: boolean;
  readonly doctrine: string;
  readonly brain_refs: readonly string[];
}

/**
 * Ordered rules — first match wins. The false-green family is checked first
 * (these are the dangerous "looks fixed, isn't" moves), then the rotate-first
 * cues, then explicitly-correct patterns.
 */
const RULES: readonly Rule[] = [
  {
    // git rm --cached / un-track / "removed it from the repo" — the canonical false-green (S-01/S-02).
    test: /\b(git\s+rm\s+--cached|untrack|un-track|removed?\s+(the\s+)?file|deleted?\s+(the\s+)?\.env|removed?\s+(it\s+)?in\s+a\s+later\s+commit)\b/i,
    verdict: "false-green",
    false_green: true,
    doctrine:
      "Un-tracking turns CI green but the secret stays in git history AND was burned the moment it hit a remote. ROTATE at the provider first (the load-bearing fix), THEN git rm --cached + fix .gitignore, THEN (optional, explicit consent) git filter-repo. Rotation must be PROVEN, not assumed.",
    brain_refs: ["O-04", "P-06", "S-01", "S-02"],
  },
  {
    // sops updatekeys-only after a teammate leaves (S-05 / P-09).
    test: /\b(updatekeys|update-keys|removed?\s+(their|the)\s+(age\s+)?(recipient|key))\b/i,
    verdict: "false-green",
    false_green: true,
    doctrine:
      "`sops updatekeys` re-encrypts the EXISTING data key to a new recipient list — the secret VALUES are unchanged, and a departing teammate who ever decrypted the file saw them. Run updatekeys to drop the recipient AND `sops rotate` (new data key) AND rotate the underlying secret values at their providers.",
    brain_refs: ["P-09", "S-05", "O-07"],
  },
  {
    // GCP "rotation enabled" = notify-only (S-09 / P-08). Order-independent:
    // both "gcp/google secret manager" and "rotat..." must appear, in any order.
    test: /(?=[\s\S]*\b(gcp|google)\b)(?=[\s\S]*\brotat)/i,
    verdict: "false-green",
    false_green: true,
    doctrine:
      "GCP Secret Manager rotation is NOTIFY-ONLY: it publishes a SECRET_ROTATE message to Pub/Sub — you build the rotation logic. 'Enable rotation' with no Cloud Function subscribed means it NEVER actually rotates. Deploy a function that does ISSUE→DEPLOY→VERIFY→REVOKE.",
    brain_refs: ["P-08", "S-09"],
  },
  {
    // overwrite-in-place rotation for live connections (S-10 / P-07).
    test: /\b(overwrite|update)\b[\s\S]{0,30}\b(secret|password|cred|key)\b[\s\S]{0,40}\b(in[\s-]?place|live|production|prod)\b/i,
    verdict: "rotate-first",
    false_green: false,
    doctrine:
      "Rotation is NEVER atomic — overwrite-in-place breaks live connections in the propagation window. Use alternating-users / two-secret: ISSUE new → DEPLOY to all consumers → VERIFY everyone is on the new one → REVOKE old.",
    brain_refs: ["O-05", "P-07", "S-10"],
  },
  {
    // a key/secret was committed / leaked / found in git — rotate-first cue (S-01).
    // Order-independent: a leak-verb AND a secret-noun must both appear, any order.
    test: /(?=[\s\S]*\b(committed|leaked|exposed|found\s+in\s+(git|history|the\s+repo)|hardcoded|pushed)\b)(?=[\s\S]*\b(key|secret|token|credential|password|\.env)\b)/i,
    verdict: "rotate-first",
    false_green: false,
    doctrine:
      "Treat the secret as LIVE until proven dead. Rotate at the provider immediately (the only fix that un-exposes it), THEN scrub: git rm --cached + .gitignore, then optional git filter-repo with explicit consent. A history rewrite is hygiene, not security.",
    brain_refs: ["O-04", "S-01", "S-02"],
  },
  {
    // already-rotated / proven-dead — the correct end state.
    test: /\b(rotated|revoked|proven\s+dead|confirmed\s+(rotated|dead)|new\s+key\s+(issued|deployed))\b/i,
    verdict: "correct",
    false_green: false,
    doctrine:
      "Rotation is the load-bearing fix — once the old value fails against the provider API, the exposure is closed. Verify the old credential is dead, then scrub history as hygiene (optional, with consent).",
    brain_refs: ["O-04", "S-01"],
  },
];

/** Classify a situation into a verdict + doctrine + brain anchors. */
export function advise(situation: string): AdviseResult {
  for (const rule of RULES) {
    if (rule.test.test(situation)) {
      return {
        verdict: rule.verdict,
        doctrine: rule.doctrine,
        false_green: rule.false_green,
        brain_refs: rule.brain_refs,
      };
    }
  }
  return {
    verdict: "needs-context",
    doctrine:
      "Not enough to classify. The default secrets stance: rotate first, scrub second; never call un-tracking / updatekeys-only / 'GCP rotation enabled' a fix; return handles, never values. Ask `hush advise` with the specific move you are considering.",
    false_green: false,
    brain_refs: ["O-04", "O-09"],
  };
}
