#!/usr/bin/env node
/**
 * cockpit/server.mjs — hush's local cockpit (G1; PLAN §10, D3, HARNESS-OVERRIDES
 * "Product surface").
 *
 * A localhost-only, zero-dependency Node `http` stdlib server + vanilla-JS SPA.
 * The cockpit is THE CHAIRMAN'S EYES (energy CLAUDE.md HARD RULE 3), not an agent
 * surface — read-only on hush's own state. It exposes four views:
 *
 *   1. Brain browser  — render the 6 doctrine brain/**.md files + the [[wikilink]]
 *                       graph (the doctrine, searchable).            GET /api/brain
 *   2. Run log        — tail logs/runs.jsonl (already redacted by E2; re-guarded
 *                       here on the read side).                      GET /api/runs
 *   3. Eval scores    — the L1/L2/L3 golden-task pass/fail board + the acceptance
 *                       status (runs eval/run.mjs, parses stdout). GET /api/evals
 *   4. Ask the employee — prompt box → `hush advise` / `hush tool` over the local
 *                       CLI (doctrine + verdicts, NEVER a value).  POST /api/ask
 *
 * HARD invariant (brain O-09): the cockpit inherits handles-not-values. Every
 * response path is re-scanned for a secret-shaped string and redacted before it
 * leaves the process — a cockpit that surfaces a raw secret is an automatic fail.
 *
 * Security stance (a SECRETS cockpit must dogfood its own doctrine):
 *   - binds 127.0.0.1 ONLY (never 0.0.0.0) — not exposed (HARD RULE 3).
 *   - path-traversal guarded on every static + brain file read (brain P-18):
 *     resolve the path and assert it startsWith the allowed root.
 *   - the /api/ask handler spawns the CLI with an ARG ARRAY (never a shell
 *     string) and caps input length — no shell injection.
 *   - request-body capped (DoS guard); only the documented routes answer.
 *
 * Zero-dep on purpose (PLAN §10): the secret-shaped detector mirrors the prefixes
 * in src/lib/redact.ts inline (the same approach scripts/runs-view.mjs takes), so
 * the cockpit stays buildless and self-contained.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const PUBLIC_DIR = join(HERE, "public");
const BRAIN_DIR = join(REPO_ROOT, "brain");
const RUNS_LOG = join(REPO_ROOT, "logs", "runs.jsonl");
const HUSH_BIN = join(REPO_ROOT, "bin", "hush");
const EVAL_RUNNER = join(REPO_ROOT, "eval", "run.mjs");

const HOST = "127.0.0.1"; // chairman's eyes only — NEVER 0.0.0.0 (HARD RULE 3).
const PORT = Number(process.env.HUSH_COCKPIT_PORT ?? 7780);
const MAX_BODY = 64 * 1024; // ask prompts are tiny; refuse oversized bodies.
const MAX_ASK_LEN = 2000; // cap the prompt forwarded to the CLI.

// The 6 doctrine brain files the cockpit renders (PLAN §10 "the 6 brain/**.md").
// Ordered for reading; ORG_* / MOC are the scaffold's, not the doctrine surface.
const BRAIN_FILES = [
  "OPINIONS.md",
  "KNOWN-PITFALLS.md",
  "BATTLE-TESTED-SCENARIOS.md",
  "EXPERTISE-MAP.md",
  "TOOL-MATRIX.md",
  "GAPS-AND-DISPUTES.md",
];

// Secret-shaped detector (mirrors src/lib/redact.ts SECRET_PATTERNS prefixes —
// the read-side O-09 guard). If this matches an outgoing payload, we redact it.
const SECRET_SHAPED =
  /sk-ant-[A-Za-z0-9_-]{6,}|sk-(?:proj-)?[A-Za-z0-9]{16,}|A(?:KIA|SIA)[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

/** Redact any secret-shaped substring from arbitrary text (defense in depth). */
function redactText(text) {
  return text.replace(SECRET_SHAPED, "[REDACTED]");
}

