---
title: "ecosystem-05 — Real-World Breakage: High-Engagement Issues, Regressions, Migration Gotchas"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, github-issues, gotchas, regressions, migration, false-positives, sops, gitleaks, trufflehog, openbao]
sources:
  - "gh search issues --repo gitleaks/gitleaks --state closed --sort reactions (2026-06-16)"
  - "gh search issues --repo trufflesecurity/trufflehog --state closed --sort reactions (2026-06-16)"
  - "gh search issues --repo getsops/sops --state closed --sort reactions (2026-06-16)"
  - "gh issue view 1302 -R gitleaks/gitleaks; 1695/1103 -R getsops/sops (2026-06-16)"
  - "https://lalatenduswain.medium.com/openbao-vs-hashicorp-vault... (2026)"
  - "https://duokey.com/en/resources/hashicorp-vault-bsl-license-change-openbao-migration (2026)"
  - "https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets-two-users.html"
  - "https://docs.cloud.google.com/secret-manager/docs/secret-rotation"
summary: "The anti-slop file: real failures, regressions, and migration gotchas pulled from high-engagement GitHub issues and migration writeups — not feature lists. The recurring theme: secrets tooling breaks at the SEAMS (false-positive rules, KMS-provider decrypt regressions, plugin-identity gaps, rotation downtime windows, fork migration-baseline limits)."
---

# ecosystem-05 — Real-World Breakage

> Sorted by how much it teaches hush. Each entry: what broke, the evidence (issue # + engagement + date), and
> the doctrine hush should encode so it doesn't repeat the failure.

## A. Secret scanners — the false-positive / coverage seams

### A1. gitleaks `hashicorp-tf-password` rule is too wide (the canonical FP pain)
- **Issue #1302** (gitleaks, closed 2024-07-10, high-engagement, multiple corroborating commenters into 2024).
- **What breaks:** the built-in `hashicorp-tf-password` rule fires on the literal stopword `password` — so
  `password = "password"` in test fixtures and **documentation examples** trip it. Commenters: *"This is being
  picked up in nearly all of our pipelines now… It is fairly common to have test files which have a password set
  to 'password'"* and *"All issues were in documentation example strings."* The reporter notes it bypasses
  gitleaks' own entropy mechanism (a low-entropy literal shouldn't fire).
- **Doctrine for hush:** a regex scanner WILL false-positive on docs/fixtures. hush's scanning component MUST
  ship (a) a **baseline/allowlist** mechanism (`.gitleaks.toml` `[allowlist]`, or `gitleaks:allow` inline
  comments, or a `--baseline-path` of known findings), and (b) **entropy gating** so low-entropy literals
  ("password", "changeme") don't drown real findings. The energy CI's crude `--exclude` is the primitive version
  of this — a real baseline is the upgrade.

### A2. trufflehog reports secrets on the wrong line (#1876)
- **Issue #1876** (trufflehog, closed 2026-01-15). Line-number attribution is wrong for some detectors → makes
  triage and inline-comment CI annotations point at the wrong place.
- **Doctrine:** don't trust scanner line numbers blindly for auto-remediation; verify the finding's location
  before any automated `git`-surgery. (Reinforces: rotate-first; never auto-edit history off a scanner's
  unverified line number.)

### A3. trufflehog install-script breakage (#4750, install script failed for 3.93.4, closed 2026-06-02)
- **What breaks:** the `curl | sh` install script failed for a recent version. Recurring class: install-script
  drift across versions/arches.
- **Doctrine:** pin scanner versions and prefer a checksummed binary or package-manager install over
  `curl | sh`; an agent that depends on a scanner must not be brittle to upstream install-script changes.

### A4. gitleaks structural gaps the community keeps asking for (feature-issues that reveal limits)
- **#741 "merge/extend/append the default config"** and **#596 "sharable configuration"** — teams need to
  *extend* not *replace* the default ruleset. **#807 "discover secrets in base64-encoded strings"** — base64ed
  secrets evade naive regex. **#156 "run only on current files"** — history-vs-working-tree confusion.
