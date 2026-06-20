/**
 * route.ts — the task→JTBD/handler router (PLAN §3 component 8 / HARNESS-OVERRIDES
 * component 8). Maps a free-text task string to one of hush's 12 jobs-to-be-done
 * (brain EXPERTISE-MAP) and the handler that owns it. Deterministic, no LLM, so it
 * is unit-testable and the eval can grade it.
 *
 * A handler is either a C3 sub-agent persona (`remediation-planner` /
 * `tool-selector`, the short names the personas are addressed by) or a B2 CLI
 * command (`scan`, `doctor`, `rotate-plan`, `broker`, `inject`, `env-example`,
 * `init`, `advise`). The router does NOT execute anything — it classifies; the
 * caller (CEO/dispatch loop) invokes the named handler. No `tmux select-pane`.
 */

/** A handler that owns a JTBD: a sub-agent persona or a CLI command. */
export type Handler =
  | "remediation-planner" // sub-agent (.claude/agents/hush-remediation-planner.md)
  | "tool-selector" // sub-agent (.claude/agents/hush-tool-selector.md)
  | "scan" // CLI: hush scan
  | "doctor" // CLI: hush doctor
  | "advise" // CLI: hush advise
  | "rotate-plan" // CLI: hush rotate-plan
  | "broker" // CLI: hush broker
  | "inject" // CLI: hush inject
  | "env-example" // CLI: hush env-example
  | "init"; // CLI: hush init

/** Whether a handler is a sub-agent persona (vs a CLI command). */
export type HandlerKind = "sub-agent" | "cli";

export interface RouteResult {
  /** The job-to-be-done index (1..12, EXPERTISE-MAP). */
  readonly jtbd: number;
  /** The handler that owns this job. */
  readonly handler: Handler;
  /** sub-agent persona vs CLI command. */
  readonly kind: HandlerKind;
  /** A one-line why, naming the JTBD. */
  readonly rationale: string;
}

interface RouteRule {
  readonly test: RegExp;
  readonly jtbd: number;
  readonly handler: Handler;
  readonly kind: HandlerKind;
  readonly rationale: string;
}

/**
 * Ordered rules — FIRST match wins. Order encodes precedence between overlapping
 * jobs:
 *  - Remediation (JOB 3) is checked BEFORE detection (JOB 2): "a key leaked in a
 *    commit" is a remediation situation, not a request to set up scanning.
 *  - Specific provisioning/rotation/broker cues come before the generic
 *    "choose a tool" (JOB 12) catch-net.
 * Each rule names the JTBD from brain/EXPERTISE-MAP.
 */
