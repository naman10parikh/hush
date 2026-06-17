---
title: "ecosystem-04 — What an AGENT (not a human) Operating Secrets Tools Needs to Know"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, agents, mcp, cli, credential-broker, secret-injection, env-var-hygiene, hush]
sources:
  - "https://blog.gitguardian.com/the-state-of-secrets-sprawl-2026/ (2026-03)"
  - "https://thehackernews.com/2026/03/the-state-of-secrets-sprawl-2026-9.html (2026-03)"
  - "https://www.helpnetsecurity.com/2026/04/14/gitguardian-ai-agents-credentials-leak/ (2026-04-14)"
  - "https://siliconangle.com/2026/06/15/1password-debuts-credential-broker-release-secrets-needed/ (2026-06-15)"
  - "https://blog.1password.com/service-accounts-sdks-agentic-ai/ (2026)"
  - "https://infisical.com/blog/best-secret-management-tools (2026)"
  - "https://chatforest.com/reviews/secret-management-mcp-servers/ (2026)"
  - "https://www.cyberark.com/resources/blog/secrets-out-why-workload-identity-is-essential-for-ai-agent-security (2026)"
  - "https://www.nodejs-security.com/blog/do-not-use-secrets-in-environment-variables-and-here-is-how-to-do-it-better"
  - "https://www.doppler.com/blog/environment-variable-secrets-2026 (2026)"
  - "github.com/FiloSottile/age, getsops/sops, trufflesecurity/trufflehog (CLI docs, 2026)"
summary: "The agent-native core of hush's domain expertise. The 2026 data (GitGuardian: AI-assisted commits leak secrets at 2x baseline; 24,008 secrets in MCP config files) PROVES agents are the new top leak vector. Covers: which CLIs/APIs/MCP-servers exist FOR agents, the credential-broker pattern, env-var-vs-file injection, MCP-config-leak avoidance, and the secret-scoping doctrine hush must enforce."
---

# ecosystem-04 — Agent-Operator Knowledge (the hush core)

> This is the file that makes hush a *domain expert* rather than a tool wrapper. The thesis: in 2026, AI agents
> are simultaneously (a) the fastest-growing *cause* of secret leaks and (b) the consumers hush must hand
> secrets to *safely*. hush has to solve both ends.

## 0. The proof that agents are the problem (GitGuardian State of Secrets Sprawl 2026)

Published 2026-03 (annual report; the canonical industry dataset). Verbatim findings worth quoting:
- **29 million** new hardcoded secrets hit public GitHub in 2025 — **+34% YoY, the largest single-year jump ever
  recorded.** [blog.gitguardian.com/the-state-of-secrets-sprawl-2026]
- **AI-assisted commits leak secrets at 3.2% vs a 1.5% baseline — ~2x.** AI coding tools *increase* leak rate.
  [helpnetsecurity 2026-04-14]
- **1,275,105 leaked secrets tied to AI services in 2025, +81% YoY.** [gitguardian 2026]
- **24,008 unique secrets exposed in MCP-related config files** on public GitHub, incl. **2,117 valid
  credentials.** Root cause: **MCP quickstart docs show API keys hardcoded in config examples**; developers copy
  the pattern, paste real keys, and commit. (Google API keys ~20%; Postgres conn-strings ~14%.) [thehackernews 2026-03]
- **The remediation gap: 64% of valid secrets first leaked in 2022 are STILL not revoked in 2026** — because
  teams "lack the governance for a viable, repeatable remediation path." [gitguardian 2026]

**hush doctrine derived from this single dataset:**
1. The MCP `.mcp.json` / `claude_desktop_config.json` file is now a **first-class leak surface**. hush's scanner
   MUST scan MCP config files specifically, and hush must NEVER write a real secret into one.
2. Leaks aren't the failure — **un-rotated leaks are.** Remediation governance (rotate-first, then prove
   rotation) is the actual product, matching the energy `.env` incident exactly (un-tracking = false-green).
3. An agent that pastes a key into a committed file is the *modal* 2026 incident. hush's agent-injection design
   must make "secret-never-touches-disk-in-the-repo" the default path.

## 1. Which secrets tools have an MCP server FOR agents (the inventory, June 2026)

Sources: [chatforest.com/reviews/secret-management-mcp-servers] + [infisical.com/blog/best-secret-management-tools]
(2026) for the comparison-post claims, CORRECTED by direct `gh search repos` (2026-06-16) which tells a messier,
more honest story than the listicle.

