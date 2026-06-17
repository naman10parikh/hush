---
title: "ecosystem-02 — Best Starter / Template / Example Repos + The Tooling Galaxy"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, starter-repos, templates, gitops, kubernetes, pre-commit, helm-secrets, hush]
sources:
  - "gh repo view (stars + pushedAt) for each repo (fetched 2026-06-16)"
  - "gh search repos sops age flux secrets / kubernetes secrets sops --sort stars (2026-06-16)"
summary: "Curated, evidence-backed list of the repos hush should learn from and the canonical tooling galaxy with exact star counts + last-commit dates (June 2026). Picks favor ACTIVE, production-grade reference implementations over toy demos. Corrects a nuance from ecosystem-01: git-filter-repo's last RELEASE is 2024 but its main branch is actively committed (pushed 2026-06-12)."
---

# ecosystem-02 — Starter Repos + Tooling Galaxy

> Stars + last-commit (`pushedAt`) verified via `gh repo view` on 2026-06-16. A repo is only worth citing if it's
> (a) still maintained and (b) shows the *load-bearing flow*, not a hello-world. I rejected stale/demo repos.

## The canonical tools — exact stats (June 16, 2026)

| Repo | Stars | Last commit (pushedAt) | What it is |
|---|---|---|---|
| `hashicorp/vault` | 35,797 | 2026-06-17 | The reference (BUSL/IBM) |
| `Infisical/infisical` | 27,380 | 2026-06-17 | Open-core modern platform (MIT core) |
| `gitleaks/gitleaks` | 27,729 | 2026-06-13 | Fast regex+entropy scanner |
| `trufflesecurity/trufflehog` | 26,786 | 2026-06-16 | Deep scanner w/ live verification |
| `FiloSottile/age` | 22,617 | 2026-03-20 | Modern file-encryption primitive |
| `getsops/sops` | 22,111 | 2026-06-16 | Encrypted-file editor (multi-KMS+age) |
| `awslabs/git-secrets` | 13,329 | 2025-09-17 | Older AWS-pattern pre-commit (maintenance) |
| `newren/git-filter-repo` | 12,601 | **2026-06-12** | History-rewrite tool (⚠ last *release* 2024, but main IS active) |
| `openbao/openbao` | 6,350 | 2026-06-16 | OSS Vault fork (MPL-2.0, Linux Foundation) |
| `external-secrets/external-secrets` | 6,680 | 2026-06-16 | ESO — vendor-neutral K8s secrets sync |
| `Yelp/detect-secrets` | 4,552 | 2026-04-02 | Enterprise pre-commit scanner w/ baseline |

**Correction to ecosystem-01:** git-filter-repo's *release* cadence is stale (v2.47.0, Dec 2024) but the **repo
is actively committed** (main pushed 2026-06-12). So: it's maintained, just released infrequently — pin to a
commit/`main` if you need a post-2.47.0 fix, otherwise v2.47.0 is fine. Not abandoned.

## Tier 1 — The 3–5 starter repos hush should actually study

### 1. `jkroepke/helm-secrets` — the de-facto Helm+SOPS secret workflow (ACTIVE)
- **Stars:** ~ (high, the canonical one); **last commit 2026-06-16** (very active). Public, maintained.
- **Why:** the standard way to keep encrypted secrets *in a Helm chart* and decrypt at deploy time. Handles SOPS
  (and Vault) backends, integrates with `helm install/upgrade`. The **zendesk/helm-secrets** original is now
  **DEPRECATED/archived** (2026-06-02) — jkroepke's fork is the live one. **Lesson for hush:** when recommending
  helm+secrets, point at `jkroepke/helm-secrets`, NOT the archived zendesk repo (a common stale-link trap).

### 2. `isindir/sops-secrets-operator` — SOPS-native Kubernetes operator (ACTIVE)
- **Last commit 2026-06-02.** Reconciles a `SopsSecret` CRD → decrypts with SOPS → creates K8s Secrets.
- **Why:** the cleanest example of the "encrypted secrets live in git, operator decrypts in-cluster" GitOps
  pattern WITHOUT standing up Vault. Compare with `peak-scale/sops-operator` (2026-06-05) — a newer alternative.
- **Lesson:** for SOPS-on-K8s there are two live operators (isindir, peak-scale) PLUS ESO's `sops` provider —
  hush should know all three exist and that they overlap.

### 3. `MadsMarschall/sopsctl` — a Flux+GitOps SOPS/age CLI (FRESH, 2026)
- **Last commit 2026-04-27.** A CLI that simplifies SOPS+age secret management for Flux GitOps.
- **Why:** a 2026-native example of wrapping SOPS+age into an ergonomic CLI — directly relevant to hush, which
  may itself ship a CLI that wraps these primitives. Study its UX choices (key generation, `.sops.yaml` config,
  encrypt/rotate flows).

