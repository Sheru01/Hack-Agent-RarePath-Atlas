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
  const center = { x: 450, y: 205 };
  const positions = new Map();
  positions.set(ordered[0].id, center);
  const others = ordered.slice(1);
  others.forEach((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(others.length, 1);
    positions.set(node.id, { x: center.x + 310 * Math.cos(angle), y: center.y + 142 * Math.sin(angle) });
  });

  const art = svg("svg", { viewBox: "0 0 900 410", role: "img", "aria-label": `Relationship map centered on ${graph.focus?.label || ordered[0].label || "selected topic"}` });
  art.append(svg("ellipse", { cx: 450, cy: 205, rx: 385, ry: 184, fill: "none", stroke: "#dfeae5", "stroke-dasharray": "4 7" }));
  edges.forEach((edge) => {
    const from = positions.get(edge.source);
    const to = positions.get(edge.target);
    if (!from || !to) return;
    const line = svg("line", { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: `svg-edge${edge.id === state.selectedEdge ? " selected" : ""}` });
    art.append(line);
  });
  ordered.forEach((node) => {
    const position = positions.get(node.id);
    const isFocus = node.id === focusId;
    const group = svg("g");
    const className = `svg-node${isFocus ? " focus" : ""} ${String(node.type || "").toLowerCase()}`;
    group.append(svg("rect", { x: position.x - (isFocus ? 98 : 82), y: position.y - 32, width: isFocus ? 196 : 164, height: 64, rx: 17, class: className }));
    const label = svg("text", { x: position.x, y: position.y + 4, "text-anchor": "middle", class: "svg-label" });
    label.textContent = shorten(node.label || node.id, isFocus ? 25 : 19);
    group.append(label);
    const type = svg("text", { x: position.x, y: position.y + 19, "text-anchor": "middle", class: "svg-type" });
    type.textContent = shorten(node.type || "entity", 18);
    group.append(type);
    const title = svg("title");
    title.textContent = `${node.label || node.id}: ${node.description || node.type || "research entity"}`;
    group.append(title);
    art.append(group);
  });
  target.append(art);
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
    copy.append(el("span", "edge-title", `${source} → ${destination}`));
    copy.append(el("span", "edge-meta", edge.label || edge.basis || "Inspect relationship"));
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
    target.append(el("p", "evidence-overline", "Selected relationship"));
    target.append(el("h3", "", evidence.label || "Research relationship"));
    if (evidence.basis) target.append(el("span", "basis-pill", evidence.basis));
    if (evidence.summary) target.append(el("p", "", evidence.summary));
    const source = el("div", "evidence-section");
    source.append(el("h4", "", "Source"));
    source.append(makeLink(evidence.source?.title || "Source not provided", evidence.source?.url, "source-link"));
    if (evidence.source_locator) source.append(el("span", "source-date", `Section: ${evidence.source_locator}`));
    if (evidence.source?.retrieved_at) source.append(el("span", "source-date", `Retrieved ${evidence.source.retrieved_at}`));
    target.append(source);
    const limitation = el("div", "evidence-section");
    limitation.append(el("h4", "", "What this does not establish"));
    limitation.append(el("p", "", evidence.limitation || "A mapped relationship alone does not establish clinical benefit or therapy equivalence."));
    target.append(limitation);
    if (["angelman-ube3a", "ube3a-locus", "dup15q-locus", "angelman-ladder", "dup15q-ladder"].includes(edgeId)) {
      const ablateButton = el("button", "ablate-button", "What if this edge is removed?");
      ablateButton.type = "button";
      const ablationResult = el("div", "ablation-result");
      ablateButton.addEventListener("click", async () => {
        ablateButton.disabled = true;
        ablationResult.replaceChildren(el("p", "", "Rechecking both routes…"));
        try {
          const result = await getJson(`/api/ablate/${encodeURIComponent(edgeId)}`);
          ablationResult.replaceChildren();
          ablationResult.append(el("strong", "", "Counterfactual check"));
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
  $("#evidence-content").replaceChildren(el("div", "empty-evidence", "Choose a relationship to inspect its evidence."));
  const [graphResult, briefResult] = await Promise.allSettled([
    getJson(`/api/graph?node=${encodeURIComponent(nodeId)}`),
    getJson(`/api/brief?node=${encodeURIComponent(nodeId)}`),
  ]);
  if (request !== state.request) return;
  if (graphResult.status === "fulfilled") {
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

function renderBrief(brief) {
  const target = $("#brief-content");
  target.replaceChildren();
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
  [["What the sources indicate", brief.known], ["What remains uncertain", brief.unknown]].forEach(([heading, items]) => {
    const column = el("div", "brief-column");
    column.append(el("h4", "", heading));
    const list = el("ul");
    (Array.isArray(items) && items.length ? items : ["No details provided in this brief."]).forEach((item) => list.append(el("li", "", item)));
    column.append(list);
    columns.append(column);
  });
  target.append(columns);

  const bottom = el("div", "brief-bottom");
  const asset = el("div");
  asset.append(el("h4", "", "Research asset"));
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
    card.append(el("div", "access-number", String(level.level ?? "—").padStart(2, "0")));
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
    target.replaceChildren(el("div", "result-head", "Search results"));
    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) {
      target.append(el("p", "empty-state", "No matches found. Try another research term."));
      return;
    }
    results.forEach((result) => {
      const button = el("button", "search-result");
      button.type = "button";
      const copy = el("span");
      copy.append(el("strong", "", result.label || result.id));
      if (result.description) copy.append(el("small", "", result.description));
      button.append(copy, el("span", "type-pill", result.type || "entity"));
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
      ? "Optional live model draft. Human review required."
      : "Live drafting requires your local OpenAI API key and explicit enable flag.";
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
    target.append(el("p", "eyebrow", "Live OpenAI draft · requires review"));
    target.append(el("h3", "", result.candidate.draft_question));
    target.append(el("p", "", `Uncertainty: ${result.candidate.uncertainty}`));
    target.append(el("p", "", `Source IDs: ${result.candidate.source_ids.join(", ")}`));
    target.append(el("p", "", result.warning));
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

loadGraph();
checkStatus();
