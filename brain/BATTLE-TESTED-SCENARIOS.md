---
title: "BATTLE-TESTED-SCENARIOS — Real Failure/Migration/Production Scenarios + Resolutions"
type: synthesis
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, scenarios, eval-tasks, incidents, migration, hush]
sources:
  - "raw/ecosystem-00-internal-references.md"
  - "raw/ecosystem-01-canonical-versions-and-deltas.md"
  - "raw/ecosystem-03-docs-deep-dive-load-bearing-flows.md"
  - "raw/ecosystem-04-agent-operator-knowledge.md"
  - "raw/ecosystem-05-github-issues-real-breakage.md"
related:
  - "[[EXPERTISE-MAP]]"
  - "[[KNOWN-PITFALLS]]"
  - "[[OPINIONS]]"
  - "[[TOOL-MATRIX]]"
summary: "≥14 real, specific failure/migration/production scenarios — each with the trigger, the wrong move (false-green), the correct resolution, and a verifiable success criterion. These become golden eval tasks in Wave S. Every scenario traces to a dated incident, a GitHub issue, or an official-doc flow — none are invented."
---

# BATTLE-TESTED-SCENARIOS

> Each scenario is **eval-ready**: it has a trigger, the tempting-but-wrong move, the correct
> resolution, and a **success criterion** a grader can check. Scenarios marked **[GOLD]** are the
> strongest candidates for Wave-S golden eval tasks (most teaching, most checkable, most real).
> Provenance is cited per scenario — these are mined from the corpus, not fabricated.

---

## S-01 [GOLD] — Live `.env` files committed to git, CI red for days

**The real incident (energy repo, the fleet's own):** 8 real `.env` files (`.env`,
`agents/earning/.env`, `agents/earning/mercury/.env`, `agents/earning/venus/.env`, + 3 `.env.bak.*`)
tracked since **2026-04-09** because `.gitignore` never excluded them. The 52-line `.env` carried
Anthropic, E2B, Twilio, AgentMail, Discord, Slack, Stripe, Supabase, Clerk, Vercel keys. Secret
Scanner CI failed on **every push for days**. [src: ecosystem-00 §1, ecosystem-05 §E]

**Wrong move (the false-green):** `git rm --cached` the files → CI goes green. The chairman: *"Merely
un-tracking the files turns CI green but leaves the keys in git history (a false-green I won't ship on
my own)."* [src: ecosystem-00 §1]

**Correct resolution (rotate-first, scrub-second):**
1. **Rotate every key at its provider** (Anthropic, Stripe, … one by one) — the load-bearing fix.
2. `git rm --cached` the real files (keep local copies) + add `.env*` to `.gitignore` (keep
   `!.env.example`) + commit → future commits clean.
3. (Optional, explicit consent) `git filter-repo` to purge old values from history + force-push.

**Success criterion:** (a) every leaked provider key is rotated (old value fails against the provider
API); (b) `find . -name ".env"` returns nothing tracked; (c) `.gitignore` contains `.env*` and
`!.env.example`; (d) a history scan (`gitleaks detect`) on the rewritten history finds zero of the old
values. Rotation MUST be verified, not assumed. [src: ecosystem-00 §1, ecosystem-03 §6]

---

## S-02 [GOLD] — Stale secret found in git history months later

**Trigger:** a scanner finds an API key that was committed and "removed" 6 months ago. Maps to
GitGuardian's headline failure: **64% of valid secrets first leaked in 2022 are STILL not revoked in
2026.** [src: ecosystem-04 §0]

**Wrong move:** assume "it was removed in a later commit, we're fine." The value lives in history
forever and may already be in use by an attacker.

**Correct resolution:** treat it as **live until proven dead**. Rotate at the provider immediately;
THEN scrub history (`git filter-repo`, force-push, consent) as hygiene. The rewrite does not undo the
exposure — rotation does. [src: ecosystem-01 §6, ecosystem-05 §E]

