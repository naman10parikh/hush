---
title: "TOOL-MATRIX — Canonical Secrets Tools, Defaults, Agent-Access Surface & Required Secrets"
type: synthesis
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, tool-matrix, env-vars, mcp, cli, required-secrets, hush]
sources:
  - "raw/ecosystem-01-canonical-versions-and-deltas.md"
  - "raw/ecosystem-02-starter-repos-and-tooling.md"
  - "raw/ecosystem-03-docs-deep-dive-load-bearing-flows.md"
  - "raw/ecosystem-04-agent-operator-knowledge.md"
  - "raw/ecosystem-06-tradeoff-matrix.md"
related:
  - "[[EXPERTISE-MAP]]"
  - "[[OPINIONS]]"
  - "[[GAPS-AND-DISPUTES]]"
  - "[[KNOWN-PITFALLS]]"
summary: "The canonical tool registry: default vs alternatives per job, when-to-use-which, the agent-access surface (CLI/API/MCP) per tool, and the exact env vars / secrets each one needs. The §'Required-Secrets manifest' feeds Wave P directly."
---

# TOOL-MATRIX — Canonical Tools & Agent-Access Surface

> Versions/dates from `gh release` (ecosystem-01, fetched 2026-06-16). Agent-access provenance
> verified against direct `gh search repos` (ecosystem-04), which corrects several listicle claims.
> **Defaults reflect hush's OSS-self-host bias** (per mission). Honest verdicts: [[OPINIONS]].

---

## §1 — Canonical defaults per job (the "reach for this first" table)

| Job (see [[EXPERTISE-MAP]]) | **DEFAULT** | Strong alternative(s) | Use the alt when… |
|---|---|---|---|
| Runtime dynamic secrets / broker (self-host) | **OpenBao 2.5.4** | HashiCorp Vault 2.0.2; Infisical 0.161 | Vault: existing Ent contract / deepest PKI+dynamic. Infisical: DX matters, want Agent Vault. [src: ecosystem-06 verdicts] |
| At-rest secrets IN git (GitOps) | **SOPS 3.13.1 + age 1.3.1** | git-crypt; sealed-secrets | SOPS is the answer for Flux/Argo; alts are narrower. [src: ecosystem-01 §4, ecosystem-06] |
| Pre-commit leak prevention | **gitleaks 8.30.1** (`protect --staged`) | Yelp/detect-secrets 4552★; awslabs/git-secrets (maintenance) | detect-secrets when you want its `.secrets.baseline` audit UX. git-secrets only for legacy AWS-only. [src: ecosystem-02 §Tier-2, ecosystem-01 §5] |
| CI deep scan + live verification | **trufflehog 3.95.5** (`--only-verified`) | gitleaks `detect` (history) | Run BOTH: gitleaks for speed/history, trufflehog for verify. [src: ecosystem-01 §5, ecosystem-03 §5] |
| History scrub (after rotation) | **git-filter-repo 2.47.0** | BFG Repo-Cleaner (JVM) | BFG if you prefer the JVM tool. ALWAYS rotate first. [src: ecosystem-01 §6] |
| Agent credential broker (commercial reference) | **1Password Credential Broker** (GA 2026-06-15) | Infisical Agent Vault | Copy whichever your org already pays for; pattern matters more than vendor. [src: ecosystem-04 §2] |
| Machine/agent auth (secret-less ideal) | **SPIFFE/SPIRE** (via Infisical SPIFFE auth) or cloud-native | Vault/OpenBao AppRole + response-wrapping | AppRole when no workload-identity platform exists. [src: ecosystem-03 §3, §4] |
| K8s runtime secret sync (multi-backend) | **External Secrets Operator (ESO) 6,680★** | Vault Agent Sidecar (memory-only); CSI; VSO | Sidecar for top secrets (no etcd object); ESO for multi-backend. [src: ecosystem-04 §5, ecosystem-05 §C2] |
| Single-cloud managed secrets | AWS Secrets Manager *or* GCP Secret Manager | Parameter Store (AWS, cheap, no rotation) | GCP only if you'll BUILD the rotation fn (notify-only). [src: ecosystem-01 §7, ecosystem-05 §D2] |
| Zero-ops SaaS (human teams) | **Doppler** | 1Password | Doppler if no compliance/air-gap block (no self-host). [src: ecosystem-06 Doppler verdict] |

---

## §2 — The agent-access surface (CLI / API / MCP) per tool

What an *agent* can actually drive, verified against `gh search repos 2026-06-16` (ecosystem-04 §1).
**Listicle claims that did NOT survive a direct repo check are flagged ⚠.**

