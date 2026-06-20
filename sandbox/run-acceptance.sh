#!/usr/bin/env bash
#
# sandbox/run-acceptance.sh — THE acceptance test (E3; PLAN §5).
#
# The bar (HARNESS-OVERRIDES): on a repo with a planted dummy secret, `hush scan`
# flags it (nonzero exit) AND `hush doctor` reports the secret-manager wiring —
# green in CI. $0, offline, no provider account, no network (D15 local-first):
# the built-in scanner catches the planted key with no binary, no API.
#
# Runs reproducibly inside the sandbox (E2B if E2B_API_KEY present, else the GH
# ubuntu runner — E2B is NOT a hard gate, HARNESS-OVERRIDES component 11). The
# script itself is identical in both; only the harness differs.
#
# pass^k: the three blocks are run K (default 3) times — a flaky scanner fails.
#
# Exit 0 = all blocks pass K times. Nonzero = the acceptance bar is not met.
set -euo pipefail

HUSH_BIN="${HUSH_BIN:-$(cd "$(dirname "$0")/.." && pwd)/bin/hush}"
K="${ACCEPT_K:-3}"

note() { printf '  %s\n' "$*"; }
fail() { printf 'ACCEPTANCE FAIL: %s\n' "$*" >&2; exit 1; }

# The planted DUMMY value, defined ONCE so the plant and the O-09 leak-check
# reference the same literal (single source of truth). It matches the scanner's
# anthropic-key prefix so the finding fires when committed to HISTORY (where the
# working-tree dummy-skip does NOT apply), yet the literal `DUMMY` marker makes
# hush's OWN working-tree self-scan AND ci.yml's secret-scan skip this source line
# — so dogfooding doesn't false-flag the acceptance script itself.
PLANTED_KEY='sk-ant-api03-DUMMYXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'

# Plant a dummy secret (NOT a real key) into a throwaway repo's history — the
# realistic "leaked .env committed" case. mktemp keeps each run isolated.
plant_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  git -C "$dir" config user.email accept@hush.test
  git -C "$dir" config user.name hush-accept
  git -C "$dir" config commit.gpgsign false
  printf 'ANTHROPIC_API_KEY=%s\n' "$PLANTED_KEY" > "$dir/leaked.env"
  git -C "$dir" add leaked.env
  git -C "$dir" commit -qm plant
  printf '%s' "$dir"
}

clean_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q
  git -C "$dir" config user.email accept@hush.test
  git -C "$dir" config user.name hush-accept
  git -C "$dir" config commit.gpgsign false
  printf 'ok\n' > "$dir/README.md"
  git -C "$dir" add README.md
  git -C "$dir" commit -qm clean
  printf '%s' "$dir"
}

run_once() {
  local iter="$1"
  note "iteration $iter/$K"

  # --- Block 1: scan the planted key in history → nonzero + a rule-bearing finding ---
  local planted scan_rc scan_out
  planted="$(plant_repo)"
  set +e
  scan_out="$(node "$HUSH_BIN" scan "$planted" --history --json)"
  scan_rc=$?
  set -e
  [ "$scan_rc" -ne 0 ] || fail "block1: scan on planted key exited 0 (expected nonzero)"
  printf '%s' "$scan_out" | grep -q '"rule"' || fail "block1: scan output has no rule-bearing finding"
  # O-09: the raw planted value must NOT appear in the scan output (redaction).
  if printf '%s' "$scan_out" | grep -qF "$PLANTED_KEY"; then
    fail "block1: RAW SECRET VALUE in scan output — O-09 violated"
  fi
  note "block1 OK — scan nonzero ($scan_rc) + rule finding + redacted"

  # --- Block 2: doctor on the bad repo → gitignore_ok:false + structured wiring ---
  local doctor_out
  doctor_out="$(node "$HUSH_BIN" doctor "$planted" --json)"
  printf '%s' "$doctor_out" | grep -q '"gitignore_ok":false' || fail "block2: doctor did not report gitignore_ok:false"
  printf '%s' "$doctor_out" | grep -q '"score"' || fail "block2: doctor emitted no score"
  note "block2 OK — doctor gitignore_ok:false + score"

  # --- Block 3: negative control — a clean repo scans to exit 0 (no FP storm) ---
  local clean clean_rc
  clean="$(clean_repo)"
  set +e
  node "$HUSH_BIN" scan "$clean" --history >/dev/null
  clean_rc=$?
  set -e
  [ "$clean_rc" -eq 0 ] || fail "block3: clean repo scan exited $clean_rc (expected 0)"
  note "block3 OK — clean repo exit 0"

  rm -rf "$planted" "$clean"
}

printf 'hush acceptance test (PLAN §5) — pass^%s, \$0/offline\n' "$K"
printf 'hush bin: %s\n' "$HUSH_BIN"
[ -f "$HUSH_BIN" ] || fail "hush binary not found at $HUSH_BIN (run pnpm build first)"

for i in $(seq 1 "$K"); do
  run_once "$i"
done

printf 'ACCEPTANCE PASS — all 3 blocks green ×%s\n' "$K"
