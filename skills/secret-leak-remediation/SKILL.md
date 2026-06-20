---
name: secret-leak-remediation
description: Remediate a committed/leaked secret the RIGHT way — rotate first, scrub second. Refuses the false-greens (git rm --cached, sops updatekeys-only, "removed in a later commit") that turn CI green while the key stays live.
trigger: When a key/secret was committed, found in git history, pushed to a remote, or CI is red on a leaked secret — and someone is about to "fix" it by deleting the file or rewriting history.
---

# Secret-Leak Remediation — Rotate First, Scrub Second

> **The one belief:** *a leaked secret is not the failure; an un-rotated leak is.* The moment a secret
> hits a remote it is **burned** — a history rewrite is hygiene, not security. Source of truth:
> `brain/OPINIONS.md` **O-04**, `brain/KNOWN-PITFALLS.md` **P-06**, `brain/BATTLE-TESTED-SCENARIOS.md`
> **S-01 / S-02**. GitGuardian 2026: **64% of valid secrets first leaked in 2022 are STILL un-revoked.**

## When to use

A secret is in the repo (working tree or history): a scanner / CI flagged it, a teammate pushed a
`.env`, or you found an old key in `git log`. The reflex — `git rm --cached` and watch CI go green — is
**the most dangerous outcome**: it ships a live secret behind a checkmark.

## The three FALSE-GREENS hush refuses (each looks fixed, isn't)

1. **`git rm --cached` / un-track / "deleted the file"** — value stays in history; was already burned on push. (O-04, P-06)
2. **`sops updatekeys`-only after a teammate leaves** — re-encrypts the *existing* data key; the secret *values* are unchanged and the departed person already saw them. (P-09, S-05)
3. **"It was removed in a later commit, we're fine"** — history is forever; the key may already be in use. (S-02)

Mirror in code: `hush advise "<situation>"` returns `verdict:"false-green"` for any of these (`src/lib/false-green.ts`).

## Steps (the order is NON-NEGOTIABLE)

1. **ROTATE at the provider FIRST** — the load-bearing fix. Issue a new credential, deploy it, then
   invalidate the old one at the provider so the leaked value *fails against the provider API*. This is
   the only step that un-exposes the secret. Run `hush rotate-plan <secret-ref>` for the
   ISSUE→DEPLOY→VERIFY→REVOKE sequence (alternating-users for live connections — O-05).
2. **PROVE rotation** — confirm the old value is dead (it returns 401/403 at the provider). hush blocks
   the green until rotation is *proven*, not assumed. "I rotated it" without proof is not done.
3. **Scrub the working tree** — `git rm --cached <file>` + add `.env*` to `.gitignore` (keep
   `!.env.example`) + commit. Future commits clean. (S-01 success criterion b/c)
4. **(Optional, EXPLICIT human consent) Scrub history** — `git filter-repo` to purge the value from
   history, then force-push. **Never** auto-run this off a scanner's reported line number — trufflehog
   line attribution is wrong for some detectors (P-04, S-13). `hush remediate` emits the plan with
   `consent_required_for_scrub:true` and never rewrites history autonomously.

## Output format

An ordered remediation plan: `[rotate → prove → git rm --cached + .gitignore → (consent) filter-repo]`,
each step with the exact command, and an explicit `false_green` flag if the user proposed a shortcut.
Use `hush remediate <finding> --json` for the machine-readable plan; `hush advise "<move>" --json` for a
single verdict. Success criterion (S-01): every leaked key rotated (old value fails) + nothing tracked
+ `.gitignore` covers `.env*`+`!.env.example` + history scan finds zero copies.

## Anti-patterns (refuse these)

- Calling un-tracking / `updatekeys`-only / "removed later" a remediation. (O-04, P-06, P-09)
- `git filter-repo` BEFORE rotation, or without explicit consent, or off an unverified line number. (P-04, S-13)
- Editing the reported code line as "the fix" — rotation is the fix, not a code edit.
