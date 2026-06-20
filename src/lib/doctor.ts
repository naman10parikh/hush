/**
 * doctor.ts — the secret-manager wiring report behind `hush doctor` (PLAN §4;
 * the second half of the acceptance test). Checks the cwd repo's hygiene against
 * hush's doctrine (JOB 1/2/6) and returns a structured, scored report.
 *
 * All checks are file-level and offline. No secret value is ever read into the
 * report (it reports BOOLEANS about wiring, never values — O-09).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scanMcpConfig } from "../scanners/mcp-config.js";
import { GITLEAKS_PINNED_VERSION } from "../scanners/gitleaks.js";

export interface DoctorReport {
  /** .gitignore excludes .env* AND keeps !.env.example (O-01/P-01). */
  readonly gitignore_ok: boolean;
  /** .env.example exists and is NOT a stale superset (no foreign-product keys, O-02). */
  readonly env_example_schema_only: boolean;
  /** .mcp.json uses ${VAR} refs, no literal secret (P-16). */
  readonly mcp_refs_ok: boolean;
  /** a scanner config (.gitleaks.toml / .pre-commit-config.yaml) is present. */
  readonly scanners_present: boolean;
  /** .sops.yaml lists ≥2 recipients (break-glass, O-07/S-04). */
  readonly sops_breakglass: boolean;
  /** 0..1 hygiene score (fraction of checks passed). */
  readonly score: number;
  /** human-readable gaps, each citing the brain anchor. */
  readonly gaps: readonly string[];
  readonly recommended_pin: string;
}

function read(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

function checkGitignore(repo: string): boolean {
  const gi = read(join(repo, ".gitignore"));
  if (!gi) return false;
  const ignoresEnv = /(^|\n)\s*\.env(\*|\b)/.test(gi);
  const keepsExample = /(^|\n)\s*!\.env\.example\b/.test(gi);
  return ignoresEnv && keepsExample;
}

// Foreign-product keys that betray a copied/stale .env.example (S-14 / P-02).
const STALE_MARKERS = /\b(Clerk|Ticketmaster|Stripe|Supabase|Twilio|WhatsApp|Discord)\b/i;

function checkEnvExample(repo: string): boolean {
  const ex = read(join(repo, ".env.example"));
  if (!ex) return false;
  // Schema-only = exists, has at least one VAR= line, and carries no stale superset markers.
  const hasVars = /^[A-Z][A-Z0-9_]*=/m.test(ex);
  return hasVars && !STALE_MARKERS.test(ex);
}

function checkScanners(repo: string): boolean {
  return (
    existsSync(join(repo, ".gitleaks.toml")) ||
    existsSync(join(repo, ".pre-commit-config.yaml")) ||
    existsSync(join(repo, ".github", "workflows", "acceptance.yml"))
  );
}

function checkSopsBreakglass(repo: string): boolean {
  const sops = read(join(repo, ".sops.yaml"));
  if (!sops) return false;
  // ≥2 recipient keys (e.g. an age: alongside a kms:, or two age recipients).
  const ageCount = (sops.match(/age1[0-9a-z]+/g) ?? []).length;
  const hasKms = /kms:|gcp_kms:|azure_keyvault:/i.test(sops);
  return ageCount >= 2 || (ageCount >= 1 && hasKms);
}

/** Run the full wiring report for `repoPath`. */
export function doctor(repoPath: string): DoctorReport {
  const gitignore_ok = checkGitignore(repoPath);
  const env_example_schema_only = checkEnvExample(repoPath);
  const mcp = scanMcpConfig(repoPath);
  const mcp_refs_ok = mcp.refs_ok;
  const scanners_present = checkScanners(repoPath);
  const sops_breakglass = checkSopsBreakglass(repoPath);

  const checks = [
    gitignore_ok,
    env_example_schema_only,
    mcp_refs_ok,
    scanners_present,
    sops_breakglass,
  ];
  const score = Number(
    (checks.filter(Boolean).length / checks.length).toFixed(2),
  );

  const gaps: string[] = [];
  if (!gitignore_ok)
    gaps.push(".gitignore does not exclude .env* with !.env.example (O-01/P-01)");
  if (!env_example_schema_only)
    gaps.push(".env.example is missing or a stale superset — generate from real schema (S-14/P-02)");
  if (!mcp_refs_ok)
    gaps.push(".mcp.json contains a literal secret (use ${VAR} refs) (P-16)");
  if (!scanners_present)
    gaps.push("no scanner config (.gitleaks.toml / pre-commit / CI) — run `hush init --scanner` (O-03)");
  if (!sops_breakglass)
    gaps.push(".sops.yaml lacks a break-glass 2nd recipient (O-07/S-04) — if you use SOPS");

  return {
    gitignore_ok,
    env_example_schema_only,
    mcp_refs_ok,
    scanners_present,
    sops_breakglass,
    score,
    gaps,
    recommended_pin: `gitleaks ${GITLEAKS_PINNED_VERSION}`,
  };
}