| Tool | MCP server reality (verified gh 2026-06-16) | Agent-safety note |
|---|---|---|
| **Infisical** | **Official + active:** `Infisical/infisical-mcp-server` (pushed 2026-06-12) + `Infisical/ai-skills` ("stop your AI hallucinating about Infisical secrets"). The listicle's "v0.0.23/45★" is the early state. | Pairs with **Agent Vault** credential proxy (below) — the safe path |
| **1Password** | **Official, but as a Codex plugin:** `1Password/1password-codex-plugin` (2026-06-09) fronts the **Developer Environments MCP**. NOT a generic standalone "1Password MCP." | Manages **"Environments"** WITHOUT exposing secrets to the agent — the broker pattern |
| **HashiCorp Vault** | **NO clean official MCP.** Top results are community/personal: `rccyx/vault-mcp` (**archived** 2026-02-05), `Cosmicjedi/vault-mcp-server`, `rod-anami-kyndryl/hashi-vault-mcp`. The listicle's "official, 47★" is **not corroborated** — treat as community-only. | Tool calls map to Vault paths; auth via the agent's own Vault token/role |
| **Bitwarden** | Official MCP (listicle: ~166★, v2026.5.0) + `bitwarden/sdk-sm` (437★, 2026-06-13). Most-starred secrets MCP per listicle. | Reads from Bitwarden Secrets Manager |
| **Doppler** | Community only / **dormant** (listicle). | Use the Doppler CLI (`doppler run --`) instead for agents |

**Notable adjacent signals (gh 2026-06-16):** `JulienPoitou/MCPGUARD` ("🔐 the 1Password for MCP servers —
secure your AI agent credentials") and `cjdrilke/aisafe` (an *educational* AI-agent credential-broker with a
documented **30+ attack-vector log across 10 rounds of adversarial review** — pointing to Infisical agent-vault /
1Password MCP for production). These confirm "secure-the-agent's-secrets" is now its own emerging tool category.

**Taste:** the *existence* of an MCP server is not the same as it being *safe* — and the listicle's "official
47★ Vault MCP" doesn't survive a direct repo check (the obvious candidate is archived). hush must verify MCP
provenance before trusting it, AND remember: The safe ones (1Password, Infisical
Agent Vault) deliberately keep the secret value OUT of the agent's context — they broker access, they don't hand
over the string. A naive MCP server that returns `{"value":"sk-ant-..."}` into the model's context window has
just put the secret in the transcript, the logs, and possibly the next commit. **hush's own MCP design must
return *references/handles*, not raw secret values, by default.**

## 2. The 2026 winning pattern: CREDENTIAL BROKER / credential proxy (don't hand the agent the secret)

This is the single most important architectural shift for hush to internalize. Two production implementations
landed in 2026:

- **1Password Credential Broker (GA 2026-06-15):** "releases secrets only when needed," keeps **fewer copies**
  of each secret ("fewer places a static secret can leak or linger after it's needed"), and **logs each request
  and handoff** so a security team can see *which workflow or agent asked for a given credential and when.* Part
  of "Unified Access" — later in 2026 it will issue **scoped credentials to agent/machine workloads at runtime**,
  reducing persistent access. [siliconangle.com 2026-06-15; blog.1password.com/service-accounts-sdks-agentic-ai]
- **Infisical Agent Vault:** "a purpose-built credential proxy that sits between the agent and the secrets it
  needs, enforcing access controls at the agent level." [infisical.com 2026]

**The broker pattern in one sentence:** the agent never holds a long-lived static secret; it requests an action
or a short-lived scoped credential from a broker that (a) decides per-request whether to release, (b) hands over
the minimum (ideally a one-shot/short-TTL token, not the master key), and (c) audit-logs the handoff.

**Contrast with workload identity (the CyberArk/SPIFFE view):** the *even-stronger* version is "no secret at
all" — the agent gets a short-lived, cryptographically-verifiable identity (SPIFFE/SPIRE X.509 SVID) tied to
*what it is and where it runs*, and the platform mints short-lived creds against that identity. "An attacker who
finds a stale key can't reuse it; your system slammed the window shut minutes ago."
[cyberark.com 2026; dev.to astaykov "your agentic platform doesn't need a single secret" 2026]

