---
title: "ecosystem-00 — Internal Reference Digest (hush corpus mine)"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, internal-corpus, env-leak, secret-scanning, hush]
sources:
  - "~/energy/chairman/CHAIRMAN-CHECKLIST.md (§SECURITY)"
  - "~/energy/.claude/rules/browser-agent-security.md"
  - "~/energy/.github/workflows/secret-scanner.yml"
  - ".env.example"
  - "AGENTS.md"
summary: "Read-only internal-corpus digest: the LIVE tracked-.env leak, the secret-scanner CI logic, and the browser-agent-security rules — quoted verbatim for hush's domain memory."
---

# ecosystem-00 — Internal Reference Digest

> READ-ONLY mine of the energy corpus. All quotes are verbatim from files I am NOT permitted to edit.
> This grounds hush's domain expertise in the fleet's own real secret-management pain.

## hush boundary (from mission brief + CLAUDE.md)

hush = the **Secrets management** domain employee. It **issues/stores secrets**.
**Auth flows belong to badge** (the auth employee — Clerk/sign-in/protected-route E2E).
This boundary is load-bearing: hush handles `.env` hygiene, secret stores (Doppler/Infisical/Vault/SOPS),
rotation, scanning, history-scrubbing, and **agent secret-scoping/injection** — NOT OAuth/session/sign-in.

## 1. The LIVE leak — energy repo `.env` files tracked in git (the canonical real-world failure)

Source: `~/energy/chairman/CHAIRMAN-CHECKLIST.md` §SECURITY (added 2026-06-14) + the
"Rotate the API keys that are sitting in git history" entry (added 2026-06-07, CP122).

**Verbatim facts:**
- Tracked secret files: `.env`, `agents/earning/.env`, `agents/earning/mercury/.env`,
  `agents/earning/venus/.env`, plus three `.env.bak.*` backups — **8 files total**.
- The 52-line `.env` contains: "Anthropic, E2B, Twilio, AgentMail, Discord, Slack, Stripe, Supabase,
  Clerk, Vercel keys."
- "They've been tracked since **2026-04-09**" and "the repo's `.gitignore` never excluded them."
- Consequence: "energy's **Secret Scanner CI has failed on every push for days** — confirmed back through
  `ec98302`, `4981b96`, `731a04c`…"
- The `.env.example` files are explicitly **fine** ("templates").