const RULES: readonly RouteRule[] = [
  // JOB 3 — Remediate: a secret was committed/leaked/found in git → rotate-first plan.
  {
    test: /\b(leak(ed|ing)?|committed|exposed|hard[\s-]?coded|pushed|found\s+in\s+(git|history|the\s+repo|a\s+commit)|in\s+(a\s+)?commit|remediat|git\s+rm\s+--cached|untrack|scrub\s+history|filter-repo)\b/i,
    jtbd: 3,
    handler: "remediation-planner",
    kind: "sub-agent",
    rationale: "JOB 3 (Remediate) — a leaked/committed secret needs the rotate-first, scrub-second plan.",
  },
  // JOB 1 — Keep out of git: .env / .gitignore / .env.example schema.
  // NB: no leading \b before the dot-prefixed alternatives — a \b cannot sit
  // between two non-word chars (a space then a literal `.`), so `.env.example`
  // would never match with a leading \b.
  {
    test: /(\.env\.example|env-example|gitignore|keep\s+out\s+of\s+git|\.env\s+(file|schema)|env\s+schema|generate\s+(an?\s+)?\.env)/i,
    jtbd: 1,
    handler: "env-example",
    kind: "cli",
    rationale: "JOB 1 (Keep out of git) — generate the .env.example schema / fix .gitignore.",
  },
  // JOB 2 — Detect leaks: set up scanning / pre-commit / CI secret check.
  // NB: no rigid trailing \b — match stems so "scanning"/"false positives" hit.
  {
    test: /\b(scan|gitleaks|trufflehog|pre[\s-]?commit|ci\s+secret\s+check|detect\s+(leak|secret)|baseline|false[\s-]?positive)/i,
    jtbd: 2,
    handler: "scan",
    kind: "cli",
    rationale: "JOB 2 (Detect leaks) — run/wire the scanning stack (gitleaks + trufflehog).",
  },
  // JOB 5 — Dynamic short-lived creds: database/creds/<role>, rotate-root.
  {
    test: /\b(dynamic\s+(secret|cred)|short[\s-]?lived\s+(secret|cred|credential)|database\/creds|rotate-root|lease|ttl[\s-]?expir)\b/i,
    jtbd: 5,
    handler: "advise",
    kind: "cli",
    rationale: "JOB 5 (Dynamic short-lived) — issue a database/creds/<role> cred with mandatory rotate-root.",
  },
  // JOB 4 — Rotate without downtime: ISSUE→DEPLOY→VERIFY→REVOKE.
  {
    test: /\b(rotat\w*|no[\s-]?downtime|zero[\s-]?downtime|alternating[\s-]?users?|issue.{0,6}deploy.{0,6}verify.{0,6}revoke)\b/i,
    jtbd: 4,
    handler: "rotate-plan",
    kind: "cli",
    rationale: "JOB 4 (Rotate no-downtime) — emit the ISSUE→DEPLOY→VERIFY→REVOKE plan.",
  },
  // JOB 6 — At-rest in git: SOPS + age, break-glass recipient.
  {
    test: /\b(sops|age\s+key|at[\s-]?rest|encrypt\w*\s+(secret|in\s+git)|gitops|flux|argo|break[\s-]?glass|updatekeys)\b/i,
    jtbd: 6,
    handler: "tool-selector",
    kind: "sub-agent",
    rationale: "JOB 6 (At-rest in git) — SOPS+age with a break-glass second recipient.",
  },
  // JOB 7 — Machine secret-zero: AppRole, response-wrapping, SPIFFE.
  {
    test: /\b(secret[\s-]?zero|approle|response[\s-]?wrap|wrapped\s+(token|secret)|machine\s+identit|workload\s+identit|spiffe|spire|service\s+(account|token))\b/i,
    jtbd: 7,
    handler: "tool-selector",
    kind: "sub-agent",
    rationale: "JOB 7 (Machine secret-zero) — AppRole+response-wrapping; prefer SPIFFE workload identity.",
  },
  // JOB 8 — Broker for agents: return handles, not values.
  {
    test: /\b(broker|hand(le|les)|short[\s-]?ttl\s+(reference|cred)|secrets?\s+mcp|return.{0,12}value|agent.{0,12}secret\b)\b/i,
    jtbd: 8,
    handler: "broker",
    kind: "cli",
    rationale: "JOB 8 (Broker for agents) — return a handle/short-TTL reference, never a value (O-09).",
  },
  // JOB 9 — Inject into a process: file-mount over env.
  {
    test: /\b(inject|file[\s-]?mount|run[\s-]?wrapper|env[\s-]?var\s+(secret|hygiene)|tmpfs|0400|pass\s+(a\s+)?secret\s+to\s+(a\s+)?(process|command|child))\b/i,
    jtbd: 9,
    handler: "inject",
    kind: "cli",
    rationale: "JOB 9 (Inject into process) — deliver via file-mount/run-wrapper, never a committed .env.",
  },
  // JOB 10 — K8s injection: sidecar vs ESO + etcd-at-rest trap.
  {
    test: /\b(k8s|kubernetes|eso|vso|external\s+secrets|sidecar|csi\s+(driver|provider)|etcd)\b/i,
    jtbd: 10,
    handler: "tool-selector",
    kind: "sub-agent",
    rationale: "JOB 10 (K8s injection) — sidecar (memory-only) vs ESO/VSO + require etcd-at-rest.",
  },
  // JOB 11 — Agent-channel leaks: context/logs/prompt-injection/errors/MCP-config.
  // NB: `.mcp.json` is matched without a leading \b (same dot-boundary reason as JOB 1).
  {
    test: /(\bprompt[\s-]?inject|\btranscript\b|\bcontext\s+window\b|\btool[\s-]?call\s+log|\bredact|\.mcp\.json|\bclaude_desktop_config|\bagent[\s-]?channel)/i,
    jtbd: 11,
    handler: "doctor",
    kind: "cli",
    rationale: "JOB 11 (Agent-channel leaks) — close the five leak channels (scan .mcp.json, redact logs).",
  },
];

/**
 * Route a free-text task to a JTBD + handler. Unmatched tasks fall to JOB 12
 * (Choose the portfolio) → the tool-selector sub-agent, which is the honest
 * default for an under-specified "what should I use for secrets?" task (O-13).
 */
export function route(task: string): RouteResult {
  for (const rule of RULES) {
    if (rule.test.test(task)) {
      return {
        jtbd: rule.jtbd,
        handler: rule.handler,
        kind: rule.kind,
        rationale: rule.rationale,
      };
    }
  }
  return {
    jtbd: 12,
    handler: "tool-selector",
    kind: "sub-agent",
    rationale: "JOB 12 (Choose the portfolio) — recommend the layer for the job, never a single tool/price.",
  };
}
