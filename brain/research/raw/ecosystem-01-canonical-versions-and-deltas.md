---
title: "ecosystem-01 — Canonical Tool Versions + 6-Month Changelog Deltas (June 2026)"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, versions, changelog, vault, openbao, infisical, sops, age, gitleaks, trufflehog, doppler, 1password]
sources:
  - "gh release list -R openbao/openbao (fetched 2026-06-16)"
  - "gh release list -R hashicorp/vault (fetched 2026-06-16)"
  - "gh release view v2.0.0 -R hashicorp/vault (fetched 2026-06-16)"
  - "gh release list -R Infisical/infisical + Infisical/cli (fetched 2026-06-16)"
  - "gh release list -R getsops/sops + FiloSottile/age (fetched 2026-06-16)"
  - "gh release list -R gitleaks/gitleaks + trufflesecurity/trufflehog (fetched 2026-06-16)"
  - "gh release list -R newren/git-filter-repo (fetched 2026-06-16)"
  - "https://www.doppler.com/changes (2026)"
  - "https://siliconangle.com/2026/06/15/1password-debuts-credential-broker-release-secrets-needed/ (2026-06-15)"
summary: "Authoritative version table + the load-bearing 6-month deltas for every canonical secrets tool, sourced from gh release bodies (dated) not marketing pages. The big movers: Vault 2.0 (IBM, BSL, security-hardened), OpenBao 2.5.4 (Horizontal Read Scalability), age 1.3 (post-quantum), 1Password Credential Broker (brand new, agent-native), Doppler dynamic secrets beta."
---

# ecosystem-01 — Canonical Versions + 6-Month Deltas

> All version numbers + dates pulled from `gh release` (the authoritative source), cross-checked against
> changelog/marketing where noted. "Delta" = what actually changed in the last ~6 months (Dec 2025 → Jun 2026),
> not a feature list. Currency: fetched 2026-06-16.

## The version table (June 16, 2026)

| Tool | Latest stable | Released | Cadence | License (June 2026) |
|---|---|---|---|---|
| **HashiCorp Vault** | **v2.0.2** | 2026-06-05 | ~monthly patch | **BUSL-1.1** (IBM, post-acquisition) |
| **OpenBao** (OSS fork) | **v2.5.4** | 2026-05-20 | ~monthly | **MPL-2.0** (Linux Foundation) |
| **Infisical** (server) | **v0.161.0** | 2026-06-12 | ~weekly | **MIT** core + **Infisical EE** (proprietary, `/ee`) |
| **Infisical CLI** | **v0.43.95** | 2026-06-17 | multiple/day | MIT |
| **SOPS** (getsops) | **v3.13.1** | 2026-05-16 | ~6-8 wk | MPL-2.0 (CNCF Sandbox) |
| **age** (FiloSottile) | **v1.3.1** | 2025-12-28 | slow/stable | BSD-3 |
| **gitleaks** | **v8.30.1** | 2026-03-21 | ~quarterly | MIT |
| **trufflehog** | **v3.95.5** | 2026-06-02 | ~weekly | AGPL-3.0 (core) |
| **git-filter-repo** | **v2.47.0** | **2024-12-04** | ⚠️ STALE (18 mo) | MIT |
| **Doppler** | SaaS (rolling) | — | continuous | proprietary SaaS (no self-host) |
| **1Password** SDK/Connect | rolling | Credential Broker GA 2026-06-15 | continuous | proprietary |
| **AWS Secrets Manager** | managed | — | continuous | AWS proprietary |
| **GCP Secret Manager** | managed | — | continuous | GCP proprietary |

---

## 1. HashiCorp Vault — v2.0.x (the biggest story of 2026)

**Delta (the version jump itself):** Vault went **1.21.x → 2.0.0 on 2026-04-14** (v2.0.0-rc1 2026-04-03; v2.0.1
2026-05-19; v2.0.2 2026-06-05). This is the first major-version bump in Vault's history and lands under **IBM's
lifecycle** following the HashiCorp acquisition. Per industry coverage, Vault 2.0 ships under the **Business
Source License (BUSL-1.1)** — NOT open source — which is the entire reason OpenBao exists.
[infisical.com/blog/best-secret-management-tools, 2026]