**Success criterion:** the old key is confirmed-rotated (fails against provider); a history scan finds
no remaining copies. Grader rejects any answer that scrubs without rotating.

---

## S-03 [GOLD] — Vault container won't start after upgrade to 2.0.2

**The real regression:** Vault **2.0.2 (2026-06-05)** removed the `cap_ipc_lock` capability from the
binary at build time so it runs in common container runtimes. **Consequence: Vault in a container can
no longer `mlock()`** and fails/refuses to start safely. The single most likely "my Vault container
broke after upgrade" gotcha of mid-2026. [src: ecosystem-01 §1]

**Wrong move:** grant `CAP_IPC_LOCK` back to the container (fights the upstream change) or downgrade
blindly.

**Correct resolution:** set **`disable_mlock = true`** in the Vault HCL config **and disable swap** on
the host/node (mlock's purpose was to keep secrets out of swap — disabling mlock without disabling swap
risks secrets paging to disk). [src: ecosystem-01 §1]

**Success criterion:** Vault starts; config sets `disable_mlock = true`; swap is off (or the node uses
encrypted swap). Grader checks both the config line AND the swap mitigation — `disable_mlock` alone
without addressing swap is a partial-credit miss.

---

## S-04 [GOLD] — SOPS suddenly can't decrypt after a version bump (Azure KeyVault)