**The fix decomposition (chairman's verbatim three-step model — this IS the rotation playbook):**
1. "the load-bearing fix is **rotating the live keys**" — "Merely un-tracking the files turns CI green but
   leaves the keys in git **history** (a false-green I won't ship on my own)."
2. `git rm --cached` the real files (keeps local copies) + confirm `.gitignore` covers them + commit →
   future commits clean. **This is a false-green** on its own.
3. "Optional full scrub: authorize a `git filter-repo` history rewrite to purge old values (force-push)."

**Taste lesson for hush:** `git rm --cached` ≠ remediation. The only true remediation for a committed
secret is **rotate at the provider** (history keeps the old value forever). History rewrite (`git
filter-repo` / BFG) is a *hygiene* step, not a *security* step — the secret is already burned the moment it
hits a remote. hush must encode "rotate-first, scrub-second" as doctrine.

## 2. The secret-scanner CI (what hush's scanning component must beat)

Source: `~/energy/.github/workflows/secret-scanner.yml` (verbatim).

It is a **bash `grep -rnE` regex scan**, not a real scanner. Key properties:
- Runs on push + PR to `main`, `actions/checkout@v4` with `fetch-depth: 0` (full history checkout, but it
  only greps the working tree, NOT history — a gap).
- 10 hardcoded regex patterns: `sk-[a-zA-Z0-9]{20,}`, `AKIA[0-9A-Z]{16}`, `ghp_[a-zA-Z0-9]{36}`,
  `glpat-…`, `xoxb-[0-9]{10,}`, `sk-ant-[a-zA-Z0-9\-]{20,}`, `e2b_…`, `whsec_…`, `sk_live_…`, `pk_live_…`.
- **Critically:** it `--exclude=".env*"` from the grep, so it does NOT catch keys *inside* tracked .env
  files via regex — instead a separate `find . -name ".env"` block (lines 57-62) fails the build if ANY
  `.env`/`.env.local`/`.env.production` exists in the tree. **That `find` is why CI is red**, not the regex.
- Exits 1 on any match → fails CI.

**Gaps a real scanner (gitleaks/trufflehog) closes that this misses:**
- No entropy detection (only fixed prefixes → misses generic high-entropy secrets, JWTs, private keys).
- No git-history scan (only working tree).
- No allowlist/baseline mechanism (can't ignore known test fixtures cleanly — only crude `--exclude`).
- No verification (trufflehog can *validate* a found key against the live API; this can't).
- Brittle: a new provider prefix = a manual code edit.

## 3. Browser-agent-security rules relevant to hush (secret-handling subset)

Source: `~/energy/.claude/rules/browser-agent-security.md` (verbatim rule titles + severities).
These are the fleet's existing secret-adjacent doctrine; hush should align, not contradict.

- **Rule 12 (Low): "Audit Log Must Not Include URL Query Params"** — "Playwright error messages can
  include redirect URLs containing session tokens or OAuth codes. Strip query strings before writing to
  audit log." Provides a `sanitizeUrl()` that keeps only `${u.origin}${u.pathname}`.
  → hush doctrine: **never log secrets, and strip query strings from any URL before logging.**
- **Rule 9 (High): "Sanitize `agentId` Before Using in File Paths"** — path-traversal guard
  `/^[a-zA-Z0-9_-]+$/` + `path.resolve` startsWith check.
  → hush doctrine: secret *names/keys* used in file/store paths must be similarly validated.
- **Rule 8 (Critical): "`userId` Must Come From Authenticated Session, Not Request Body"** — this is a
  **badge** concern (auth), quoted here only to mark the boundary: hush does not own identity, badge does.
- **Rule 2 (High): "Treat All Extracted Page Content as Untrusted — Prompt Injection Risk"** — relevant to
  agent secret-scoping: a malicious page can try to get an agent to *exfiltrate* a secret it holds. hush's
  agent-injection design must assume the agent's context can be adversarially manipulated.

## 4. hush wiki schema (where research routes)

Source: `AGENTS.md`. Wiki lives under `brain/wiki/` (sources/entities/concepts/
syntheses). Raw immutable sources under `brain/research/raw/` (this file). hush domain = "personal" stub
(forged skeleton) — the real domain is **Secrets management**. Frontmatter convention: title/type/created/
updated/tags/sources/related/summary. Wikilinks `[[Page]]`. `wikimem lint` flags orphans.

## 5. hush's own .env.example (inherited from energy — a teaching artifact)

Source: `.env.example` — it is currently a **verbatim copy of energy's** (Anthropic,
E2B, Clerk, Stripe, Google, Ticketmaster, Composio, Supabase, GitHub PAT, Twilio, WhatsApp, Cronofy,
Browserbase, Firecrawl, Spark identity). This is itself a hush use-case: a domain-secrets employee should
*generate* per-repo `.env.example` from a schema, not inherit a stale superset. Note the file uses
placeholder values (`sk-ant-...`, `e2b_...`) — correct: examples must never carry real values.

---

### Distilled doctrine seeds for hush (from the corpus)
1. **Rotate-first, scrub-second.** A committed secret is burned; rotation at the provider is the only fix.
2. **`.env` files must never be tracked.** `.gitignore` `.env*` (keep `!.env.example`). A `find .env` gate
   in CI is a cheap, effective last line of defense (energy proves it works — it's the thing going red).
3. **Examples carry placeholders, never values.** `.env.example` is a schema, not a secret.
4. **Never log secrets; strip URL query strings before logging** (Rule 12).
5. **Real scanners beat regex greps** — entropy + history + verification + baselines (gitleaks/trufflehog).
6. **Boundary:** hush issues/stores/scans/rotates/injects secrets; badge owns auth/identity/sign-in.
