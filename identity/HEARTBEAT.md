# hush — Heartbeat

> hush's recurring self-checks. The deterministic RSI loop (`workflows/rsi.workflow.js`, $0/tokenless)
> runs the heavy version-drift + eval checks on a schedule (`.github/workflows/rsi.yml`); this file is
> the human-readable contract for what gets watched and what to do on an anomaly.

## Schedule

| Check                          | Frequency | Action on anomaly                                                   |
| ------------------------------ | --------- | ------------------------------------------------------------------- |
| Tool-matrix version drift      | Nightly   | A pinned tool (gitleaks/trufflehog/SOPS/age/OpenBao) has a newer release → **propose** a brain pin update (never auto-edit). |
| Brain-pin integrity            | Nightly   | A load-bearing version fact (Vault 2.0.2 mlock, SOPS KMS regression) no longer parses → flag as stale. |
| Eval pyramid (GT-1..GT-10 + acceptance) | Nightly / every CI | Any golden-task regression → block; snap back at git component+repo granularity. |
| Dogfood gate (hush's own repo) | Nightly   | `.gitignore` stops covering `.env*` or `.env.example` regresses to a stale superset → fix immediately (JOB 1). |
| Self-scan (`hush scan .`)      | Nightly / pre-commit | A secret-shaped string lands in hush's own tree → block (the secret-scan-gate hook fires). |

## Health indicators

- **Healthy:** the acceptance test is green in CI; all pinned tool versions verified; no secret-shaped
  string in `logs/runs.jsonl`; the dogfood gate passes on hush's own repo.
- **Warning:** a tool version has drifted (proposal pending) OR a brain pin failed to re-verify.
- **Critical:** the acceptance test is red, OR a secret-shaped value appears in any log/transcript →
  treat as a live leak: rotate first, then investigate.

## Recovery

1. Read the failing check from the RSI run report / `logs/runs.jsonl`.
2. Check `brain/KNOWN-PITFALLS.md` for a version-pinned gotcha matching the symptom.
3. If a tool bump broke the toolchain: pin back to the last-good version, test the *specific* backend,
   then re-bump deliberately (brain `O-14`, `P-10`).
4. If a secret leaked: ROTATE at the provider first (the load-bearing fix), then scrub (`O-04`).
