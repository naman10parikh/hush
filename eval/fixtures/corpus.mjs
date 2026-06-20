/**
 * corpus.mjs — materialize the fixture corpus into ephemeral git repos.
 *
 * WHY this exists (the load-bearing design decision, Risk #1 / G-10):
 * hush's built-in scanner (src/scanners/builtin.ts) deliberately SKIPS any path
 * under `fixtures/` and any value carrying a DUMMY/PLACEHOLDER marker — that is
 * the S-12 / P-03 false-positive suppression, and it is CORRECT (hush must not
 * flag its own test fixtures, or it fails its own dogfood self-scan). So the
 * committed corpus under `eval/fixtures/` is, by construction, NOT scanned where
 * it sits.
 *
 * To genuinely test no-FN (real keys ARE flagged) and no-FP (`password =
 * "password"` is NOT), the corpus is COPIED into a fresh ephemeral git repo with
 * the files at the repo ROOT (path `leaked-anthropic.env`, not
 * `eval/fixtures/planted/...`) — out of the `fixtures/` allowlist — where the
 * scanner runs for real. This is the same shape the acceptance test (E3) uses:
 * a planted key in a throwaway repo.
 *
 * The planted fixture VALUES are secret-SHAPED but harmless (zeroed/patterned,
 * no real entropy, no DUMMY marker) so: (a) they match the prefix patterns (the
 * scanner's no-FN path fires), (b) they are not real credentials, (c) they don't
 * carry the working-tree DUMMY skip-marker (so they aren't skipped in the
 * ephemeral repo).
 *
 * Used by: eval/run.mjs (GT-3, GT-15/acceptance) and sandbox/run-acceptance.sh.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PLANTED_DIR = join(HERE, "planted");
export const CLEAN_DIR = join(HERE, "clean");

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

/** Initialize a throwaway git repo with a deterministic identity (CI-safe). */
function initRepo(dir) {
  git(["init", "-q"], dir);
  git(["config", "user.email", "corpus@hush.test"], dir);
  git(["config", "user.name", "hush-corpus"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
}

/**
 * Copy every file from `srcDir` into the root of a fresh ephemeral repo and
 * commit it (so it is in BOTH the working tree and history). Returns the repo
 * path. `commitToHistory` plants the file via a commit (the realistic
 * leaked-then-committed case) — true by default.
 */
export function materialize(srcDir, { commitToHistory = true } = {}) {
  const repo = mkdtempSync(join(tmpdir(), "hush-corpus-"));
  initRepo(repo);
  // Copy files to the ephemeral repo ROOT (out of the fixtures/ allowlist).
  for (const name of readdirSync(srcDir)) {
    cpSync(join(srcDir, name), join(repo, name), { recursive: true });
  }
  if (commitToHistory) {
    git(["add", "-A"], repo);
    git(["commit", "-qm", "plant corpus"], repo);
  }
  return repo;
}

/** Materialize the PLANTED corpus (real-shaped keys → MUST produce findings). */
export function materializePlanted(opts) {
  return materialize(PLANTED_DIR, opts);
}

/** Materialize the CLEAN corpus (FP fixtures → MUST produce zero findings). */
export function materializeClean(opts) {
  return materialize(CLEAN_DIR, opts);
}

/**
 * Build a single ephemeral repo with ONE planted secret committed to history —
 * the canonical acceptance-test fixture (PLAN §5). Returns the repo path.
 */
export function plantedAcceptanceRepo() {
  const repo = mkdtempSync(join(tmpdir(), "hush-accept-"));
  initRepo(repo);
  // A real-shaped Anthropic key (zeroed value), committed to history — the
  // realistic "leaked .env" case. No DUMMY marker, so the history scan reports it.
  writeFileSync(
    join(repo, "leaked.env"),
    "ANTHROPIC_API_KEY=sk-ant-api03-0000000000000000000000000000000000000000000000000000\n",
    "utf8",
  );
  git(["add", "leaked.env"], repo);
  git(["commit", "-qm", "plant"], repo);
  return repo;
}

// Allow running standalone for a quick smoke (prints the two repo paths).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ planted: materializePlanted(), clean: materializeClean() }));
}
