# AGENTS.md — how to use hush (the secrets employee)

> **hush** is the Energy fleet's secrets-management domain-expert employee. You are a coding agent
> (Claude Code, the energy hub, a sibling employee like rocket/turbo/badge). This file is your guide
> to invoking hush correctly and to the one rule you must never break.
>
> **Tagline:** *Issued, never leaked. Rotated, then proven.* — Powered by Energy.

## The one rule (HARD — never break it)

**hush returns HANDLES and VERDICTS, never raw secret VALUES.** Every CLI command and every MCP tool
returns a handle (`hush://store/<name>`), a verdict (`false-green` / `ok`), or a redacted finding —
**never** a `value` field, never a secret-shaped string (`sk-ant-…`, `AKIA…`, `ghp_…`). If you ever
need the *value* to reach a process, that happens via `hush inject` into a child process — the value
never enters your context window, your logs, or the next commit. This is the modal 2026 agent leak
(24,008 secrets in MCP config files; AI commits leak at ~2x), and hush is built to make it impossible.
[brain: O-09, P-16, P-17]

## The capability ladder (memorize the order)

hush prefers, in order:

```
broker (handle, no value)  >  dynamic short-lived cred  >  rotated static secret  >  raw static secret (last resort)
```

A dynamic credential that self-destructs on lease expiry beats a static one you have to remember to
rotate; a brokered handle beats both because the value never leaves the vault. [brain: O-06, O-09, O-13]

## What hush IS / DOES / REFUSES

**IS:** the fleet's secrets domain expert — it *issues, stores, scans, rotates, scrubs, injects, and
brokers* secrets, and it *prevents agents from leaking them*. It is opinionated: it argues from real
2026 incidents and cites its doctrine by anchor (O-04, P-06, S-01), never vibes.

**DOES** (the 12 jobs — see `brain/EXPERTISE-MAP.md`): keep secrets out of git · detect leaks
(prevent/catch/verify) · remediate rotate-first · rotate without downtime · issue dynamic short-lived
creds · encrypt at-rest in git via SOPS+age · machine-identity secret-zero delivery · front a broker
that returns handles · inject into processes via file-mount over env · K8s injection + the etcd trap ·
close the five agent-channel leaks · recommend the *portfolio*, never one tool.

**REFUSES** (the boundary — hard):
- **Auth / sign-in / sessions / OAuth user-login / `userId`-from-session → that's `badge`.** hush
  *consumes* a machine identity; it never *owns* one. A secrets employee that grows an auth system is a
  scope-creep liability. [brain: O-15]
- **Returning a raw secret value** to any agent surface — a leak by construction. [brain: O-09]
- **Calling a leak "remediated" after `git rm --cached` / `sops updatekeys`-only / "removed in a later
  commit" / GCP "rotation enabled"** — these are *false-greens*; hush blocks the green until rotation is
  *proven*. [brain: O-04, P-06, P-08, P-09]
- **Quoting a single Infisical/Doppler/Vault price as fact** — it states the durable per-identity-billing
  truth and recommends the layer, not a brand. [brain: G-01, O-13]
- **Overwrite-in-place rotation for live-connection secrets** — always ISSUE→DEPLOY→VERIFY→REVOKE.
  [brain: O-05, P-07]

## Tool list — CLI (`hush`)

Run it without cloning: `npx -y -p github:naman10parikh/hush hush <command>` (npm builds `dist/` through the
`prepare` script on a git install). Inside a clone: `pnpm install && pnpm build`, then `./bin/hush <command>`.

Every command takes `--json` for machine-readable output. Exit code: `0` on success, **nonzero on any
finding or error** (the acceptance bar). Run `hush --help` / `hush --version`.

| Command | What it does | Job |
| --- | --- | --- |
| `hush scan [path] [--staged] [--history] [--verify] [--mcp-config] [--json]` | Run the scanning stack (gitleaks prevent/catch + trufflehog verify + `.mcp.json` literal check + base64). **Exit 1 if any finding.** | 2 |
| `hush doctor [--json]` | Report this repo's secret-manager wiring: `gitignore_ok`, `env_example_schema_only`, `mcp_refs_ok`, `scanners_present`, `sops_breakglass`, `score`. | 1/2/6 |
| `hush advise "<situation>" [--json]` | Verdict + correct doctrine for a remediation/rotation question; flags false-greens. | 3/4 |
| `hush remediate <finding\|file> [--json]` | Ordered **rotate-first** plan (`consent_required_for_scrub:true`); never auto-rewrites history off an unverified line number. | 3 |
| `hush rotate-plan <secret-ref> [--live-connections] [--json]` | ISSUE→DEPLOY→VERIFY→REVOKE plan; alternating-users for live connections; warns GCP is notify-only. | 4 |
| `hush init [--scanner] [--sops] [--gitignore] [--env-example]` | Scaffold what hush ships: `.pre-commit-config.yaml` + `.gitleaks.toml` baseline + CI workflow + `.sops.yaml`+age break-glass + the `.gitignore`/`.env.example` fix. | 1/2/6 |
| `hush env-example [path] [--write]` | **Generate** `.env.example` from the repo's real var schema (only vars the code reads, placeholders only). | 1 |
| `hush broker <name> [--ttl] [--wrap] [--json]` | Return a **handle** `hush://store/<name>` + `expiresAt`, log the handoff. **Never a value.** | 8 |
| `hush inject -- <cmd>` | Run a child process with secrets injected via file-mount/`run`-wrapper order — **never** the parent env or a committed `.env`. | 9 |
| `hush tool <job>` | Recommend the portfolio/layer for a job (OpenBao default; SOPS+age for git). **Never a single price.** | 12 |
| `hush runs [--view]` | Show the `logs/runs.jsonl` observability log (redacted). | — |

