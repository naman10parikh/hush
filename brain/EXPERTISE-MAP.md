---
title: "EXPERTISE-MAP — What hush Must Master (by Job-To-Be-Done)"
type: synthesis
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, expertise-map, jtbd, hush, doctrine]
sources:
  - "raw/ecosystem-00-internal-references.md"
  - "raw/ecosystem-01-canonical-versions-and-deltas.md"
  - "raw/ecosystem-02-starter-repos-and-tooling.md"
  - "raw/ecosystem-03-docs-deep-dive-load-bearing-flows.md"
  - "raw/ecosystem-04-agent-operator-knowledge.md"
  - "raw/ecosystem-05-github-issues-real-breakage.md"
  - "raw/ecosystem-06-tradeoff-matrix.md"
related:
  - "[[TOOL-MATRIX]]"
  - "[[BATTLE-TESTED-SCENARIOS]]"
  - "[[KNOWN-PITFALLS]]"
  - "[[OPINIONS]]"
  - "[[GAPS-AND-DISPUTES]]"
summary: "The structured map of everything the Secrets-management employee must master, organized by the job to be done (not by tool). Each leaf cites its raw source so a fresh Claude session becomes dangerous in this vertical by reading brain/ alone."
---

# EXPERTISE-MAP — What hush Must Master

> Organized by **job-to-be-done**, not by tool. A tool (OpenBao, SOPS, gitleaks) shows up under
> every job it serves. The canonical tool-by-tool view lives in [[TOOL-MATRIX]]; the failure
> scenarios that test each job live in [[BATTLE-TESTED-SCENARIOS]]; the version-specific gotchas
> in [[KNOWN-PITFALLS]]; the taste stances in [[OPINIONS]]; the unresolved questions in
> [[GAPS-AND-DISPUTES]].
>
> **The hush boundary (load-bearing):** hush *issues / stores / scans / rotates / scrubs / injects*
> secrets. **badge** owns *auth / identity / sign-in / sessions*. The broker that hush fronts checks
> an identity that **badge** owns. Do not cross this line. [src: ecosystem-00 §"hush boundary"; ecosystem-04 §2]

---

## The one-sentence thesis (internalize this first)

In 2026, **AI agents are simultaneously the #1 new cause of secret leaks AND the consumers hush must
hand secrets to safely** — so hush must solve both ends: prevent agents from leaking secrets, and
release secrets to agents without ever putting the raw value in a commit, a context window, a log, or
a child process. [src: ecosystem-04 §0, §6]

