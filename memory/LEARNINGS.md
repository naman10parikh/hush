# hush — LEARNINGS (append-only)

Every error → root cause → rule. Auto-compressed when >500 lines (memory-compress.sh).

## 2026-10-19 · CP158 standard pass

- **A fake Stripe-shaped fixture tripped every history scan.** `src/lib/redact.test.ts` held a bare
  `sk_live_…` literal. Rule: a secret-shaped test fixture carries a DUMMY marker (the repo's `.gitleaks.toml`
  allowlists it); a copy already in history is fingerprinted in `.gitleaksignore`, because history is never
  rewritten.
- **`npx -p github:…` had nothing to run.** `dist/` is gitignored and there was no `prepare` script, so a git
  install stopped at "run `pnpm build` first". Rule: a package that builds `dist/` needs `"prepare": "tsc"`.
- **The secret-scan gate failed open through a symlink.** It compared `import.meta.url` (Node's real path)
  with the unresolved `argv[1]`, so started through a symlinked directory it skipped `main()` and allowed
  everything. Rule: resolve `argv[1]` with `realpathSync` before that comparison.
- **The sub-agents' tool limits were never applied.** `allowed-tools` is a skill field that sub-agents ignore.
  Rule: a sub-agent restricts tools with `tools:`.
- **The nightly loop could never propose.** On the runner `gh release view` had no token, so all six tools
  were "unreachable" and drift was always 0. Rule: give the step `GH_TOKEN`, and upload `workflows/proposals/`
  as an artifact, because the runner is thrown away.
- **The docs promised an E2B run that no code made.** Rule: `sandbox/run-in-sandbox.mjs` boots the template
  with `Sandbox.create` only on `--boot` (a billed call), and `.dockerignore` keeps `.env` out of every image.
- **Open: a locally installed gitleaks fails the clean-repo control.** hush runs gitleaks with its default
  rules on a repo that has no `.gitleaks.toml`, so the clean fixture's decoys are flagged and eval GT-3 fails.
  CI has no gitleaks binary and passes. Decide whether hush should fall back to its own baseline config.
- **Resolved: the clean-repo control with a local gitleaks.** A scan now passes hush's baseline with `-c` when
  the repository has no gitleaks config of its own. The baseline itself also missed the decoys: gitleaks matches
  allowlist regexes against the secret, and for `hashicorp-tf-password` that is the quoted value (`"password"`),
  not the line. Rule: test an allowlist regex against the secret gitleaks reports, and keep one baseline
  (`GITLEAKS_BASELINE_TOML`, also what `hush init --scanner` writes).
