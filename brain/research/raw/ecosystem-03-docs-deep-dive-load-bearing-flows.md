---
title: "ecosystem-03 — Official-Docs Deep Dive: The Load-Bearing Flows (verbatim syntax)"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, docs, flows, dynamic-secrets, sops, approle, machine-identity, gitleaks, hush]
sources:
  - "https://openbao.org/docs/secrets/databases/ (fetched 2026-06-16)"
  - "https://infisical.com/docs/documentation/platform/identities/machine-identities (fetched 2026-06-16)"
  - "https://getsops.io/docs/ (fetched 2026-06-16)"
  - "https://developer.hashicorp.com/vault/docs/auth/approle/approle-pattern (2026)"
  - "https://github.com/gitleaks/gitleaks (2026)"
summary: "Verbatim command/config syntax for the flows hush will actually drive: OpenBao/Vault dynamic DB secrets (lease lifecycle), SOPS+age encryption (.sops.yaml + rotate/updatekeys), Vault AppRole response-wrapping for agents, Infisical machine-identity auth (incl. SPIFFE), and gitleaks scan/pre-commit/baseline. These are the commands hush's skills must wrap correctly."
---

# ecosystem-03 — Load-Bearing Flows (the commands hush must get right)

> Syntax quoted from official docs (fetched 2026-06-16). These are the exact flows hush's skills/CLI wrap.

## 1. OpenBao / Vault — DYNAMIC database secrets (the lease lifecycle)

Source: https://openbao.org/docs/secrets/databases/ (verbatim, `bao` = OpenBao CLI; identical for `vault`).

```bash
# 1. enable the engine
bao secrets enable database

# 2. configure the connection (root creds OpenBao uses to MANAGE other users)
bao write database/config/my-database \
  plugin_name="..." \
  connection_url="..." \
  allowed_roles="..." \
  username="..." \
  password="..."

# 3. rotate the root password so even YOU no longer know it (recommended)
bao write -force database/rotate-root/my-database

# 4. define a role: maps a name -> SQL that CREATES a scoped, time-bound user
bao write database/roles/my-role \
  db_name=my-database \
  creation_statements="..." \
  default_ttl="1h" \
  max_ttl="24h"

# 5. an agent/app GENERATES a fresh dynamic credential on demand
bao read database/creds/my-role
# -> returns: lease_id, lease_duration, lease_renewable, username, password
```

**Concepts (verbatim):** *Connection Config* = root user OpenBao uses to manage others; *Role* = maps a name to
SQL `creation_statements` (with `{{username}}`/`{{password}}` placeholders); *Lease* = "time-bound credential
grant with automatic revocation"; *TTL/max_ttl* = `default_ttl` initial lease, `max_ttl` caps total lifetime;
*Revocation* = OpenBao's "internal revocation system automatically invalidates credentials when leases expire."

**Why this is THE flow for hush:** this is dynamic short-lived secrets done right — the DB password the app uses
**never exists before it's needed and self-destructs on lease expiry.** No rotation playbook needed because the
credential's lifetime IS the rotation. **`rotate-root` is the killer move:** after step 3, the master password
is unknown to humans — only OpenBao holds it. hush should make `rotate-root` mandatory in any dynamic-DB recipe.

## 2. SOPS + age — at-rest encryption for git (the GitOps flow)

Source: https://getsops.io/docs/ (verbatim).

```yaml
# .sops.yaml — creation_rules drive WHICH key encrypts WHICH path
creation_rules:
    - path_regex: \.dev\.yaml$
      age: 'age129h70qwx39k7h5x6l9hg566nwm53527zvamre8vep9e3plsm44uqgy8gla'
      kms: 'arn:aws:kms:us-west-2:927034868273:key/fe86dd69-4132-404c-ab86-4269956b4500'
```

