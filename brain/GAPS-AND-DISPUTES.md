---
title: "GAPS-AND-DISPUTES — Where Sources Disagree, Where None Exist, What's Unconfirmed"
type: synthesis
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, gaps, disputes, unconfirmed, experiments-needed, hush, meta]
sources:
  - "raw/ecosystem-01-canonical-versions-and-deltas.md"
  - "raw/ecosystem-02-starter-repos-and-tooling.md"
  - "raw/ecosystem-04-agent-operator-knowledge.md"
  - "raw/ecosystem-05-github-issues-real-breakage.md"
  - "raw/ecosystem-06-tradeoff-matrix.md"
related:
  - "[[EXPERTISE-MAP]]"
  - "[[TOOL-MATRIX]]"
  - "[[OPINIONS]]"
  - "[[KNOWN-PITFALLS]]"
  - "[[BATTLE-TESTED-SCENARIOS]]"
summary: "The intellectual-honesty file. Three classes: (1) DISPUTES where sources contradict each other — both sides given, no silent pick; (2) UNCONFIRMED claims the corpus asserts but couldn't verify; (3) GAPS where no good source exists and hush must form its own view via experiments. Includes a META gap: the second researcher's field-*.md corpus is entirely absent."
---

# GAPS-AND-DISPUTES — What hush Does NOT Know for Sure

> Three sections. **§A DISPUTES** = sources contradict (both sides, no silent pick). **§B UNCONFIRMED**
> = the corpus asserts it but it couldn't be verified to primary-source confidence. **§C GAPS /
> EXPERIMENTS-NEEDED** = no good source exists; hush must form its own view by *doing*. A fresh session
> must consult this BEFORE asserting anything in these areas. Anchors `G-NN` are referenced from
> [[EXPERTISE-MAP]] and [[TOOL-MATRIX]].

---

# §A — DISPUTES (sources disagree; both sides preserved)

## G-01 — Infisical & Doppler pricing: per-USER vs per-IDENTITY, and ~2.5x dollar spread

**The disagreement (research-flagged, ecosystem-06 §Pricing):**

| Tool | Source 1 | Source 2 | Nature of conflict |
|---|---|---|---|
| **Infisical** | "$8/user/mo" (pkgpulse 2026) | "$18/identity/mo Pro" (envmanager / dev.to 2026) | **Different billing AXIS** (per-user vs per-identity) AND different dollar amount |
| **Doppler** | "$0 personal / $8/user/mo team" (pkgpulse) | "$21/user/mo Team" (envmanager) | Same axis, **~2.5x dollar spread** |

**Why it's not just a stale number:** the per-user-vs-per-identity axis is a *real billing-model
difference*, and it matters enormously in an agent-heavy fleet — **many machine identities → per-identity
billing can balloon vs per-human.** [src: ecosystem-06 §2]

**hush's stance:** **NEVER quote a single Infisical/Doppler price as fact.** State the durable truth
instead: *OSS (OpenBao/SOPS) trades dollars for ops-time; SaaS trades ops-time for per-seat or
per-identity dollars; Infisical bills per identity, which is the line item to watch in an agent fleet.*
If a concrete number is needed, **fetch the live pricing page at decision time** and cite the fetch date.
[src: ecosystem-06 §Pricing; tied to [[OPINIONS]] O-13]

---

## G-02 — Does Doppler have dynamic secrets? (stale comparison vs Doppler's own changelog)

**The disagreement (research-flagged, ecosystem-06 †):**
- pkgpulse 2026 comparison: *"Doppler has no dynamic secrets."*
- **doppler.com/changes (March 2026):** announces **dynamic secrets in beta** + an **Azure dynamic
  provider** + Pulumi ESC integration. [src: ecosystem-01 §7; ecosystem-06 †]

**Resolution (primary source wins, but with a caveat):** treat Doppler dynamic secrets as
**beta-available, not absent.** The comparison post is stale on this point. *Caveat:* "beta" is not
"production-ready" — verify GA status and the *specific* provider before relying on it. [src: ecosystem-01
§7]