**v2.0.0 BREAKING + SECURITY (verbatim-sourced from `gh release view v2.0.0 -R hashicorp/vault`, 2026-06-16):**
- **`sys/generate-root`, `sys/rekey`, and DR `generate-operation-token` are now AUTHENTICATED by default.**
  The old unauthenticated behaviour requires explicitly opting in via new HCL key
  `enable_unauthenticated_access = ["generate-root", "rekey", "generate-operation-token"]`. → This is a direct
  hardening of the historically-scary "anyone can start a root-token generation" surface. **hush doctrine: any
  Vault deploy guide must NOT re-enable unauthenticated access.**
- **auth/aws: fixed an auth-bypass** — "a user may be able to bypass authentication to Vault due to incorrect
  caching of the AWS client." (A real CVE-class bug, fixed in 2.0.0.)
- **auth/cert: ensure the certificate being renewed matches the certificate attached to the session** (token
  renewal with a different-but-valid cert was possible — same class of bug OpenBao 2.5.0 also fixed).
- **core: remove Vault tokens from the `Authorization` header before forwarding to plugin backends** unless
  `Authorization` is explicitly in passthrough headers. (Token-leak-to-plugin fix.)
- **`max_token_header_size`** new listener option (default **8 KB**) bounds auth-token header size → DoS guard
  against oversized `X-Vault-Token` / `Authorization: Bearer`.
- **core: rejects non-canonical paths** (`path//to/resource`, URL-encoded paths) — path-confusion fix.
- Bumped Go to **1.26.2**; ~20 dependency CVE fixes (go-jose CVE-2026-34986, pgx GHSA-jqcq-xjh3-6g23,
  cloudflare/circl CVE-2026-1229, golang.org/x/crypto v0.45.0, etc.).
- **`secrets/ldap` (Enterprise):** static roles migrate from plugin-managed queue → Enterprise **Rotation
  Manager** (new `static-migration` endpoint). Signals HashiCorp consolidating rotation into one engine.

**v2.0.2 BREAKING (2026-06-05) — the one that bites containers (verbatim from `gh release view`):**
- **`cap_ipc_lock` capability removed from the `vault` binary at build time** so Vault runs in common container
  runtimes. **Consequence: Vault in containers can no longer `mlock()`** → operators MUST set
  `disable_mlock = true` and disable swap for data safety. **This is the single most likely "my Vault container
  broke after upgrade" gotcha of mid-2026.** hush must encode it in any Vault-in-Docker recipe.
- **secrets/ssh: RSA key sizes capped at 8192 bits** (CVE-2026-39829).

**Taste:** Vault 2.0 is more secure out of the box (auth-by-default on root-gen/rekey is overdue) but the BUSL
license + IBM stewardship is exactly why OSS-first shops (and hush, which is OSS-self-host-biased per the
mission) should default to **OpenBao** unless an existing Vault Enterprise contract dictates otherwise.

## 2. OpenBao — v2.5.4 (the OSS Vault fork, the recommended default)

**Provenance:** community fork of Vault forked at **Vault 1.14.0** (last MPL-2.0 release), now a **Linux
Foundation** project. [endoflife.date/openbao; lalatenduswain.medium.com, 2026]

**Delta — the 2.5.x line (Feb–May 2026), the headline being a genuine architectural feature:**
- **v2.5.0 (2026-02-04): Horizontal Read Scalability** — HA *standby* nodes can now serve **read operations
  locally** instead of forwarding everything to the active node. This is a real scaling win Vault OSS never had
  and is OpenBao's clearest "we are diverging, not just tracking upstream" signal. [openbao.org release notes 2.5.0]
