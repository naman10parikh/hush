/**
 * Single source of truth for hush's version, read from package.json at runtime.
 * Used by the CLI (`hush --version`) and the MCP server handshake.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// dist/version.js → repo root is two levels up (dist/ → repo).
const pkgPath = join(here, "..", "package.json");

interface PkgShape {
  readonly version: string;
  readonly name: string;
}

function readPkg(): PkgShape {
  try {
    const raw = readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PkgShape>;
    return {
      version: typeof parsed.version === "string" ? parsed.version : "0.0.0",
      name: typeof parsed.name === "string" ? parsed.name : "hush",
    };
  } catch (err) {
    // Intentionally tolerant: a missing/garbled package.json must not crash --version.
    console.warn(
      "[version] could not read package.json:",
      err instanceof Error ? err.message : String(err),
    );
    return { version: "0.0.0", name: "hush" };
  }
}

const pkg = readPkg();

export const HUSH_VERSION: string = pkg.version;
export const HUSH_NAME: string = pkg.name;