**hush doctrine:** the target architecture is **broker > dynamic-short-lived > rotated-static > raw-static**.
hush issues secrets, so hush should *be* (or front) a broker: return handles, mint short-TTL creds, log every
release. badge owns the *identity* that the broker checks; hush owns the *secret* the broker releases.

## 3. Env-var injection is the legacy default — and it's the leaky one

The most common way agents/processes get secrets is env vars (`process.env.X`). 2026 consensus: **env vars are
NOT safe for secrets in production.** Why (all sourced):
- **Readable via `/proc/<PID>/environ` on Linux** by anyone with ptrace; **inherited by ALL child processes** —
  violates least-privilege and spreads the secret to every subprocess the agent spawns.
  [nodejs-security.com; sourcery.ai container-secrets; trendmicro 2022 (still cited 2026)]
- **`.env` with `chmod 644` is world-readable** on the host. Crash dumps, error reporters, and `printenv`-style
  debug output routinely capture the full environment.
- Doppler's own 2026 piece: "Are environment variables still safe for secrets in 2026?" — answer: no, for prod.
  [doppler.com/blog/environment-variable-secrets-2026]

**The safer injection alternatives (in order of preference):**
1. **Broker/dynamic at runtime** (§2) — agent fetches a short-TTL cred when it needs it, holds it in memory only.
2. **File-mount, read-only, 0400, in `/run/secrets` (tmpfs)** — the Docker/K8s-secrets pattern. Not in env, not
   inherited by children, not in `/proc/environ`. The "mount secrets as files" recommendation. [aquilax.ai OWASP 2026]
3. **Vault Agent sidecar → shared memory volume** — renders secrets to tmpfs, never creates a K8s Secret object,
   secret stays in memory. (See §5.)
4. **Env var injected just-in-time, never written to a file** (`doppler run --`, `infisical run --`,
   `op run --`, `vault agent`) — better than a committed `.env`, but still inherits to children. Acceptable for
   dev, marginal for prod.
5. **Committed `.env` file** — the failure mode. Never. (This is literally the energy incident.)

**hush doctrine:** for agent injection, prefer broker/dynamic; if a static value is unavoidable, prefer a
read-only 0400 file-mount over an env var; if env var, inject just-in-time via a `run`-wrapper and NEVER persist
to a committed file. Document the `/proc/environ` + child-inheritance risk so the agent *knows why*.

## 4. The agent-runnable CLIs (the commands hush should know cold)

Every major tool ships a CLI designed to inject secrets without writing them to disk. These are the "just-in-time
env" wrappers — the agent runs its real command *as a subprocess* of the secrets CLI:

- **Doppler:** `doppler run -- <cmd>` (injects the project/config secrets as env into `<cmd>` only).
- **Infisical:** `infisical run -- <cmd>` (same model; supports `--env`, machine-identity auth for CI/agents).
- **1Password:** `op run -- <cmd>` (resolves `op://vault/item/field` secret-references in env at launch);
  `op read op://...` for one-shot reads. Service-account token via `OP_SERVICE_ACCOUNT_TOKEN`.
- **Vault / OpenBao:** `vault kv get -mount=secret <path>` / `bao kv get ...`; agent auth via
  `vault login` with a role; **Vault Agent** (`vault agent -config=...`) does auto-auth + templating to files.
- **SOPS:** `sops -d secrets.enc.yaml` (decrypt to stdout); `sops exec-env secrets.enc.yaml '<cmd>'` (decrypt
  into env for a child cmd); `sops exec-file ...` (decrypt to a temp file for a child cmd). age key via
  `SOPS_AGE_KEY` / `SOPS_AGE_KEY_FILE`.
- **age:** `age -r <recipient> -o out.age in` (encrypt); `age -d -i key.txt out.age` (decrypt). Dead-simple,
  no KMS, one keypair. age 1.3+ has a post-quantum recipient.

**Machine-identity / agent-auth note (load-bearing):** every tool now has a *non-interactive* auth path for
agents/CI that is NOT "paste a human's token": Infisical **Machine Identities** (Universal Auth / OIDC / native
cloud), 1Password **Service Accounts** (`OP_SERVICE_ACCOUNT_TOKEN`), Vault/OpenBao **AppRole / Kubernetes /
JWT-OIDC auth**, Doppler **Service Tokens / Service Accounts**. **hush doctrine: an agent must authenticate as a
*machine identity scoped to one project/path*, never with a human's personal token.** (Mirrors browser-agent
Rule 8: identity comes from a verified machine credential, not a request body — that boundary is badge's, but
hush must consume only machine identities.)

