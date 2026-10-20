# hush

<!-- fleet:header:start -->
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE) [![Agent-native](https://img.shields.io/badge/agent--native-yes-2f5d8a?style=flat-square)](AGENTS.md) [![MCP server](https://img.shields.io/badge/MCP-server-1e3f60?style=flat-square)](#use-it-from-any-coding-agent) [![Skills](https://img.shields.io/badge/skills-5-2f6b4f?style=flat-square)](skills/)

**Secrets that never reach the model: encrypted, scanned, brokered.**

Hush is an agent-native, recursively self-improving agent employee whose job is secrets. Coding agents use it through its skills, its MCP server and its command line. It improves itself through its own evals and a scheduled improvement loop, and a person reviews every change.

[AGENTS.md](AGENTS.md) · [llms.txt](llms.txt) · [Skills](skills/) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [All projects](https://github.com/naman10parikh)
<!-- fleet:header:end -->

hush keeps secrets out of git, out of logs and out of an agent's context, and when one leaks it gives the real
fix: rotate the key at the provider first, prove it, then scrub. It is for coding agents (Claude Code, Codex,
Cursor and others) and for the people who run them; every tool returns a handle or a verdict, never a raw secret.

<!-- fleet:use:start -->
## Use it from any coding agent

**Claude Code**: the plugin brings the skills, sub-agents, hooks and MCP server.

```
/plugin marketplace add naman10parikh/hush
/plugin install hush@hush
```

**Its MCP server**, in any MCP client:

```bash
claude mcp add --transport stdio hush -- npx -y -p github:naman10parikh/hush hush-mcp
codex mcp add hush -- npx -y -p github:naman10parikh/hush hush-mcp
```

Cursor (`.cursor/mcp.json`), Gemini CLI (`.gemini/settings.json`) and most other clients take the same command as JSON:

```json
{
  "mcpServers": {
    "hush": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "github:naman10parikh/hush",
        "hush-mcp"
      ]
    }
  }
}
```

**Gemini CLI**: the extension brings the context and the MCP server.

```bash
gemini extensions install https://github.com/naman10parikh/hush
```

**One skill** (5 in all, in [skills/](skills/)), in any agent that reads Agent Skills:

```bash
gemini skills install https://github.com/naman10parikh/hush --path skills/secret-leak-remediation
git clone --depth 1 https://github.com/naman10parikh/hush /tmp/hush && cp -r /tmp/hush/skills/secret-leak-remediation ~/.claude/skills/
```

**The command line:**

```bash
npx -y -p github:naman10parikh/hush hush --help
```

Codex, Cursor, OpenCode, GitHub Copilot and other agents read [AGENTS.md](AGENTS.md); Claude Code reads [CLAUDE.md](CLAUDE.md) and Gemini CLI reads [GEMINI.md](GEMINI.md), which import it. [llms.txt](llms.txt) maps every surface for agents that read first.
<!-- fleet:use:end -->

## Quick start

No clone needed: npm builds hush from GitHub on first use.

```bash
npx -y -p github:naman10parikh/hush hush --help
npx -y -p github:naman10parikh/hush hush advise "I ran git rm --cached on the leaked .env, are we fixed?"
```

The second command answers `verdict: false-green`: un-tracking a file leaves the key live in history, so the
fix is to rotate it first.

In a clone, the acceptance test plants a fake key in a throwaway repository, checks that `hush scan` flags it
and that a clean repository passes, three times, offline:

```bash
pnpm install && pnpm build && bash sandbox/run-acceptance.sh
```

It ends with `ACCEPTANCE PASS`.

## How it works

**The one rule.** Every CLI command and MCP tool returns a handle (`hush://store/<name>`), a verdict or a
redacted finding, never a value. When a process needs the value, `hush inject` hands it to the child process,
so it never enters the model's context, a log or a commit.

**What it refuses.** Auth, sign-in and identity belong to badge; hush uses a machine identity and never owns
one. It will not call a leak fixed after `git rm --cached` or `sops updatekeys` alone, and it will not quote one
tool's price as fact; it recommends a layered setup instead.

**The commands** (each takes `--json`; a finding exits nonzero):

```text
hush scan [path] [--staged] [--history] [--verify] [--mcp-config]   # the scanning stack
hush doctor                       # how well this repository keeps its secrets
hush advise "<situation>"         # verdict and doctrine; flags false-greens
hush remediate <finding|file>     # ordered rotate-first plan; the scrub needs consent
hush rotate-plan <secret-ref>     # issue, deploy, verify, revoke
hush init [--scanner|--sops|--gitignore|--env-example]   # scaffold the setup hush recommends
hush env-example [path] [--write] # .env.example from the variables the code reads
hush broker <name> [--ttl]        # a short-lived handle, never a value
hush inject -- <cmd>              # run a child process with secrets through a file mount
hush tool <job>                   # the layer to use for a job
hush runs [--view]                # the redacted run log
```

**The guard.** A PreToolUse hook (`.claude/hooks/secret-scan-gate.js`) blocks a secret-shaped string before it
enters a command or a file, and a literal secret written into `.mcp.json`.

**The brain.** Six files in [brain/](brain/) hold the judgment: the 12 jobs, the stances, version-pinned
pitfalls, real incidents (the golden tasks), the tool matrix and the open disputes. Query it with
`bash scripts/memory-search.sh "<question>"`.

**Isolation.** CI runs the acceptance test on a fresh runner. `node sandbox/run-in-sandbox.mjs --boot` runs it
in an E2B microVM built from `sandbox/Dockerfile`; that is a billed call, so it only happens on that flag.

<!-- fleet:anatomy:start -->
## What it is made of

Every project in this fleet is graded on the same 11 harness components and on self-improvement. Each mark is backed by a file you can open.

| Component | Grade | Where |
| --- | --- | --- |
| Identity | ✅ | identity/SOUL.md:8 + identity/BRAND.md:5 |
| Memory | ✅ | memory/MEMORY.md:1 + scripts/memory-search.sh:1 |
| Skills | ✅ | skills/secret-leak-remediation/SKILL.md:1 |
| Tools/CLIs | ✅ | package.json:6 + src/cli/index.ts:1 |
| Hooks | ✅ | .claude/settings.json:4 + hooks/hooks.json:4 |
| Sub-agents | ✅ | .claude/agents/hush-remediation-planner.md:1 |
| MCPs | ✅ | src/mcp/tools.ts:44 + bin/hush-mcp:1 |
| Dispatch | ✅ | src/dispatch/route.ts:159 + .github/workflows/rsi.yml:11 |
| Evals | ✅ | eval/run.mjs:1 + .github/workflows/acceptance.yml:47 |
| Observability | ✅ | src/lib/runlog.ts:51 |
| Sandbox/Infra | ✅ | sandbox/run-in-sandbox.mjs:22 |
| RSI / open-endedness | ✅ | dsip.json:1 + .github/workflows/rsi.yml:56 |

✅ real and tested · 🟡 partial, with the reason in the row · ❌ absent
<!-- fleet:anatomy:end -->

<!-- fleet:footer:start -->
## How it improves itself

It carries its own evals and a self-improvement contract, [`dsip.json`](dsip.json) (level L2). A scheduled loop runs the evals, tries a change in a sandbox and opens it for review. A change that lowers a score is not merged, and a person merges every change. Lessons it learns are kept as rules in its memory files.

## Part of a fleet

One of the agent-native, recursively self-improving open-source projects by [Naman Parikh](https://github.com/naman10parikh). Each one is an agent employee that owns one part of an agent's harness or of the product around it.

Siblings: [agentdial](https://github.com/naman10parikh/agentdial) (identity) · [wikimem](https://github.com/naman10parikh/wikimem) (memory) · [skillsmith](https://github.com/naman10parikh/skillsmith) (skills) · [agent-booster](https://github.com/naman10parikh/agent-booster) (tools / CLIs) · [armory](https://github.com/naman10parikh/armory) (MCPs and the component registry) · [agentgrid](https://github.com/naman10parikh/agentgrid) (dispatch) · [agentswarm](https://github.com/naman10parikh/agentswarm) (dispatch) · [agentbench](https://github.com/naman10parikh/agentbench) (evals) · [agentmoney](https://github.com/naman10parikh/agentmoney) (observability) · [claude-harness](https://github.com/naman10parikh/claude-harness) (the whole harness, as a template).

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md); AI-assisted pull requests are welcome. Report a vulnerability privately, as [SECURITY.md](SECURITY.md) explains.

## License

MIT, © 2026 Naman Parikh. See [LICENSE](LICENSE).
<!-- fleet:footer:end -->
