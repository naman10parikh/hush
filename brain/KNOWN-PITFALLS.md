---
title: "KNOWN-PITFALLS — Version-Specific Gotchas, with Detection + Avoidance"
type: synthesis
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, pitfalls, gotchas, regressions, version-specific, detection, hush]
sources:
  - "raw/ecosystem-00-internal-references.md"
  - "raw/ecosystem-01-canonical-versions-and-deltas.md"
  - "raw/ecosystem-02-starter-repos-and-tooling.md"
  - "raw/ecosystem-03-docs-deep-dive-load-bearing-flows.md"
  - "raw/ecosystem-04-agent-operator-knowledge.md"
  - "raw/ecosystem-05-github-issues-real-breakage.md"
related:
  - "[[EXPERTISE-MAP]]"
  - "[[BATTLE-TESTED-SCENARIOS]]"
  - "[[OPINIONS]]"
  - "[[TOOL-MATRIX]]"
  - "[[GAPS-AND-DISPUTES]]"
summary: "The gotcha list. Each pitfall is version-pinned where it matters, paired with how to DETECT it (the symptom + the command that surfaces it) and how to AVOID it. These are the traps that make a confident answer wrong — a fresh session must read this before asserting in this vertical."
---

# KNOWN-PITFALLS — The Gotcha List

> Format per entry: **the trap** → **how you'll hit it** → **DETECT** (symptom + command) →
> **AVOID** (the fix/precondition). Version numbers are load-bearing: a gotcha that's real on
> Vault 2.0.2 may not exist on 1.21. Anchors `P-NN` are referenced from [[EXPERTISE-MAP]] jobs and
> tested by [[BATTLE-TESTED-SCENARIOS]]. Each cites the raw `§`. **Nothing here is invented** —
> every entry traces to a dated incident, a GitHub issue, or an official doc.

---

## P-01 — `.gitignore` that never excluded `.env` (the energy root cause) — **LIVE in this repo**

**The trap:** a repo's `.gitignore` doesn't list `.env*`, so the first `git add .` quietly tracks
real secret files. This is the *exact* root cause of the energy incident — 8 real `.env` files tracked
since **2026-04-09**, Secret Scanner CI red on every push for days. [src: ecosystem-00 §1]

**How you'll hit it:** you inherit/clone a repo, `git add -A`, and a `.env` rides in unnoticed because
nothing told git to ignore it.

**DETECT:**
```bash
git ls-files | grep -E '(^|/)\.env($|\.|/)' | grep -v '\.env\.example'   # any tracked .env (not .example)?
grep -qE '(^|\n)\.env' .gitignore && echo "ignored" || echo "NOT IGNORED — vulnerable"
```

**AVOID:** add `.env*` to `.gitignore` AND keep `!.env.example`. Ship a `.gitignore` template that does
this by default. [src: ecosystem-00 §1; ecosystem-02 §"what hush should ship"]

**⚠ DOGFOOD — true of hush's OWN repo right now:** `~/hush/.gitignore` (verified 2026-06-16)
contains NO `.env*` line. The secrets employee currently has the very hole that caused the fleet's
flagship leak. Fixing hush's own `.gitignore` is JOB 1's first dogfood task. [verified against repo]

---

## P-02 — Inherited / stale `.env.example` (a superset of keys you don't use) — **LIVE in this repo**

**The trap:** copying another repo's `.env.example` drags a stale superset. Devs then "fill in the
blanks" for keys the repo doesn't even need — and some of those filled values get committed. [src: ecosystem-00 §5]

**How you'll hit it:** `cp ../other/.env.example .` to "save time."

**DETECT:** the `.env.example` header names a *different* project; it lists vars the codebase never reads
(`grep -rF "$VARNAME" src/` returns nothing for several of them).

**AVOID:** *generate* `.env.example` from the repo's real secret schema — only the vars this repo
consumes, each a placeholder + a one-line comment. [src: ecosystem-00 §2, §5] (tested by
[[BATTLE-TESTED-SCENARIOS]] S-14)