**The real issue (#1695, closed 2025-01):** *"Since v3.9.2 I'm unable to decrypt my data… Failed to
get the data key required to decrypt the SOPS file. Group 0: FAILED."* A version-specific regression
in SOPS's **Azure KeyVault** key-service — other backends kept working. [src: ecosystem-05 §B1]

**Wrong move:** panic-rotate all secrets (you may not be able to, you can't decrypt them) or assume
the secrets are corrupt.

**Correct resolution:** (a) pin SOPS back to the last known-good version to decrypt; (b) because the
file listed a **break-glass second recipient** (an `age:` key alongside the `kms:` key via
`.sops.yaml` `path_regex`), decrypt with the age identity instead; (c) test decrypt against the
*specific* KMS backend after any future bump before rolling it out. [src: ecosystem-03 §2, ecosystem-05 §B1]

**Success criterion:** secrets are decryptable again WITHOUT a destructive rotation; the `.sops.yaml`
demonstrably lists ≥2 recipients (KMS + age). Grader rewards the break-glass recipient existing
*before* the incident.

---

## S-05 [GOLD] — A teammate leaves; you `updatekeys` to drop their age key

**Trigger:** an engineer with access to SOPS-encrypted secrets leaves the company. Someone runs
`sops updatekeys` to remove their age recipient and calls it done. [src: ecosystem-03 §2]

**Wrong move (the false-green):** `updatekeys` alone. It re-encrypts the **existing data key** to the
new recipient list — but if the departing person ever decrypted the file, they saw the underlying
**secret values**, which are unchanged. Same false-green family as `git rm --cached`. [src: ecosystem-03 §2]

**Correct resolution:** `sops updatekeys` to drop the recipient **AND** `sops rotate` to generate a new
data key **AND** rotate the underlying secret values at their providers (the DB password, the API key
the file held). [src: ecosystem-03 §2]

**Success criterion:** the departed recipient is gone; the data key is new; AND the actual secret
values are rotated at the provider. Grader rejects `updatekeys`-only.

---

## S-06 [GOLD] — Give an agent/CI its first secret without leaking it (secret-zero)

**Trigger:** a CI pipeline or an agent needs to authenticate to Vault/OpenBao to pull secrets. How
does it get its *first* credential without that credential leaking? [src: ecosystem-03 §3]

**Wrong move:** commit a long-lived Vault token to CI config, or store a static `secret_id` in the
repo.

**Correct resolution (AppRole + response-wrapping):**
- Store the `role_id` in CI/CD secrets (it identifies the role; *"never commit role IDs to source
  control"*).
- A trusted orchestrator issues a **wrapped, single-use, short-TTL** secret_id:
  `vault write -wrap-ttl=120s -f auth/approle/role/<role>/secret-id`.
- The agent **unwraps it ONCE** to get the real `secret_id`, with `secret_id_num_uses=1` and strict
  TTLs; remove the secret_id file after reading; audit all AppRole auths.
- **Even better:** skip the secret entirely — use a secret-less workload identity (Infisical
  Cloud-Native / Kubernetes / **SPIFFE**). [src: ecosystem-03 §3, §4; ecosystem-04 §2]

**Success criterion:** no long-lived token or static `secret_id` in the repo/config; the delivered
secret_id is single-use + short-TTL (intercept → already-used-or-expired); audit log shows the auth.
Grader awards full marks for a workload-identity (no-secret) answer.

---

## S-07 [GOLD] — Provision a short-lived DB credential for an app/agent

**Trigger:** an app needs a database password at runtime; you want it to never exist before it's
needed and to self-destruct. [src: ecosystem-03 §1]

**Wrong move:** create a static DB user, put its password in a `.env`, and "rotate quarterly."

**Correct resolution (dynamic secrets):**
```bash
bao secrets enable database
bao write database/config/mydb plugin_name=... connection_url=... allowed_roles=... username=... password=...
bao write -force database/rotate-root/mydb     # <- MANDATORY: even YOU no longer know the master pw
bao write database/roles/myrole db_name=mydb creation_statements="..." default_ttl="1h" max_ttl="24h"
bao read database/creds/myrole                  # app gets a fresh, scoped, time-bound user
```
The lease auto-revokes on expiry — the credential's lifetime IS its rotation. [src: ecosystem-03 §1]

**Success criterion:** the app obtains a credential via `database/creds/<role>` (not a static user);
`rotate-root` was run (master pw unknown to humans); the cred has a bounded `max_ttl`. Grader treats a
missing `rotate-root` as a serious miss.

---

## S-08 [GOLD] — An MCP server returns a raw secret into the agent's context

**Trigger:** a developer wires a "secrets MCP" that returns `{"value":"sk-ant-..."}` so the agent can
use the key. This is the modal 2026 agent leak: the secret is now in the transcript, the logs, and
possibly the next commit. (Backed by GitGuardian: **24,008 secrets in MCP config files**, **AI commits
leak at ~2x baseline**.) [src: ecosystem-04 §0, §1]

**Wrong move:** ship it. The value is now in N channels humans don't watch.

**Correct resolution:** the agent-facing API/MCP returns a **handle/reference**, not the value
(`op://vault/item/field`-style). The actual use happens via a broker that injects the secret into the
child process at runtime (`op run --`, `infisical run --`) or mints a short-TTL scoped cred — the value
never enters the model's context. Copy the 1Password DevEnv MCP / Infisical Agent Vault design. [src: ecosystem-04 §1, §2]

**Success criterion:** the secret value never appears in the transcript or logs; the agent operates via
a handle + a broker/`run`-wrapper. Grader scans the transcript for the raw value — any appearance fails.

---

## S-09 [GOLD] — "Enable rotation" on GCP Secret Manager and assume it rotates

**The real asymmetry:** GCP docs say rotation is *"notification-based, not rotation itself."* You set a
rotation period + a Pub/Sub topic; at the interval GCP publishes a `SECRET_ROTATE` message and **you
must build the actual rotation logic.** AWS ships ready-made rotation Lambdas; GCP does not. A team can
"enable rotation," see no errors, and **never actually rotate** — a dangerous false sense of security.
[src: ecosystem-05 §D2]

**Wrong move:** toggle the rotation period in the GCP console and move on.

**Correct resolution:** deploy a **Cloud Function subscribed to the Pub/Sub topic** that performs the
real rotation (issue new version → update consumers → verify → disable old version), following the
issue→deploy→verify→revoke pattern. [src: ecosystem-03 §6, ecosystem-05 §D2]

**Success criterion:** a rotation function exists and is subscribed to the topic; a forced rotation
event produces a new secret version AND consumers pick it up. Grader rejects "I enabled the rotation
period" with no function.

---

## S-10 [GOLD] — Rotate a production DB credential with live connections (no downtime)

**The real constraint:** AWS single-user rotation has *"potential for application downtime… between the
setSecret and finishSecret steps"* — in-flight calls with the old/new cred get denied during the gap.
Rotation is **never atomic**. [src: ecosystem-05 §D1]

**Wrong move:** overwrite the password in place ("update the secret"). Live connections break in the
window.

**Correct resolution (alternating-users / two-secret):** AWS creates a second user suffixed **`_clone`**
with identical perms and flips between them → zero-downtime. Generic version (applies to API keys too):
**ISSUE new → DEPLOY to all consumers → VERIFY everyone's on the new one (logs/health) → REVOKE old.**
Account for the `_clone` user. [src: ecosystem-03 §6, ecosystem-05 §D1]

**Success criterion:** no failed requests during rotation; the new cred is verified live on all
consumers BEFORE the old is revoked. Grader rejects overwrite-in-place for live-connection secrets.

---

## S-11 — Migrate from HashiCorp Vault 2.0 to OpenBao (the version-baseline trap)

**The real gotcha:** the official OpenBao migration guide *"only supports Vault 1.14.1 (Community
Edition) as the tested baseline"* and warns *"this guide will not work on Vault versions 1.15.0 and
newer"* + *"Vault Enterprise migration is not supported."* With Vault now at **2.0.x**, the blessed path
does not apply directly — the fork point was 1.14.0; everything Vault added in 1.15→2.0 is NOT
guaranteed in OpenBao. [src: ecosystem-05 §C1]

**Wrong move:** promise a "drop-in" cutover and flip a config.

**Correct resolution:** inventory post-1.14 Vault features + any Enterprise features in use; plan a real
migration (**assess → parallel deploy → phased cutover → validate**, typically **2–8 weeks**). For
OpenBao-on-K8s use **ESO** (the `openbao-secrets-operator` fork was **archived 2026-02-20** without ever
releasing). Note: namespaces are FREE in OpenBao but there's **no native DR replication** yet. [src: ecosystem-05 §C1, §C2, §C3]

**Success criterion:** a feature-gap inventory exists; the plan is phased with a validation step; K8s
guidance points at ESO not a VSO fork. Grader rejects "OpenBao is drop-in, just switch."

---

## S-12 — Scanner drowns the team in false positives (`password = "password"`)

**The real issue (#1302):** gitleaks' built-in `hashicorp-tf-password` rule fires on the literal
stopword `password` — *"This is being picked up in nearly all of our pipelines now… It is fairly common
to have test files which have a password set to 'password'"* and *"All issues were in documentation
example strings."* It even bypasses gitleaks' own entropy mechanism. [src: ecosystem-05 §A1]

**Wrong move:** disable the scanner (now you catch nothing) or `--exclude` whole directories (energy's
crude approach — also hides real findings).

**Correct resolution:** ship a **baseline/allowlist** — `.gitleaks.toml [allowlist]`, inline
`gitleaks:allow` comments, and/or `--baseline-path` of audited known findings (steal Yelp/detect-secrets'
`.secrets.baseline` pattern) **plus entropy gating** so low-entropy literals don't fire. **Extend**, don't
replace, the upstream ruleset. Also scan **base64-encoded** payloads (a common evasion, #807). [src: ecosystem-05 §A1, §A4; ecosystem-02 §Tier-2]

**Success criterion:** real secrets still fail CI; `password = "password"` in fixtures/docs does not;
the config extends rather than forks the default ruleset. Grader checks both directions (no FN, no FP).

---

## S-13 — Don't auto-`git`-surgery off a scanner's reported line number

**The real issue (#1876, closed 2026-01-15):** trufflehog's **line-number attribution is wrong for some
detectors** → inline CI annotations and any auto-remediation point at the wrong place. [src: ecosystem-05 §A2]

**Wrong move:** build an "auto-fix" that edits/strips the exact line the scanner reported.

**Correct resolution:** treat scanner line numbers as a hint, not ground truth; **verify the finding's
location before any automated git surgery**; and remember rotation (not a code edit) is the actual fix
for a real finding. [src: ecosystem-05 §A2]

**Success criterion:** no automated history rewrite triggered solely by an unverified line number; the
finding is human-or-verification-confirmed first. Grader rejects blind auto-surgery.

---

## S-14 — Generate a fresh, correct `.env.example` for a new repo

**Trigger:** a new repo needs an `.env.example`. The lazy path is to copy another repo's — which is
exactly how hush's own `.env.example` became a stale verbatim copy of energy's (Anthropic, E2B, Clerk,
Stripe, Google, Ticketmaster, …), most of which the new repo doesn't use. [src: ecosystem-00 §5]

**Wrong move:** `cp ../other/.env.example .` (drags a stale superset; invites devs to fill keys they
don't need and commit them).

**Correct resolution:** **generate** the `.env.example` from the repo's actual secret schema — only the
vars this repo consumes, each with a **placeholder** value (`sk-ant-...`, never a real value), plus a
one-line comment per var. Pair with `.gitignore` `.env*` + `!.env.example`. [src: ecosystem-00 §2, §5]

**Success criterion:** the `.env.example` lists exactly the repo's required vars (no stale superset),
all placeholders (zero real values), and `.gitignore` excludes `.env*` while keeping `!.env.example`.

---

## S-15 — K8s secret lands in etcd as base64 (mistaken for "encrypted")

**Trigger:** a team adopts ESO/VSO/CSI-sync to get secrets into pods and assumes the resulting K8s
`Secret` is encrypted. It's **base64, NOT encrypted, unless etcd encryption-at-rest is enabled.** [src: ecosystem-04 §5]

**Wrong move:** ship secrets via VSO/ESO into a cluster with default (unencrypted) etcd and consider
them protected.

**Correct resolution:** for the highest-value secrets use the **Vault Agent Sidecar Injector**
(renders to a shared **memory/tmpfs** volume, creates **no** K8s Secret object). If VSO/ESO/CSI-sync is
used, **require etcd encryption-at-rest as a precondition** and say so loudly. [src: ecosystem-04 §5]

**Success criterion:** top secrets are memory-only (no K8s Secret object) OR etcd-at-rest encryption is
verified enabled before any Secret-creating operator is used. Grader rejects "base64 == encrypted."

---

## Coverage map (which JOB each scenario tests — for Wave-S balance)

| Scenario | Primary JOB(s) tested | GOLD? |
|---|---|---|
| S-01 committed `.env` | JOB 1, 3 | ✅ |
| S-02 stale history secret | JOB 2, 3 | ✅ |
| S-03 Vault 2.0.2 container | JOB 12 | ✅ |
| S-04 SOPS Azure decrypt regression | JOB 10, 12 | ✅ |
| S-05 teammate-leaves updatekeys | JOB 4, 10 | ✅ |
| S-06 secret-zero AppRole | JOB 7 | ✅ |
| S-07 dynamic DB cred | JOB 6 | ✅ |
| S-08 MCP returns raw value | JOB 8, 9 | ✅ |
| S-09 GCP notify-only rotation | JOB 4 | ✅ |
| S-10 zero-downtime DB rotation | JOB 4 | ✅ |
| S-11 Vault→OpenBao migration | JOB 11, 12 | — |
| S-12 scanner false positives | JOB 2 | — |
| S-13 scanner wrong line number | JOB 2, 3 | — |
| S-14 generate `.env.example` | JOB 1 | — |
| S-15 etcd base64 trap | JOB 5 | — |
