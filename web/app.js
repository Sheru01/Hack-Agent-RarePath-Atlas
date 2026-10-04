const DEFAULT_NODE = "angelman";
const SVG_NS = "http://www.w3.org/2000/svg";
const state = { node: DEFAULT_NODE, graph: null, selectedEdge: null, request: 0, openaiConfigured: false };

const $ = (selector) => document.querySelector(selector);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function makeLink(label, url, className = "") {
  const valid = safeUrl(url);
  if (!valid) return el("span", className, label);
  const link = el("a", className, label);
  link.href = valid;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

async function getJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

function showError(target, message, retry) {
  target.replaceChildren();
  const box = el("div", "error-state", message + " ");
  if (retry) {
    const button = el("button", "", "Try again");
    button.type = "button";
    button.addEventListener("click", retry);
    box.append(button);
  }
  target.append(box);
}

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function shorten(value, max = 18) {
  const text = String(value || "");
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// Presentation helper: a stable CSS hook per entity type (e.g. "research asset" -> "type-research-asset").
function typeClass(type) {
  return "type-" + String(type || "entity").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
}

function nodeLabel(nodeId) {
  return state.graph?.nodes?.find((node) => node.id === nodeId)?.label || nodeId || "Research entity";
}

// Presentation only: map the seed's existing `basis` wording to one of three evidence classes.
// "Question" is reserved for the brief's open items; it is never applied to a sourced edge.
const EVIDENCE_CLASSES = {
  stated: { label: "Stated", meaning: "The cited source says this directly." },
  inferred: { label: "Inferred", meaning: "RarePath combined two sourced facts. The inference and its limits are shown." },
  question: { label: "Question", meaning: "Not established yet. Needs a source, expert review, or more evidence." },
};
function evidenceClassOf(basis) {
  return /infer/i.test(String(basis || "")) ? "inferred" : "stated";
}
function classBadge(key) {
  const meta = EVIDENCE_CLASSES[key] || EVIDENCE_CLASSES.stated;
  const badge = el("span", `evidence-class evidence-class-${key}`, meta.label);
  badge.title = meta.meaning;
  badge.setAttribute("aria-label", `${meta.label}: ${meta.meaning}`);
  return badge;
}

// Shared card for the explicit "no supported route" payload.
function noRouteCard(payload, heading) {
  const card = el("div", "no-route");
  card.append(el("p", "no-route-kicker", `${heading || "Result"} · Coverage boundary`));
  card.append(el("h3", "", payload.message || "No supported route in the current evidence snapshot"));
  const checked = el("div", "no-route-block");
  checked.append(el("h4", "", "What RarePath checked"));
  const list = el("ul");
  const sources = Array.isArray(payload.checked_sources) && payload.checked_sources.length ? payload.checked_sources : ["the versioned evidence seed"];
  sources.forEach((item) => list.append(el("li", "", typeof item === "string" ? item : item.title || item.id || "source")));
  if (payload.seed_version) list.append(el("li", "", `Seed version ${payload.seed_version}`));
  checked.append(list);
  card.append(checked);
  const meaning = el("div", "no-route-block");
  meaning.append(el("h4", "", "What this does not mean"));
  meaning.append(el("p", "", payload.not_negative_evidence === false
    ? "A contradicting source was found; see the evidence lens."
    : "No evidence here does not mean no evidence anywhere. This is a gap in our snapshot, not proof of absence."));
  card.append(meaning);
  if (payload.next_step) {
    const next = el("div", "no-route-block no-route-next");
    next.append(el("h4", "", "Next research step"));
    next.append(el("p", "", payload.next_step));
    card.append(next);
  }
  return card;
}

function drawMap(graph) {
  const target = $("#map-visual");
  target.replaceChildren();
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  if (!nodes.length) {
    target.append(el("p", "empty-state", "No connected entities were returned for this topic."));
    return;
  }

  const focusId = graph.focus?.id || state.node;
  const ordered = [...nodes].sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : 0));
  const center = { x: 450, y: 300 };
  const positions = new Map();
  positions.set(ordered[0].id, center);
  const others = ordered.slice(1);
  others.forEach((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(others.length, 1);
    positions.set(node.id, { x: center.x + 310 * Math.cos(angle), y: center.y + 238 * Math.sin(angle) });
  });

  const art = svg("svg", { viewBox: "0 0 900 600", role: "img", "aria-label": `Relationship map centered on ${graph.focus?.label || ordered[0].label || "selected topic"}` });
  art.append(svg("ellipse", { cx: 450, cy: 300, rx: 392, ry: 280, fill: "none", stroke: "#dfeae5", "stroke-dasharray": "4 7" }));
  edges.forEach((edge) => {
    const from = positions.get(edge.source);
    const to = positions.get(edge.target);
    if (!from || !to) return;
    // Gentle curve so overlapping relationships stay distinguishable.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const bend = 0.12 * length;
    const cx = (from.x + to.x) / 2 - (dy / length) * bend;
    const cy = (from.y + to.y) / 2 + (dx / length) * bend;
    const line = svg("path", { d: `M${from.x} ${from.y} Q${cx} ${cy} ${to.x} ${to.y}`, class: `svg-edge${edge.id === state.selectedEdge ? " selected" : ""}${edge.role === "counterexample" ? " counterexample" : ""}` });
    art.append(line);
    if (edge.role === "counterexample") {
      // Point on the quadratic curve at t = 0.5, so the marker sits on the drawn line.
      const mx = 0.25 * from.x + 0.5 * cx + 0.25 * to.x;
      const my = 0.25 * from.y + 0.5 * cy + 0.25 * to.y;
      const marker = svg("g", { class: "svg-neq" });
      marker.append(svg("circle", { cx: mx, cy: my, r: 13 }));
      const glyph = svg("text", { x: mx, y: my + 5, "text-anchor": "middle" });
      glyph.textContent = "≠";
      marker.append(glyph);
      const title = svg("title");
      title.textContent = "Same chromosome 15 region; parent of origin differs. No supported LADDER action route in this seed.";
      marker.append(title);
      art.append(marker);
    }
  });
  ordered.forEach((node) => {
    const position = positions.get(node.id);
    const isFocus = node.id === focusId;
    const group = svg("g");
    const className = `svg-node${isFocus ? " focus" : ""} ${typeClass(node.type)}`;
    group.setAttribute("class", `svg-node-group ${typeClass(node.type)}${node.counterexample ? " is-counterexample" : ""}`);
    const width = isFocus ? 216 : 200;
    const left = position.x - width / 2;
    if (isFocus) group.append(svg("rect", { x: left, y: position.y - 32, width, height: 64, rx: 18, class: "svg-halo" }));
    const selected = state.selectedEdge ? edges.find((edge) => edge.id === state.selectedEdge) : null;
    const isEndpoint = Boolean(selected && (selected.source === node.id || selected.target === node.id));
    group.append(svg("rect", { x: left, y: position.y - 32, width, height: 64, rx: 18, class: className + (isEndpoint ? " endpoint" : "") }));
    group.append(svg("circle", { cx: left + 18, cy: position.y, r: 5, class: "svg-dot" }));
    const label = svg("text", { x: left + 32, y: position.y + 4, class: "svg-label" });
    label.textContent = shorten(node.label || node.id, isFocus ? 25 : 23);
    group.append(label);
    const type = svg("text", { x: left + 32, y: position.y + 19, class: "svg-type" });
    type.textContent = node.counterexample ? "counterexample" : shorten(node.type || "entity", 22);
    group.append(type);
    const title = svg("title");
    title.textContent = `${node.label || node.id}: ${node.description || node.type || "research entity"}`;
    group.append(title);
    art.append(group);
  });
  target.append(art);
  // When the map is wider than its container (narrow screens), start centred on the focus node.
  if (target.scrollWidth > target.clientWidth) target.scrollLeft = (target.scrollWidth - target.clientWidth) / 2;
}

