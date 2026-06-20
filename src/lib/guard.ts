/**
 * guard.ts — input validation for secret names (brain P-18, browser-agent Rule 9
 * analog). A secret name that flows into a store/file path must not allow
 * traversal (`../../etc/passwd`). Used by `hush broker` and the MCP broker tool.
 */
import { resolve } from "node:path";

const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;

/**
 * Throw if `name` is not a safe secret name. Returns the name unchanged on
 * success so it can be used inline.
 */
export function safeSecretName(name: string): string {
  if (!SAFE_NAME.test(name)) {
    throw new Error(
      `invalid secret name "${name}" — must match /^[a-zA-Z0-9_-]+$/ (path-traversal guard, P-18)`,
    );
  }
  return name;
}

/**
 * Verify a resolved path stays inside `baseDir` (defense in depth on top of the
 * name check). Returns the resolved absolute path.
 */
export function resolveWithinBase(baseDir: string, name: string): string {
  safeSecretName(name);
  const base = resolve(baseDir);
  const full = resolve(base, name);
  if (!full.startsWith(base)) {
    throw new Error(`path "${name}" escapes the store directory (P-18)`);
  }
  return full;
}
