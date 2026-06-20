#!/usr/bin/env node
/**
 * eval/run.mjs — hush's eval pyramid runner (E1; PLAN §6, HARNESS-OVERRIDES
 * component 9). The `pnpm eval` entry point.
 *
 * Hamel three-level pyramid:
 *   L1  structural assertions      (GT-3 no-FN/no-FP, GT-4 schema, GT-15 acceptance)
 *   L2  binary golden tasks        (GT-1..GT-10) graded by an ASSERTION-CHECKER
 *       against each scenario's Resolution success-criterion — NO self-grading:
 *       the checker tests structural properties of hush's DETERMINISTIC output
 *       (advise/remediate/rotate-plan/broker/scan), so a deliberately-broken
 *       golden answer turns the run red.
 *   L3  trajectory tasks           (GT-11..GT-14) judged by a calibrated
 *       LLM-judge (Hamel binary) — RUN only when ANTHROPIC_API_KEY is present;
 *       NON-blocking (nightly). Their absence is not a CI failure.
 *
 * CI-blocking subset = every task with "ci_block": true (GT-1..GT-10 + GT-15).
 * Exit nonzero iff any CI-blocking task fails. L3 failures/skip never block.
 *
 * No self-grading: the model does not grade its own answer. L2 is graded by code
 * (the assertion checker); L3 by a SEPARATE judge model with a binary rubric.
 *
 * Model routing (CP123 D12/D14): the L3 judge passes an EXPLICIT model
 * (claude-opus-4-8[1m]) — never a bare default.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { advise } from "../dist/lib/false-green.js";
import { remediationPlan, rotationPlan, recommendTool } from "../dist/lib/doctrine.js";
import { generateEnvExample } from "../dist/lib/env-example.js";
import { scanRepo } from "../dist/scanners/index.js";
import { containsSecret } from "../dist/lib/redact.js";
import {
  materializePlanted,
  materializeClean,
  plantedAcceptanceRepo,
} from "./fixtures/corpus.mjs";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { judgeTrajectory, judgeAvailable } from "./judge.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(HERE, "golden");
const REPO_ROOT = join(HERE, "..");

const ANSI = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// ---------------------------------------------------------------------------
// kind handlers — each returns a flat result object the assertions read from.
// These call hush's DETERMINISTIC libs (the same code the CLI/MCP ship), so the
// eval grades the real product, not a stored answer.
// ---------------------------------------------------------------------------

function brokerResult(secretName) {
  // Mirror src/cli/commands/broker.ts / src/mcp/tools.ts: a handle, never a value.
  const handle = `hush://store/${secretName}`;
  const out = { handle, expiresAt: new Date(Date.now() + 300_000).toISOString() };
  const transcript = JSON.stringify(out);
  return {
    has_handle: typeof out.handle === "string" && out.handle.length > 0,
    has_value_field: Object.prototype.hasOwnProperty.call(out, "value"),
    handle: out.handle,
    transcript,
    transcript_no_secret: !containsSecret(transcript),
  };
}

function scanCorpusResult() {
  const plantedRepo = materializePlanted();
  const cleanRepo = materializeClean();
  const p = scanRepo({ path: plantedRepo });
  const c = scanRepo({ path: cleanRepo });
  const plantedStr = JSON.stringify(p.findings);
  return {
    planted: {
      exitCode: p.exitCode,
      findings_count: p.findings.length,
      no_raw_value: !containsSecret(plantedStr),
    },
    clean: { exitCode: c.exitCode, findings_count: c.findings.length },
  };
}

function envExampleResult(files) {
  // Materialize the given files into an ephemeral git repo, then generate.
  const repo = mkdtempSync(join(tmpdir(), "hush-envex-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "e@e.co"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "e"], { cwd: repo });
  for (const [rel, body] of Object.entries(files)) {
    const full = join(repo, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, "utf8");
  }
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "x"], { cwd: repo });
  const { body, vars } = generateEnvExample(repo);
  return { vars: [...vars], body, body_no_real_value: !containsSecret(body) };
}

function brainKnowledgeResult(brainFile, section) {
  const text = readFileSync(join(REPO_ROOT, brainFile), "utf8");
  // Extract the scenario section: from "## S-NN" up to the next "## " heading.
  const re = new RegExp(`(^|\\n)##\\s+${section}\\b[\\s\\S]*?(?=\\n##\\s|$)`, "i");
  const m = re.exec(text);
  return { section_text: m ? m[0] : "" };
}

function acceptanceResult() {
  const repo = plantedAcceptanceRepo();
  const scan = scanRepo({ path: repo, history: true });
  const scanStr = JSON.stringify(scan.findings);
  // doctor: import lazily from dist.
  return import("../dist/lib/doctor.js").then(({ doctor }) => {
    const doc = doctor(repo);
    const cleanRepo = mkdtempSync(join(tmpdir(), "hush-accept-clean-"));
    execFileSync("git", ["init", "-q"], { cwd: cleanRepo });
    execFileSync("git", ["config", "user.email", "c@c.co"], { cwd: cleanRepo });
    execFileSync("git", ["config", "user.name", "c"], { cwd: cleanRepo });
    writeFileSync(join(cleanRepo, "README.md"), "ok\n", "utf8");
    execFileSync("git", ["add", "-A"], { cwd: cleanRepo });
    execFileSync("git", ["commit", "-qm", "x"], { cwd: cleanRepo });
    const cleanScan = scanRepo({ path: cleanRepo, history: true });
    return {
      planted_scan: {
        exitCode: scan.exitCode,
        has_rule: scan.findings.some((f) => typeof f.rule === "string" && f.rule.length > 0),
        no_raw_value: !containsSecret(scanStr),
      },
      doctor: { gitignore_ok: doc.gitignore_ok, has_score: typeof doc.score === "number" },
      clean_scan: { exitCode: cleanScan.exitCode },
    };
  });
}

// ---------------------------------------------------------------------------
// assertion checker — reads a dotted path into the result, applies the op.
// ---------------------------------------------------------------------------

function dig(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Build a case-insensitive RegExp from a golden-task `value`. JS does not support
 * the inline `(?i)` flag, so we strip a leading `(?i)` if present and apply the
 * `i` flag on the constructor instead (golden tasks are authored case-insensitive).
 */