function renderEdges(graph) {
  const target = $("#edge-list");
  target.replaceChildren();
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodes = new Map((graph.nodes || []).map((node) => [node.id, node]));
  $("#connection-count").textContent = String(edges.length).padStart(2, "0");
  if (!edges.length) {
    target.append(el("p", "empty-state", "No relationships were returned. Try another search term."));
    return;
  }
  edges.forEach((edge) => {
    const source = nodes.get(edge.source)?.label || edge.source || "Research entity";
    const destination = nodes.get(edge.target)?.label || edge.target || "research entity";
    const button = el("button", "edge-card");
    button.type = "button";
    button.setAttribute("aria-pressed", String(edge.id === state.selectedEdge));
    button.setAttribute("aria-label", `Inspect evidence for ${source} to ${destination}: ${edge.label || "relationship"}`);
    const copy = el("span");
    const title = el("span", "edge-title");
    title.append(el("i", `dot ${typeClass(nodes.get(edge.source)?.type)}`), document.createTextNode(source), el("span", "edge-sep", "→"), el("i", `dot ${typeClass(nodes.get(edge.target)?.type)}`), document.createTextNode(destination));
    copy.append(title);
    const meta = el("span", "edge-meta", edge.label || edge.basis || "Inspect relationship");
    if (edge.role === "counterexample") meta.prepend(el("span", "edge-tag", "Counterexample"));
    copy.append(meta);
    button.append(copy, el("span", "edge-arrow", "↗"));
    button.addEventListener("click", () => selectEdge(edge.id));
    target.append(button);
  });
}

