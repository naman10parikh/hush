---
name: dynamic-secret-provisioning
description: "Provision short-lived dynamic credentials (OpenBao/Vault database/creds/<role>) instead of rotating static ones — with mandatory rotate-root — and rotate live-connection secrets via ISSUE→DEPLOY→VERIFY→REVOKE (never overwrite-in-place; GCP rotation is notify-only). Use when asked for a short-lived DB credential, a dynamic secret, rotation without downtime, \"enable GCP rotation\", or fixing a Vault 2.0.2 container that won't start."
trigger: When asked for a short-lived DB credential, a dynamic secret, rotation without downtime, "enable GCP rotation", or fixing a Vault 2.0.2 container that won't start.
---

# Dynamic Secret Provisioning — Short-Lived > Rotated-Static

> **The stance:** prefer **dynamic short-lived** credentials over rotating static ones — a dynamic
> cred never exists before it's needed and self-destructs on lease expiry, so its TTL *is* its rotation
> (no playbook to forget). And rotation is **never atomic** — for live connections, always
> ISSUE→DEPLOY→VERIFY→REVOKE. Source of truth: `brain/OPINIONS.md` **O-05 / O-06**,
> `brain/BATTLE-TESTED-SCENARIOS.md` **S-07 / S-09 / S-10**, `brain/KNOWN-PITFALLS.md`
> **P-07 / P-08 / P-13**. Pinned: **OpenBao 2.5.4** (default; self-host, MPL-2.0).

## When to use

An app/agent needs a DB password at runtime, OR you must rotate a production credential with live
connections, OR a team "enabled GCP rotation," OR a Vault container won't start after upgrade to 2.0.2.

## The load-bearing rules

- **Dynamic > static, and `rotate-root` is MANDATORY.** Use `database/creds/<role>` so each consumer
  gets a fresh, scoped, time-bound user that auto-revokes on lease expiry. Run
  `bao write -force database/rotate-root/<db>` so the **master password is unknown to humans** — only
  the broker holds it. A dynamic-DB recipe *without* `rotate-root` leaves a human-known master credential
  sitting around (S-07 treats a missing `rotate-root` as a serious miss). Bound it with `max_ttl`. (O-06, S-07)
- **Rotation is NEVER atomic — never overwrite-in-place for live connections.** There is always a
  propagation window. Use **alternating-users / two-secret**: AWS uses a `_clone` user with identical
  perms and flips between them → zero-downtime. Generic form (API keys too):
  **ISSUE new → DEPLOY to all consumers → VERIFY everyone's on the new one → REVOKE old.** Revoke the old
  one *only after* verifying every consumer is on the new one. `hush rotate-plan <ref> --live-connections`
  emits exactly this. (O-05, P-07, S-10)
- **GCP rotation is NOTIFY-ONLY.** Setting a rotation period + Pub/Sub topic only publishes a
  `SECRET_ROTATE` message — **you** build the rotation function. "Enable rotation" with no Cloud Function
  subscribed means it NEVER rotates. AWS ships rotation Lambdas; GCP does not. `hush advise` flags this
  as a false-green. (O-05, P-08, S-09)
- **Vault 2.0.2 in a container can't `mlock()`** (the `cap_ipc_lock` capability was removed at build).
  Fix: set **`disable_mlock = true`** in the HCL **AND disable swap** on the host (mlock's job was to keep
  secrets out of swap — disabling mlock without disabling swap risks secrets paging to disk). Granting
  `CAP_IPC_LOCK` back fights the upstream change — don't. Both fixes, not one. (P-13, S-03)

## Steps

1. **Enable + configure** — `bao secrets enable database`; `bao write database/config/<db> …`.
2. **`rotate-root` (MANDATORY)** — `bao write -force database/rotate-root/<db>`.
3. **Define the role** — `bao write database/roles/<role> default_ttl="1h" max_ttl="24h" creation_statements="…"`.
4. **Issue** — the app reads `database/creds/<role>` at runtime (a fresh scoped user); the lease
   auto-revokes. For rotating an *existing* live secret, run the ISSUE→DEPLOY→VERIFY→REVOKE plan instead.

## Output format

For provisioning: the `bao` command sequence including `rotate-root` + a bounded `max_ttl`. For rotation:
the ISSUE→DEPLOY→VERIFY→REVOKE plan (alternating-users for live connections). Verify (S-07): the app gets
a cred via `database/creds/<role>` (not a static user), `rotate-root` was run, `max_ttl` bounded.

## Anti-patterns (refuse these)

- "Create a static DB user, store the password, rotate quarterly" — a standing credential + a calendar
  reminder; strictly worse than a cred that doesn't exist until needed. (O-06)
- A dynamic-DB recipe missing `rotate-root` — leaves a human-known master password. (O-06, S-07)
- Overwrite-in-place rotation for anything with live connections — breaks the propagation window. (O-05, P-07, S-10)
- "I enabled the GCP rotation period" with no Cloud Function subscribed — it never rotates. (P-08, S-09)
- Granting `CAP_IPC_LOCK` back to a Vault 2.0.2 container instead of `disable_mlock=true` + swap-off. (P-13, S-03)
