/**
 * doctrine.ts — hush's secrets knowledge, distilled to deterministic structures
 * for `hush tool`, `hush rotate-plan`, and `hush remediate`. Every entry traces
 * to a brain anchor (OPINIONS / TOOL-MATRIX / BATTLE-TESTED-SCENARIOS).
 *
 * HARD rule G-01: never quote a single price as fact. `tool` returns a
 * `billing_note` describing the durable billing-axis truth, never a number.
 */

export interface ToolRecommendation {
  readonly job: string;
  readonly default: string;
  readonly alts: readonly string[];
  readonly when_alt: string;
  /** The durable billing TRUTH — an axis, never a single dollar figure (G-01). */
  readonly billing_note: string;
  readonly brain_refs: readonly string[];
}

/**
 * The portfolio per job (O-13: recommend the LAYER, not a brand). Keys are
 * matched case-insensitively as substrings of the requested job.
 */
const TOOL_MATRIX: readonly ToolRecommendation[] = [
  {
    job: "scanning",
    default:
      "gitleaks 8.30.1 (`protect --staged` prevent + `detect` history) AND trufflehog 3.95.5 (`--only-verified`) — run BOTH, they are not alternatives (O-03).",
    alts: ["Yelp/detect-secrets (baseline UX)", "git-secrets (legacy AWS)"],
    when_alt: "detect-secrets when you want its mature .secrets.baseline allowlist UX.",
    billing_note: "gitleaks + trufflehog are OSS/free; no per-seat billing.",
    brain_refs: ["O-03", "S-12", "P-03", "P-05"],
  },
  {
    job: "at-rest",
    default:
      "SOPS 3.13.1 + age 1.3.1 — the only tool that belongs in git (encrypted at rest); ALWAYS list a break-glass 2nd recipient (O-07).",
    alts: ["git-crypt", "sealed-secrets (narrower, K8s-only)"],
    when_alt: "sealed-secrets only inside a Kubernetes GitOps flow; git-crypt for whole-file opacity.",
    billing_note: "SOPS + age are OSS/free; cost is in the KMS/age key management, not licensing.",
    brain_refs: ["O-07", "S-04", "S-05", "P-09", "P-10"],
  },
  {
    job: "runtime",
    default:
      "OpenBao 2.5.4 (MPL-2.0, alive) for serious self-host — dynamic creds + the broker. Default over Vault (BUSL-1.1/IBM) unless an existing Enterprise contract dictates (O-13).",
    alts: ["Vault 2.0.2 (Ent contract / deepest PKI)", "Infisical 0.161 (DX / Agent Vault / SPIFFE)"],
    when_alt: "Infisical when agent-native DX (Agent Vault, SPIFFE) matters and the MIT-core gaps are acceptable; Vault when an Enterprise contract or the deepest dynamic/PKI story already exists.",
    billing_note:
      "Infisical & Doppler bill on DIFFERENT axes (per-user vs per-identity) and sources disagree ~2.5x — fetch live pricing and cite the date; never quote one number as fact (G-01).",
    brain_refs: ["O-13", "G-01", "S-07"],
  },
  {
    job: "rotation",
    default:
      "PREFER dynamic short-lived creds (OpenBao `database/creds/<role>` — the TTL IS the rotation) over rotating static ones; if static, use alternating-users ISSUE→DEPLOY→VERIFY→REVOKE (O-06/O-05).",
    alts: ["AWS Secrets Manager (ready-made rotation Lambdas)", "GCP SM (notify-only — you build the fn)"],
    when_alt: "AWS-managed rotation when all-in on AWS; on GCP you MUST build the Pub/Sub-triggered rotation function (P-08).",
    billing_note: "rotation cost is operational (the function/broker), not a per-secret license.",
    brain_refs: ["O-05", "O-06", "P-07", "P-08", "S-10"],
  },
  {
    job: "broker",
    default:
      "hush's own broker returns HANDLES not values (O-09); reference designs = 1Password Credential Broker / Infisical Agent Vault — copy the PATTERN, not a vendor.",
    alts: ["1Password (`op run --`)", "Infisical Agent Vault", "Doppler (`doppler run --`)"],
    when_alt: "use whichever your org already pays for — the handles-not-values pattern matters more than the vendor.",
    billing_note: "broker vendors bill per-identity/per-seat on disputed axes — pattern > price (G-01).",
    brain_refs: ["O-08", "O-09", "S-06", "S-08", "P-16"],
  },
  {
    job: "k8s",
    default:
      "Sidecar (memory-only, no K8s Secret object) for top secrets; ESO 6,680★ for multi-backend — but REQUIRE etcd encryption-at-rest (base64 ≠ encrypted, O-11/P-12).",
    alts: ["External Secrets Operator (ESO)", "Vault Agent Sidecar Injector", "CSI driver"],
    when_alt: "ESO is the OpenBao-on-K8s path (the openbao-secrets-operator fork was archived 2026-02-20); sidecar for the highest-value secrets.",
    billing_note: "ESO and the sidecar are OSS/free; cost is the runtime broker behind them.",
    brain_refs: ["O-11", "P-12", "S-15"],
  },
];

