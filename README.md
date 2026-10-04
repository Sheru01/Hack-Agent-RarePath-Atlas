# RarePath Atlas

A bounded, inspectable research-scoping prototype for Hack-Nation Challenge 5. It demonstrates a sourced Angelman → Dup15q → LADDER journey, including the biological caution and the fact that LADDER already exists. It does **not** recommend treatment or grant patient-data access.

## Run in one command

```sh
./start.sh
```

Open <http://127.0.0.1:8765>. Requires Python 3.10+ and no third-party packages. The built-in seed and Action Brief work offline. `python3 -m unittest discover -s tests -v` runs the tests.

## Optional live OpenAI call

Copy `.env.example` to `.env.local`, put your key in `.env.local` on your own machine, and keep it out of Git. Set `ENABLE_LOCAL_OPENAI=1` only when you intend to make a paid local call; set `OPENAI_MODEL` if needed. The app's optional live call uses the OpenAI Responses API to draft **one source-constrained research question**. This is a candidate requiring human review, never a new graph edge or a clinical verdict. A successful call records model, source IDs and prompt/output hashes in gitignored `run/generations.jsonl`; no key is recorded. The source-backed offline demo never pretends to be a live AI response. This endpoint is for the loopback-only local server; disable or protect it before any public deployment.

## Architecture

```
web/            static UI: index.html, style.css, app.js (no build step, no framework)
rarepath/
  atlas.py      loads and validates data/seed.json; search, graph, evidence, path, brief, ablate
  server.py     stdlib ThreadingHTTPServer bound to 127.0.0.1; JSON API plus static files
  openai_adapter.py  optional, gated Responses API call with a strict JSON schema
data/seed.json  the evidence set: sources, nodes, edges
tests/          unittest suite covering the seed contract, the adapter and the HTTP surface
```

The seed is the only source of truth. `Atlas.validate()` refuses to start if any edge lacks a source, a locator, a summary or a limitation, or points at a node or source that does not exist. The UI never computes a claim; it renders what the API returns and labels each piece by its evidence class:

| Class | Meaning | Where it comes from |
|---|---|---|
| Stated | Directly asserted by the cited source | an edge whose `basis` names a sourced relationship |
| Inferred | RarePath combined two source-backed statements; both are shown with the limit | an edge whose `basis` contains "inference" and lists `supporting_source_ids` |
| Question | Not established; needs a source, expert review or more evidence | the brief's "What remains uncertain" items |

A counterexample node (`counterexample: true`, edges with `role: "counterexample"`) is drawn in a dashed outline and never enters the brief's "known" list. A query with no supported route returns a `no_supported_route` payload that names the sources checked and the next step, so a gap stays a gap.

## Reproducing the dataset

There is no crawler and no generated data. Every record in `data/seed.json` was read by a person from a public page on the date in its `retrieved_at` field, and the `source_locator` names the section the claim comes from. To re-verify:

1. Open each `sources[].url` and find the `source_locator` section (for MedlinePlus pages this is usually "Causes"; for LADDER it is the About or For Researchers page).
2. Confirm the edge `summary` is supported by that section. Inferred edges cite two sources; confirm each coordinate separately. The inference itself is RarePath's and is labelled as such.
3. Run `python3 -m unittest discover -s tests`. The suite checks the seed contract (every edge sourced, located, limited and resolvable), the two independent route families, the ablation behaviour and the HTTP surface. It does not call the network.

To extend the seed, add a source record first, then the node, then the edge with all five fields. Validation fails closed; a half-described edge will not load.

## What is in the seed

`data/seed.json` contains 8 typed nodes, 8 inspectable edges, and 6 public sources. Each edge names its source, locator, basis and limitation; source records carry retrieval dates. The UBE3A-to-region edge explicitly marks its coordinate comparison as an inference and shows both supporting sources. The graph has two independent route families: chromosome-15 biology and the existing LADDER collaboration. Removing a biology edge should not erase the collaboration. There is no claim that all therapies transfer between conditions or that Dup15q is a UBE3A-only disorder.

To reproduce counts and evidence checks, run the test command above. There is no opaque database, retrieval service, or generated seed. The seed is deliberately small: an inspectable neighborhood, not a comprehensive atlas, a validated clinical knowledge graph, or a statistically meaningful cluster.

## API

- `GET /api/search?q=Angelman` — typed node lookup
- `GET /api/graph?node=angelman` — bounded graph
- `GET /api/evidence/angelman-ube3a` — evidence, URL, limitation
- `GET /api/brief?node=angelman` — action brief and LADDER access levels
- `GET /api/ablate/angelman-ube3a` — optional route stress test
- `GET /api/status` — configuration status, never the key
- `POST /api/generate-scoping` with `{"focus":"angelman"}` — optional real OpenAI call

## Research and access boundaries

Angelman can arise through multiple mechanisms affecting maternal UBE3A expression/function. Dup15q involves maternal copy-number gain over a multi-gene chromosome region. Shared geography in the genome is a reason to frame a **comparison**, not a reason to transfer a therapy. LADDER is an existing Angelman–Dup15q research collaboration. Its public dashboard, de-identified dataset and recruitment pathways have different governance requirements; the app labels them separately. Source links are exposed in the UI so an expert can inspect the underlying claims.

## Known limitations

- The seed is one neighbourhood (Angelman, Dup15q, UBE3A, 15q11.2-q13.1, LADDER and its partners). It is not a comprehensive atlas and it is not a cluster; there is nothing to cluster at this size.
- Two sources could not be re-fetched automatically during the last audit (a rate limit and a CAPTCHA): the NCBI Gene location for UBE3A and PubMed 38808315. Re-check both by hand in a browser before submission.
- The Action Brief for the demo topic is authored in `atlas.py`, with its sources drawn from the seed; it is not yet generated from the graph.
- The live OpenAI draft logs hashes only, so a run cannot be replayed verbatim.
- The 10× section is a hypothesis about discovery-and-framing work. It states assumptions and lists what it does not accelerate; it carries no timelines, percentages or cost figures.

## Release gates still to close

This local prototype is not yet a submitted hackathon entry. Before publication, check the current organizer portal for exact deliverables, perform a final source/claims review, record the team video and the one-minute walkthrough, and submit to each required destination. Do not claim any of these gates are complete based on this README.
