# RarePath Atlas

A bounded, inspectable research-scoping prototype for Hack-Nation Challenge 5. It demonstrates a sourced Angelman → Dup15q → LADDER journey, including the biological caution and the fact that LADDER already exists. It does **not** recommend treatment or grant patient-data access.

## Run in one command

```sh
./start.sh
```

Open <http://127.0.0.1:8765>. Requires Python 3.10+ and no third-party packages. The built-in seed and Action Brief work offline. `python3 -m unittest discover -s tests -v` runs the tests.

## Optional live OpenAI call

Copy `.env.example` to `.env.local`, put your key in `.env.local` on your own machine, and keep it out of Git. Set `ENABLE_LOCAL_OPENAI=1` only when you intend to make a paid local call; set `OPENAI_MODEL` if needed. The app's optional live call uses the OpenAI Responses API to draft **one source-constrained research question**. This is a candidate requiring human review, never a new graph edge or a clinical verdict. A successful call records model, source IDs and prompt/output hashes in gitignored `run/generations.jsonl`; no key is recorded. The source-backed offline demo never pretends to be a live AI response. This endpoint is for the loopback-only local server; disable or protect it before any public deployment.

## What is in the seed

`data/seed.json` contains 8 typed nodes, 8 inspectable edges, and 6 public sources. Each edge names its source, locator, basis and limitation; source records carry retrieval dates. The graph has two independent route families: chromosome-15 biology and the existing LADDER collaboration. Removing a biology edge should not erase the collaboration. There is no claim that all therapies transfer between conditions or that Dup15q is a UBE3A-only disorder.

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

## Release gates still to close

This local prototype is not yet a submitted hackathon entry. Before publication, verify the live OpenAI key and response, check the current organizer portal for exact deliverables, perform a source/claims review, record videos, deploy a live demo, and submit to each required destination. Do not claim any of these gates are complete based on this README.