**⚠ DOGFOOD — true of hush's OWN repo right now:** `~/hush/.env.example` (verified
2026-06-16) literally begins `# Energy Platform — Environment Variables` and carries Clerk, Stripe,
E2B, Ticketmaster, etc. — most of which a secrets employee does not need. *Correct part:* it uses
placeholders (`sk-ant-...`, `e2b_...`), zero real values. So the value-hygiene is right; the *schema*
is stale. [verified against repo]

---

## P-03 — Scanner false-positives on `password = "password"` (gitleaks `hashicorp-tf-password`)

**The trap:** gitleaks' built-in `hashicorp-tf-password` rule fires on the literal stopword `password`,
so test fixtures and **documentation examples** trip CI. It even bypasses gitleaks' own entropy
mechanism (a low-entropy literal shouldn't fire). Issue **#1302** (high-engagement): *"This is being
picked up in nearly all of our pipelines now… All issues were in documentation example strings."*
[src: ecosystem-05 §A1]

**How you'll hit it:** you add gitleaks to CI with the default ruleset; the next PR with a fixture
`password = "password"` goes red.

**DETECT:** CI fails on a finding whose value is a common literal (`password`, `changeme`, `secret`) in
a `*_test.*`, `fixtures/`, `docs/`, or example file.

**AVOID:** ship a **baseline/allowlist** — `.gitleaks.toml [allowlist]`, inline `gitleaks:allow`
comments, and/or `--baseline-path` of audited findings (steal Yelp/detect-secrets' `.secrets.baseline`)
— PLUS keep **entropy gating** on. **Extend**, don't replace, the upstream ruleset (#741/#596). [src:
ecosystem-05 §A1, §A4; ecosystem-02 §Tier-2] (tested by [[BATTLE-TESTED-SCENARIOS]] S-12)

---

## P-04 — Trusting a scanner's reported LINE NUMBER for auto-surgery (trufflehog #1876)

**The trap:** trufflehog's line-number attribution is **wrong for some detectors** (#1876, closed
2026-01-15). An "auto-fix" that strips/edits the exact reported line touches the wrong place; inline CI
annotations point at the wrong spot. [src: ecosystem-05 §A2]

**How you'll hit it:** you build an automated remediation that does `git`-surgery off `finding.line`.

**DETECT:** the reported line doesn't contain a secret on inspection; the real secret is a few lines
away or in a different hunk.

**AVOID:** treat scanner line numbers as a *hint*, never ground truth. Verify the finding's location
before any automated git operation. And remember the real fix for a true finding is **rotation**, not a
code edit. [src: ecosystem-05 §A2] (tested by [[BATTLE-TESTED-SCENARIOS]] S-13)

---

## P-05 — `curl | sh` scanner installs drift across versions (trufflehog #4750)

**The trap:** the trufflehog `curl | sh` install script **failed for 3.93.4** (#4750, closed
2026-06-02). Install-script drift across versions/arches is a recurring class — an agent that depends on
a scanner installed this way is brittle. [src: ecosystem-05 §A3]

**How you'll hit it:** your CI/agent setup does `curl … | sh` and a new upstream release breaks it.

**DETECT:** the install step fails non-deterministically after an upstream version bump; the scanner
binary is absent or the wrong arch.

**AVOID:** **pin** the scanner version and prefer a **checksummed binary** or package-manager install
over `curl | sh`. (gitleaks: pin `v8.30.1`; trufflehog: pin `v3.95.5`.) [src: ecosystem-05 §A3;
ecosystem-01 §5]

---

## P-06 — `git rm --cached` (and friends) mistaken for remediation — the FALSE-GREEN family