function rx(pattern) {
  return new RegExp(pattern.replace(/^\(\?i\)/, ""), "i");
}

function evalAssertion(a, ctx) {
  const { check } = a;
  // The check string is "<resultKey>.<field>" or "<resultKey>.<field>.<op-suffix>".
  // We resolve special composite checks first, then fall back to dotted access.
  switch (check) {
    // --- advise (L2) ---
    case "advise.verdict":
      return ctx.advise.verdict === a.equals;
    case "advise.false_green":
      return ctx.advise.false_green === a.equals;
    case "advise.brain_refs.includes":
      return ctx.advise.brain_refs.includes(a.value);
    case "advise.brain_refs.includesAny":
      return a.value.some((v) => ctx.advise.brain_refs.includes(v));
    case "advise.doctrine.matches":
      return rx(a.value).test(ctx.advise.doctrine);
    // --- remediate (L2) ---
    case "remediate.rotate_first":
      return ctx.remediate.rotate_first === a.equals;
    case "remediate.consent_required_for_scrub":
      return ctx.remediate.consent_required_for_scrub === a.equals;
    case "remediate.step1.matches":
      return rx(a.value).test(ctx.remediate.ordered_steps[0] ?? "");
    case "remediate.rotate_before_scrub": {
      const steps = ctx.remediate.ordered_steps;
      const rotateIdx = steps.findIndex((s) => /rotate/i.test(s));
      const scrubIdx = steps.findIndex((s) => /git rm --cached|filter-repo/i.test(s));
      const rotateBeforeScrub = rotateIdx !== -1 && (scrubIdx === -1 || rotateIdx < scrubIdx);
      return rotateBeforeScrub === a.equals;
    }
    // --- rotate-plan (L2) ---
    case "rotatePlan.pattern":
      return ctx.rotatePlan.pattern === a.equals;
    case "rotatePlan.alternating_users":
      return ctx.rotatePlan.alternating_users === a.equals;
    case "rotatePlan.steps.matches":
      return rx(a.value).test(ctx.rotatePlan.steps.join("\n"));
    // --- broker (L2 / O-09) ---
    case "broker.has_handle":
      return ctx.broker.has_handle === a.equals;
    case "broker.has_value_field":
      return ctx.broker.has_value_field === a.equals;
    case "broker.handle.matches":
      return rx(a.value).test(ctx.broker.handle);
    case "broker.transcript.no_secret_shaped":
      return ctx.broker.transcript_no_secret === a.equals;
    // --- scan corpus (L1, GT-3) ---
    case "scan.planted.exitCode":
      return a.notEquals !== undefined
        ? ctx.scan.planted.exitCode !== a.notEquals
        : ctx.scan.planted.exitCode === a.equals;
    case "scan.planted.findings_min":
      return ctx.scan.planted.findings_count >= a.value;
    case "scan.planted.no_raw_value":
      return ctx.scan.planted.no_raw_value === a.equals;
    case "scan.clean.exitCode":
      return ctx.scan.clean.exitCode === a.equals;
    case "scan.clean.findings_count":
      return ctx.scan.clean.findings_count === a.equals;
    // --- env-example (L1, GT-4) ---
    case "envExample.vars.equalsSet": {
      const got = new Set(ctx.envExample.vars);
      const want = new Set(a.value);
      return got.size === want.size && [...want].every((v) => got.has(v));
    }
    case "envExample.body.no_real_value":
      return ctx.envExample.body_no_real_value === a.equals;
    case "envExample.body.matches":
      return rx(a.value).test(ctx.envExample.body);
    // --- brain knowledge (L2, GT-9/GT-10) ---
    case "brain.section.matches":
      return rx(a.value).test(ctx.brain.section_text);
    // --- acceptance (L1, GT-15) ---
    case "acceptance.planted_scan.exitCode":
      return ctx.acceptance.planted_scan.exitCode !== a.notEquals;
    case "acceptance.planted_scan.has_rule":
      return ctx.acceptance.planted_scan.has_rule === a.equals;
    case "acceptance.planted_scan.no_raw_value":
      return ctx.acceptance.planted_scan.no_raw_value === a.equals;
    case "acceptance.doctor.gitignore_ok":
      return ctx.acceptance.doctor.gitignore_ok === a.equals;
    case "acceptance.doctor.has_score":
      return ctx.acceptance.doctor.has_score === a.equals;
    case "acceptance.clean_scan.exitCode":
      return ctx.acceptance.clean_scan.exitCode === a.equals;
    default:
      // Generic dotted access fallback (keeps the checker extensible).
      if (a.equals !== undefined) return dig(ctx, check) === a.equals;
      if (a.notEquals !== undefined) return dig(ctx, check) !== a.notEquals;
      throw new Error(`unknown assertion check: ${check}`);
  }
}

