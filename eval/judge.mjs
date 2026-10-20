/**
 * eval/judge.mjs — the L3 calibrated LLM-judge (Hamel binary rubric).
 *
 * Used by eval/run.mjs for the L3 trajectory tasks (GT-11..GT-14). The judge is
 * a SEPARATE model call from any answer generation — hush does NOT grade its own
 * output (no self-grading, PLAN §6). The judge scores hush's doctrine answer for
 * a scenario against a binary PASS/FAIL rubric (Hamel: binary, not Likert).
 *
 * For the L3 scenarios, the "answer under test" is hush's deterministic doctrine
 * for that scenario (the advise() verdict + the brain scenario resolution) — the
 * judge confirms the doctrine contains the load-bearing pieces the success
 * criterion demands. This keeps it falsifiable: if the doctrine regresses, the
 * judge fails the task.
 *
 * Transport: raw Messages API over the built-in global `fetch` (Node 20+) — NO
 * @anthropic-ai/sdk dependency (PLAN §7 pins only `commander`; the L3 judge is
 * nightly/non-blocking and must not pull a heavy dep into the CI-blocking path).
 *
 * Model routing: the person names the judge model in HUSH_JUDGE_MODEL. The
 * Messages API needs a model name and hush never picks one, because a fixed ID
 * goes stale; with no name, L3 is skipped.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { advise } from "../dist/lib/false-green.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

/** The judge model, named by the person; empty when unset (L3 is then skipped). */
export function judgeModel() {
  return process.env.HUSH_JUDGE_MODEL?.trim() ?? "";
}
const ANTHROPIC_VERSION = "2023-06-01";
const API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Resolve ANTHROPIC_API_KEY from the env OR the repo's gitignored .env (the
 * Wave-B runner sources it; CI passes it as a secret). Never logged.
 */
function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const env = readFileSync(join(REPO_ROOT, ".env"), "utf8");
    const m = env.match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    // Intentionally silent: no .env is the no-key path → judge unavailable (non-blocking).
  }
  return null;
}

/** True iff an Anthropic key is present (env or .env) and HUSH_JUDGE_MODEL names a model. L3 is skipped otherwise. */
export function judgeAvailable() {
  return apiKey() !== null && judgeModel() !== "";
}

/**
 * Build the doctrine "answer under test" for a scenario: hush's deterministic
 * advise() verdict + the brain scenario's Resolution text. The judge grades THIS
 * against the rubric — so a regression in either surface fails the task.
 */
function doctrineAnswer(task) {
  const verdict = advise(task.input.situation ?? "");
  const brainText = readFileSync(
    join(REPO_ROOT, "brain", "BATTLE-TESTED-SCENARIOS.md"),
    "utf8",
  );
  // Extract the source scenario section (e.g. S-06) for grounding.
  const section = task.from.split("/")[0];
  const re = new RegExp(`(^|\\n)##\\s+${section}\\b[\\s\\S]*?(?=\\n##\\s|$)`, "i");
  const m = re.exec(brainText);
  const resolution = m ? m[0] : "(no scenario section found)";
  return [
    `hush advise() verdict: ${verdict.verdict} (false_green=${verdict.false_green})`,
    `hush advise() doctrine: ${verdict.doctrine}`,
    `brain refs: ${verdict.brain_refs.join(", ")}`,
    "",
    `hush's scenario doctrine (${section}):`,
    resolution,
  ].join("\n");
}

/**
 * Call the Messages API and return the assistant text. Throws on non-200.
 * Uses adaptive thinking + max effort per the model contract. No streaming (the
 * judge output is a tiny JSON verdict — well under any timeout).
 */
async function callJudge(systemPrompt, userPrompt) {
  const key = apiKey();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: judgeModel(),
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      output_config: { effort: "max" },
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`judge API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const textBlock = (data.content ?? []).find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

/**
 * Judge one L3 trajectory task. Returns { pass, reason }.
 * Binary rubric (Hamel): the judge must answer PASS or FAIL with a one-line reason.
 */
export async function judgeTrajectory(task) {
  const answer = doctrineAnswer(task);
  const system =
    "You are a strict, calibrated grader for a secrets-management expert system called hush. " +
    "Grade the ANSWER against the RUBRIC with a BINARY verdict (PASS or FAIL) — never a score, never partial credit. " +
    "PASS only if EVERY load-bearing element the rubric demands is present in the answer. " +
    "Respond with a single line of JSON: {\"verdict\":\"PASS\"|\"FAIL\",\"reason\":\"<one sentence>\"}. No other text.";
  const user = [
    `RUBRIC (the success criterion):\n${task.judge_question}`,
    "",
    `Additional context — the scenario's success criterion: ${task.success_criterion}`,
    "",
    `ANSWER (hush's doctrine for this scenario):\n${answer}`,
  ].join("\n");

  try {
    const out = await callJudge(system, user);
    // Parse the single-line JSON verdict (tolerant of stray prose around it).
    const m = out.match(/\{[\s\S]*?"verdict"[\s\S]*?\}/);
    if (!m) return { pass: false, reason: `judge returned no parseable verdict: ${out.slice(0, 120)}` };
    const parsed = JSON.parse(m[0]);
    return {
      pass: parsed.verdict === "PASS",
      reason: parsed.reason ?? (parsed.verdict === "PASS" ? "ok" : "no reason given"),
    };
  } catch (err) {
    // A judge transport error is NON-blocking (L3 is nightly) — report, don't crash CI.
    return { pass: false, reason: `judge error (non-blocking): ${err instanceof Error ? err.message : String(err)}` };
  }
}