- **Doctrine:** hush should default to **extending** the upstream ruleset (not forking it), and should scan
  **base64/encoded** payloads (a common evasion). And be explicit about **history-scan vs working-tree-scan** —
  energy's CI only does working-tree (a documented gap in ecosystem-00).

## B. SOPS — the KMS-provider + plugin-identity seams (where SOPS actually breaks)

### B1. SOPS v3.9.2 fails to decrypt with Azure KeyVault (#1695, closed 2025-01)
- **What breaks:** *"Since v3.9.2 I'm unable to decrypt my data… Failed to get the data key required to decrypt
  the SOPS file. Group 0: FAILED."* A **version-specific regression** in the Azure KeyVault key-service.
- **Doctrine:** SOPS's multi-KMS abstraction means a SOPS point-release can break ONE provider while others
  work. hush must (a) pin SOPS versions, (b) test decrypt against the *specific* KMS backend in use after any
  bump, and (c) keep a **second recipient** (e.g. an age key alongside the KMS key) so a single-provider
  regression doesn't lock you out of your own secrets. ("Always have a break-glass recipient.")

### B2. SOPS + age YubiKey: `age1yubikey` malformed recipient (#1103, closed 2025-02)
- **What breaks:** age plugin recipients/identities (e.g. `age-plugin-yubikey`) failed SOPS's validation —
  *"the validation for identity fails because the parse-method of age was never updated outside of Cmd."* SOPS
  lagged age's plugin support.
- **Doctrine:** the age *plugin* ecosystem (YubiKey, TPM, FIDO2, KMS-via-plugin) is a sharp edge — SOPS↔age
  plugin compatibility lags. If hush recommends hardware-backed age keys, it must pin a known-good SOPS+age+plugin
  triple and test it, not assume "age plugin == works in SOPS."

### B3. Recurring SOPS asks: configurable YAML indentation (#900), arm/arm64 binaries (#595)
- Signals SOPS's output formatting and platform coverage have rough edges; relevant if hush generates
  `.sops.yaml`-managed files in CI on ARM runners.

## C. The Vault → OpenBao migration: the hard, version-specific gotchas

(Sources: lalatenduswain.medium.com 2026; duokey.com migration guide 2026; OpenBao migration guide.)

### C1. Migration baseline is pinned to Vault **1.14.1 CE only**
- The official OpenBao migration guide *"only supports Vault 1.14.1 (Community Edition) as the tested baseline,"*
  with explicit warnings that **"this guide will not work on Vault versions 1.15.0 and newer"** and **"Vault
  Enterprise migration is not supported."**
- **Why it matters:** with Vault now at **2.0.x**, a shop on a modern Vault cannot follow the blessed migration
  path directly — they must reason about the gap themselves. The fork-point was 1.14.0; everything Vault added in
  1.15→2.0 is NOT guaranteed in OpenBao.
- **Doctrine for hush:** "OpenBao is drop-in for Vault" is TRUE only for ~1.14-era usage. hush must qualify every
  drop-in claim with the version baseline and tell users to inventory post-1.14 Vault features (and Enterprise
  features) before promising a clean cutover. Typical real migration = **2–8 weeks** (assess → parallel deploy →
  phased cutover → validate), not a config flip.

### C2. `openbao-secrets-operator` was ARCHIVED 2026-02-20 (never cut a release)
- The fork of HashiCorp's Vault Secrets Operator was **archived without ever releasing**; the community
  consolidated behind the **External Secrets Operator (ESO)** instead.
- **Doctrine:** for OpenBao-on-Kubernetes, **ESO is the supported path, not a Vault-Secrets-Operator fork.**
  hush's K8s guidance for OpenBao should point at ESO. (Reinforces ecosystem-04 §5: ESO is the vendor-neutral
  de-facto standard.)

