---
name: scanner-stack-setup
description: Set up the LAYERED secret-scanning stack — gitleaks (prevent + catch) AND trufflehog (verify), with a baseline/entropy allowlist so false positives don't kill the scanner, plus a .mcp.json + base64 scan. They are not alternatives; run both.
trigger: When setting up secret scanning, a pre-commit hook, a CI secret check, or fixing a scanner that drowns the team in false positives on test fixtures / docs.
---

# Scanner Stack Setup — Both Tools, Baselined, Pinned

> **The stance:** run **BOTH gitleaks AND trufflehog** — they cover different moments, not the same
> one. Source of truth: `brain/OPINIONS.md` **O-03**, `brain/BATTLE-TESTED-SCENARIOS.md` **S-12**,
> `brain/KNOWN-PITFALLS.md` **P-03 / P-05**. Pinned versions (brain TOOL-MATRIX, `gh release`
> 2026-06-16): **gitleaks 8.30.1 · trufflehog 3.95.5**.

## When to use

A repo needs secret scanning, OR an existing scanner is red on `password = "password"` in fixtures/docs
(the #1302 false-positive storm) and the team is about to disable it.

## The two layers (O-03 — both, not one)

- **gitleaks `protect --staged`** = the **PREVENTION** layer — blocks in milliseconds *before* a secret
  enters history. This is the only place prevention is possible (pre-commit).
- **gitleaks `detect`** (full **history**, in CI) + **trufflehog `--only-verified`** = the
  **DETECTION-WITH-PROOF** layer — `detect` scans history (not just the working tree — energy's CI gap);
  trufflehog confirms a found cred is *still live* against the provider API → near-zero false positives.
- Also scan the **`.mcp.json` / `claude_desktop_config.json`** specifically (the 2026 leak surface,
  P-16) and **base64-encoded** payloads (a common evasion, #807).

Picking one tool leaves half the surface open. hush's own `hush scan` is layered the same way (builtin
offline scanner + gitleaks + trufflehog when present — `src/scanners/index.ts`), so the acceptance test
stays $0/offline even when the binaries are absent.

## Steps

1. **Pre-commit** — install gitleaks `8.30.1` as a `.pre-commit-config.yaml` hook running
   `gitleaks protect --staged`. `hush init --scanner` writes this.
2. **CI catch + verify** — a workflow that runs `gitleaks detect --source . --redact` over **history**
   AND `trufflehog git file://. --only-verified`. Both, in parallel.
3. **Baseline / allowlist (REQUIRED — or FP fatigue kills it)** — ship a `.gitleaks.toml [allowlist]`
   that suppresses dummy/example/test values **without** hiding real keys (S-12: no-FN AND no-FP).
   Keep **entropy gating** on so low-entropy literals (`password`) don't fire. **EXTEND** the upstream
   ruleset (`[extend] useDefault = true`), never replace it (#741/#596). `hush init --scanner` generates
   a tuned baseline; tune the entropy threshold against a fixture corpus until both directions are green.
4. **Pin + checksum** — pin gitleaks `8.30.1` / trufflehog `3.95.5` and install a **checksummed binary**,
   never `curl | sh` (the trufflehog install script broke for 3.93.4 — P-05).

## Output format

A `.pre-commit-config.yaml` + `.gitleaks.toml` (extends-default + allowlist + entropy) + a CI workflow,
all version-pinned. Verify: `hush scan <fixture-with-real-key>` → exit 1; `hush scan <fixture-with-only-
password="password">` → exit 0 (S-12 success criterion: both directions).

## Anti-patterns (refuse these)

- "A secret scanner" (singular) — or grepping a handful of hardcoded prefixes (no entropy, no history,
  no verification). A real layered stack beats it on every axis. (O-03)
- Disabling the scanner or `--exclude`-ing whole directories to silence FPs (also hides real findings) —
  use a baseline + entropy instead. (S-12)
- `curl | sh` installs / "always run latest" for secrets tooling — pin and checksum. (P-05, O-14)