- **v2.5.0 security fixes (mirror Vault's same-era fixes):** prevent token renewal with a different-but-valid
  certificate; prevent **cross-namespace** token renewal/revocation by accessor; **disable `sys/generate-root/*`
  by default** (unauthenticated cancellation risk); validate + restrict downloaded plugin binary size from OCI
  images; fix Auto-Unseal upgrade/downgrade issues across **AWS KMS / Azure Key Vault / GCP Cloud KMS**.
- **v2.5.1 → v2.5.4 (Feb–May 2026):** monthly patch cadence (2.5.1 2026-02-23, 2.5.2 2026-03-25, 2.5.3
  2026-04-20, 2.5.4 2026-05-20). Steady, healthy maintenance — refutes the "forks die" worry.

**Taste:** OpenBao is now a *living* project with its own roadmap, not a stale mirror. For hush's OSS-self-host
bias it's the **Vault-compatible default**; the API/CLI are still ~drop-in for Vault 1.14-era usage, but the
namespaces and some Enterprise-only engines diverge. Verify per-engine before promising "drop-in."

## 3. Infisical — v0.161.0 server / v0.43.95 CLI (the modern open-core challenger)

**Delta (last 6 mo — Infisical ships fast; server ~weekly, CLI multiple times/day):**
- **Infisical Gateway** — secure access to private resources (DBs behind a VPC) WITHOUT inbound connections to
  private networks (reverse-tunnel pattern). Directly competes with Vault's network-reachability story.
- **OIDC auth method** + **token auth for Terraform** + import existing Infisical secrets as TF resources +
  project templates.
- **Kubernetes operator:** auto-reload now covers **DaemonSets + StatefulSets** (was Deployments-only) + adds
  **ConfigMaps**.
- **CLI:** **multiline secret support**, custom headers, steady patch stream into June 2026.
- **Access control:** "Grant Privileges" (delegate policy mgmt to specific users), **Access Tree** permission
  simulator/visualizer.
- **Self-host:** per-feature billing/usage visibility, delete users, **multiple super admins**, password reset
  without backup-PDF.
- **AI-agent angle (load-bearing for hush):** Infisical now brands itself "the modern security platform for
  developers **and agents**" and ships an **Agent Vault** — a purpose-built credential proxy between an agent
  and its secrets, enforcing access controls at the agent level (see ecosystem-04). [infisical.com, 2026]

**License nuance:** core is **MIT**, but a meaningful slice (SSO/SAML, some access-control, audit depth) lives
under the proprietary **Infisical EE** in the `/ee` directory. Self-hosting the MIT core is real and free;
"fully featured self-host" is not. **hush must not claim Infisical OSS == Infisical Cloud.**

## 4. SOPS + age (the GitOps file-encryption pair)

- **SOPS v3.13.1 (2026-05-16)** — recent line: v3.12.x (Feb–Mar 2026) then v3.13.0/3.13.1 (May 2026). 3.13.1 is
  largely a fix release ("avoid percent-encoding of cache key to blow up size > 50 chars" for GPG-agent with
  age-key passwords). SOPS supports YAML/JSON/ENV/INI/BINARY and encrypts with **AWS KMS, GCP KMS, Azure Key
  Vault, HuaweiCloud KMS, age, PGP**. CNCF Sandbox since 2023; maintained at getsops/sops. [github.com/getsops/sops/releases]
- **age v1.3.0 (2025-12-27) → v1.3.1 (2025-12-28): POST-QUANTUM.** This is the notable age delta — age 1.3 added
  a post-quantum recipient/identity option. age is otherwise deliberately slow-moving and stable (1.2.x was
  2024). For hush: age is the **simplest** at-rest primitive (a single X25519-class keypair, no KMS dependency),
  and as of 1.3 it has a PQ story for the paranoid. [github.com/FiloSottile/age/releases]

**Taste:** SOPS+age is the right tool when secrets must live *in git* (GitOps/Flux/ArgoCD) encrypted at rest —
NOT a runtime secrets *broker*. It has no rotation engine, no dynamic secrets, no audit log, no access policy
beyond "who holds a key." It complements Vault/Infisical; it does not replace them.

## 5. Secret scanners

- **gitleaks v8.30.1 (2026-03-21)** — quarterly-ish cadence (8.29.x Nov 2025, 8.30.0 Nov 2025, 8.30.1 Mar
  2026). Fast regex+entropy scanner; best as a **pre-commit hook** (blocks in ms) and as the basis of CI/history
  scans. MIT. Run `gitleaks detect` (history) and `gitleaks protect --staged` (pre-commit).
- **trufflehog v3.95.5 (2026-06-02)** — ships ~weekly; the 3.95.x line is current. **800+ detector types**,
  scans git history + **S3, Docker images, Slack, Jenkins, GCS, filesystems, CI logs**, and — the differentiator
  — **verifies** whether a found credential is *still live* against the provider API (`--only-verified`). AGPL-3.0
  core. Created by Dylan Ayrey 2016; ~24.5K★, 250K+ daily scans. [github.com/trufflesecurity/trufflehog/releases]
- **git-secrets (awslabs)** — older, AWS-pattern-focused pre-commit tool; effectively in maintenance. Use
  gitleaks instead for new work (broader patterns, active dev).

**Taste:** the 2026 consensus (multiple comparison posts) is **gitleaks pre-commit for speed + trufflehog in
CI/CD for depth + verification**. hush's scanning component should beat energy's regex-grep CI by adopting BOTH
and by scanning **history**, which energy's CI does not.

## 6. git-filter-repo — v2.47.0 (the history-scrub tool) ⚠️ staleness flag

- **Latest release v2.47.0 is from 2024-12-04 — 18 months old as of June 2026.** This is NOT abandonment
  (it's a mature single-purpose tool and the `main` branch may have newer commits), but hush should **flag it**:
  pin to v2.47.0, and note that BFG Repo-Cleaner is the alternative for the JVM-inclined. git-filter-repo is the
  **officially recommended** replacement for the deprecated `git filter-branch` (the Git docs themselves point
  to it). It is the correct tool for the energy `.env`-in-history scrub the chairman flagged.
- **Critical doctrine (from internal corpus, ecosystem-00):** a history rewrite is a **hygiene** step, NOT a
  **security** step. Once a secret hit a remote it is burned — `git filter-repo` purges the *value from history*
  but the only real fix is **rotate at the provider**. Rotate-first, scrub-second.

## 7. Managed cloud + commercial (boundary-aware summary)

- **AWS Secrets Manager** — managed; native **rotation Lambdas** for RDS/Redshift/DocumentDB; ~$0.40/secret/mo +
  API calls; integrates with IAM for access. The "default if you're all-in on AWS." Pairs with **Parameter
  Store** (cheaper, no rotation) for non-secret config.
- **GCP Secret Manager** — managed; versions + IAM bindings; **rotation is notify-only** (Pub/Sub on a schedule,
  you do the rotation) — a real gotcha vs AWS's managed rotation. ~$0.06/active-secret-version/mo + access ops.
- **Doppler** — SaaS only (no self-host). **2026 delta:** **dynamic secrets (beta)** and **automated Azure
  Service Principal rotation** added March 2026 — closing its two most-cited gaps. Pulumi ESC integration
  (dynamic login + dynamic secrets) launched 2026. Developer-first UX is its moat; the lack of self-host is its
  ceiling for compliance-heavy/air-gapped shops. [doppler.com/changes; pulumi.com/blog 2026]
- **1Password** — **Credential Broker (GA 2026-06-15)**: releases secrets only when needed, keeps fewer copies,
  and logs each request/handoff (which agent/workflow asked for which credential, when). Plus **Service Accounts**
  + **SDKs (Python/JS/Go)** + a new **MCP server** for agents that manages "Environments" without exposing
  secrets to the agent. This is the most aggressively agent-native of the commercial players in mid-2026.
  [siliconangle.com 2026-06-15; blog.1password.com/service-accounts-sdks-agentic-ai; 1password.com/blog ai-builders]

---

### Distilled version-doctrine for hush
1. **OSS-self-host default = OpenBao 2.5.4** (MPL-2.0, alive, Horizontal Read Scalability) over Vault 2.0 (BUSL/IBM).
2. **Open-core modern UX = Infisical 0.161** — but MIT core ≠ EE; never conflate self-host with cloud features.
3. **GitOps at-rest = SOPS 3.13 + age 1.3** (age now post-quantum). Not a runtime broker — complements, not replaces.
4. **Scanning = gitleaks 8.30 (pre-commit) + trufflehog 3.95 (CI, --only-verified)** — beat energy's regex grep
   by adding entropy + history + verification.
5. **History scrub = git-filter-repo 2.47.0** (pin it; flag its 18-mo staleness) — and ALWAYS rotate-first.
6. **Commercial agent-native leaders = 1Password Credential Broker + Infisical Agent Vault** — both implement the
   "credential proxy / broker, never hand the agent a static secret" pattern hush should adopt as doctrine.
7. **Vault 2.0.2 container gotcha = `disable_mlock = true`** (cap_ipc_lock removed at build) — most likely
   upgrade-break of mid-2026.
