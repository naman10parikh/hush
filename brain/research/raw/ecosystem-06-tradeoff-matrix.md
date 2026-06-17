---
title: "ecosystem-06 — Competing Tools: The Honest Trade-Off Matrix (June 2026)"
type: source
created: "2026-06-16"
updated: "2026-06-16"
tags: [secrets, tradeoffs, comparison, pricing, licensing, decision-matrix, hush]
sources:
  - "https://www.pkgpulse.com/blog/infisical-vs-doppler-vs-hashicorp-vault-secrets-management-2026 (2026)"
  - "https://blog.gitguardian.com/top-secrets-management-tools/ (2026)"
  - "https://infisical.com/blog/best-secret-management-tools (2026)"
  - "https://wetheflywheel.com/en/comparisons/hashicorp-vault-alternatives/ (2026)"
  - "https://dev.to/beton/infisical-pricing-teardown-2026-1ang (2026)"
  - "ecosystem-01..05 (this corpus)"
summary: "The honest, opinionated decision matrix across the secrets landscape — capability, license, self-host, dynamic-secrets, agent-readiness, ops complexity, and a pointed 'best for / worst for' per tool. Includes a flagged pricing dispute (per-user vs per-identity; sources disagree) and a freshness conflict (one comparison says Doppler has no dynamic secrets — contradicted by doppler.com/changes March 2026)."
---

# ecosystem-06 — The Honest Trade-Off Matrix

> Opinionated on purpose (the mission bar is "explicit taste"). Where sources disagree, I flag it rather than
> pick silently. Verdicts are mine, grounded in ecosystem-01..05.

## The master matrix

