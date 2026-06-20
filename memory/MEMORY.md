# hush — Long-Term Memory (bootstrap index)

> The ≤2,000-token bootstrap loaded every cycle. Critical facts only. The deep, queryable doctrine
> lives in `brain/**.md`; search it with `bash scripts/memory-search.sh "<query>"` (BM25, cites the
> brain anchor). This index is the spine; the brain is the encyclopedia.

## The one belief everything descends from

> **A leaked secret is not the failure. An un-rotated leak is.** (brain `O-04`)

GitGuardian 2026: 64% of valid secrets first leaked in 2022 are *still* un-revoked. hush sells
**remediation governance** — rotate, then *prove* rotation — not "scanning."

## HARD invariants (never violated)

- **Handles, not values.** Every CLI command + MCP tool returns a handle or a verdict, never a raw
  secret value (`O-09`, `P-16`). A secret-shaped string in any return/log/transcript = automatic fail.
- **The badge boundary.** hush owns the SECRET; **badge** owns the IDENTITY (`O-15`). Auth / sign-in /
  sessions / OAuth user-login → badge. hush *consumes* a machine identity, never owns one.
- **Never log a secret; strip URL query strings before logging** (`O-12`, `P-17`).

## The capability ladder (the spine of every decision)

Releasing a secret to a consumer (esp. an agent):

```
broker > dynamic-short-lived > rotated-static > raw-static
```

Injecting a secret into a process:

```
broker/dynamic-at-runtime > 0400 file-mount in tmpfs > run-wrapper env > committed .env (NEVER)
```

## The 12 jobs (hush's whole surface — full leaves in `brain/EXPERTISE-MAP.md`)

1. **Keep out of git** — `.gitignore .env*` + `!.env.example`; *generate* `.env.example`; scan `.mcp.json`. (`S-01`/`S-14`)
2. **Detect leaks** — prevent (`gitleaks protect --staged`) · catch (`gitleaks detect` history) · verify (`trufflehog --only-verified`). (`O-03`)
3. **Remediate** — ROTATE-first, scrub-second; reject false-greens. (`O-04`)
4. **Rotate no-downtime** — ISSUE→DEPLOY→VERIFY→REVOKE; alternating-users; GCP notify-only. (`O-05`/`P-07`)
5. **Dynamic short-lived** — `database/creds/<role>`; `rotate-root` mandatory; TTL = rotation. (`O-06`/`S-07`)
6. **At-rest in git** — SOPS+age (GitOps only); break-glass 2nd recipient; `rotate` ≠ `updatekeys`. (`O-07`/`S-04`)
7. **Machine secret-zero** — scoped machine identity (SPIFFE > AppRole-wrap > token > human-token NEVER). (`O-08`/`S-06`)
8. **Broker for agents** — return handles not values; audit the handoff. (`O-09`/`S-08`)
9. **Inject into process** — file-mount 0400/tmpfs > run-wrapper > env > committed `.env` (NEVER). (`O-10`/`P-11`)
10. **K8s injection** — memory-only sidecar for top secrets; operator ⇒ require etcd-at-rest (base64 ≠ encrypted). (`O-11`/`P-12`)
11. **Close 5 agent-channel leaks** — context · logs · prompt-injection · errors · MCP-config. (`O-12`/`P-17`)
12. **Choose the portfolio** — recommend the *layer*, never one brand, never a single price. (`O-13`/`G-01`)

## The false-green family (block the green until rotation is proven)

`git rm --cached` (`P-06`) · `sops updatekeys`-only after a teammate leaves (`P-09`) · "removed in a
later commit" · GCP "rotation enabled" (it's **notify-only** — you build the rotation fn) (`P-08`).

## Provider defaults (OSS-self-host bias) + pins

| Layer | Default (wired) | Pin |
| --- | --- | --- |
| Pre-commit prevent + CI catch | gitleaks (`protect --staged` + `detect`) | `8.30.1` |
| CI verify (still-live proof) | trufflehog (`--only-verified`) | `3.95.5` |
| At-rest in git | SOPS + age | `3.13.1` / `1.3.1` |
| Runtime broker (self-host) | OpenBao (MPL-2.0, alive) | `2.5.4` |
| History scrub (after rotation only) | git-filter-repo | `2.47.0` |

**Pin + test after every bump** (`O-14`); checksummed binaries over `curl | sh` (`P-05`). Alts
(Vault / Infisical / Doppler / 1Password / AWS-GCP SM) are documented-not-wired (`brain/TOOL-MATRIX.md`).

## Version-pinned gotchas to check before asserting

- **Vault ≥ 2.0.2 in containers** can't `mlock()` → set `disable_mlock=true` AND disable swap (`P-13`).
- **SOPS v3.9.2 / Azure KV** decrypt regression — one point-release breaks one backend; pin + test the
  *specific* backend (`P-10`); always keep a break-glass 2nd recipient.
- **OpenBao "drop-in for Vault"** only at the **1.14 baseline** — post-1.14/Enterprise has no guarantee (`P-15`).
- **Scanner FP** on `password = "password"` (gitleaks `hashicorp-tf-password`) → ship a `.gitleaks.toml`
  baseline + entropy gating; **extend, don't replace** the ruleset (`P-03`).
- **Don't trust a scanner's line number** for auto-surgery (`P-04`); the real fix is rotation.

## The 6 doctrine brain files (cite the anchor, don't vibe)

- `brain/EXPERTISE-MAP.md` — the 12 jobs, organized by JTBD (the master map).
- `brain/OPINIONS.md` — the `O-NN` taste stances (always X / never Y, because Z).
- `brain/KNOWN-PITFALLS.md` — the `P-NN` version-pinned gotchas + detect/avoid.
- `brain/BATTLE-TESTED-SCENARIOS.md` — the `S-NN` failure scenarios (the golden-task source).
- `brain/TOOL-MATRIX.md` — tool-by-tool: default vs alts, agent-access surface, pins.
- `brain/GAPS-AND-DISPUTES.md` — the `G-NN` contested/unknown items (refuse to assert these).

## Dogfood (hush obeys JOB 1 on its own repo)

`.gitignore` ignores `.env*` + keeps `!.env.example`; `.env.example` generated from the real schema;
`.mcp.json` uses `${VAR}` refs, no literal secret (`P-01`/`P-02`/`P-16`).

## Operating context

Always Opus 4.8 (`claude-opus-4-8[1m]`), max effort; budget is a no-op (chairman D14). RSI loop runs
$0/tokenless now (version-drift + brain-pin + eval checks); the Claude half is deferred to
`CLAUDE_CODE_OAUTH_TOKEN` (D8) — its absence is not a gap.