/** Recommend the portfolio for a job (substring match; falls back to a portfolio overview). */
export function recommendTool(job: string): ToolRecommendation {
  const q = job.toLowerCase();
  for (const rec of TOOL_MATRIX) {
    if (q.includes(rec.job) || rec.job.includes(q)) return rec;
  }
  // Fallback: the layered-portfolio answer (O-13 — the question "best tool?" is malformed).
  return {
    job,
    default:
      "There is no single winner — LAYER: SOPS+age (git) + OpenBao 2.5.4 (runtime dynamic) + gitleaks/trufflehog (prevent/catch) + a handles-not-values broker (agents).",
    alts: ["Vault (Enterprise)", "Infisical (agent-native DX)", "Doppler/1Password (zero-ops SaaS)"],
    when_alt: "pick the layer for the job, not a brand; OpenBao is the self-host default.",
    billing_note:
      "Pricing is contested across sources and billing axes — never quote a single number; fetch live + cite the date (G-01).",
    brain_refs: ["O-13", "G-01"],
  };
}

export interface RotationPlan {
  readonly secretRef: string;
  readonly pattern: "ISSUE→DEPLOY→VERIFY→REVOKE";
  readonly alternating_users: boolean;
  readonly steps: readonly string[];
  readonly gcp_notify_only_warning: string;
  readonly brain_refs: readonly string[];
}

/** Build the no-downtime rotation plan (O-05 / S-10). */
export function rotationPlan(secretRef: string, liveConnections: boolean): RotationPlan {
  const steps = [
    `ISSUE: mint a NEW credential for ${secretRef} (do not touch the old one yet).`,
    "DEPLOY: roll the new credential to every consumer (config/secret store), old still valid.",
    "VERIFY: confirm via logs/health that every consumer is using the NEW credential.",
    "REVOKE: only now disable/delete the OLD credential.",
  ];
  if (liveConnections) {
    steps.unshift(
      "LIVE CONNECTIONS: use alternating-users / two-secret (e.g. AWS `_clone` user with identical perms) — rotation is never atomic; overwrite-in-place breaks in-flight calls (P-07).",
    );
  }
  return {
    secretRef,
    pattern: "ISSUE→DEPLOY→VERIFY→REVOKE",
    alternating_users: liveConnections,
    steps,
    gcp_notify_only_warning:
      "If this secret lives in GCP Secret Manager: rotation is NOTIFY-ONLY — you must deploy a Pub/Sub-subscribed Cloud Function that performs the actual rotation; 'enable rotation' alone never rotates (P-08).",
    brain_refs: liveConnections ? ["O-05", "P-07", "S-10"] : ["O-05", "S-10", "P-08"],
  };
}

export interface RemediationPlan {
  readonly target: string;
  readonly rotate_first: true;
  readonly consent_required_for_scrub: true;
  readonly ordered_steps: readonly string[];
  readonly warning: string;
  readonly brain_refs: readonly string[];
}

/** Build the ordered rotate-first remediation plan (O-04 / S-01 / S-13). */
export function remediationPlan(target: string): RemediationPlan {
  return {
    target,
    rotate_first: true,
    consent_required_for_scrub: true,
    ordered_steps: [
      `1. ROTATE the secret in "${target}" at its provider NOW — the load-bearing fix (the old value is live until proven dead).`,
      "2. VERIFY the old credential fails against the provider API (rotation must be proven, not assumed).",
      "3. `git rm --cached` the file (keep a local copy) + add `.env*` to .gitignore (keep `!.env.example`) + commit.",
      "4. (OPTIONAL, explicit consent) `git filter-repo` to purge the old value from history + force-push.",
    ],
    warning:
      "NEVER auto-rewrite history off a scanner's reported line number — trufflehog line attribution is wrong for some detectors (P-04/S-13). Verify the finding's location first; the real fix is rotation, not a code edit.",
    brain_refs: ["O-04", "P-04", "P-06", "S-01", "S-13"],
  };
}