async function selectEdge(edgeId) {
  if (!edgeId) return;
  state.selectedEdge = edgeId;
  drawMap(state.graph);
  renderEdges(state.graph);
  const target = $("#evidence-content");
  target.replaceChildren(el("div", "loading-state", "Loading evidence…"));
  try {
    const evidence = await getJson(`/api/evidence/${encodeURIComponent(edgeId)}`);
    if (state.selectedEdge !== edgeId) return;
    target.replaceChildren();
    target.classList.remove("revealing");
    void target.offsetWidth; // restart the staggered reveal
    target.classList.add("revealing");
    target.append(el("p", "evidence-overline", "Selected connection"));
    // The evidence payload replaces `source` with the citation object, so read endpoints from the loaded graph.
    const edgeMeta = state.graph?.edges?.find((edge) => edge.id === edgeId);
    if (edgeMeta) {
      const route = el("p", "evidence-route");
      route.append(el("span", "route-node", nodeLabel(edgeMeta.source)), el("span", "route-arrow", "→"), el("span", "route-node", nodeLabel(edgeMeta.target)));
      target.append(route);
    }
    target.append(el("h3", "", evidence.label || "Research relationship"));
    const isCounter = evidence.role === "counterexample" || edgeMeta?.role === "counterexample";
    if (isCounter) {
      const banner = el("div", "counterexample-banner");
      banner.append(el("strong", "", "Same chromosome 15 region; parent of origin differs."));
      banner.append(el("span", "", "Shown as a counterexample: being close on the chromosome does not mean a shared mechanism, treatment, or research route."));
      target.append(banner);
    }
    const basis = el("div", "evidence-section evidence-basis");
    basis.append(el("h4", "", "Evidence basis"));
    const basisRow = el("p", "basis-row");
    basisRow.append(classBadge(isCounter ? "inferred" : evidenceClassOf(evidence.basis)));
    if (evidence.basis) basisRow.append(el("span", "basis-pill", evidence.basis));
    basis.append(basisRow);
    target.append(basis);
    if (evidence.summary) {
      const says = el("div", "evidence-section evidence-says");
      says.append(el("h4", "", "What the evidence says"));
      says.append(el("p", "evidence-summary", evidence.summary));
      target.append(says);
    }
    const source = el("div", "evidence-section evidence-source");
    source.append(el("h4", "", "Source"));
    source.append(makeLink(evidence.source?.title || "Source not provided", evidence.source?.url, "source-link"));
    if (evidence.source_locator) source.append(el("span", "source-date", `Section: ${evidence.source_locator}`));
    if (evidence.source?.retrieved_at) source.append(el("span", "source-date", `Retrieved ${evidence.source.retrieved_at}`));
    (evidence.supporting_sources || []).forEach((supporting) => {
      source.append(el("span", "source-date", "Additional source for this comparison:"));
      source.append(makeLink(supporting.title || "Supporting source", supporting.url, "source-link"));
    });
    target.append(source);
    const limitation = el("div", "evidence-section evidence-limit");
    limitation.append(el("h4", "", "What this does not establish"));
    limitation.append(el("p", "", evidence.limitation || "A mapped relationship alone does not establish clinical benefit or therapy equivalence."));
    target.append(limitation);
    const next = el("div", "evidence-section evidence-next");
    next.append(el("h4", "", "Next step"));
    const nextLink = el("a", "next-link", "Take this into the action brief");
    nextLink.href = "#brief";
    next.append(nextLink);
    if (["angelman-ube3a", "ube3a-locus", "dup15q-locus", "angelman-ladder", "dup15q-ladder"].includes(edgeId)) {
      const ablateButton = el("button", "ablate-button", "What if we remove this link?");
      ablateButton.type = "button";
      const ablationResult = el("div", "ablation-result");
      ablateButton.addEventListener("click", async () => {
        ablateButton.disabled = true;
        ablationResult.replaceChildren(el("p", "", "Checking both routes again…"));
        try {
          const result = await getJson(`/api/ablate/${encodeURIComponent(edgeId)}`);
          ablationResult.replaceChildren();
          ablationResult.append(el("strong", "", "Route check · graph connectivity only, not a biological experiment"));
          ablationResult.append(el("p", "", result.biological_route_after.length
            ? "Biological route still supported in this seed."
            : "Biological route no longer supported in this seed."));
          ablationResult.append(el("p", "", result.collaboration_route_after.length
            ? "Independent LADDER collaboration route remains."
            : "LADDER collaboration route no longer supported in this seed."));
        } catch {
          ablationResult.replaceChildren(el("p", "", "Could not recompute the route."));
        } finally {
          ablateButton.disabled = false;
        }
      });
      target.append(ablateButton, ablationResult);
    }
    target.append(next);
    // Keep the top of the lens (route, basis, what the evidence says) on screen after a selection.
    const panel = target.closest(".evidence-panel");
    if (panel) {
      const top = panel.getBoundingClientRect().top;
      const narrow = window.matchMedia("(max-width: 760px)").matches;
      if (narrow || top < 60 || top > window.innerHeight * 0.55) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch {
    if (state.selectedEdge === edgeId) showError(target, "Evidence could not be loaded.", () => selectEdge(edgeId));
  }
}

async function loadGraph(nodeId = DEFAULT_NODE) {
  const request = ++state.request;
  state.node = nodeId;
  $("#generate-question").disabled = !state.openaiConfigured || nodeId !== "angelman";
  state.selectedEdge = null;
  $("#focus-label").textContent = "Loading map…";
  $("#map-visual").replaceChildren(el("div", "loading-state", "Loading research connections…"));
  $("#edge-list").replaceChildren();
  $("#connection-count").textContent = "—";
  $("#evidence-content").replaceChildren(el("div", "empty-evidence", "Pick a connection to see its evidence."));
  const [graphResult, briefResult] = await Promise.allSettled([
    getJson(`/api/graph?node=${encodeURIComponent(nodeId)}`),
    getJson(`/api/brief?node=${encodeURIComponent(nodeId)}`),
  ]);
  if (request !== state.request) return;
  if (graphResult.status === "fulfilled" && graphResult.value?.status === "no_supported_route") {
    state.graph = null;
    $("#focus-label").textContent = nodeId;
    $("#map-visual").replaceChildren(noRouteCard(graphResult.value, "Relationship map"));
    $("#connection-count").textContent = "00";
    $("#edge-list").replaceChildren(el("p", "empty-state", "No recorded connections for this search."));
    $("#evidence-content").replaceChildren(el("p", "empty-state", "This is a coverage limit, not evidence that no relationship exists."));
  } else if (graphResult.status === "fulfilled") {
    state.graph = graphResult.value;
    $("#focus-label").textContent = graphResult.value.focus?.label || nodeId;
    drawMap(graphResult.value);
    renderEdges(graphResult.value);
  } else {
    state.graph = null;
    $("#focus-label").textContent = "Map unavailable";
    showError($("#map-visual"), "The relationship map could not be loaded.", () => loadGraph(nodeId));
  }
  if (briefResult.status === "fulfilled") renderBrief(briefResult.value);
  else {
    showError($("#brief-content"), "The action brief could not be loaded.", () => loadGraph(nodeId));
    $("#access-levels").replaceChildren(el("p", "empty-state", "Access requirements are unavailable for this topic."));
  }
}

function renderTenx(tenx) {
  const panel = el("div", "tenx");
  panel.append(el("p", "eyebrow", "The 10× goal, stated as a hypothesis"));
  panel.append(el("h3", "", tenx.goal || "Reach an expert-reviewed go/no-go decision faster."));
  const columns = el("div", "tenx-columns");
  [["Without the atlas", tenx.without, "without"], ["With the atlas", tenx.with, "with"], ["Not accelerated", tenx.not_accelerated, "not"]].forEach(([heading, items, key]) => {
    const column = el("div", `tenx-column tenx-${key}`);
    column.append(el("h4", "", heading));
    const list = el("ol");
    (Array.isArray(items) && items.length ? items : ["Not specified in this brief."]).forEach((item) => list.append(el("li", "", item)));
    column.append(list);
    columns.append(column);
  });
  panel.append(columns);
  if (tenx.assumption) {
    const note = el("p", "tenx-assumption");
    note.append(el("strong", "", "Assumption. "), document.createTextNode(tenx.assumption));
    panel.append(note);
  }
  return panel;
}

function renderBrief(brief) {
  const target = $("#brief-content");
  target.replaceChildren();
  if (brief?.status === "no_supported_route") {
    target.append(noRouteCard(brief, "Action brief"));
    renderAccess(brief.access);
    return;
  }
  const top = el("div", "brief-top");
  const intro = el("div", "brief-intro");
  intro.append(el("p", "eyebrow", "Research snapshot"));
  intro.append(el("h3", "", brief.title || "Research action brief"));
  intro.append(el("p", "", brief.summary || "Use this summary to guide further questions."));
  const question = el("div", "brief-question");
  question.append(el("p", "eyebrow", "A question to ask"));
  question.append(el("p", "", brief.question || "What evidence would help clarify the next research step?"));
  top.append(intro, question);
  target.append(top);

  const columns = el("div", "brief-columns");
  [["What the sources indicate", brief.known, "stated"], ["What remains uncertain", brief.unknown, "question"]].forEach(([heading, items, key]) => {
    const column = el("div", "brief-column");
    const h4 = el("h4", "", heading);
    h4.append(classBadge(key));
    column.append(h4);
    const list = el("ul");
    (Array.isArray(items) && items.length ? items : ["No details provided in this brief."]).forEach((item) => list.append(el("li", "", item)));
    column.append(list);
    columns.append(column);
  });
  target.append(columns);
  if (Array.isArray(brief.not_prioritized) && brief.not_prioritized.length) {
    const aside = el("div", "brief-not-prioritized");
    aside.append(el("h4", "", "Looked at, not prioritized"));
    const list = el("ul");
    brief.not_prioritized.forEach((item) => list.append(el("li", "", typeof item === "string" ? item : item.text || item.label || "")));
    aside.append(list);
    target.append(aside);
  }
  if (brief.tenx && typeof brief.tenx === "object") target.append(renderTenx(brief.tenx));

  const bottom = el("div", "brief-bottom");
  const asset = el("div", "brief-next");
  asset.append(el("h4", "", "Next step · research asset"));
  if (brief.asset) {
    asset.append(makeLink(brief.asset.name || "Explore asset", brief.asset.url));
    if (brief.asset.description) asset.append(el("p", "", brief.asset.description));
  } else asset.append(el("p", "", "No research asset is listed for this topic."));
  const caveat = el("div");
  caveat.append(el("h4", "", "Keep in mind"));
  caveat.append(el("p", "", brief.disclaimer || "This is for research scoping, not medical advice. A relationship or asset is not proof of treatment benefit."));
  if (Array.isArray(brief.sources) && brief.sources.length) {
    const sources = el("div", "brief-sources");
    sources.append("Sources: ");
    brief.sources.forEach((source, index) => {
      sources.append(makeLink(source.title || `Source ${index + 1}`, source.url));
      if (index < brief.sources.length - 1) sources.append(" · ");
    });
    caveat.append(sources);
  }
  bottom.append(asset, caveat);
  target.append(bottom);
  renderAccess(brief.access);
}

function renderAccess(levels) {
  const target = $("#access-levels");
  target.replaceChildren();
  if (!Array.isArray(levels) || !levels.length) {
    target.append(el("p", "empty-state", "No access requirements were supplied for this topic."));
    return;
  }
  levels.forEach((level) => {
    const card = el("article", "access-card");
    card.append(el("div", "access-number", level.level === undefined || level.level === null ? "Level" : `Level ${level.level}`));
    card.append(el("h3", "", level.name || "Access level"));
    card.append(el("p", "", Array.isArray(level.requirements) ? level.requirements.join(" · ") : level.requirements || "Ask the asset holder about requirements."));
    target.append(card);
  });
}

async function search(query) {
  const target = $("#search-results");
  if (!query.trim()) {
    target.hidden = true;
    target.replaceChildren();
    return;
  }
  target.hidden = false;
  target.replaceChildren(el("div", "loading-state", "Searching the atlas…"));
  try {
    const data = await getJson(`/api/search?q=${encodeURIComponent(query.trim())}`);
    if ($("#search-input").value.trim() !== query.trim()) return;
    const results = Array.isArray(data.results) ? data.results : [];
    if (data.status === "no_supported_route" || !results.length) {
      target.replaceChildren(noRouteCard({ ...data, message: data.message || "No supported route in the current evidence snapshot" }, "Search"));
      return;
    }
    const suggestionsOnly = results.length && results.every((item) => item.match_kind === "spelling_suggestion");
    target.replaceChildren(el("div", "result-head", suggestionsOnly ? "Possible spelling matches — choose carefully" : "Search results"));
    results.forEach((result) => {
      const button = el("button", "search-result");
      button.type = "button";
      const copy = el("span");
      copy.append(el("strong", "", result.label || result.id));
      if (result.description) copy.append(el("small", "", result.description));
      button.append(copy, el("span", "type-pill", result.counterexample ? "Counterexample" : result.type || "entity"));
      button.addEventListener("click", () => {
        $("#search-input").value = result.label || result.id;
        target.hidden = true;
        loadGraph(result.id);
        $("#map").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      target.append(button);
    });
  } catch {
    showError(target, "Search is unavailable right now.", () => search(query));
  }
}

async function checkStatus() {
  try {
    const status = await getJson("/api/status");
    state.openaiConfigured = Boolean(status.openai_configured);
    $("#api-status").textContent = status.openai_configured ? "Local AI drafting enabled" : "Research service connected";
    $("#generate-question").disabled = !state.openaiConfigured || state.node !== "angelman";
    $("#generation-status").textContent = status.openai_configured
      ? "Live. Each press asks OpenAI for one new candidate question."
      : "Not enabled on this server. Run locally with your own OpenAI key to try it.";
  } catch {
    $("#api-status").textContent = "Service status unavailable";
  }
}

async function generateQuestion() {
  const button = $("#generate-question");
  const target = $("#generation-result");
  button.disabled = true;
  target.hidden = false;
  target.replaceChildren(el("p", "loading-state", "Requesting a source-constrained draft…"));
  try {
    const response = await fetch("/api/generate-scoping", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ focus: "angelman" }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    target.replaceChildren();
    target.append(el("p", "eyebrow", "Candidate · Requires human review"));
    button.querySelector(".ai-label")?.replaceChildren(document.createTextNode("Ask OpenAI again"));
    const statusLine = $("#generation-status");
    statusLine.textContent = "New candidate ready below. Press Ask OpenAI again for another one.";
    statusLine.classList.remove("shine");
    void statusLine.offsetWidth;
    statusLine.classList.add("shine");
    target.append(el("h3", "", result.candidate.draft_question));
    if (result.candidate.uncertainty) target.append(el("p", "candidate-uncertainty", `Uncertainty: ${result.candidate.uncertainty}`));
    if (result.warning) target.append(el("p", "candidate-warning", result.warning));
    const provenance = document.createElement("details");
    provenance.className = "provenance";
    const summary = document.createElement("summary");
    summary.textContent = "View provenance";
    provenance.append(summary);
    const list = el("ul");
    const prov = result.provenance || {};
    list.append(el("li", "", `Cited source IDs: ${(result.candidate.source_ids || []).join(", ") || "none"}`));
    if (prov.model) list.append(el("li", "", `Model: ${prov.model}`));
    if (prov.status) list.append(el("li", "", `Status: ${prov.status}`));
    if (prov.timestamp || prov.created_at) list.append(el("li", "", `Logged: ${prov.timestamp || prov.created_at}`));
    ["prompt_sha256", "output_sha256"].forEach((key) => { if (prov[key]) list.append(el("li", "hash", `${key}: ${prov[key]}`)); });
    list.append(el("li", "", "Generated under a strict schema that only permits the seed's own sources. Nothing here enters the graph."));
    provenance.append(list);
    target.append(provenance);
  } catch (error) {
    showError(target, error.message || "Live drafting failed.", generateQuestion);
  } finally {
    button.disabled = false;
  }
}

$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  search($("#search-input").value);
});
$("#search-input").addEventListener("input", (event) => {
  if (!event.target.value.trim()) $("#search-results").hidden = true;
});
$("#print-brief").addEventListener("click", () => window.print());
$("#generate-question").addEventListener("click", generateQuestion);
// Guided demo entry point: load the default topic and open the first relationship so the lens is populated.
$("#hero-demo").addEventListener("click", async () => {
  $("#search-input").value = "Angelman syndrome";
  $("#search-results").hidden = true;
  await loadGraph(DEFAULT_NODE);
  if (state.graph?.edges?.some((edge) => edge.id === "angelman-ube3a")) await selectEdge("angelman-ube3a");
  document.querySelector(".map-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

// Header nav follows the section in view.
if ("IntersectionObserver" in window) {
  const links = Array.from(document.querySelectorAll(".site-nav a"));
  const byId = new Map(links.map((link) => [link.getAttribute("href").slice(1), link]));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((link) => link.removeAttribute("aria-current"));
      byId.get(entry.target.id)?.setAttribute("aria-current", "true");
    });
  }, { rootMargin: "-40% 0px -50% 0px" });
  byId.forEach((_, id) => { const section = document.getElementById(id); if (section) observer.observe(section); });
  const hero = document.getElementById("top"); if (hero) observer.observe(hero); // entering the hero clears the highlight
}

loadGraph();
checkStatus();