### 4. `nwarila-platform/talos-cluster` — production reference: SOPS/age + Vault + AWS-KMS-auto-unseal (FRESH)
- **Last commit 2026-06-16.** Production Talos Linux bare-metal K8s: Flux GitOps, **SOPS/age for git-stored
  secrets AND HashiCorp Vault with AWS KMS auto-unseal** side by side, plus Kyverno policy.
- **Why:** shows the *real-world layered* pattern — SOPS+age for the bootstrap/config secrets that must live in
  git, Vault for runtime dynamic secrets, KMS for Vault's own unseal. This is the architecture hush should
  recommend for serious deployments (defense in depth, no single key to rule them all).
- Companion: `cosmicspork/homelab` (2026-05-28) — simpler DO-based Flux+SOPS+age reference for learning.

### 5. `external-secrets/external-secrets` (ESO) — the vendor-neutral runtime sync standard
- **6,680★, last commit 2026-06-16, helm-chart-2.6.0.** Reads from AWS/GCP/Azure/Vault/1Password/Infisical/
  Doppler/Bitwarden and syncs to K8s Secrets via `ExternalSecret`/`ClusterSecretStore` CRDs.
- **Why:** the de-facto neutral standard for K8s runtime secrets (and the path OpenBao's community now endorses
  after archiving its own operator — see ecosystem-05 §C2). hush's K8s story should treat ESO as the default
  multi-backend bridge.

## Tier 2 — Scanner + pre-commit starters

- **`pre-commit/pre-commit`** (15,351★, 2026-06-17) — the framework. The canonical secrets pre-commit config
  wires `gitleaks` and/or `detect-secrets` hooks. hush should ship a ready `.pre-commit-config.yaml`.
- **`Yelp/detect-secrets`** (4,552★, 2026-04-02) — "enterprise-friendly," its differentiator is a **baseline
  file** (`.secrets.baseline`) workflow: audit known findings once, then only NEW secrets fail. This baseline
  pattern is exactly what energy's crude CI lacks. Strong model for hush's allowlist design.
- **`gitleaks` GitHub Action** + **`trufflehog` GitHub Action** — both ship official Actions; the trufflehog
  Action's killer feature is `--only-verified` (only fail on creds it confirmed are live → near-zero FP in CI).

## Tier 3 — Commercial-but-instructive operators/SDKs

- **`1Password/onepassword-operator`** (609★, 2026-06-05) — K8s operator that syncs 1Password items → K8s
  Secrets and **auto-restarts deployments when an item changes** (a rotation-propagation pattern worth copying).
- **`bitwarden/sdk-sm`** (437★, 2026-06-13) — Bitwarden Secrets Manager SDK; pairs with the most-starred secrets
  MCP server. Good reference for a clean machine-identity SDK surface.
- **`Tongsuo-Project/RustyVault`** (active 2026-06-14) — a Rust reimplementation of Vault-style secrets mgmt;
  interesting as a "what a from-scratch vault looks like" study, not a production recommendation.

## What hush should ship (synthesized from the above)
1. A **`.pre-commit-config.yaml`** wiring gitleaks (fast block) — the Tier-2 pattern.
2. A **`.gitleaks.toml` with a baseline/allowlist** — the detect-secrets `.secrets.baseline` idea.
3. A **CI workflow** that runs gitleaks (working tree + history) AND trufflehog `--only-verified` — beating
   energy's regex-grep on entropy + history + verification.
4. A **`.sops.yaml` + age-keygen** scaffold for at-rest git secrets, with a **break-glass second recipient**.
5. A **`.gitignore` template** that excludes `.env*` but keeps `!.env.example` (the energy-incident fix).
6. For K8s: point at **ESO** (multi-backend) or **SOPS operators** (git-native), never the archived zendesk/
   OpenBao-VSO repos.

---

### Distilled repo-doctrine for hush
- **Live, not stale:** helm-secrets = jkroepke (NOT archived zendesk); K8s OpenBao = ESO (NOT archived VSO fork).
- **Study the layered prod refs** (talos-cluster): SOPS+age for git secrets, Vault for dynamic, KMS for unseal.
- **Steal the baseline pattern** from detect-secrets (`.secrets.baseline`) — it's the cure for FP fatigue.
- **In CI, trufflehog `--only-verified`** is the FP-killer; gitleaks pre-commit is the speed layer.
- git-filter-repo is maintained (active main) despite an old release tag — pin a commit if you need a recent fix.