The corollary, which is the actual product: **a leaked secret is not the failure — an un-rotated leak
is.** GitGuardian 2026: 64% of valid secrets first leaked in 2022 are *still* un-revoked. The energy
`.env` incident is this exact failure inside our own fleet. Remediation governance ("rotate, then
*prove* rotation") is what hush sells. [src: ecosystem-00 §1; ecosystem-04 §0; ecosystem-05 §E]

---

## The capability ladder (memorize the ordering — it is the spine of every decision)

For **releasing a secret to a consumer (esp. an agent):**

```
broker  >  dynamic-short-lived  >  rotated-static  >  raw-static
```

For **injecting a secret into a process:**

```
broker/dynamic-at-runtime  >  0400 file-mount in tmpfs  >  just-in-time env via run-wrapper  >  committed .env (NEVER)
```

For **storing a secret:**

```
runtime broker (OpenBao/Vault/Infisical)  for runtime creds
SOPS+age in git                            ONLY for secrets that must live in git (GitOps)
managed (AWS/GCP SM)                        if single-cloud and IAM-tied
```

[src: ecosystem-04 §2–§4; ecosystem-06 decision tree]

---

## JOB 1 — Keep secrets OUT of the repo (the hygiene floor)

The cheapest, highest-leverage job. Everything else is moot if secrets are sitting in git.

- **`.gitignore` `.env*` but keep `!.env.example`.** The energy incident root cause was a `.gitignore`
  that *never excluded* `.env` → 8 real `.env` files tracked since 2026-04-09. [src: ecosystem-00 §1]
  - *Self-aware note:* hush's OWN `.gitignore` does not currently exclude `.env*` — a live dogfood gap.
- **`.env.example` is a SCHEMA, not a secret.** Placeholder values only (`sk-ant-...`, `e2b_...`). A
  secrets employee should *generate* per-repo `.env.example` from a schema, not inherit a stale
  superset (hush's own `.env.example` is a verbatim copy of energy's — the anti-pattern). [src: ecosystem-00 §5]
- **A `find . -name .env` CI gate is a cheap, effective last line of defense.** energy proves it works —
  it is the thing going red. [src: ecosystem-00 §2]
- **The MCP config file (`.mcp.json` / `claude_desktop_config.json`) is a first-class 2026 leak surface.**
  24,008 secrets leaked in MCP config files on public GitHub; 2,117 valid. Root cause: quickstart docs
  show keys hardcoded → devs copy the pattern. hush must scan these files specifically and NEVER write a
  real secret into one. [src: ecosystem-04 §0]

→ tested by [[BATTLE-TESTED-SCENARIOS]] S-01, S-14 · gotchas in [[KNOWN-PITFALLS]] P-01, P-02 · stance in [[OPINIONS]] O-01, O-02

## JOB 2 — Detect leaks (scanning: prevent, catch, verify)

Two distinct moments, two distinct tools. The load-bearing distinction is **prevent vs catch**.

- **PREVENT (pre-commit):** `gitleaks protect --staged` blocks BEFORE the secret enters history — the
  *only* place prevention is possible. Ship a `.pre-commit-config.yaml`. [src: ecosystem-03 §5; ecosystem-02 Tier-2]
- **CATCH (CI, history):** `gitleaks detect --source .` scans the WHOLE git history. energy's CI scans
  the **working tree only** — adding a history scan is the upgrade. [src: ecosystem-03 §5; ecosystem-00 §2]
- **VERIFY (CI, FP-free):** `trufflehog --only-verified` confirms a found credential is *still live*
  against the provider API → near-zero false positives in CI. 800+ detectors; scans git history + S3,
  Docker images, Slack, Jenkins, GCS, CI logs. [src: ecosystem-01 §5; ecosystem-03 §5]
- **The FP cure (mandatory):** scanners WILL false-positive on docs/fixtures (gitleaks
  `hashicorp-tf-password` fires on the literal `password = "password"`). Ship a **baseline/allowlist**
  (`.gitleaks.toml [allowlist]`, `--baseline-path`, or `gitleaks:allow` inline) + **entropy gating**.
  Steal the `.secrets.baseline` pattern from Yelp/detect-secrets. [src: ecosystem-05 §A1, §A4; ecosystem-02 Tier-2]
- **Coverage gaps to close:** scan **base64/encoded** payloads (a common evasion, gitleaks #807);
  **EXTEND** the upstream ruleset, never replace it (gitleaks #741/#596). [src: ecosystem-05 §A4]
- **The full stack that beats energy's regex grep:** entropy + history + verification + baseline.
  energy's CI is a `grep -rnE` with 10 hardcoded prefixes, no entropy, no history, no verification, no
  baseline. [src: ecosystem-00 §2]

→ tested by [[BATTLE-TESTED-SCENARIOS]] S-02, S-12, S-13 · gotchas in [[KNOWN-PITFALLS]] P-03, P-04, P-05 · stance in [[OPINIONS]] O-03

## JOB 3 — Remediate a leaked secret (rotate-first, scrub-second)

The single most important doctrine in the whole vertical. **Un-tracking ≠ remediation.**

- **The only true fix for a committed secret is ROTATE at the provider.** History keeps the old value
  forever; the secret is burned the moment it hits a remote. [src: ecosystem-00 §1; ecosystem-04 §0]
- **The false-greens (all of them):** `git rm --cached`, `sops updatekeys`, "un-tracking the files."
  Each turns CI green while the secret is still live and still in history. [src: ecosystem-00 §1; ecosystem-03 §2]
- **The chairman's verbatim three-step remediation model (this IS the playbook):**
  1. Rotate the live keys at the provider (the load-bearing fix).
  2. `git rm --cached` the real files (keeps local copies) + confirm `.gitignore` covers them + commit
     → future commits clean. (False-green ON ITS OWN.)
  3. Optional full scrub: authorize a `git filter-repo` history rewrite to purge old values (force-push).
  [src: ecosystem-00 §1]
- **History scrub is a HYGIENE step, NOT a security step.** `git-filter-repo` (pin v2.47.0; main is
  active despite the old release tag) purges the value from history but the secret was already burned.
  Always rotate first. [src: ecosystem-01 §6; ecosystem-02 §correction]

→ tested by [[BATTLE-TESTED-SCENARIOS]] S-01, S-02, S-13 · gotchas in [[KNOWN-PITFALLS]] P-06 · stance in [[OPINIONS]] O-04

## JOB 4 — Rotate cleanly without downtime (rotation is never atomic)

- **The universal atomic-safe pattern: ISSUE → DEPLOY → VERIFY → REVOKE.** Never overwrite-in-place for
  anything with live connections. There is ALWAYS a propagation window. [src: ecosystem-03 §6; ecosystem-05 §D1]
- **Dynamic secrets collapse rotation to "let the lease expire"** — the cleanest form. The credential's
  TTL *is* its rotation. [src: ecosystem-03 §1, §6]
- **AWS managed rotation does this via alternating users** (the `_clone` user, suffixed, same perms) →
  zero-downtime. Single-user rotation has a downtime window between `setSecret` and `finishSecret`.
  [src: ecosystem-05 §D1]
- **GCP "rotation" is notify-only** — it publishes a `SECRET_ROTATE` Pub/Sub message; YOU build the
  rotation function. "Rotation enabled" = "a reminder fires," not "it rotated." [src: ecosystem-01 §7; ecosystem-05 §D2]

→ tested by [[BATTLE-TESTED-SCENARIOS]] S-05, S-09, S-10 · gotchas in [[KNOWN-PITFALLS]] P-07, P-08 · stance in [[OPINIONS]] O-05

## JOB 5 — Issue dynamic, short-lived secrets (the ideal, where available)

- **OpenBao/Vault database engine** is the canonical flow: the DB password the app uses **never exists
  before it is needed and self-destructs on lease expiry.** [src: ecosystem-03 §1]
- **`rotate-root` is the killer move:** after configuring the engine, rotate the root credential so even
  *you* no longer know the master password — only OpenBao does. Make it mandatory in any dynamic-DB
  recipe. [src: ecosystem-03 §1]
- **Lease lifecycle:** `creation_statements` (SQL with `{{username}}`/`{{password}}`) + `default_ttl` +
  `max_ttl`; revocation is automatic on lease expiry. [src: ecosystem-03 §1]
- **Coverage reality:** dynamic = full in OpenBao/Vault; DB-rotation-only in Infisical; beta in Doppler;
  RDS-family in AWS; absent in GCP/1Password/SOPS. [src: ecosystem-06 matrix]

→ tested by [[BATTLE-TESTED-SCENARIOS]] S-07 · stance in [[OPINIONS]] O-06

## JOB 6 — Store secrets at rest in git (SOPS+age, GitOps only)

- **SOPS+age is the ONLY tool in the matrix that belongs in git** (encrypted at rest). It is the
  complement, never the replacement, for a runtime broker. No rotation engine, no dynamic secrets, no
  audit log, no access policy beyond "who holds a key." [src: ecosystem-06 verdicts; ecosystem-01 §4]
- **`.sops.yaml creation_rules` (path_regex) drive which key encrypts which path.** [src: ecosystem-03 §2]
- **TWO distinct rotation operations (a subtle, load-bearing distinction):**
  - `sops rotate` = generate a NEW data key + re-encrypt (use when a recipient key may be compromised).
  - `sops updatekeys` = re-encrypt the EXISTING data key to a changed recipient list (add/remove a
    person) — does NOT change the data key.
  - **`updatekeys` alone is a false-green** when someone leaves who *saw* the data — you must `rotate`
    AND rotate the underlying secret values. [src: ecosystem-03 §2]
- **Always list a break-glass second recipient** (e.g. a `kms:` AND an `age:` recipient) so a
  single-provider regression doesn't lock you out of your own secrets. [src: ecosystem-03 §2; ecosystem-05 §B1]
- **age key resolution:** `SOPS_AGE_KEY_FILE` / `SOPS_AGE_KEY`; default search
  `~/.config/sops/age/keys.txt` (Linux) / `~/Library/Application Support/sops/age/keys.txt` (macOS).
  [src: ecosystem-03 §2]
- **Live-link traps:** helm+secrets = `jkroepke/helm-secrets` (NOT archived zendesk); SOPS-on-K8s has
  TWO live operators (isindir, peak-scale) + ESO's `sops` provider. [src: ecosystem-02 Tier-1]

→ tested by [[BATTLE-TESTED-SCENARIOS]] S8, S9 · gotchas in [[KNOWN-PITFALLS]] P9, P10 · stance in [[OPINIONS]] O7

## JOB 7 — Give a secret to a MACHINE safely (machine-identity & response-wrapping)

- **The secret-zero problem:** how do you give a secret to a machine without that secret leaking? Two
  canonical answers:
  - **Vault/OpenBao AppRole + response-wrapping:** split into `role_id` (identifies the role; never
    commit it — store in CI secrets) + `secret_id` (the real secret; generate on-demand, never
    pre-generate/store). Deliver the `secret_id` as a **wrapped, single-use, short-TTL token** the app
    unwraps once. Knobs: `secret_id_num_uses=1`, `-wrap-ttl`. If intercepted, it's already-used
    (detectable) or expired. [src: ecosystem-03 §3]
  - **Secret-less workload identity (the stronger answer):** the agent gets a short-lived,
    cryptographically-verifiable identity tied to *what it is and where it runs* — no stored secret at
    all. Infisical ships **Cloud-Native (AWS/Azure/GCP), Kubernetes, OIDC, and SPIFFE (JWT-SVID from
    SPIRE)** auth. SPIFFE shipping in 2026 confirms workload-identity is mainstream, not bleeding-edge.
    [src: ecosystem-03 §4; ecosystem-04 §2]
- **HARD RULE: an agent authenticates as a machine identity scoped to ONE project/path — never a
  human's personal token.** Infisical Machine ID / 1Password Service Account / Vault AppRole-K8s-OIDC /
  Doppler Service Token. [src: ecosystem-04 §4]

→ tested by [[BATTLE-TESTED-SCENARIOS]] S10 · stance in [[OPINIONS]] O8

## JOB 8 — Front a credential BROKER for agents (return handles, not values)

This is the architectural shift hush must *embody*, not just describe.

- **The broker pattern in one sentence:** the agent never holds a long-lived static secret; it requests
  an action or a short-lived scoped credential from a broker that (a) decides per-request whether to
  release, (b) hands over the minimum (one-shot/short-TTL, not the master key), (c) audit-logs the
  handoff. [src: ecosystem-04 §2]
- **Two production references to copy:** 1Password **Credential Broker** (GA 2026-06-15 — releases
  secrets only when needed, keeps fewer copies, logs which agent/workflow asked for which credential
  when) and **Infisical Agent Vault** (credential proxy enforcing access controls at the agent level).
  [src: ecosystem-01 §7; ecosystem-04 §2]
- **HARD RULE: hush's own MCP/agent API returns REFERENCES/HANDLES, not raw secret values, by default.**
  A naive MCP server that returns `{"value":"sk-ant-..."}` has put the secret in the transcript, the
  logs, and possibly the next commit. [src: ecosystem-04 §1, §6]

→ tested by [[BATTLE-TESTED-SCENARIOS]] S10, S11 · stance in [[OPINIONS]] O8, O9

## JOB 9 — Inject secrets into running processes (env-var hygiene)

- **Env vars are NOT safe for secrets in production** (2026 consensus, incl. Doppler's own piece).
  Readable via `/proc/<PID>/environ`; **inherited by ALL child processes** (spreads to every subprocess
  the agent spawns); captured by crash dumps, error reporters, `printenv`. [src: ecosystem-04 §3]
- **Preference order:** broker/dynamic-at-runtime (in-memory only) > **0400 file-mount in `/run/secrets`
  tmpfs** (not in env, not inherited, not in `/proc/environ`) > just-in-time env via a `run`-wrapper
  (`doppler run --` / `infisical run --` / `op run --` / `vault agent`) > committed `.env` (the failure
  mode, NEVER). [src: ecosystem-04 §3]
- **The `run`-wrapper commands hush must know cold:** `doppler run -- <cmd>`, `infisical run -- <cmd>`,
  `op run -- <cmd>` (resolves `op://vault/item/field`), `sops exec-env file.enc.yaml '<cmd>'`,
  `sops exec-file ...`, `vault kv get` / `bao kv get`. [src: ecosystem-04 §4]

→ tested by [[BATTLE-TESTED-SCENARIOS]] S11 · gotchas in [[KNOWN-PITFALLS]] P11 · stance in [[OPINIONS]] O10

## JOB 10 — Inject secrets into Kubernetes (three patterns + the etcd trap)

- **Three Vault patterns + the neutral standard:**
  - **Sidecar Injector** → renders to shared-memory (tmpfs) volume → **NO K8s Secret object** (memory
    only). Highest security, highest Vault load. Use for top-value secrets.
  - **CSI Provider** → ephemeral CSI volume → files; can optionally sync to a K8s Secret/env. Balance.
  - **Vault Secrets Operator (VSO)** → CRD reconciles → **real K8s Secret**. Easiest adoption, lowest
    load. OK only if etcd encryption-at-rest is on.
  - **External Secrets Operator (ESO)** → vendor-neutral (Vault/AWS/GCP/1P/Infisical/Doppler) → real
    K8s Secret. The de-facto neutral standard. [src: ecosystem-04 §5]
- **THE TRAP: VSO/ESO/CSI-sync create a real K8s `Secret`, which is base64, NOT encrypted, unless etcd
  encryption-at-rest is enabled.** Only the Sidecar Injector keeps the secret out of etcd entirely.
  hush doctrine: prefer memory-only for top secrets; if ESO/VSO, *require* etcd encryption-at-rest as a
  precondition and say so loudly. [src: ecosystem-04 §5]
- **For OpenBao-on-K8s, the supported path is ESO** — the `openbao-secrets-operator` fork was archived
  2026-02-20 without ever cutting a release. [src: ecosystem-05 §C2]

→ tested by [[BATTLE-TESTED-SCENARIOS]] S9 · gotchas in [[KNOWN-PITFALLS]] P12 · stance in [[OPINIONS]] O11

## JOB 11 — Never leak through agent-specific channels (the under-discussed surfaces)

Agents leak through channels humans don't. All five must be closed.

1. **The context window / transcript** — an MCP tool returning a raw value puts it in conversation
   history (logged, cached, maybe trained). → return handles.
2. **Tool-call logs & traces** — observability captures tool args/returns. → redact secret-shaped
   strings; **strip URL query strings before logging** (`origin+pathname` only — browser-agent Rule 12).
3. **Prompt-injection → exfiltration** — a malicious page can instruct the agent to read a held secret
   and POST it (browser-agent Rule 2: extracted content is untrusted). → the *capability* to read a raw
   secret must not exist (broker pattern); egress-restrict secret-bearing agents.
4. **Error messages / stack traces** — secrets in env get dumped by crash reporters. → file-mount over env.
5. **The MCP config file** — a known 2026 leak surface. → scan it; never write a real secret into it.
[src: ecosystem-04 §6; ecosystem-00 §3]

→ tested by [[BATTLE-TESTED-SCENARIOS]] S11, S12 · stance in [[OPINIONS]] O9, O12

## JOB 12 — Choose the right tool / portfolio (no single winner)

- **It's a portfolio, not a tool.** Serious setups LAYER: SOPS+age (git) + OpenBao/Vault (runtime
  dynamic) + scanners (prevent/catch) + a broker (agents). Recommend the *layer*. [src: ecosystem-06 §1]
- **OSS-self-host default = OpenBao 2.5.4** (MPL-2.0, alive, Horizontal Read Scalability) over Vault 2.0
  (BUSL/IBM). [src: ecosystem-01 §1, §2]
- **Modern open-core + agent-native DX = Infisical** (MIT core ≠ EE). [src: ecosystem-01 §3; ecosystem-06]
- **The economic axis:** OSS trades dollars for ops-time; SaaS trades ops-time for per-seat/per-identity
  dollars. **In an agent-heavy fleet, per-identity billing (Infisical Cloud) is the line item to
  watch** (many machine IDs). [src: ecosystem-06 §2]
- The full decision tree and the honest best-for/worst-for verdicts live in [[TOOL-MATRIX]] and
  [[GAPS-AND-DISPUTES]] (pricing is disputed — never quote a single number).

→ full matrix in [[TOOL-MATRIX]] · disputes in [[GAPS-AND-DISPUTES]] G1, G2

---

## Cross-cutting masteries (apply to every job above)

- **Never log a secret; strip URL query strings before logging** (browser-agent Rule 12). [src: ecosystem-00 §3]
- **Validate secret names/keys used in file/store paths** (`/^[a-zA-Z0-9_-]+$/` + `path.resolve`
  startsWith) — path-traversal guard (browser-agent Rule 9). [src: ecosystem-00 §3]
- **Pin tool versions; test after every bump** — SOPS can break ONE KMS provider on a point-release
  while others work. Prefer checksummed binaries over `curl | sh` (trufflehog #4750). [src: ecosystem-05 §A3, §B1]
- **The Vault 2.0.2 container gotcha:** `cap_ipc_lock` removed at build → set `disable_mlock = true` +
  disable swap. Most likely "my Vault container broke after upgrade" of mid-2026. [src: ecosystem-01 §1]
- **Vault 2.0 hardening:** `sys/generate-root`, `sys/rekey`, DR `generate-operation-token` are now
  AUTHENTICATED by default — NEVER re-enable `enable_unauthenticated_access`. [src: ecosystem-01 §1]

---

## How a fresh session should USE this map

1. Read this file top-to-bottom once (the thesis + capability ladder + 12 jobs).
2. For a concrete task, jump to the matching JOB, then follow its `→ tested by / gotchas / stance` links
   into [[BATTLE-TESTED-SCENARIOS]], [[KNOWN-PITFALLS]], [[OPINIONS]].
3. For "which tool," go to [[TOOL-MATRIX]]; for "is this contested," check [[GAPS-AND-DISPUTES]] BEFORE
   asserting.
4. The raw immutable evidence is in `brain/research/raw/ecosystem-0X-*.md` — cite by `§` when challenged.