| Tool | License | Self-host | Dynamic secrets | Rotation | Agent-native? | Ops complexity | At-rest-in-git? |
|---|---|---|---|---|---|---|---|
| **OpenBao** | MPL-2.0 (LF) | ✅ (only) | ✅ full | ✅ engine | ✅ AppRole/K8s/OIDC + MCP | **High** | ✗ (runtime broker) |
| **HashiCorp Vault** | BUSL-1.1 (IBM) | ✅ + HCP SaaS | ✅ **full (best)** | ✅ Rotation Manager (Ent) | ✅ AppRole/K8s/OIDC + MCP | **High** | ✗ |
| **Infisical** | MIT core + EE | ✅ (MIT) + Cloud | 🟡 DB rotation only* | ✅ rotation | ✅ **Agent Vault + Machine ID (SPIFFE!)** | **Low-med** | ✗ |
| **Doppler** | proprietary | ✗ **SaaS only** | 🟡 **beta (2026)**† | ✅ (Azure SP, etc.) | 🟡 CLI `doppler run`, MCP dormant | **Low** | ✗ |
| **1Password** | proprietary | ✗ SaaS | ✗ | 🟡 (Credential Broker) | ✅ **Credential Broker + Service Accts + MCP** | **Low** | ✗ |
| **AWS Secrets Mgr** | proprietary | ✗ (AWS) | 🟡 RDS-family rotation | ✅ managed Lambda | 🟡 via IAM roles | **Med** | ✗ |
| **GCP Secret Mgr** | proprietary | ✗ (GCP) | ✗ | 🟡 **notify-only** | 🟡 via IAM | **Low-med** | ✗ |
| **SOPS + age** | MPL-2.0 / BSD | ✅ (it's a CLI) | ✗ | 🟡 `sops rotate` (manual) | 🟡 `sops exec-env` + env keys | **Low** | ✅ **(the only one)** |
| **gitleaks** | MIT | ✅ CLI | n/a (scanner) | n/a | ✅ CLI/Action | **Low** | scans git |
| **trufflehog** | AGPL-3.0 | ✅ CLI | n/a (scanner) | n/a | ✅ CLI/Action + **verify** | **Low** | scans git+more |

\* Infisical: one source says "rotation for databases only"; it also ships broader rotation + an Agent Vault.
† **Freshness conflict (flagged):** the pkgpulse 2026 comparison says **"Doppler has no dynamic secrets,"** but
**doppler.com/changes (March 2026)** announces **dynamic secrets in beta** + Azure dynamic provider. The
comparison post is stale on this point; treat Doppler dynamic secrets as **beta-available**, not absent.

## Pricing (FLAGGED — sources disagree; present as ranges, confirm before quoting)

| Tool | Reported pricing | Source disagreement |
|---|---|---|
| **Infisical** | "$8/user/mo" (pkgpulse) **vs** "$18/identity/mo Pro" (envmanager/dev.to) | **per-user vs per-identity** + dollar amount differ |
| **Doppler** | "$0 personal / $8/user/mo team" (pkgpulse) **vs** "$21/user/mo Team" (envmanager) | dollar amount differs ~2.5x |
| **Vault** | free self-host; HCP "$0.03/active-client/hr (~$22/mo for 30)"; Ent "thousands/mo" | consistent-ish |
| **OpenBao / SOPS / age / scanners** | $0 (OSS) + your ops/infra time | consistent |
| **AWS SM** | ~$0.40/secret/mo + API calls | consistent |
| **GCP SM** | ~$0.06/active-version/mo + access ops | consistent |

→ **GAPS-AND-DISPUTES candidate.** Do NOT quote a single Infisical/Doppler price as fact; the per-user vs
per-identity *axis* itself differs between sources (a real billing-model difference, not just a number). The
durable truth: **OSS (OpenBao/SOPS) trades dollars for ops-time; SaaS (Doppler/1P) trades ops-time for per-seat
or per-identity dollars; Infisical bills per *identity* which matters a lot in an agent-heavy fleet** (many
machine identities → per-identity billing can balloon vs per-human).

## The honest "best for / worst for" verdicts

**OpenBao** — *Best for:* OSS-first shops that want Vault's power without BUSL/IBM, K8s-native dynamic secrets,
free namespaces. *Worst for:* small teams wanting low ops (it's High complexity); shops needing managed DR
replication today (not yet native). **hush default for serious self-host.**

**HashiCorp Vault** — *Best for:* enterprises already on Vault Enterprise, needing the deepest dynamic-secrets +
encryption-as-a-service + PKI + multi-cloud, with the staff to run it. *Worst for:* anyone license-sensitive
(BUSL) or small (High complexity). Vault 2.0 is more secure OOTB (auth-by-default root-gen) but the container
`disable_mlock` gotcha (ecosystem-01 §1) bites on upgrade.

**Infisical** — *Best for:* teams wanting Vault-ish capability with a *gentle* learning curve, modern UI,
self-host the MIT core, AND the most agent-native OSS-adjacent story (Agent Vault + Machine Identity incl.
SPIFFE). *Worst for:* assuming OSS == Cloud (SSO/audit-depth are EE); agent-heavy fleets on per-identity billing
(Cloud) can get expensive. **hush's recommended modern open-core pick when DX matters.**

**Doppler** — *Best for:* teams that want zero-ops, slickest onboarding (`doppler setup` and done), secrets
across many services/envs, human-only billing. *Worst for:* compliance/air-gapped/data-residency (no self-host
at all — a hard ceiling), and agents (MCP dormant; per-human billing model fits humans not machine identities).

**1Password** — *Best for:* orgs already on 1Password wanting the **most polished agent story** (Credential
Broker GA 2026-06-15, Service Accounts, MCP that never exposes secrets to the agent). *Worst for:* OSS/self-host
requirements; no dynamic secrets engine of its own. **The commercial agent-safety reference design to copy.**

**AWS / GCP Secret Manager** — *Best for:* single-cloud shops wanting native IAM-tied secrets with minimal new
infra. *Worst for:* multi-cloud (lock-in) and — critically — **GCP rotation is notify-only** (you build the
rotation function, ecosystem-05 §D2), an easy way to *think* you have rotation and not.

**SOPS + age** — *Best for:* GitOps (Flux/Argo) where secrets MUST live in git encrypted at rest; the simplest
at-rest primitive; age 1.3 even has post-quantum. *Worst for:* anything needing a runtime broker, dynamic
secrets, audit log, or fine-grained access policy (it has none — "who holds the key" is the entire ACL). **The
complement, never the replacement.** Pairs with a runtime broker (OpenBao/Vault) in serious setups (ecosystem-02
§Tier-1.4 talos-cluster).

**gitleaks / trufflehog** — not competitors to the stores; the *scanning* layer. **gitleaks** = fast pre-commit
prevention (MIT). **trufflehog** = deep CI detection + **live verification** (AGPL). Run **both** (ecosystem-03 §5).

## The decision tree hush should encode

```
Does the secret need to live IN git (GitOps)?          → SOPS + age (+ break-glass 2nd recipient)
Is it a DB/cloud credential an app needs at runtime?   → dynamic secrets: OpenBao/Vault `creds/<role>` (best)
Want power + OSS license, have ops staff?              → OpenBao
Want power + gentle DX + agent-native, OK with EE gaps?→ Infisical (Agent Vault, Machine ID/SPIFFE)
Want zero-ops SaaS, human team, no compliance block?  → Doppler
Already on 1Password, want best agent broker?         → 1Password Credential Broker
All-in on one cloud, minimal new infra?               → AWS SM (real rotation) / GCP SM (BUT build rotation fn)
Need to PREVENT/CATCH leaks?                          → gitleaks (pre-commit) + trufflehog --only-verified (CI)
Need to SCRUB a leaked secret from history?           → ROTATE first, then git-filter-repo (hygiene, not security)
```

---

### Distilled trade-off doctrine for hush
1. **No single winner — it's a portfolio.** Serious setups layer: SOPS+age (git) + OpenBao/Vault (runtime
   dynamic) + scanners (prevent/catch) + a broker (agents). hush should recommend the *layer*, not a single tool.
2. **OSS trades dollars for ops-time; SaaS trades ops-time for per-seat/per-identity dollars.** In an
   agent-heavy fleet, **per-identity billing (Infisical Cloud) is the line item to watch** (many machine IDs).
3. **Dynamic > static everywhere it's available** (Vault/OpenBao best; Infisical DB-only; Doppler beta).
4. **Agent-native leaders = 1Password Credential Broker + Infisical Agent Vault** — the patterns to copy even if
   hush uses an OSS store underneath.
5. **Doppler's no-self-host and GCP's notify-only-rotation are the two "looks fine until compliance/audit" traps.**
6. **Flagged disputes (→ GAPS):** Infisical/Doppler exact pricing (per-user vs per-identity, ~2.5x dollar
   spread) and the stale "Doppler has no dynamic secrets" claim (contradicted by Doppler's own March-2026 changelog).