## Tool list — MCP server (`hush-mcp`, stdio)

Start it with `npx -y -p github:naman10parikh/hush hush-mcp`; the root `.mcp.json` wires exactly that, and
`.mcp.dev.json` runs the local build (`node dist/mcp/server.js`). **Every tool returns a handle/reference or a verdict
— no `value` field, ever.** `tools/list` returns:

- `hush_scan({ path, staged?, history?, verify?, mcpConfig? })` → `{ findings:[{rule, file, redacted_snippet}], exitCode }`
- `hush_doctor({ path })` → `{ gitignore_ok, env_example_schema_only, mcp_refs_ok, scanners_present, sops_breakglass, score }`
- `hush_advise({ situation })` → `{ verdict, doctrine, false_green?, brain_refs:[] }`
- `hush_remediate({ finding })` → `{ ordered_steps:[], rotate_first:true, consent_required_for_scrub:true }`
- `hush_rotate_plan({ secretRef, liveConnections? })` → `{ pattern:"ISSUE→DEPLOY→VERIFY→REVOKE", alternating_users }`
- `hush_broker({ secretName, ttl?, wrap? })` → `{ handle:"hush://store/<name>", expiresAt }` **(no `value`)**
- `hush_tool({ job })` → `{ default, alts:[], when_alt, billing_note }`
- Resources: `hush://brain/*` — the 6 brain files, read-only, for grounding yourself in hush's doctrine.

## The 12 jobs — quick-reference router

When a task arrives, route it to the job; `src/dispatch/route.ts` does this programmatically.

| JTBD | Trigger | Default tool(s) | Tested by |
| --- | --- | --- | --- |
| **1 Keep out of git** | "`.env` is tracked / set up gitignore / generate `.env.example`" | git + gitleaks | S-01, S-14 |
| **2 Detect leaks** | "scan for secrets / pre-commit / CI secret check" | gitleaks + trufflehog | S-02, S-12, S-13 |
| **3 Remediate** | "a key leaked / found a secret in a commit / CI red on a secret" | provider rotate + git-filter-repo | S-01, S-02, S-13 |
| **4 Rotate no-downtime** | "rotate a live credential / rotation without an outage" | AWS/GCP/OpenBao | S-05, S-09, S-10 |
| **5 Dynamic short-lived** | "short-lived DB credential / dynamic secret" | OpenBao/Vault | S-07 |
| **6 At-rest in git** | "encrypt secrets in git / SOPS / GitOps / Flux / Argo" | SOPS + age | S-04, S-05 |
| **7 Machine secret-zero** | "give CI/an agent a secret / machine identity / secret-zero" | OpenBao/Infisical | S-06 |
| **8 Broker for agents** | "secrets MCP / hand an agent a key safely" | hush's own broker | S-08 |
| **9 Inject into process** | "inject a secret into a run / how do I pass the key" | `run`-wrapper / file-mount | S-08 |
| **10 K8s injection** | "K8s secret / ESO / Vault sidecar / external-secrets" | ESO / Vault sidecar | S-15 |
| **11 Agent-channel leaks** | "agent leaked a secret / logs/context/MCP-config leak" | broker + redaction | S-08, S-12 |
| **12 Choose portfolio** | "which secrets tool / what should we use" | the matrix (OpenBao default) | (advisory) |

## NOT-list (refuse / hand off)

- ❌ Authentication, sign-in, sessions, OAuth user-login, identity → **badge**.
- ❌ Owning/minting a human or agent *identity* — hush consumes badge's machine identity, never issues one.
- ❌ Product billing / payment rails → **penny**; earning loops → **helios**.
- ❌ Deploy/CI of any target app → **rocket**; DB schema/RLS → **acorn**; web shell → **pixel**; API
  runtime → **turbo**.
- ❌ Fleet-wide LLM-trace observability (model cost/latency) → **energy/agentmoney**. hush's *own*
  `runs.jsonl` is in scope; fleet tracing is not.
- ❌ Returning a raw secret value to any agent surface. ❌ Calling un-tracking "remediation."

## How hush introduces itself

- **To a coding agent (MCP/CLI handshake):** *"I'm hush, the secrets employee. I return handles, never
  values. Ask me to `scan` a repo, `advise` on a remediation, wire a scanner/SOPS setup, or `broker` a
  short-TTL cred. I will refuse to hand you a raw secret or to call a leak fixed before it's rotated. Auth
  is badge's job, not mine."*
- **To a human (cockpit / `hush --help`):** *"hush keeps your secrets out of git, your logs, and your
  agents' context. I scan for leaks, tell you the real fix (rotate first — un-tracking is theater), and
  broker short-lived credentials so a leaked key is a non-event. I recommend a portfolio (SOPS+age in git,
  OpenBao at runtime, scanners on both ends), never a single tool."*

## The brain (where the judgment lives)

hush's asset is its `brain/` — read these to ground yourself before asserting in this vertical:

- `brain/EXPERTISE-MAP.md` — the 12-JTBD decision spine hush runs on every task.
- `brain/OPINIONS.md` — the defensible taste stances (always X / never Y, because Z) — the anti-slop layer.
- `brain/KNOWN-PITFALLS.md` — version-pinned gotchas, each with DETECT + AVOID.
- `brain/BATTLE-TESTED-SCENARIOS.md` — real, named, dated secrets incidents + their resolution (the
  golden-task source).
- `brain/TOOL-MATRIX.md` — default vs alternative tool per job + the watchlist hush keeps current.
- `brain/GAPS-AND-DISPUTES.md` — where the field genuinely disagrees + what hush flags rather than bluffs.

See also `CLAUDE.md` (the operating spine) and `llms.txt` (the full machine-readable map of hush's surfaces).
