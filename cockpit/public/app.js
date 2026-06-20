/* hush cockpit SPA — vanilla JS, zero-framework (PLAN §10).
 * Four views: brain · runs · evals · ask. Read-only on hush's own state.
 * The cockpit inherits handles-not-values (O-09) — the server redacts every
 * payload; this client never reconstructs a secret. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ------------------------------------------------------------ navigation ---
function showView(name) {
  $$(".rail button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  // lazy-load each view's data the first time it's shown
  if (name === "runs") loadRuns();
  if (name === "evals") loadEvals();
  history.replaceState(null, "", `#${name}`);
}

$$(".rail button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

// ------------------------------------------------------- 1. brain browser ---
let brainState = { files: [], current: null };

async function loadBrain() {
  const index = $("#brain-index");
  const graphEl = $("#brain-graph");
  index.innerHTML = '<div class="empty">Loading doctrine…</div>';
  try {
    const data = await api("/api/brain");
    brainState.files = data.files;
    renderBrainIndex(data.files);
    renderBrainGraph(data.graph);
    // open the first (OPINIONS — the spine) by default
    if (data.files.length) openBrainFile(data.files[0].stem);
  } catch (e) {
    index.innerHTML = `<div class="empty">Brain unavailable: ${escapeHtml(e.message)}</div>`;
  }
}

function renderBrainIndex(files, filter = "") {
  const index = $("#brain-index");
  const q = filter.toLowerCase();
  const shown = files.filter(
    (f) => !q || f.title.toLowerCase().includes(q) || f.summary.toLowerCase().includes(q),
  );
  if (!shown.length) {
    index.innerHTML = '<div class="empty">No match.</div>';
    return;
  }
  index.innerHTML = shown
    .map(
      (f) => `
    <div class="brain-card${brainState.current === f.stem ? " active" : ""}" data-stem="${escapeHtml(f.stem)}">
      <div class="bc-title">${escapeHtml(f.title)}</div>
      <div class="bc-sum">${escapeHtml(f.summary)}</div>
    </div>`,
    )
    .join("");
  $$(".brain-card", index).forEach((c) =>
    c.addEventListener("click", () => openBrainFile(c.dataset.stem)),
  );
}

function renderBrainGraph(graph) {
  const el = $("#brain-graph");
  if (!graph.nodes.length) {
    el.innerHTML = '<div class="empty">No graph.</div>';
    return;
  }
  // adjacency count per node (the wikilink graph rendered as a node list)
  const degree = {};
  for (const e of graph.edges) {
    degree[e.from] = (degree[e.from] || 0) + 1;
    degree[e.to] = (degree[e.to] || 0) + 1;
  }
  el.innerHTML = graph.nodes
    .map(
      (n) => `
    <div class="graph-node" data-stem="${escapeHtml(n.id)}">
      <div class="gn-title">${escapeHtml(n.title || n.id)}</div>
      <div class="gn-edges">${degree[n.id] || 0} link(s)</div>
    </div>`,
    )
    .join("");
  $$(".graph-node", el).forEach((g) =>
    g.addEventListener("click", () => openBrainFile(g.dataset.stem)),
  );
}

async function openBrainFile(stem) {
  brainState.current = stem;
  $$(".brain-card").forEach((c) => c.classList.toggle("active", c.dataset.stem === stem));
  const reader = $("#brain-reader");
  reader.innerHTML = '<div class="spinner-line"><i class="ph ph-circle-notch"></i> Loading…</div>';
  try {
    const data = await api(`/api/brain/file?name=${encodeURIComponent(stem)}`);
    reader.innerHTML = data.html;
    reader.scrollTop = 0;
    // intercept [[wikilink]] anchors → navigate within the cockpit
    $$("a.wikilink", reader).forEach((a) =>
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const target = a.dataset.wiki;
        // only navigate if the target is one of our doctrine files
        if (brainState.files.some((f) => f.stem === target)) openBrainFile(target);
      }),
    );
  } catch (e) {
    reader.innerHTML = `<div class="empty">Could not load: ${escapeHtml(e.message)}</div>`;
  }
}

$("#brain-q").addEventListener("input", (e) => renderBrainIndex(brainState.files, e.target.value));

// ------------------------------------------------------------- 2. run log ---
async function loadRuns() {
  const summary = $("#runs-summary");
  const table = $("#runs-table");
  const note = $("#runs-redact-note");
  summary.innerHTML = '<div class="spinner-line"><i class="ph ph-circle-notch"></i> Reading runs.jsonl…</div>';
  try {
    const data = await api("/api/runs");
    const s = data.summary;
    summary.innerHTML = `
      <div class="metric-card"><div class="mc-v">${s.total}</div><div class="mc-k">runs logged</div></div>
      <div class="metric-card"><div class="mc-v">${s.totalFindings}</div><div class="mc-k">findings flagged</div></div>
      <div class="metric-card"><div class="mc-v">${Object.keys(s.byCmd).length}</div><div class="mc-k">commands used</div>
        <div class="mc-sub">${Object.entries(s.byCmd).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => `${escapeHtml(c)} ·${n}`).join("  ")}</div>
      </div>
      <div class="metric-card"><div class="mc-v ${data.leaks ? "" : "ok"}">${data.leaks === 0 ? "clean" : data.leaks}</div><div class="mc-k">redaction</div></div>`;

    if (!data.runs.length) {
      table.innerHTML = '<div class="tr"><span class="td">No runs yet — exercise the CLI and refresh.</span></div>';
    } else {
      table.innerHTML = data.runs
        .map((r) => {
          const when = (r.ts || "").replace("T", " ").replace(/\.\d+Z$/, "Z");
          const oc = String(r.outcome || "ok");
          const pillClass = oc === "findings" ? "findings" : oc === "error" ? "error" : "ok";
          return `<div class="tr">
            <span class="td mono">${escapeHtml(when)}</span>
            <span class="td">${escapeHtml(String(r.cmd || "—"))}</span>
            <span class="td">${escapeHtml(String(r.jtbd ?? "—"))}</span>
            <span class="td"><span class="pill ${pillClass}">${escapeHtml(oc)}</span></span>
            <span class="td mono">${escapeHtml(String(r.findings_count ?? 0))}</span>
            <span class="td mono">${escapeHtml(String(r.duration_ms ?? "—"))}</span>
          </div>`;
        })
        .join("");
    }
    note.innerHTML = data.leaks
      ? `<span class="bad-dot">●</span> ${data.leaks} line(s) carried a secret-shaped value and were withheld — writer regression (O-09).`
      : `<span class="ok-dot">●</span> Redaction clean — no secret-shaped value in any logged line (O-12 / P-17).`;
  } catch (e) {
    summary.innerHTML = `<div class="empty">Runs unavailable: ${escapeHtml(e.message)}</div>`;
  }
}

$("#runs-refresh").addEventListener("click", loadRuns);

// -------------------------------------------------------- 3. eval scores ---
let evalsLoaded = false;
async function loadEvals(force = false) {
  if (evalsLoaded && !force) return;
  const banner = $("#eval-banner");
  const board = $("#eval-board");
  banner.className = "eval-banner";
  banner.innerHTML = '<div class="spinner-line"><i class="ph ph-circle-notch"></i> Running the golden pyramid (this grades the real product)…</div>';
  board.innerHTML = "";
  try {
    const data = await api("/api/evals");
    evalsLoaded = true;
    if (!data.available) {
      banner.innerHTML = `<div class="eb-icon"><i class="ph ph-warning"></i></div><div><div class="eb-title">Eval runner unavailable</div><div class="eb-sub">${escapeHtml(data.reason || "")}</div></div>`;
      return;
    }
    const green = data.ci_green;
    banner.className = `eval-banner ${green ? "green" : "red"}`;
    const passCount = data.tasks.filter((t) => t.status === "PASS").length;
    const failCount = data.tasks.filter((t) => t.status === "FAIL").length;
    const skipCount = data.tasks.filter((t) => t.status === "SKIP").length;
    banner.innerHTML = `
      <div class="eb-icon"><i class="ph-fill ph-${green ? "check-circle" : "x-circle"}"></i></div>
      <div>
        <div class="eb-title">${green ? "CI-blocking evals green" : "CI-blocking evals RED"}</div>
        <div class="eb-sub">${passCount} pass · ${failCount} fail · ${skipCount} nightly-skip${data.f1 != null ? ` · F1 ${data.f1.toFixed(2)} (floor 0.80)` : ""} · acceptance (GT-15): <strong class="amber">${escapeHtml(data.acceptance)}</strong></div>
      </div>`;

    const ord = (id) => parseInt(id.replace("GT-", ""), 10) || 0;
    board.innerHTML = data.tasks
      .sort((a, b) => ord(a.id) - ord(b.id))
      .map(
        (t) => `
      <div class="eval-cell ${t.status}">
        <div class="ec-top">
          <span class="ec-id">${escapeHtml(t.id)} <span class="ec-level">${escapeHtml(t.level)}</span></span>
          <span class="ec-status ${t.status}">${escapeHtml(t.status)}</span>
        </div>
        <div class="ec-detail">${escapeHtml(t.detail)}</div>
      </div>`,
      )
      .join("");
  } catch (e) {
    banner.innerHTML = `<div class="eb-icon"><i class="ph ph-warning"></i></div><div><div class="eb-title">Eval run failed</div><div class="eb-sub">${escapeHtml(e.message)}</div></div>`;
  }
}

$("#evals-refresh").addEventListener("click", () => loadEvals(true));

// ----------------------------------------------------- 4. ask the employee ---
let askMode = "advise";
const ASK_EXAMPLES = {
  advise: [
    "I committed a .env with our API key — does git rm --cached fix it?",
    "A teammate left; I ran sops updatekeys to drop their key. Done?",
    "We enabled GCP secret rotation in the console — are we rotating?",
    "Can I just have the secrets MCP return the value so the agent can use it?",
  ],
  tool: ["rotation", "secret scanning", "encrypt secrets in git", "give an agent a secret", "dynamic database credential"],
};

function renderAskExamples() {
  const el = $("#ask-examples");
  el.innerHTML = ASK_EXAMPLES[askMode]
    .map((x) => `<span class="ask-chip">${escapeHtml(x)}</span>`)
    .join("");
  $$(".ask-chip", el).forEach((c) =>
    c.addEventListener("click", () => {
      $("#ask-input").value = c.textContent;
      doAsk();
    }),
  );
}

$$("#ask-mode button").forEach((b) =>
  b.addEventListener("click", () => {
    askMode = b.dataset.mode;
    $$("#ask-mode button").forEach((x) => x.classList.toggle("active", x === b));
    $("#ask-input").placeholder =
      askMode === "tool"
        ? "e.g. rotation, secret scanning, dynamic database credential…"
        : "e.g. I committed a .env with our API key — does git rm --cached fix it?";
    renderAskExamples();
    $("#ask-answer").innerHTML = "";
  }),
);

async function doAsk() {
  const query = $("#ask-input").value.trim();
  const answer = $("#ask-answer");
  if (!query) return;
  answer.innerHTML = '<div class="spinner-line"><i class="ph ph-circle-notch"></i> Asking hush…</div>';
  try {
    const data = await api("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: askMode, query }),
    });
    if (data.error) {
      answer.innerHTML = `<div class="empty">${escapeHtml(data.error)}</div>`;
      return;
    }
    answer.innerHTML = askMode === "tool" ? renderToolCard(data.result) : renderAdviseCard(data.result);
  } catch (e) {
    answer.innerHTML = `<div class="empty">hush couldn't answer: ${escapeHtml(e.message)}</div>`;
  }
}

function refChips(refs) {
  if (!refs || !refs.length) return "";
  return `<div class="brain-refs">${refs.map((r) => `<span class="ref-chip">${escapeHtml(r)}</span>`).join("")}</div>`;
}

function renderAdviseCard(r) {
  const verdict = String(r.verdict || "neutral");
  const cls = verdict === "false-green" ? "false-green" : verdict === "sound" || verdict === "ok" ? "ok" : "neutral";
  const icon = verdict === "false-green" ? "warning-octagon" : "check-circle";
  return `
    <div class="verdict-card">
      <span class="verdict-badge ${cls}"><i class="ph-fill ph-${icon}"></i> ${escapeHtml(verdict)}</span>
      <div class="vc-label">Doctrine</div>
      <div class="vc-doctrine">${escapeHtml(r.doctrine || "")}</div>
      ${refChips(r.brain_refs)}
    </div>`;
}

function renderToolCard(r) {
  const alts = Array.isArray(r.alts) && r.alts.length
    ? `<div class="vc-label">Alternatives</div><ul class="vc-alts">${r.alts.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>`
    : "";
  const whenAlt = r.when_alt ? `<div class="vc-label">When to reach for an alt</div><div class="vc-doctrine">${escapeHtml(r.when_alt)}</div>` : "";
  const billing = r.billing_note ? `<div class="billing-note">${escapeHtml(r.billing_note)}</div>` : "";
  return `
    <div class="verdict-card">
      <span class="verdict-badge neutral"><i class="ph-fill ph-stack"></i> ${escapeHtml(r.job || "recommendation")}</span>
      <div class="vc-label">Default (the layer for the job)</div>
      <div class="vc-default">${escapeHtml(r.default || "")}</div>
      ${alts}
      ${whenAlt}
      ${billing}
      ${refChips(r.brain_refs)}
    </div>`;
}

$("#ask-send").addEventListener("click", doAsk);
$("#ask-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doAsk();
});

// --------------------------------------------------------------- header ---
async function loadHeaderStats() {
  try {
    const runs = await api("/api/runs");
    $("#stat-runs").textContent = runs.summary.total;
    $("#stat-redact").textContent = runs.leaks === 0 ? "clean" : runs.leaks;
  } catch {}
  // evals are heavier (they spawn the runner) — fetch once for the header badge
  try {
    const ev = await api("/api/evals");
    if (ev.available) {
      const pass = ev.tasks.filter((t) => t.status === "PASS").length;
      const total = ev.tasks.filter((t) => t.status !== "SKIP").length;
      $("#stat-evals").textContent = `${pass}/${total}`;
      $("#stat-accept").textContent = ev.acceptance === "PASS" ? "green" : ev.acceptance;
      // prime the evals view so re-visiting is instant
      evalsLoaded = false;
    }
  } catch {}
}

// ------------------------------------------------------------------ boot ---
loadBrain();
renderAskExamples();
loadHeaderStats();
const initial = location.hash.replace("#", "");
if (["brain", "runs", "evals", "ask"].includes(initial)) showView(initial);