**The trap:** un-tracking a leaked `.env` turns CI green but leaves the value in git **history** — and
the secret was already burned the moment it hit a remote. Chairman, verbatim: *"Merely un-tracking the
files turns CI green but leaves the keys in git history (a false-green I won't ship on my own)."* Same
family: `sops updatekeys` (P-09), "removed in a later commit." [src: ecosystem-00 §1; ecosystem-05 §E]

**How you'll hit it:** CI is red because of a tracked secret; the fastest path to green is `git rm
--cached`; you stop there.

**DETECT:** CI is green but no provider rotation happened; `gitleaks detect` (full history) still finds
the old value; the provider API still accepts the "removed" key.

**AVOID:** **rotate at the provider FIRST** (the load-bearing fix), THEN `git rm --cached` + fix
`.gitignore`, THEN (optional, explicit consent) `git filter-repo` history scrub. Order is non-negotiable.
[src: ecosystem-00 §1; ecosystem-03 §6] (tested by [[BATTLE-TESTED-SCENARIOS]] S-01, S-02)

---

## P-07 — Rotation treated as atomic → downtime window (AWS single-user rotation)

**The trap:** AWS single-user rotation has *"potential for application downtime… between the setSecret
and finishSecret steps"* — in-flight calls during the gap get denied. Rotation is **never atomic**;
there is ALWAYS a propagation window. [src: ecosystem-05 §D1]

**How you'll hit it:** you "rotate" by overwriting the password in place on a DB/API with live
connections.

**DETECT:** a spike of auth failures during/just after a rotation; intermittent 401/403s correlated
with the rotation timestamp.

**AVOID:** **alternating-users / two-secret** rotation. AWS does this with a `_clone` user (same perms,
flip between them) → zero-downtime. Generic form (API keys too): **ISSUE new → DEPLOY → VERIFY everyone's
on the new one → REVOKE old.** Never overwrite-in-place for anything with live connections. [src:
ecosystem-03 §6; ecosystem-05 §D1] (tested by [[BATTLE-TESTED-SCENARIOS]] S-10)

---

## P-08 — GCP "rotation enabled" is NOTIFY-ONLY (the AWS↔GCP asymmetry)

**The trap:** GCP Secret Manager rotation is *"notification-based, not rotation itself."* You set a
period + a Pub/Sub topic; GCP publishes a `SECRET_ROTATE` message and **you** build the rotation logic.
A team can "enable rotation," see no errors, and **never actually rotate**. AWS ships ready-made rotation
Lambdas; GCP does not. [src: ecosystem-01 §7; ecosystem-05 §D2]

**How you'll hit it:** you toggle the rotation period in the GCP console and consider rotation "done."

**DETECT:** the secret's version history shows no new versions despite the rotation period elapsing; no
Cloud Function is subscribed to the topic; the `SECRET_ROTATE` messages pile up unconsumed.

**AVOID:** deploy a **Cloud Function subscribed to the topic** that performs the real rotation
(issue→deploy→verify→revoke). On GCP, "rotation enabled" means "a reminder fires," nothing more. [src:
ecosystem-05 §D2] (tested by [[BATTLE-TESTED-SCENARIOS]] S-09)

---

## P-09 — `sops updatekeys` alone after a teammate leaves (the SOPS false-green)

**The trap:** `sops updatekeys` re-encrypts the **existing data key** to a changed recipient list — it
does NOT change the data key, and the **secret values are unchanged**. If the departing person ever
decrypted the file, they saw the values. Dropping their recipient is theater. Same family as `git rm
--cached`. [src: ecosystem-03 §2]

**How you'll hit it:** an engineer with SOPS access leaves; you `updatekeys` to remove their `age` key
and close the ticket.

**DETECT:** the recipient list no longer includes them, but the data key (`sops` metadata `lastmodified`/
`mac`) is unchanged and the underlying secret values (DB password, API key) are the same ones they saw.

**AVOID:** `updatekeys` to drop the recipient **AND** `sops rotate` (new data key) **AND** rotate the
underlying secret **values** at their providers. [src: ecosystem-03 §2] (tested by
[[BATTLE-TESTED-SCENARIOS]] S-05)

---

## P-10 — SOPS point-release breaks ONE KMS provider; age-plugin lag (#1695, #1103)

**The trap (two heads):**
- **Per-provider decrypt regression:** SOPS **v3.9.2** could not decrypt with **Azure KeyVault** while
  other backends worked — *"Failed to get the data key… Group 0: FAILED"* (#1695, closed 2025-01). The
  multi-KMS abstraction means one point-release can break a single provider. [src: ecosystem-05 §B1]
- **age-plugin lag:** `age1yubikey` recipients failed SOPS validation because *"the parse-method of age
  was never updated outside of Cmd"* (#1103, closed 2025-02). SOPS↔age-plugin (YubiKey/TPM/FIDO2)
  compatibility lags. [src: ecosystem-05 §B2]

**How you'll hit it:** you bump SOPS (or adopt a hardware-backed age key) and suddenly can't decrypt.

**DETECT:** decrypt fails for a specific backend right after a SOPS version change; a plugin recipient
(`age1yubikey…`) is rejected as malformed.

**AVOID:** **pin SOPS versions; test decrypt against the *specific* KMS backend after any bump** before
rolling out. For hardware age keys, pin a known-good **SOPS+age+plugin triple** and test it. And ALWAYS
keep a **break-glass second recipient** (an `age:` key alongside the `kms:` key) so a single-provider
regression doesn't lock you out. [src: ecosystem-05 §B1, §B2; ecosystem-03 §2] (tested by
[[BATTLE-TESTED-SCENARIOS]] S-04)

---

## P-11 — Env-var secret injection leaks via `/proc/environ` + child inheritance

**The trap:** env vars are **NOT safe for secrets in production**. Readable via `/proc/<PID>/environ`
(anyone with ptrace), **inherited by ALL child processes** (spreads to every subprocess the agent
spawns), and captured by crash dumps, error reporters, and `printenv`. Doppler's own 2026 piece confirms
it. [src: ecosystem-04 §3]

**How you'll hit it:** you `export API_KEY=…` (or `process.env.X`) and spawn subprocesses — now the
secret is in every child's environment and on disk if anything dumps it.

**DETECT:** `cat /proc/<pid>/environ | tr '\0' '\n' | grep -i key` shows the secret; a child process you
didn't intend has the secret in its env; a crash report contains the full environment.

**AVOID:** preference order — **broker/dynamic-at-runtime (memory only)** > **0400 file-mount in
`/run/secrets` tmpfs** (not in env, not inherited, not in `/proc/environ`) > just-in-time env via a
`run`-wrapper (`doppler run --` / `infisical run --` / `op run --` / `vault agent`) > committed `.env`
(NEVER). [src: ecosystem-04 §3] (tested by [[BATTLE-TESTED-SCENARIOS]] S-08, S-11)

---

## P-12 — K8s Secret in etcd is base64, NOT encrypted (the "operator = safe" illusion)

**The trap:** VSO / ESO / CSI-sync all create a real K8s `Secret`, which is **base64-encoded, not
encrypted, unless you've enabled etcd encryption-at-rest.** Teams adopt an operator to "manage secrets
properly" and assume the result is encrypted. Only the **Vault Agent Sidecar Injector** keeps the secret
out of etcd entirely (memory/tmpfs only). [src: ecosystem-04 §5]

**How you'll hit it:** you wire ESO/VSO into a cluster with default etcd config and consider the secrets
protected.

**DETECT:** `kubectl get secret <name> -o jsonpath='{.data.X}' | base64 -d` returns the plaintext
(base64 is trivially reversible); the cluster's `EncryptionConfiguration` is absent/`identity`.

**AVOID:** for top-value secrets use the **Sidecar Injector** (no K8s Secret object). If using
ESO/VSO/CSI-sync, **require etcd encryption-at-rest as a precondition** and say so loudly. For
OpenBao-on-K8s, the supported path is **ESO** — the `openbao-secrets-operator` fork was **archived
2026-02-20** without ever releasing. [src: ecosystem-04 §5; ecosystem-05 §C2] (tested by
[[BATTLE-TESTED-SCENARIOS]] S-15)

---

## P-13 — Vault 2.0.2 container can't `mlock()` (cap_ipc_lock removed at build)

**The trap:** Vault **2.0.2 (2026-06-05)** removed the `cap_ipc_lock` capability from the binary at
build time so it runs in common container runtimes. **Consequence: Vault in a container can no longer
`mlock()`** and won't start safely without a config change. The single most likely "my Vault container
broke after upgrade" gotcha of mid-2026. [src: ecosystem-01 §1]

**How you'll hit it:** you upgrade a containerized Vault to 2.0.2+ and it fails to start / logs an mlock
error.

**DETECT:** container logs show an mlock/`IPC_LOCK` failure on startup; pre-2.0.2 the same config worked.

**AVOID:** set **`disable_mlock = true`** in the Vault HCL **and disable swap** on the host/node (mlock's
job was to keep secrets out of swap — disabling mlock without disabling swap risks secrets paging to
disk). Granting `CAP_IPC_LOCK` back fights the upstream change — don't. [src: ecosystem-01 §1] (tested
by [[BATTLE-TESTED-SCENARIOS]] S-03)

---

## P-14 — Re-enabling Vault's unauthenticated root-gen/rekey (undoing 2.0 hardening)

**The trap:** Vault 2.0 made `sys/generate-root`, `sys/rekey`, and DR `generate-operation-token`
**AUTHENTICATED by default** — overdue hardening of the historically-scary "anyone can start a
root-token generation" surface. The old behaviour is opt-in via `enable_unauthenticated_access = [...]`.
A copy-pasted "make it work like before" config can re-open the hole. [src: ecosystem-01 §1]

**How you'll hit it:** you migrate an old config or follow a stale guide that sets
`enable_unauthenticated_access`.

**DETECT:** the HCL contains `enable_unauthenticated_access` listing `generate-root` / `rekey` /
`generate-operation-token`.

**AVOID:** **never set `enable_unauthenticated_access`** for these operations. Keep them authenticated.
[src: ecosystem-01 §1]

---

## P-15 — "OpenBao is drop-in for Vault" beyond the 1.14 baseline

**The trap:** the official OpenBao migration guide *"only supports Vault 1.14.1 (Community Edition) as
the tested baseline"*, warns *"this guide will not work on Vault versions 1.15.0 and newer,"* and
*"Vault Enterprise migration is not supported."* OpenBao forked at **1.14.0** — everything Vault added in
1.15→2.0 is NOT guaranteed. With Vault at 2.0.x, the blessed path doesn't apply directly. [src:
ecosystem-05 §C1]

**How you'll hit it:** you promise a "drop-in" cutover from a modern Vault to OpenBao and flip a config.

**DETECT:** features in use (post-1.14 auth methods, Enterprise engines like managed Rotation Manager,
DR replication) have no OpenBao equivalent; the migration guide's version preconditions don't match your
Vault.

**AVOID:** qualify every "drop-in" claim with the **1.14 baseline**. Inventory post-1.14 + Enterprise
features first. Plan a real migration (**assess → parallel deploy → phased cutover → validate**, typically
**2–8 weeks**). OpenBao gives **free namespaces** but has **no native DR replication** yet. [src:
ecosystem-05 §C1, §C3] (tested by [[BATTLE-TESTED-SCENARIOS]] S-11)

---

## P-16 — A "secrets MCP" that returns the raw value into the agent's context

**The trap:** an MCP/agent tool that returns `{"value":"sk-ant-..."}` puts the secret in the
conversation transcript, the tool-call logs/traces, and possibly the next commit. This is the **modal
2026 agent leak** (GitGuardian: **24,008 secrets in MCP config files**, **2,117 valid**; AI-assisted
commits leak at **~2x** baseline). [src: ecosystem-04 §0, §1, §6]

**How you'll hit it:** you wire a naive secrets MCP so "the agent can use the key," or you hardcode a
key into `.mcp.json` / `claude_desktop_config.json` following a quickstart.

**DETECT:** grep the transcript/trace for secret-shaped strings (`sk-`, `AKIA`, `ghp_`, etc.) — any
appearance is a leak; grep the MCP config file for real values (not `${VAR}` refs).

**AVOID:** the agent-facing API/MCP returns a **handle/reference** (`op://vault/item/field`-style), never
the value; the actual use happens via a broker (`op run --`, `infisical run --`) or a short-TTL minted
cred so the value never enters the model's context. Scan the MCP config file specifically; never write a
real secret into it. [src: ecosystem-04 §1, §2, §6] (tested by [[BATTLE-TESTED-SCENARIOS]] S-08)

**✅ DOGFOOD — hush gets this one RIGHT:** `~/hush/.mcp.json` (verified 2026-06-16) references
the GitHub token as `${GITHUB_PERSONAL_ACCESS_TOKEN}`, not a pasted value. That is the correct pattern —
the config carries a *reference*, the value comes from the environment at launch. [verified against repo]

---

## P-17 — Secrets leak via logs / URL query strings / prompt-injection exfiltration

**The trap (agent-specific channels humans don't watch):**
- **Logs/traces** capture tool args/returns and error messages → secrets in env get dumped by crash
  reporters. [src: ecosystem-04 §6]
- **URLs** in error messages can carry session tokens / OAuth codes in query strings (browser-agent
  Rule 12). [src: ecosystem-00 §3]
- **Prompt injection:** a malicious page/document can instruct the agent to read a held secret and POST
  it (browser-agent Rule 2: extracted content is untrusted). [src: ecosystem-04 §6; ecosystem-00 §3]

**DETECT:** secret-shaped strings appear in logs/traces; logged URLs contain `?…token=…`; an agent with
outbound network and a held secret can be steered to exfiltrate it.

**AVOID:** **never log a secret;** redact secret-shaped tokens; **strip URL query strings before
logging** (`origin+pathname` only). For high-value secret-bearing agents, the *capability* to read a raw
secret must not exist (broker pattern) and outbound network should be egress-restricted. [src:
ecosystem-04 §6; ecosystem-00 §3] (tested by [[BATTLE-TESTED-SCENARIOS]] S-08)

---

## P-18 — Path traversal via unvalidated secret names/keys (browser-agent Rule 9 analog)

**The trap:** a secret *name/key* used to build a file or store path (e.g. `secrets/<name>.enc`) without
validation invites `../../etc/passwd`-style traversal — the same class browser-agent Rule 9 guards for
`agentId`. [src: ecosystem-00 §3]

**DETECT:** a secret name containing `/`, `..`, or URL-encoded path chars resolves outside the intended
store directory.

**AVOID:** validate secret names against `/^[a-zA-Z0-9_-]+$/` and verify the resolved path
`startsWith(path.resolve(storeDir))` before any file op. [src: ecosystem-00 §3]

---

## Quick-reference: which version makes each gotcha real

| Pitfall | Version-pinned trigger | The one command/line that detects it |
|---|---|---|
| P-01 `.env` not ignored | any | `git ls-files \| grep '\.env' \| grep -v example` |
| P-03 gitleaks FP | gitleaks (default ruleset) | CI red on `password = "password"` in a fixture |
| P-04 wrong line # | trufflehog (some detectors) | reported line has no secret |
| P-05 install drift | trufflehog 3.93.4 era | `curl\|sh` install step fails post-bump |
| P-09 updatekeys-only | SOPS (any) | data-key `mac` unchanged after "removal" |
| P-10 KMS decrypt break | **SOPS v3.9.2 / Azure KV** | decrypt fails one backend after bump |
| P-10 age-plugin lag | SOPS + `age1yubikey` | recipient rejected as malformed |
| P-13 mlock | **Vault ≥ 2.0.2 in containers** | mlock error on startup |
| P-14 unauth root-gen | **Vault 2.0** migrated config | `enable_unauthenticated_access` present |
| P-15 not-drop-in | Vault > 1.14 → OpenBao | post-1.14 feature has no OpenBao equiv |
| P-16 raw value MCP | any naive MCP | secret-shaped string in transcript |

---

## How a fresh session should USE this list

1. Before asserting a fix, check whether a **version-pinned** pitfall applies (P-10, P-13, P-14, P-15).
2. Before calling something "remediated," confirm it isn't a **false-green** (P-06, P-08, P-09).
3. Before shipping an agent secret path, run the **agent-channel** checks (P-11, P-16, P-17, P-18).
4. The three ⚠/✅ DOGFOOD entries (P-01, P-02, P-16) are hush's own repo state — fix P-01 and P-02,
   keep P-16's good pattern.