/** Deep-redact a JSON-able value before it leaves the process (O-09 gate). */
function redactPayload(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactPayload);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactPayload(v);
    return out;
  }
  return value;
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, status, body) {
  const text = JSON.stringify(redactPayload(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(text);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(text);
}

// ---------------------------------------------------------------------------
// markdown → HTML (minimal, zero-dep). Handles the subset the brain uses:
// headings, bold/italic/code, fenced code, blockquotes, lists, hr, [[wikilinks]],
// and [text](url) links. NOT a general renderer — just enough for the doctrine.
// Everything is HTML-escaped first, so this is XSS-safe on trusted brain input.
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMd(text) {
  let s = escapeHtml(text);
  // fenced inline code first (so its content isn't further transformed)
  s = s.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  // [[wikilink]] → an in-app anchor the SPA intercepts (resolves to a brain file)
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, label) => {
    const t = String(target).trim();
    const text = (label ?? t).trim();
    return `<a class="wikilink" data-wiki="${t}" href="#brain/${encodeURIComponent(t)}">${text}</a>`;
  });
  // [text](url) markdown links — only http(s), opened in a new tab
  s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, (_m, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  // bold then italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return s;
}

function renderMarkdown(md) {
  // strip YAML frontmatter
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, "");
  const lines = body.split("\n");
  const html = [];
  let inCode = false;
  let listType = null; // 'ul' | 'ol' | null

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    // fenced code blocks
    const fence = line.match(/^```/);
    if (fence) {
      if (inCode) {
        html.push("</code></pre>");
        inCode = false;
      } else {
        closeList();
        html.push('<pre class="codeblock"><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(line));
      continue;
    }
    // blank line
    if (!line.trim()) {
      closeList();
      continue;
    }
    // horizontal rule
    if (/^---+$/.test(line.trim())) {
      closeList();
      html.push("<hr>");
      continue;
    }
    // headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      html.push(`<h${level}>${inlineMd(h[2])}</h${level}>`);
      continue;
    }
    // blockquote
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      closeList();
      html.push(`<blockquote>${inlineMd(bq[1])}</blockquote>`);
      continue;
    }
    // ordered list
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inlineMd(ol[1])}</li>`);
      continue;
    }
    // unordered list
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inlineMd(ul[1])}</li>`);
      continue;
    }
    // table row — render as a simple pre-styled row (the brain uses pipe tables);
    // keep it readable without a full table parser.
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      const isSep = /^\s*\|[\s:|-]+\|\s*$/.test(line);
      if (isSep) continue; // skip the |---|---| separator row
      const cells = line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => `<span class="td">${inlineMd(c.trim())}</span>`)
        .join("");
      html.push(`<div class="tr">${cells}</div>`);
      continue;
    }
    // paragraph
    closeList();
    html.push(`<p>${inlineMd(line)}</p>`);
  }
  closeList();
  if (inCode) html.push("</code></pre>");
  return html.join("\n");
}

/** Extract [[wikilink]] targets from raw markdown (for the graph). */
function extractWikilinks(md) {
  const out = new Set();
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(md)) !== null) out.add(m[1].trim());
  return [...out];
}

/** First non-frontmatter, non-heading line (a short summary for the card). */
function summaryOf(md) {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const s = fm[1].match(/^summary:\s*["']?(.+?)["']?\s*$/m);
    if (s) return redactText(s[1]).slice(0, 240);
  }
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, "");
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#") && !t.startsWith(">")) return redactText(t).slice(0, 240);
  }
  return "";
}

// ---------------------------------------------------------------------------
// API: brain — list + per-file render + the wikilink adjacency graph
// ---------------------------------------------------------------------------

function brainFileList() {
  const files = [];
  for (const name of BRAIN_FILES) {
    const full = join(BRAIN_DIR, name);
    if (!existsSync(full)) continue;
    const md = readFileSync(full, "utf8");
    const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? name.replace(/\.md$/, "")).trim();
    files.push({
      name,
      stem: name.replace(/\.md$/, ""),
      title,
      summary: summaryOf(md),
      links: extractWikilinks(md),
    });
  }
  return files;
}

function brainGraph(files) {
  // Build the node/edge graph from [[wikilink]] adjacency between brain stems.
  const stems = new Set(files.map((f) => f.stem));
  const nodes = files.map((f) => ({ id: f.stem, title: f.title }));
  const edges = [];
  for (const f of files) {
    for (const target of f.links) {
      if (stems.has(target) && target !== f.stem) {
        edges.push({ from: f.stem, to: target });
      }
    }
  }
  return { nodes, edges };
}

/** Resolve a wiki target (stem or filename) to a brain file, traversal-guarded. */
function resolveBrainFile(target) {
  const name = target.endsWith(".md") ? target : `${target}.md`;
  // only allow the curated doctrine files — never arbitrary repo paths (P-18)
  if (!BRAIN_FILES.includes(basename(name))) return null;
  const full = resolve(BRAIN_DIR, basename(name));
  if (!full.startsWith(resolve(BRAIN_DIR))) return null; // traversal guard
  if (!existsSync(full)) return null;
  return full;
}

// ---------------------------------------------------------------------------
// API: runs — read logs/runs.jsonl, redact-guard, summarize (reuses E2 shape)
// ---------------------------------------------------------------------------

function readRuns() {
  if (!existsSync(RUNS_LOG)) return { records: [], leaks: 0, malformed: 0 };
  const lines = readFileSync(RUNS_LOG, "utf8").split("\n").filter((l) => l.trim());
  const records = [];
  let leaks = 0;
  let malformed = 0;
  for (const line of lines) {
    if (SECRET_SHAPED.test(line)) {
      leaks++;
      continue; // NEVER surface a line carrying a secret-shaped value (O-09)
    }
    try {
      records.push(JSON.parse(line));
    } catch {
      malformed++;
    }
  }
  return { records, leaks, malformed };
}

function summarizeRuns(records) {
  const byCmd = {};
  const byOutcome = {};
  let totalFindings = 0;
  for (const r of records) {
    const cmd = String(r.cmd ?? "unknown");
    byCmd[cmd] = (byCmd[cmd] ?? 0) + 1;
    const o = String(r.outcome ?? "unknown");
    byOutcome[o] = (byOutcome[o] ?? 0) + 1;
    totalFindings += Number(r.findings_count) || 0;
  }
  return { total: records.length, byCmd, byOutcome, totalFindings };
}

// ---------------------------------------------------------------------------
// API: evals — run eval/run.mjs, parse the stable PASS/FAIL/SKIP stdout lines.
// This grades the REAL product (the same runner CI uses) — no duplicated logic,
// no touching eval/run.mjs (Karpathy surgical). The runner's lines are stable:
//   "PASS GT-1 (L2) — <title>"  /  "FAIL GT-3 (L1) — <checks>"  /  "SKIP GT-11 …"
// ANSI colour codes are stripped before matching.
// ---------------------------------------------------------------------------

function runEvals() {
  return new Promise((resolveP) => {
    if (!existsSync(EVAL_RUNNER)) {
      resolveP({ available: false, reason: "eval/run.mjs not found", tasks: [] });
      return;
    }
    const child = spawn(process.execPath, [EVAL_RUNNER], {
      cwd: REPO_ROOT,
      env: { ...process.env, NO_COLOR: "1" },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => {
      resolveP({ available: false, reason: String(e?.message ?? e), tasks: [] });
    });
    child.on("close", (code) => {
      const text = (out + "\n" + err).replace(/\x1b\[[0-9;]*m/g, ""); // strip ANSI
      const tasks = [];
      const lineRe = /^(PASS|FAIL|SKIP)\s+(GT-\d+)\s+\(([^)]+)\)\s+—\s+(.*)$/;
      for (const line of text.split("\n")) {
        const m = line.trim().match(lineRe);
        if (m) {
          tasks.push({ status: m[1], id: m[2], level: m[3].split(",")[0].trim(), detail: m[4].trim() });
        }
      }
      // acceptance status = GT-15 (the §5 acceptance flow)
      const accept = tasks.find((t) => t.id === "GT-15");
      const f1Match = text.match(/F1=([0-9.]+)/);
      resolveP({
        available: true,
        exitCode: code,
        ci_green: code === 0,
        f1: f1Match ? Number(f1Match[1]) : null,
        acceptance: accept ? accept.status : "UNKNOWN",
        tasks,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// API: ask — shell out to `hush advise` / `hush tool` via an arg array (no shell)
// ---------------------------------------------------------------------------

function runHush(args) {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [HUSH_BIN, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => resolveP({ ok: false, error: String(e?.message ?? e) }));
    child.on("close", () => {
      try {
        resolveP({ ok: true, data: JSON.parse(out.trim()) });
      } catch {
        resolveP({ ok: true, data: { raw: redactText(out.trim() || err.trim()) } });
      }
    });
  });
}

async function handleAsk(body) {
  const mode = body?.mode === "tool" ? "tool" : "advise"; // advise | tool
  const query = String(body?.query ?? "").slice(0, MAX_ASK_LEN).trim();
  if (!query) return { error: "empty query" };
  const args = mode === "tool" ? ["tool", query, "--json"] : ["advise", query, "--json"];
  const result = await runHush(args);
  if (!result.ok) return { error: result.error };
  // O-09: the CLI already returns handles/verdicts, but redact defensively.
  return { mode, query, result: result.data };
}

// ---------------------------------------------------------------------------
// static file serving (path-traversal guarded — P-18)
// ---------------------------------------------------------------------------

function serveStatic(res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const full = resolve(PUBLIC_DIR, rel);
  if (!full.startsWith(resolve(PUBLIC_DIR))) {
    sendText(res, 403, "forbidden");
    return;
  }
  if (!existsSync(full) || !statSync(full).isFile()) {
    sendText(res, 404, "not found");
    return;
  }
  const type = CONTENT_TYPES[extname(full)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(readFileSync(full));
}

function readBody(req) {
  return new Promise((resolveP, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolveP(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const path = url.pathname;

    // --- API routes ---
    if (path === "/api/health") {
      sendJson(res, 200, { ok: true, service: "hush-cockpit", repo: REPO_ROOT });
      return;
    }
    if (path === "/api/brain" && req.method === "GET") {
      const files = brainFileList();
      sendJson(res, 200, { files, graph: brainGraph(files) });
      return;
    }
    if (path === "/api/brain/file" && req.method === "GET") {
      const target = url.searchParams.get("name") ?? "";
      const full = resolveBrainFile(target);
      if (!full) {
        sendJson(res, 404, { error: "unknown brain file" });
        return;
      }
      const md = readFileSync(full, "utf8");
      sendJson(res, 200, {
        name: basename(full),
        title: (md.match(/^#\s+(.+)$/m)?.[1] ?? basename(full)).trim(),
        html: redactText(renderMarkdown(md)),
        links: extractWikilinks(md),
      });
      return;
    }
    if (path === "/api/runs" && req.method === "GET") {
      const { records, leaks, malformed } = readRuns();
      // newest first; cap the tail the SPA renders.
      const tail = records.slice(-200).reverse();
      sendJson(res, 200, { runs: tail, summary: summarizeRuns(records), leaks, malformed });
      return;
    }
    if (path === "/api/evals" && req.method === "GET") {
      const evals = await runEvals();
      sendJson(res, 200, evals);
      return;
    }
    if (path === "/api/ask" && req.method === "POST") {
      let body = {};
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: "invalid JSON body" });
        return;
      }
      sendJson(res, 200, await handleAsk(body));
      return;
    }

    // --- static SPA ---
    if (req.method === "GET") {
      serveStatic(res, path);
      return;
    }
    sendText(res, 405, "method not allowed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { error: redactText(msg) });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`hush cockpit → http://${HOST}:${PORT}  (the chairman's eyes; read-only)`);
});

export { renderMarkdown, extractWikilinks, brainGraph, redactPayload, SECRET_SHAPED };
