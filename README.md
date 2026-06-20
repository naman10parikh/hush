# hush

> **Issued, never leaked. Rotated, then proven.** Powered by Energy.

**hush** is the Energy fleet's secrets-management employee. It keeps secrets out of git, out of your
logs, and out of your agents' context — and when one leaks, it tells you the *real* fix: rotate first,
prove it, then scrub. It is a recursively self-improving, agent-native harness built on the Energy
harness formula, consumed by coding agents via a **CLI** and an **MCP** server, with a local cockpit
for human review.

## What hush is

- A **secrets domain expert**: it issues, stores, scans, rotates, scrubs, injects, and brokers secrets,
  and prevents agents from leaking them — across 12 jobs (see `brain/EXPERTISE-MAP.md`).
- **Opinionated, not a tool-wrapper**: it argues from real 2026 incidents (the energy `.env` leak; the
  agent-leak wave — 24,008 secrets in MCP config files) and cites its doctrine by anchor.
- **Handles-not-values by construction**: every command and MCP tool returns a handle or a verdict,
  never a raw secret value.

## What hush refuses

- **Auth / sign-in / sessions / identity** — that's `badge`'s job. hush *consumes* a machine identity,
  never owns one.
- **Returning a raw secret value** to any agent surface — a leak by construction.
- **Calling a leak "remediated" after un-tracking** (`git rm --cached`, `sops updatekeys`-only) — these
  are false-greens; the secret stays live until rotation is *proven*.
- **Quoting a single secrets-tool price as fact** — it recommends the portfolio/layer, not a brand.

## CLI quick-reference

```text
hush scan [path] [--staged] [--history] [--verify] [--mcp-config] [--json]   # the scanning stack; exit 1 on any finding
hush doctor [--json]            # report the secret-manager wiring of this repo
hush advise "<situation>"       # verdict + correct doctrine; flags false-greens
hush remediate <finding|file>   # ordered rotate-first plan (consent-gated scrub)
hush rotate-plan <secret-ref>   # ISSUE → DEPLOY → VERIFY → REVOKE plan
hush init [--scanner|--sops|--gitignore|--env-example]   # scaffold what hush ships
hush env-example [path] [--write]   # generate .env.example from the real var schema
hush broker <name> [--ttl] [--wrap]  # return a handle/short-TTL reference, never a value
hush inject -- <cmd>            # run a child with secrets injected via file-mount, never committed .env
hush tool <job>                 # recommend the portfolio/layer for a job (never a single price)
hush runs [--view]              # show the runs.jsonl observability log
hush --help | --version
```

## The acceptance bar

`hush scan` on a repo with a planted dummy key flags it (nonzero exit) and `hush doctor` reports that
repo's secret-manager wiring — green in CI, $0 and offline. See `PLAN.md` §5.

## Layout

`identity/` (SOUL/BRAND/HEARTBEAT) · `brain/` (the secrets doctrine — 6 files) · `bin/hush` + `src/`
(CLI) · `skills/` · `.claude/` (hooks, sub-agents) · `.mcp.json` + `src/mcp` (MCP server) · `eval/`
(golden tasks) · `cockpit/` (the local web view). Agent guide: `AGENTS.md`. Operating spine: `CLAUDE.md`.
