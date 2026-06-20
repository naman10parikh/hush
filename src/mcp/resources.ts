/**
 * resources.ts — the read-only `hush://brain/*` MCP resources (PLAN §3 component
 * 7 / §4). An agent that connects to hush can read the six brain files to ground
 * itself in the secrets doctrine BEFORE asking for a verdict.
 *
 * These are doctrine documents (markdown), not secrets — they carry zero secret
 * values. Still, every resource read is run through the redact filter (defence in
 * depth, O-12) so a brain file that ever quoted a key-shape literally cannot leak
 * through this surface.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { redact } from "../lib/redact.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist/mcp/resources.js → repo root is two levels up.
const REPO_ROOT = join(here, "..", "..");
const BRAIN_DIR = join(REPO_ROOT, "brain");

/** A brain file exposed as an `hush://brain/*` resource. */
export interface BrainResource {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly file: string;
  readonly mimeType: "text/markdown";
}

/**
 * The six grounding brain files (the doctrine). Names match the on-disk files so
 * the RSI loop and the cockpit reference the same corpus.
 */
export const BRAIN_RESOURCES: readonly BrainResource[] = [
  {
    uri: "hush://brain/expertise-map",
    name: "EXPERTISE-MAP",
    description: "What hush must master, by the 12 jobs-to-be-done (the spine).",
    file: "EXPERTISE-MAP.md",
    mimeType: "text/markdown",
  },
  {
    uri: "hush://brain/opinions",
    name: "OPINIONS",
    description: "hush's explicit taste — always X / never Y / because Z (the anti-slop layer).",
    file: "OPINIONS.md",
    mimeType: "text/markdown",
  },
  {
    uri: "hush://brain/known-pitfalls",
    name: "KNOWN-PITFALLS",
    description: "Version-specific gotchas with detect + avoid (P-01..P-18).",
    file: "KNOWN-PITFALLS.md",
    mimeType: "text/markdown",
  },
  {
    uri: "hush://brain/battle-tested-scenarios",
    name: "BATTLE-TESTED-SCENARIOS",
    description: "Real failure/migration scenarios with success criteria (S-01..S-15).",
    file: "BATTLE-TESTED-SCENARIOS.md",
    mimeType: "text/markdown",
  },
  {
    uri: "hush://brain/tool-matrix",
    name: "TOOL-MATRIX",
    description: "The tool-by-tool view + the decision tree (recommend the layer, not a brand).",
    file: "TOOL-MATRIX.md",
    mimeType: "text/markdown",
  },
  {
    uri: "hush://brain/gaps-and-disputes",
    name: "GAPS-AND-DISPUTES",
    description: "What is contested / unconfirmed — refuse to assert these (e.g. a single price, G-01).",
    file: "GAPS-AND-DISPUTES.md",
    mimeType: "text/markdown",
  },
];

/** List the resource descriptors for `resources/list`. */
export function listResources(): readonly Omit<BrainResource, "file">[] {
  return BRAIN_RESOURCES.map(({ uri, name, description, mimeType }) => ({
    uri,
    name,
    description,
    mimeType,
  }));
}

/**
 * Read one resource by URI. Returns the redacted markdown text, or null if the
 * URI is unknown / the file is missing (the caller maps null to a JSON-RPC error).
 */
export function readResource(uri: string): { uri: string; mimeType: string; text: string } | null {
  const res = BRAIN_RESOURCES.find((r) => r.uri === uri);
  if (!res) return null;
  const path = join(BRAIN_DIR, res.file);
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  // Defence in depth (O-09/O-12): brain files are doctrine, but the surface still
  // redacts so no secret-shaped literal can ever leave through this channel.
  return { uri, mimeType: res.mimeType, text: redact(raw) };
}
