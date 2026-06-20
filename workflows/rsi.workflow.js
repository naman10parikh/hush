#!/usr/bin/env node
/**
 * workflows/rsi.workflow.js — hush's deterministic RSI engine (E4; PLAN §11,
 * HARNESS-OVERRIDES RSI row).
 *
 * The Darwin "AutoLab" loop, DETERMINISTIC + $0 + TOKENLESS half (D8). It runs:
 *   1. refresh-tool-matrix-versions — `gh release view` for the 6 pinned tools,
 *      diff vs the brain's pins, PROPOSE a brain update if drifted (NEVER auto-edits).
 *   2. re-verify-brain-pins — assert the load-bearing version facts still parse
 *      from the brain (Vault 2.0.2 mlock P-13, SOPS Azure-KV decrypt regression P-10).
 *   3. run-eval-pyramid — re-run the CI-blocking golden subset (GT-1..GT-10 + GT-15)
 *      via `pnpm eval`; any regression → block (test-gate).
 *   4. propose → test-gate → commit — Git snap-back at component+repo granularity
 *      if a change regresses (the Darwin pattern). The COMMIT is the only mutating
 *      step and is gated on the eval passing; `--dry-run` skips it.
 *
 * The CLAUDE HALF (rewrite the affected brain/**.md on a real watchlist delta) is
 * DEFERRED to CLAUDE_CODE_OAUTH_TOKEN (D8) — its absence is NOT a gap. Until then
 * the engine DETECTS drift and PROPOSES; it does not rewrite the doctrine.
 *
 * Model routing (CP123 D12/D14): any spawn passes an EXPLICIT model — never a bare
 * default. The deterministic half makes no model call; the deferred Claude half's
 * model is named here so the routing is explicit and grep-able.
 *
 * Network tolerance: `gh release view` needs auth/network. When `gh` is absent or
 * offline (CI without a token, local dev), the refresh step DEGRADES to a clear
 * "skipped — could not reach upstream" note and does NOT fail (Risk #3 / chaos
 * no-network: degrade-to-plan, never hang). `--dry-run` always exits 0 on a
 * healthy repo.
 *
 * Usage:
 *   node workflows/rsi.workflow.js --dry-run   # detect + propose, no commit (CI/cron)
 *   node workflows/rsi.workflow.js             # + commit a proposal file if drift found
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

// Model routing (D12/D14): the deferred Claude half runs on Opus 4.8, max — named
// explicitly so `grep 'model:' workflows/` shows explicit routing (no bare default).
const RSI_MODEL = "claude-opus-4-8"; // model: claude-opus-4-8 (Claude half, deferred D8)

// The brain's pinned tool versions (brain/TOOL-MATRIX.md). The map keys are the
// `gh repo` slugs used by `gh release view`; values are the pinned versions.
const TOOL_PINS = [
  { name: "gitleaks", repo: "gitleaks/gitleaks", pin: "8.30.1" },
  { name: "trufflehog", repo: "trufflesecurity/trufflehog", pin: "3.95.5" },
  { name: "sops", repo: "getsops/sops", pin: "3.13.1" },
  { name: "age", repo: "FiloSottile/age", pin: "1.3.1" },
  { name: "openbao", repo: "openbao/openbao", pin: "2.5.4" },
  { name: "git-filter-repo", repo: "newren/git-filter-repo", pin: "2.47.0" },
];

// Load-bearing brain facts re-verify checks still parse (version-pinned doctrine).
const BRAIN_PIN_FACTS = [
  { file: "brain/KNOWN-PITFALLS.md", re: /Vault\s+2\.0\.2[\s\S]{0,200}?mlock/i, label: "P-13 Vault 2.0.2 mlock removal" },
  { file: "brain/KNOWN-PITFALLS.md", re: /disable_mlock\s*=\s*true/i, label: "P-13 disable_mlock fix" },
  { file: "brain/KNOWN-PITFALLS.md", re: /SOPS\s+v?3\.9\.2[\s\S]{0,120}?Azure/i, label: "P-10 SOPS Azure-KV decrypt regression" },
  { file: "brain/OPINIONS.md", re: /rotate first|ROTATE FIRST/i, label: "O-04 rotate-first doctrine" },
];

const log = (step, msg) => console.log(`[rsi:${step}] ${msg}`);

/** Read a brain file or return "" (so a missing file is a clear FAIL, not a crash). */
function readBrain(rel) {
  const p = join(REPO_ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

/**
 * STEP 1 — refresh-tool-matrix-versions. Query `gh release view` per tool, diff vs
 * the pin, collect drift. Network/auth-tolerant: a failed lookup is "unknown", not
 * a hard error. Returns { drift:[], checked:n, unreachable:n }.
 */
function refreshToolMatrix() {
  const drift = [];
  let checked = 0;
  let unreachable = 0;
  const ghPresent = (() => {
    try {
      execFileSync("gh", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  if (!ghPresent) {
    log("refresh", "gh CLI not available — skipping upstream version check (degrade-to-plan, not a failure)");
    return { drift, checked: 0, unreachable: TOOL_PINS.length, ghPresent: false };
  }

  for (const tool of TOOL_PINS) {
    let latest = null;
    try {
      const out = execFileSync("gh", ["release", "view", "--repo", tool.repo, "--json", "tagName", "-q", ".tagName"], {
        encoding: "utf8",
        timeout: 15000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      latest = out.trim().replace(/^v/, "");
    } catch {
      unreachable++;
      continue; // offline / unauthenticated / rate-limited → unknown, not a failure
    }
    checked++;
    if (latest && latest !== tool.pin) {
      drift.push({ tool: tool.name, pin: tool.pin, latest });
      log("refresh", `DRIFT: ${tool.name} pinned ${tool.pin} → upstream ${latest} (PROPOSE brain update)`);
    } else if (latest) {
      log("refresh", `${tool.name} ${tool.pin} current`);
    }
  }
  if (unreachable) log("refresh", `${unreachable}/${TOOL_PINS.length} tools unreachable (offline/unauth) — not a failure`);
  return { drift, checked, unreachable, ghPresent: true };
}

/**
 * STEP 2 — re-verify-brain-pins. Assert each load-bearing version fact still parses
 * from the brain. A missing fact is a real FAIL (the doctrine silently drifted).
 */
function reVerifyBrainPins() {
  const stale = [];
  for (const fact of BRAIN_PIN_FACTS) {
    const text = readBrain(fact.file);
    if (!fact.re.test(text)) {
      stale.push(fact.label);
      log("re-verify", `STALE: "${fact.label}" no longer parses from ${fact.file}`);
    }
  }
  if (stale.length === 0) log("re-verify", `all ${BRAIN_PIN_FACTS.length} brain pin facts intact`);
  return { stale };
}

/**
 * STEP 3 — run-eval-pyramid. Re-run the CI-blocking golden subset (GT-1..GT-10 +
 * GT-15) via `pnpm eval`. Returns { passed:bool }. This is the test-gate's evidence.
 */
function runEvalPyramid() {
  try {
    execFileSync("pnpm", ["eval"], { cwd: REPO_ROOT, stdio: "inherit", timeout: 300000 });
    log("eval", "eval pyramid PASS (CI-blocking subset green)");
    return { passed: true };
  } catch {
    log("eval", "eval pyramid FAIL — regression detected (test-gate blocks)");
    return { passed: false };
  }
}

/**
 * STEP 4 — propose → test-gate → commit. Write a proposal note for any drift/staleness
 * (NEVER auto-edits the brain — that's the deferred Claude half). The commit is gated
 * on the eval passing; `--dry-run` skips it.
 */
function proposeAndGate({ drift, stale }, evalPassed, dryRun) {
  const hasProposal = drift.length > 0 || stale.length > 0;
  if (!hasProposal) {
    log("propose", "no drift, no staleness — nothing to propose");
    return { committed: false, proposalPath: null };
  }

  const lines = [
    `# RSI proposal — ${new Date().toISOString()}`,
    "",
    "> Generated by workflows/rsi.workflow.js (deterministic half). The Claude half",
    `> (model: ${RSI_MODEL}, deferred to CLAUDE_CODE_OAUTH_TOKEN per D8) rewrites the`,
    "> affected brain/**.md when it lights up. This file is a DETECTION, not an edit.",
    "",
  ];
  if (drift.length) {
    lines.push("## Tool-matrix drift (propose brain/TOOL-MATRIX.md pin bump + test-after-bump)");
    for (const d of drift) lines.push(`- ${d.tool}: pinned ${d.pin} → upstream ${d.latest} (O-14: pin + test the specific backend after a bump)`);
    lines.push("");
  }
  if (stale.length) {
    lines.push("## Brain pin facts that no longer parse (re-verify the doctrine)");
    for (const s of stale) lines.push(`- ${s}`);
    lines.push("");
  }

  const proposalDir = join(REPO_ROOT, "workflows", "proposals");
  const proposalPath = join(proposalDir, `rsi-${new Date().toISOString().slice(0, 10)}.md`);

  // test-gate: only commit if the eval passed (don't snap forward over a regression).
  if (!evalPassed) {
    log("test-gate", "eval failed — refusing to commit a proposal over a regression (snap-back behavior)");
    return { committed: false, proposalPath: null, blocked: true };
  }

  if (dryRun) {
    log("propose", `[dry-run] would write proposal to ${proposalPath} (${drift.length} drift, ${stale.length} stale)`);
    return { committed: false, proposalPath, dryRun: true };
  }

  mkdirSync(proposalDir, { recursive: true });
  writeFileSync(proposalPath, lines.join("\n") + "\n", "utf8");
  log("commit", `wrote proposal ${proposalPath} (NOT auto-editing the brain — Claude half deferred, D8)`);
  return { committed: true, proposalPath };
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  log("start", `deterministic $0 engine (model for deferred Claude half: ${RSI_MODEL})${dryRun ? " [dry-run]" : ""}`);

  const refresh = refreshToolMatrix();
  const verify = reVerifyBrainPins();
  const evalResult = runEvalPyramid();

  const proposal = proposeAndGate(
    { drift: refresh.drift, stale: verify.stale },
    evalResult.passed,
    dryRun,
  );

  // Exit policy:
  // - A stale brain pin fact (step 2) is a real FAIL — the doctrine drifted.
  // - An eval regression (step 3) is a real FAIL — the test-gate blocks.
  // - Tool-matrix drift (step 1) is a PROPOSAL, not a failure (upstream moved; we
  //   detect + propose; the Claude half acts later — D8). It does NOT fail the run.
  const fail = verify.stale.length > 0 || !evalResult.passed;
  log(
    "done",
    `drift=${refresh.drift.length} stale=${verify.stale.length} eval=${evalResult.passed ? "pass" : "fail"} proposal=${proposal.proposalPath ? "yes" : "no"}`,
  );
  process.exit(fail ? 1 : 0);
}

main();