**hush's stance:** in the matrix, mark Doppler dynamic as **🟡 beta (2026)**, never ✗. Prefer
OpenBao/Vault for *full* dynamic. (See [[TOOL-MATRIX]] §1, [[OPINIONS]] O-06.)

---

## G-03 — Is there an "official HashiCorp Vault MCP server"? (listicle vs direct repo check)

**The disagreement (research-flagged, ecosystem-04 §1):**
- Listicle (chatforest 2026): claims an **"official, 47★" Vault MCP**.
- **Direct `gh search repos` (2026-06-16):** the obvious candidate `rccyx/vault-mcp` is **ARCHIVED
  (2026-02-05)**; the rest are community/personal (`Cosmicjedi/vault-mcp-server`,
  `rod-anami-kyndryl/hashi-vault-mcp`). The "official 47★" claim is **not corroborated.** [src:
  ecosystem-04 §1]

**Resolution:** treat Vault's MCP story as **community-only** until HashiCorp/IBM ships and *labels* an
official one. The *existence* of an MCP server ≠ official ≠ safe. [src: ecosystem-04 §1]

**hush's stance:** **verify MCP provenance by direct repo check, never trust a listicle's "official" or
star count.** Flag the dispute in [[TOOL-MATRIX]] §2 with the ⚠ marker (already done). This is a general
rule: comparison posts drift; repos don't lie about being archived.

---

## G-04 — git-filter-repo: "18-month-stale, flag it" vs "main is actively committed" (INTERNAL self-correction)

**The disagreement (within the corpus itself):**
- ecosystem-01 §6: *"Latest release v2.47.0 is from 2024-12-04 — 18 months old… hush should flag it."*
- ecosystem-02 §correction: *"git-filter-repo's release cadence is stale (v2.47.0, Dec 2024) but the repo
  is **actively committed** (main pushed 2026-06-12). So: maintained, just released infrequently."*

**Resolution (the later, repo-verified file wins):** git-filter-repo is **maintained, not abandoned** —
its *release* cadence is slow but `main` is active (pushed 2026-06-12). Pin **v2.47.0** for stability; if
you need a post-2.47.0 fix, pin a specific `main` commit. [src: ecosystem-02 §correction]

**hush's stance:** don't call it "stale/risky" — call it "infrequently released but live." (See
[[TOOL-MATRIX]] §1, §3; [[OPINIONS]] O-04 uses it correctly as a hygiene tool.) **Lesson:** prefer
`pushedAt` (last commit) over last-release-date when judging whether a tool is alive.

---

## G-05 — Infisical rotation: "databases only" vs "broader rotation + Agent Vault"

**The disagreement (research-flagged, ecosystem-06 *):**
- One source: Infisical rotation is *"for databases only."*
- The same corpus also documents Infisical shipping **broader rotation + an Agent Vault credential
  proxy** in 2026. [src: ecosystem-06 *; ecosystem-04 §1, §2]

**Resolution:** Infisical's dynamic/rotation surface is **broader than "DB-only" but narrower than
Vault/OpenBao's full dynamic engine** — and it's moving fast (server ships ~weekly). The honest matrix
cell is **🟡 (DB rotation + broadening)**, with a note that the exact scope is a moving target. [src:
ecosystem-01 §3; ecosystem-06 *]

**hush's stance:** verify the *current* Infisical rotation scope at decision time (it changes weekly);
don't hard-code "DB-only" or "full dynamic." (See [[TOOL-MATRIX]] §1, [[OPINIONS]] O-06's caveat.)

---

# §B — UNCONFIRMED (corpus asserts it; not verified to primary-source confidence)

## G-06 — Bitwarden MCP "most-starred secrets MCP" + star counts (listicle-sourced)

