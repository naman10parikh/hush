---
name: sops-age-gitops
description: Encrypt secrets at-rest in git with SOPS+age for GitOps (Flux/Argo) — as a COMPLEMENT to a runtime broker, never a replacement. Always list a break-glass second recipient; distinguish sops rotate from sops updatekeys; pin SOPS and test-decrypt per backend after a bump.
trigger: When asked to encrypt secrets in git, set up SOPS, do GitOps secrets (Flux/Argo), handle a teammate leaving a SOPS repo, or debug "SOPS can't decrypt after a version bump".
---

# SOPS + age for GitOps — Complement, With a Break-Glass Recipient

> **The stance:** SOPS+age is the *only* tool that belongs in git (encrypted at rest) — but it has **no
> rotation engine, no dynamic secrets, no audit log, no access policy** beyond "who holds a key." It
> **pairs with** a runtime broker (OpenBao/Vault); it does not stand in for one. Source of truth:
> `brain/OPINIONS.md` **O-07**, `brain/BATTLE-TESTED-SCENARIOS.md` **S-04 / S-05**,
> `brain/KNOWN-PITFALLS.md` **P-09 / P-10**. Pinned: **SOPS 3.13.1 + age 1.3.1**.

## When to use

Secrets must live in git (GitOps: Flux/Argo reconcile from the repo), OR a SOPS repo needs a recipient
change (teammate leaves), OR SOPS suddenly can't decrypt after an upgrade.

## The load-bearing rules

- **ALWAYS list a break-glass SECOND recipient.** Put an `age:` key alongside the `kms:` key via
  `.sops.yaml` `path_regex`. SOPS can break **one** KMS provider on a point-release (v3.9.2 couldn't
  decrypt Azure KeyVault while other backends worked — #1695). A single-recipient `.sops.yaml` is a
  self-inflicted single point of failure: if that one backend regresses, you're locked out of your own
  secrets. The break-glass age key lets you decrypt anyway (S-04 rewards it existing *before* the
  incident). (O-07, P-10)
- **`sops rotate` ≠ `sops updatekeys`.** `updatekeys` re-encrypts the *existing* data key to a new
  recipient list — the secret **values are unchanged**. `rotate` generates a **new data key**. After a
  teammate leaves: `updatekeys` (drop their recipient) **AND** `sops rotate` (new data key) **AND**
  rotate the underlying secret **values** at their providers. `updatekeys`-only is a false-green — they
  already saw the values. (P-09, S-05)
- **Pin SOPS; test-decrypt the SPECIFIC backend after any bump** before rolling out. age-plugin
  recipients (YubiKey/TPM `age1yubikey…`) lag SOPS validation (#1103) — pin a known-good
  SOPS+age+plugin triple. (P-10, O-14)

## Steps

1. **Keygen + break-glass** — `age-keygen -o ~/.config/sops/age/keys.txt`; add a SECOND age recipient
   for break-glass. `hush init --sops` does this (no provider account needed — SEC-1).
2. **`.sops.yaml`** — `creation_rules` with `path_regex` mapping secret files to **≥2 recipients**
   (`kms:` + the break-glass `age:`), so a single-backend regression doesn't lock you out.
3. **Encrypt / GitOps wire** — `sops -e -i secrets.enc.yaml`; for runtime use `sops exec-env` /
   `exec-file`; for Flux/Argo wire the SOPS decryption provider.
4. **Lifecycle** — recipient change → `updatekeys`; key compromise → `rotate` + rotate values; never
   `updatekeys`-only.

## Output format

A `.sops.yaml` (≥2 recipients incl. break-glass), an encrypted file, and — for a teammate-leaves event —
the three-part plan (`updatekeys` + `rotate` + rotate-values). Verify: `.sops.yaml` lists ≥2 recipients;
decrypt works via the break-glass age identity (S-04 success criterion).

## Anti-patterns (refuse these)

- "Use SOPS as your secrets manager" — it's a file-encryptor, not a broker; pair it with a runtime store. (O-07)
- A single-recipient `.sops.yaml` (no break-glass) — one KMS regression locks you out. (P-10, S-04)
- `updatekeys` alone after a teammate leaves — values unchanged = false-green. (P-09, S-05)
- Bumping SOPS without testing decrypt against your actual KMS backend. (P-10)