## 5. Kubernetes secret injection — the three patterns (for when hush ships to clusters)

Source: [developer.hashicorp.com/vault/docs/deploy/kubernetes/injector-csi; hashicorp.com blog; verifa.io] (2026).

| Pattern | How secrets land | Creates K8s Secret object? | Vault load | Best when |
|---|---|---|---|---|
| **Vault Agent Sidecar Injector** | Sidecar renders to **shared memory (tmpfs) volume** | **No** (memory only) | **Highest** (per-pod conn + sidecar) | Max security; secret must never be a K8s Secret |
| **Vault CSI Provider** | Ephemeral CSI volume → files; can optionally sync to K8s Secret/env | Optional | Medium (per-pod conn) | K8s-native file mounts, balance |
| **Vault Secrets Operator (VSO)** | CRD reconciles Vault → **real K8s Secret** | **Yes** | **Lowest** (one conn pool per node, client cache) | Easiest adoption; OK if etcd-at-rest encryption is on |
| **External Secrets Operator (ESO)** | Same idea, vendor-neutral (Vault/AWS/GCP/1P/Infisical/Doppler) | Yes | Low | Multi-backend shops; the de-facto neutral standard |

**Gotcha:** VSO/ESO/CSI-sync all create a real K8s `Secret`, which is **base64, NOT encrypted, unless you've
enabled etcd encryption-at-rest.** The Sidecar Injector is the only one that keeps the secret out of etcd
entirely (memory-only). **hush doctrine:** prefer memory-only (sidecar) for the highest-value secrets; if using
ESO/VSO, *require* etcd encryption-at-rest as a precondition and say so loudly.

## 6. The "secret in the model's context / logs / transcript" failure (agent-specific, under-discussed)

Beyond commits, agents leak secrets through channels humans don't:
- **The context window / transcript:** an MCP tool that returns a raw secret value puts it in the conversation
  history, which may be logged, cached, or used to train. → return **references/handles**, never raw values.
- **Tool-call logs & traces:** observability (LangSmith-style traces, request logs) capture tool args/returns.
  → redact secret-shaped strings before logging; never log the secret or a URL containing it (browser-agent
  Rule 12 in the internal corpus: strip query strings → `origin+pathname` only).
- **Prompt injection → exfiltration:** a malicious page/document can instruct the agent to read a held secret
  and POST it somewhere (browser-agent Rule 2: treat extracted content as untrusted). → the agent should not be
  *able* to read a raw secret it holds (broker pattern) and outbound network on secret-bearing agents should be
  egress-restricted.
- **Error messages / stack traces:** secrets in env get dumped by crash reporters. → file-mount over env.

**hush doctrine (the agent secret-scoping rules):**
1. Return handles, not values, from any agent-facing secret API/MCP.
2. Redact secret-shaped tokens from all logs/traces; strip URL query strings before logging.
3. Scope every agent to the minimum secret set via a machine identity (one project/path), short TTL.
4. Assume the agent's context is adversarially manipulable (prompt injection) — the *capability* to exfiltrate
   must not exist, not just the *policy* against it.
5. Never let the agent write a secret to a repo path; the MCP-config file is a known 2026 leak surface — scan it.

---

### Distilled agent-doctrine for hush
- **Agents are the #1 new leak vector (GitGuardian 2026: 2x leak rate, MCP-config leaks, 81% AI-service surge).**
- **Architecture order: broker > dynamic-short-lived > rotated-static > raw-static.** Be/​front a broker.
- **Env vars leak (`/proc/environ` + child inheritance); prefer 0400 file-mounts in tmpfs; never a committed `.env`.**
- **Agents auth as scoped machine identities, never a human's token** (Infisical Machine ID / 1P Service Account
  / Vault AppRole-K8s-OIDC / Doppler Service Token).
- **Return handles not values; redact logs; assume prompt-injection; scan the MCP config file.**
- **K8s: memory-only sidecar for top secrets; if ESO/VSO, require etcd encryption-at-rest.**
- Boundary: hush releases/scopes the *secret*; badge owns the *identity* the broker checks.