The "Bitwarden MCP is the most-starred secrets MCP (~166★)" and several other star figures in
ecosystem-04 §1 come from a **listicle** (chatforest 2026), not a direct `gh` check (unlike the Vault and
Infisical rows, which *were* repo-verified). The `bitwarden/sdk-sm` (437★, 2026-06-13) figure IS
repo-verified; the *MCP* star count is not. [src: ecosystem-04 §1]

**hush's stance:** treat un-repo-verified star counts as **approximate**. Before recommending an MCP on
"popularity," run `gh repo view <repo>` for current stars + `pushedAt`. (Reinforces G-03's lesson.)

## G-07 — age 1.3 "post-quantum" maturity (claimed; no field evidence of production use)

age v1.3.0/1.3.1 (Dec 2025) *added* a post-quantum recipient/identity option — that's
release-note-confirmed. But the corpus has **no field evidence** that anyone runs age PQ in production, no
interop/regression reports, and no SOPS-compatibility confirmation for PQ age recipients (given the
*existing* age-plugin lag in SOPS, P-10/#1103). [src: ecosystem-01 §4; ecosystem-05 §B2]

**hush's stance:** "age has a PQ story" is true; "age PQ is production-ready *with SOPS*" is **unconfirmed**
— test the SOPS+age-PQ triple before recommending it, exactly as P-10 demands for any age plugin.

## G-08 — Exact OpenBao↔Vault drop-in scope above 1.14 (only the *baseline* is documented)

The corpus confirms the migration guide's **1.14.1 baseline** and that "drop-in" holds for ~1.14-era
usage. What is **NOT documented anywhere in the corpus** is a *per-engine* compatibility map for
Vault 1.15→2.0 features against OpenBao 2.5.4 — so any specific "is feature X drop-in?" question above
1.14 is currently **unanswerable from sources alone.** [src: ecosystem-05 §C1, §C3]

**hush's stance:** for any post-1.14 Vault feature, the honest answer is "verify against OpenBao's current
docs/release notes" — do NOT extrapolate "drop-in." (See [[KNOWN-PITFALLS]] P-15.)

---

# §C — GAPS / EXPERIMENTS-NEEDED (no good source; hush must form its own view by DOING)

## G-09 — hush's OWN agent-secret protocol (handle format, broker API, redaction filter) is UNSPECIFIED

The corpus tells hush the *doctrine* — return handles not values, be/front a broker, redact logs — and
gives two **reference designs** to copy (1Password Credential Broker, Infisical Agent Vault). But it does
**not** specify hush's *own* concrete surface:
- the **handle/reference format** (1Password uses `op://vault/item/field`; what does hush emit?),
- the **broker request/response contract** (how an agent asks for a short-TTL cred; what's logged),
- the **redaction filter** (the exact regex set + entropy threshold for scrubbing secret-shaped strings
  from logs/traces, given gitleaks' own FP problems, P-03). [src: ecosystem-04 §1, §2, §6]

**Experiment for hush:** design + dogfood a handle protocol and a redaction filter inside this repo;
golden-test that the raw value never appears in a transcript (the S-08 success criterion). This is build
work, not research — the answer comes from shipping it. (Wave-P/Wave-S territory.)

## G-10 — Beating energy's CI: the concrete hush scanning stack is DESIGNED but UNBUILT

The corpus prescribes the *ingredients* (gitleaks `protect --staged` pre-commit + gitleaks `detect`
history in CI + trufflehog `--only-verified` + a baseline/allowlist + entropy gating + MCP-config + base64
scanning) but the **assembled, tuned artifact does not exist yet** — including the *specific*
`.gitleaks.toml` allowlist that suppresses fixtures (P-03) without hiding real findings (the no-FN/no-FP
balance from S-12). [src: ecosystem-03 §5; ecosystem-05 §A1, §A4]

**Experiment for hush:** build the `.pre-commit-config.yaml` + `.gitleaks.toml` + CI workflow, then
*measure* it against a seeded corpus (known real secrets + known fixtures) to verify zero-FN and
acceptable-FP. The tuning thresholds are empirical — they can't be looked up.

## G-11 — Does the broker pattern actually defeat prompt-injection exfiltration? (UNTESTED claim)

The doctrine asserts that returning handles + egress-restricting secret-bearing agents makes the
*capability* to exfiltrate "not exist" (vs merely a policy against it). The corpus references an
*educational* adversarial harness — `cjdrilke/aisafe` with a **"30+ attack-vector log across 10 rounds of
adversarial review"** — but hush has **not run its own red-team** against its own (unbuilt) broker. [src:
ecosystem-04 §1, §6]

**Experiment for hush:** once the broker exists (G-09), red-team it against the documented attack vectors
(prompt-injection-to-read, log-scrape, transcript-scrape, MCP-config-write) and record results. Doctrine
without a passing red-team is a hypothesis. (Ties to browser-agent Rules 2 & 12.)

## G-12 — hush's own repo violates its own JOB-1 doctrine (dogfood debt, not a knowledge gap)

Verified against the live repo (2026-06-16): hush's `.gitignore` does **not** exclude `.env*`
([[KNOWN-PITFALLS]] P-01) and its `.env.example` is a **stale verbatim copy of energy's** (P-02). These
aren't unknowns — they're known fixes the employee hasn't applied to itself. (Positive: `.mcp.json`
correctly uses `${VAR}` refs, P-16.) [verified against repo]

**Action (not experiment):** fix hush's own `.gitignore` and *generate* its `.env.example` from its real
schema — the first dogfood of JOB 1 and S-14. Listed here so the gap is tracked until closed.

---

# §D — META: a structural gap in the research itself

## G-13 — The second researcher's `field-*.md` corpus is ENTIRELY ABSENT

**Finding:** the synthesis brief specifies *"Two researchers have written `ecosystem-*.md` and
`field-*.md`."* As of synthesis (2026-06-16), `brain/research/raw/` contains **only** the seven
`ecosystem-0X-*.md` files (00–06). There are **zero `field-*.md` files** — `ls field-*.md` returns no
matches. [verified: `ls brain/research/raw/`]

**Impact assessment (honest):**
- The ecosystem corpus is **unusually strong** and already absorbed much of what a "field" track would
  cover: real GitHub issues with engagement counts (ecosystem-05), agent-operator practitioner knowledge
  (ecosystem-04), and the internal energy incident (ecosystem-00). So the absence is **not fatal** — all
  six artifacts were producible to a high bar from the ecosystem files alone.
- BUT a dedicated field track would likely have added: **practitioner war-stories** (incident retros,
  on-call postmortems beyond GitHub issues), **interview/blog-sourced "what bit us in prod"** narratives,
  and possibly **hands-on benchmark numbers** (rotation latency, scanner FP rates on real corpora) — the
  empirical grounding §C's experiments now have to generate from scratch.

**hush's stance:** the brain is **good-enough to make a fresh session dangerous** without the field
corpus. The deepening opportunity (if a future pass wants it): commission the missing `field-*.md` track
to (a) corroborate the listicle-sourced claims in §B (G-06 star counts, etc.) with practitioner
evidence, and (b) supply real-world numbers for §C's experiments instead of designing them blind. Until
then, treat §B as "best-available, not battle-confirmed" and §C as "design-and-measure-it-yourself."

---

## How a fresh session should USE this file

1. Before quoting a **price** → G-01 (never a single number; fetch live, cite date).
2. Before claiming a tool **lacks** a feature (Doppler dynamic, Infisical rotation) → G-02, G-05 (check
   current state; these move weekly).
3. Before trusting an **MCP/star claim** from a comparison post → G-03, G-06 (`gh repo view` first).
4. Before saying **"drop-in"** for OpenBao above 1.14 → G-08 (unanswerable from sources; verify).
5. For anything about hush's **own** broker/scanner/handle protocol → G-09, G-10, G-11 (it's unbuilt;
   the answer is an experiment, not a lookup).
6. Remember the brain was built **without** the field corpus (G-13) — §B claims are best-available, not
   battle-confirmed.