// ---------------------------------------------------------------------------
// build the result context for a task based on its kind, then run assertions.
// ---------------------------------------------------------------------------

async function runTask(task) {
  const ctx = {};
  switch (task.kind) {
    case "advise+remediate":
      ctx.advise = advise(task.input.situation);
      // Use a clean finding/file name for the remediation plan — the `situation`
      // string can itself contain phrases like "git rm --cached" that would leak
      // into the interpolated plan steps and corrupt index-order assertions.
      ctx.remediate = remediationPlan(task.input.finding ?? "the committed secret");
      break;
    case "advise":
      ctx.advise = advise(task.input.situation);
      break;
    case "rotate-plan":
      ctx.rotatePlan = rotationPlan(task.input.secretRef, !!task.input.liveConnections);
      break;
    case "broker":
      ctx.broker = brokerResult(task.input.secretName);
      break;
    case "scan-corpus":
      ctx.scan = scanCorpusResult();
      break;
    case "env-example":
      ctx.envExample = envExampleResult(task.input.files);
      break;
    case "brain-knowledge":
      ctx.brain = brainKnowledgeResult(task.input.brain_file, task.input.section);
      break;
    case "acceptance":
      ctx.acceptance = await acceptanceResult();
      break;
    case "trajectory-judge":
      // L3 — handled separately (judge), not via assertions.
      return null;
    default:
      throw new Error(`unknown task kind: ${task.kind}`);
  }
  const results = task.assertions.map((a) => ({
    check: a.check,
    pass: evalAssertion(a, ctx),
  }));
  return results;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const onlyL3 = args.includes("--l3");
  const includeL3 = onlyL3 || args.includes("--all") || args.includes("--nightly");

  const files = readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const tasks = files.map((f) => JSON.parse(readFileSync(join(GOLDEN_DIR, f), "utf8")));

  let ciPass = 0;
  let ciFail = 0;
  let l3Pass = 0;
  let l3Fail = 0;
  let l3Skip = 0;
  const failures = [];

  console.log("hush eval pyramid (Hamel L1/L2/L3) — no self-grading\n");

  for (const task of tasks) {
    const isL3 = task.level === "L3";
    if (isL3 && !includeL3) {
      console.log(`${ANSI.dim("SKIP")} ${task.id} (${task.level}, nightly) — ${task.title}`);
      continue;
    }
    if (!isL3 && onlyL3) continue;

    if (isL3) {
      if (!judgeAvailable()) {
        l3Skip++;
        console.log(
          `${ANSI.yellow("SKIP")} ${task.id} (L3) — no ANTHROPIC_API_KEY (judge unavailable; non-blocking)`,
        );
        continue;
      }
      const verdict = await judgeTrajectory(task);
      if (verdict.pass) {
        l3Pass++;
        console.log(`${ANSI.green("PASS")} ${task.id} (L3) — ${task.title}`);
      } else {
        l3Fail++;
        console.log(`${ANSI.red("FAIL")} ${task.id} (L3, non-blocking) — ${verdict.reason}`);
      }
      continue;
    }

    // L1/L2 — assertion-checked.
    let results;
    try {
      results = await runTask(task);
    } catch (err) {
      ciFail++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${task.id}: threw — ${msg}`);
      console.log(`${ANSI.red("FAIL")} ${task.id} (${task.level}) — threw: ${msg}`);
      continue;
    }
    const failed = results.filter((r) => !r.pass);
    if (failed.length === 0) {
      ciPass++;
      console.log(`${ANSI.green("PASS")} ${task.id} (${task.level}) — ${task.title}`);
    } else {
      ciFail++;
      for (const f of failed) failures.push(`${task.id}: assertion failed — ${f.check}`);
      console.log(
        `${ANSI.red("FAIL")} ${task.id} (${task.level}) — ${failed.map((f) => f.check).join(", ")}`,
      );
    }
  }

  // F1 over the CI-blocking binary tasks (all assertions are "should pass"
  // positives, so precision=recall=accuracy here; report it for the F1≥0.8 gate).
  const ciTotal = ciPass + ciFail;
  const f1 = ciTotal === 0 ? 1 : ciPass / ciTotal;

  console.log("");
  console.log(`CI-blocking (L1/L2): ${ANSI.green(`${ciPass} pass`)} / ${ciFail ? ANSI.red(`${ciFail} fail`) : "0 fail"}  (F1=${f1.toFixed(2)}, floor 0.80)`);
  if (includeL3) {
    console.log(`L3 trajectory (nightly, non-blocking): ${l3Pass} pass / ${l3Fail} fail / ${l3Skip} skip`);
  }
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log("  - " + f);
  }

  // Exit nonzero iff a CI-blocking task failed OR F1 below the 0.8 floor.
  const ok = ciFail === 0 && f1 >= 0.8;
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[eval] fatal:", err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