```bash
sops encrypt --age <recipient> test.yaml > test.enc.yaml   # encrypt
sops decrypt mynewtestfile.yaml                              # decrypt to stdout
sops edit <file>                                             # edit + re-encrypt in place
sops rotate example.yaml                                     # ROTATE the data key
sops updatekeys test.enc.yaml                                # update recipients WITHOUT rotating data key
```

age key resolution (decrypt side):
- `SOPS_AGE_KEY_FILE` (path to keys.txt) or `SOPS_AGE_KEY` (the key inline).
- Default search: Linux `$HOME/.config/sops/age/keys.txt`; macOS `$HOME/Library/Application Support/sops/age/keys.txt`.

**Two distinct rotation operations (a subtle, important distinction):**
- **`sops rotate`** = generate a NEW data key and re-encrypt (use after a recipient key may be compromised).
- **`sops updatekeys`** = re-encrypt the EXISTING data key to a changed recipient list (use when adding/removing
  a team member's age key) — does NOT change the underlying data key.
- **Doctrine:** when someone leaves the team, `updatekeys` to drop their recipient is NOT enough if they ever saw
  the data — you must `rotate` AND rotate the underlying secret values. (`updatekeys` alone is a false-green,
  same family as `git rm --cached`.)

**The `path_regex` + multi-recipient pattern** is how you get the **break-glass second recipient** (ecosystem-05
§B1): list BOTH a `kms:` and an `age:` recipient so a single-provider regression doesn't lock you out.

## 3. Vault AppRole — how an AGENT/CI authenticates safely (response-wrapping)

Source: https://developer.hashicorp.com/vault/docs/auth/approle/approle-pattern + 2026 guides (verbatim where shown).

The AppRole model splits the credential into **two parts** to defeat the "secret-zero" problem:
- **`role_id`** — non-secret-ish, identifies the role. *"Never commit role IDs to source control — store in CI/CD
  secrets."*
- **`secret_id`** — the actual secret. *"Generate secret IDs on-demand, never pre-generate and store."*

**Response-wrapping (the key technique):**
```bash
# a trusted orchestrator generates a WRAPPED secret_id (a one-time token, NOT the secret_id itself)
vault write -wrap-ttl=120s -f auth/approle/role/my-role/secret-id
# the app/agent unwraps it ONCE to get the real secret_id (single-use delivery)
```

**Best-practice knobs (verbatim):** `secret_id_num_uses=1` (single-use), strict TTLs on tokens AND secret_ids,
`secret_id_response_wrapping_path` for Vault Agent, remove the secret_id file after reading, audit all AppRole
auths. *"Obscure the RoleID from [CI] but allow [CI] to deliver a wrapped SecretID to the application."*

**Doctrine for hush:** the two-part + response-wrapping pattern is the canonical "how do I give a secret to a
machine without that secret leaking" answer. The wrapped token is single-use and short-TTL — if intercepted, it's
either already used (detectable) or expired. hush should prefer this over handing an agent a long-lived token.
(OpenBao has the same AppRole engine.)

## 4. Infisical — machine-identity auth (the modern multi-method flow)

Source: https://infisical.com/docs/documentation/platform/identities/machine-identities (verbatim).

Auth methods for non-human/agent/CI workloads:
- **Universal Auth** — Client ID + Client Secret.
- **Token Auth** — simple platform-agnostic token.
- **Cloud-Native** — **AWS / Azure / GCP** auth (uses the workload's native cloud credentials → no stored secret).
- **Kubernetes Auth** — pod-native (uses the K8s service-account JWT).
- **OIDC Auth** — JWT via any OIDC provider.
- **SPIFFE Auth** — **JWT-SVID tokens from SPIRE** (true workload identity).

Flow (verbatim): identity created with a role + auth method → identity authenticates → *"system returns a
short-lived access token to be used in subsequent requests"* → agent uses token for subsequent API calls.
Scoping: project-level identity = restricted to its project; org-level = multi-project.

**Doctrine for hush:** the BEST agent-auth methods are the ones with **no stored secret at all** — Cloud-Native
(AWS/GCP/Azure), Kubernetes, and especially **SPIFFE** (the workload-identity ideal from ecosystem-04 §2). hush
should steer agents toward these over Universal-Auth client-secret (which is itself a secret to protect). The
fact that Infisical ships SPIFFE auth in 2026 confirms workload-identity is mainstream, not bleeding-edge.

## 5. gitleaks — scan / pre-commit / baseline (the scanning flow hush must beat energy's CI with)

Source: https://github.com/gitleaks/gitleaks + 2026 usage guides (verbatim).

```bash
gitleaks detect --source .                    # scan the WHOLE git history (uses `git log -p` under the hood)
gitleaks protect --source . --staged          # scan ONLY staged changes — the pre-commit variant
gitleaks protect --staged --redact -v         # pre-commit hook: redact secret values in output
gitleaks detect --source . -b .gitleaks-baseline.json   # ignore known findings via a BASELINE file
gitleaks detect --config .gitleaks.toml       # custom rules/allowlist
```
Scan modes: **git** (history), **dir** (filesystem), **stdin**. The `-b/--baseline-path` flag is the cure for
false-positive fatigue (ecosystem-05 §A1).

**`detect` vs `protect` is the load-bearing distinction:**
- **`protect --staged`** = pre-commit, blocks BEFORE the secret enters history (the only place to truly *prevent*).
- **`detect`** = scans history, finds what's ALREADY committed (detection, not prevention — by then, rotate).

**Doctrine for hush (beating energy's regex-grep CI, ecosystem-00 §2):**
1. `protect --staged` as a **pre-commit hook** — prevents the leak at the only moment prevention is possible.
2. `detect` (full history) in **CI** — catches what slipped past local hooks (energy's CI scans working-tree
   ONLY; adding history scan is the upgrade).
3. A **`.gitleaks.toml` allowlist + baseline file** — so docs/fixtures don't drown real findings.
4. trufflehog `--only-verified` in CI for the FP-free "is it LIVE" layer.

## 6. The rotation playbook (synthesized from all the above + ecosystem-05)

The universal, atomic-safe rotation pattern (works for DB creds, API keys, everything):
1. **ISSUE** a new credential (don't touch the old one yet).
2. **DEPLOY** the new credential to all consumers (config push / secret-store update / lease).
3. **VERIFY** every consumer is using the new one (logs/health checks) — the propagation window.
4. **REVOKE** the old credential (only now).

- Dynamic secrets (OpenBao §1) collapse this to "let the lease expire" — the cleanest form.
- AWS managed rotation does this via **alternating users** (the `_clone` user, ecosystem-05 §D1).
- For a *leaked* secret, step 1 is "rotate at the provider" and the whole point is you CANNOT skip it
  (un-tracking/`updatekeys`/`git rm --cached` are all false-greens).

---

### Distilled flow-doctrine for hush
1. **Dynamic > rotated:** OpenBao `database/creds/<role>` + `rotate-root` makes the credential's TTL its own
   rotation. Make `rotate-root` mandatory.
2. **SOPS has TWO rotations:** `rotate` (new data key) vs `updatekeys` (recipient list only) — `updatekeys` alone
   is a false-green when someone leaves. Always list a break-glass second recipient via `path_regex`.
3. **Agent auth = response-wrapped AppRole, or (better) secret-less workload identity** (Infisical
   Cloud-Native/K8s/**SPIFFE**). Never a long-lived token.
4. **Scanning = `protect --staged` pre-commit (prevent) + `detect` history in CI (catch) + baseline/allowlist +
   trufflehog `--only-verified`.** This beats energy's working-tree regex grep on every axis.
5. **Rotation = issue → deploy → verify → revoke** (never overwrite-in-place); for leaks, rotate-at-provider is
   non-skippable.