### C3. OpenBao gaps vs Vault Enterprise (as of mid-2026)
- **No native Disaster-Recovery Replication** (on the funded 2026–2027 roadmap; needs workarounds today). But:
  **namespaces are FREE in OpenBao** (Enterprise-only in Vault) — RFC #787 + delivery tracked. **HSM unseal**
  was a top community ask (#300).
- **Doctrine:** the OpenBao trade is "free namespaces + no IBM lock-in" vs "no managed DR replication (yet) +
  some Enterprise engines missing." hush must present this honestly, not as "OpenBao == Vault minus the license."

## D. Cloud-managed rotation — the asymmetries that bite

### D1. AWS Secrets Manager single-user rotation has a downtime window
- AWS docs: with **single-user** rotation there is *"potential for application downtime… between the setSecret
  and finishSecret steps… a short period between when the password in the database changes and when the secret is
  updated"* → in-flight calls with the rotated cred can be denied.
- The fix is **alternating-users (multi-user) rotation**: AWS creates a second user suffixed **`_clone`** with
  the same perms and flips between them → zero-downtime, but now you have a `_clone` user to account for.
- **Doctrine for hush's rotation playbook:** rotation is NOT atomic — there is always a propagation window.
  Default to **two-secret / alternating** rotation (issue new → deploy → verify → revoke old), never
  "overwrite-in-place," for anything with live connections. This is the generic version of the AWS pattern and
  applies to API keys too (issue new key → roll out → confirm → delete old key).

### D2. GCP Secret Manager rotation is **notify-only** (the big AWS↔GCP asymmetry)
- GCP docs: rotation is *"notification-based, not rotation itself"* — you set a rotation period + a Pub/Sub
  topic; at the interval GCP publishes a `SECRET_ROTATE` message and **you build/maintain the actual rotation
  logic yourself.** AWS ships ready-made rotation Lambda templates; GCP does not.
- **Doctrine:** never assume "the cloud rotates it for you." On GCP, "rotation enabled" means "a reminder fires";
  hush must supply/scaffold the rotation function (Cloud Function subscribing to the topic) or the rotation
  silently never happens — a dangerous false sense of security.

## E. The energy `.env` incident, re-read as a breakage case study (internal corpus tie-in)

(From ecosystem-00 / CHAIRMAN-CHECKLIST §SECURITY — the fleet's own live failure.)
- **What broke:** 8 real `.env` files tracked since **2026-04-09** because `.gitignore` never excluded them →
  Secret Scanner CI red on every push for days. Keys: Anthropic, E2B, Twilio, AgentMail, Discord, Slack, Stripe,
  Supabase, Clerk, Vercel.
- **The trap:** `git rm --cached` turns CI green but is a **false-green** — keys remain in git **history**.
- **Doctrine (already in ecosystem-00, restated as breakage law):** un-tracking ≠ remediation. Order is
  **rotate at provider → `git rm --cached` + fix `.gitignore` → (optional) `git filter-repo` history scrub
  (force-push, explicit consent).** Maps 1:1 to GitGuardian's "64% of valid secrets still un-revoked" finding:
  the world's #1 secrets failure is *not rotating after a leak.*

---

### Distilled breakage-doctrine for hush
1. **Scanners false-positive on docs/fixtures** → ship a baseline/allowlist + entropy gating; extend (don't
   replace) the default ruleset; scan base64/encoded payloads; scan the MCP config file specifically.
2. **SOPS breaks per-KMS-provider on point-releases** → pin versions, test decrypt against the actual backend,
   ALWAYS keep a break-glass second recipient (age alongside KMS).
3. **age plugins (YubiKey/TPM) lag in SOPS** → pin a known-good SOPS+age+plugin triple; don't assume.
4. **"OpenBao is drop-in" is true only for ~Vault 1.14** → qualify every claim; ESO (not a VSO fork) for K8s;
   OpenBao lacks native DR replication but gives free namespaces; real migration = 2–8 weeks.
5. **Rotation is never atomic** → default to alternating/two-secret rotation (issue→deploy→verify→revoke), never
   overwrite-in-place, for anything with live connections.
6. **GCP "rotation" is notify-only** → you must build the rotation function or it never rotates.
7. **Un-tracking ≠ remediation** → rotate-first; the #1 global secrets failure is leaks that are never rotated.
8. **Don't trust scanner line numbers for auto-surgery; don't depend on `curl|sh` install scripts** (pin binaries).