| Tool | CLI (agent-runnable) | API / SDK | MCP server (verified June 2026) | Agent-safety note |
|---|---|---|---|---|
| **OpenBao** | `bao` (full Vault-compat: `bao kv get`, `bao read database/creds/<role>`, `bao write -wrap-ttl=…`) | HTTP API (Vault-compatible) | Community only — same picture as Vault | Auth via the agent's own token/role; map tool calls → bao paths |
| **HashiCorp Vault** | `vault` (`vault kv get -mount=secret <path>`, `vault agent -config=…`) | HTTP API; many SDKs | ⚠ **NO clean official MCP.** Top community results: `rccyx/vault-mcp` (**archived** 2026-02-05), `Cosmicjedi/vault-mcp-server`, `rod-anami-kyndryl/hashi-vault-mcp`. Listicle "official 47★" **not corroborated** — community-only. | Vault Agent does auto-auth + templating to files (not env) |
| **Infisical** | `infisical run -- <cmd>`, `--env`, machine-identity auth | HTTP API; SDKs | **Official + active:** `Infisical/infisical-mcp-server` (pushed 2026-06-12) + `Infisical/ai-skills` | Pairs with **Agent Vault** credential proxy — the safe path; Machine ID incl. **SPIFFE** [src: ecosystem-03 §4] |
| **1Password** | `op run -- <cmd>` (resolves `op://vault/item/field`); `op read op://…` | SDKs (Python/JS/Go) | **Official, as a Codex plugin:** `1Password/1password-codex-plugin` (2026-06-09) fronting the **Developer Environments MCP** (NOT a generic standalone "1Password MCP") | Manages "Environments" WITHOUT exposing secrets to the agent — the broker pattern [src: ecosystem-04 §1] |
| **Doppler** | `doppler run -- <cmd>`, `doppler setup` | API; SDKs | ⚠ Community only / **dormant** — use the CLI for agents | Service Tokens / Service Accounts for non-interactive |
| **Bitwarden Secrets Mgr** | `bws` | `bitwarden/sdk-sm` (437★, 2026-06-13) | Official MCP (~166★, v2026.5.0) — most-starred secrets MCP per listicle | Reads from BW Secrets Manager |
| **SOPS** | `sops -d`, `sops exec-env <f> '<cmd>'`, `sops exec-file`, `sops encrypt/edit/rotate/updatekeys` | — (it's a CLI) | n/a | Decrypt to stdout or into a child process's env/file |
| **age** | `age -r <recipient> -o out.age in`; `age -d -i key.txt out.age` | — | n/a | Dead-simple, one keypair, no KMS; 1.3+ post-quantum recipient |
| **gitleaks** | `gitleaks detect` / `protect --staged` / `-b baseline` / `--config` | — | n/a | Official GitHub Action |
| **trufflehog** | `trufflehog git <url> --only-verified` (+ S3/docker/filesystem/slack scanners) | — | n/a | Official Action; `--only-verified` = FP-killer |

**Hard rule for hush's OWN agent surface (MCP/API):** return **references/handles, not raw secret
values, by default.** A naive MCP that returns `{"value":"sk-ant-..."}` has put the secret in the
transcript, logs, and possibly the next commit. The safe commercial designs (1Password DevEnv MCP,
Infisical Agent Vault) deliberately keep the value OUT of the agent's context. [src: ecosystem-04 §1, §2]

**Provenance rule:** the *existence* of an MCP server ≠ it being safe or official. Verify before
trusting (the obvious "official Vault MCP" candidate is archived). [src: ecosystem-04 §1]

---

## §3 — Required env vars / secrets per tool (the Wave-P feed)

Exactly what each tool needs to authenticate / find its key. **This section is the source for the
Required-Secrets manifest** the harness assembles in Wave P. All values shown are **placeholders** —
never commit real values (`.env.example` is a schema, [[EXPERTISE-MAP]] JOB 1.2).

| Tool | Required env / secret | What it is | Notes / source |
|---|---|---|---|
| **OpenBao / Vault** | `VAULT_ADDR` (or `BAO_ADDR`) | server URL | non-secret, required to connect |
| | `VAULT_TOKEN` (or `BAO_TOKEN`) | session token | **prefer NOT to set a long-lived one** — use AppRole/K8s/OIDC auth → short-lived token [src: ecosystem-03 §3] |
| | AppRole: `role_id` + (wrapped) `secret_id` | two-part machine cred | `role_id` "never commit… store in CI/CD secrets"; `secret_id` "generate on-demand" via `-wrap-ttl` [src: ecosystem-03 §3] |
| | Auto-unseal: cloud-KMS creds (AWS/Azure/GCP) | unseal key custody | KMS auto-unseal (talos-cluster ref) [src: ecosystem-02 §Tier-1.4] |
| | Container deploy: `disable_mlock = true` (HCL, not env) | mlock workaround | **mandatory on Vault 2.0.2+ in containers** (cap_ipc_lock removed) [src: ecosystem-01 §1] |
| **Infisical** | `INFISICAL_TOKEN` *or* Machine Identity (`--client-id` / `--client-secret`) | machine auth | best: OIDC / Cloud-Native / K8s / **SPIFFE** = **no stored secret** [src: ecosystem-03 §4] |
| | `INFISICAL_API_URL` (self-host) | server URL | non-secret |
| **1Password** | `OP_SERVICE_ACCOUNT_TOKEN` | service-account token | the non-interactive agent auth; resolves `op://` refs [src: ecosystem-04 §4] |
| **Doppler** | `DOPPLER_TOKEN` (Service Token / Service Account) | project-scoped token | `doppler run --` injects; SaaS-only (no self-host) [src: ecosystem-04 §4, ecosystem-06] |
| **SOPS + age (decrypt)** | `SOPS_AGE_KEY_FILE` *or* `SOPS_AGE_KEY` | path to keys.txt / inline key | default search: macOS `~/Library/Application Support/sops/age/keys.txt`; Linux `~/.config/sops/age/keys.txt` [src: ecosystem-03 §2] |
| **SOPS (KMS backends)** | `AWS_*` / `GOOGLE_APPLICATION_CREDENTIALS` / Azure creds | KMS auth | per-backend; pin SOPS version + test decrypt per backend [src: ecosystem-05 §B1] |
| **gitleaks** | (none required) | — | config via `.gitleaks.toml`; baseline via `-b` |
| **trufflehog** | provider creds only IF verifying specific backends (e.g. AWS for S3 scan) | scan-target auth | `--only-verified` calls provider APIs to confirm live keys [src: ecosystem-01 §5] |
| **AWS Secrets Manager** | IAM role / `AWS_*` | IAM-tied access | rotation via managed Lambda (RDS family) [src: ecosystem-01 §7] |
| **GCP Secret Manager** | `GOOGLE_APPLICATION_CREDENTIALS` / workload identity | IAM-tied access | **rotation notify-only** — build the rotation fn [src: ecosystem-05 §D2] |
| **git-filter-repo** | (none) | — | pin v2.47.0; run AFTER rotation only [src: ecosystem-01 §6] |

**Anti-leak rule for THIS manifest:** the manifest lists *which secrets a tool needs*, never the
values. The injection path for those values follows [[EXPERTISE-MAP]] JOB 5 preference order (broker
> 0400 file-mount > just-in-time `run`-wrapper > **never** a committed `.env`). [src: ecosystem-04 §3]

---

## §4 — Repos to STUDY (live reference implementations, not demos)

Stars + last-commit verified `gh repo view` 2026-06-16. Rejected stale/toy repos. [src: ecosystem-02]

| Repo | Why study it | ⚠ Stale-link trap to avoid |
|---|---|---|
| `jkroepke/helm-secrets` (active 2026-06-16) | de-facto Helm+SOPS workflow | **NOT** the archived `zendesk/helm-secrets` (archived 2026-06-02) |
| `isindir/sops-secrets-operator` (2026-06-02) | SopsSecret CRD → K8s Secrets, GitOps without Vault | also `peak-scale/sops-operator` (newer); ESO `sops` provider overlaps |
| `MadsMarschall/sopsctl` (2026-04-27) | 2026-native SOPS+age CLI UX to copy | — |
| `nwarila-platform/talos-cluster` (2026-06-16) | **layered prod ref:** SOPS+age (git) + Vault + AWS-KMS-unseal | companion `cosmicspork/homelab` (simpler) |
| `external-secrets/external-secrets` (ESO, 2026-06-16) | vendor-neutral runtime sync standard | **the supported OpenBao-on-K8s path** (VSO fork was archived 2026-02-20) [src: ecosystem-05 §C2] |
| `pre-commit/pre-commit` (2026-06-17) | the hook framework hush ships config for | — |
| `Yelp/detect-secrets` (2026-04-02) | the `.secrets.baseline` audit pattern to steal | — |
| `1Password/onepassword-operator` (2026-06-05) | **auto-restarts deployments on item change** (rotation-propagation pattern) | — |

---

## §5 — What hush itself should SHIP (synthesized)

1. `.pre-commit-config.yaml` wiring gitleaks (fast block). [src: ecosystem-02 §"what hush should ship"]
2. `.gitleaks.toml` with a baseline/allowlist + entropy gating. [src: ecosystem-05 §A1]
3. CI workflow: gitleaks (working tree + **history**) AND trufflehog `--only-verified` — beating
   energy's regex-grep on entropy + history + verification. [src: ecosystem-02, ecosystem-03 §5]
4. `.sops.yaml` + `age-keygen` scaffold with a **break-glass second recipient**. [src: ecosystem-02, ecosystem-03 §2]
5. `.gitignore` template: exclude `.env*`, keep `!.env.example` (the energy-incident fix). [src: ecosystem-00 §1]
6. K8s guidance pointing at **ESO** (multi-backend) or **SOPS operators** (git-native) — never the
   archived zendesk/OpenBao-VSO repos. [src: ecosystem-05 §C2]
7. An agent-facing secret API/MCP that returns **handles, not values**, and mints short-TTL creds. [src: ecosystem-04 §1, §8]
