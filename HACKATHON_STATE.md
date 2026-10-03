# Hackathon state

## Scope frozen for the first vertical slice

Research-scoping demo: Angelman → Dup15q → existing LADDER collaboration. The source-backed seed, inspectable limitations, local Action Brief, and tests are P0. Live OpenAI generation is an optional, visibly labeled candidate until key and output are verified. This is not a clinical tool.

## Pending release checks

- [ ] Real OpenAI call succeeds with the user's securely configured `OPENAI_API_KEY`.
- [ ] Human reviews generated candidate and all displayed scientific wording.
- [x] User-provided captures visually show search results, relationship map, selected evidence, Action Brief, and three LADDER access levels. This is not an agent-driven browser test.
- [ ] Ablation result is visually checked and walkthrough video captured.
- [ ] Exact submission fields/videos confirmed in the live organizer portal.
- [ ] Public repository and deployment approved, then verified.
- [ ] Submission completed on each required destination before the deadline.

## First implementation check (2026-10-03)

- Local Python seed, graph routes, evidence, Action Brief, optional OpenAI adapter, and static UI created in this new repository only.
- `python3 -m unittest discover -s tests -v`: 14 tests passed after review fixes.
- `node --check web/app.js`: passed.
- Starting the local HTTP server inside this task sandbox returned `PermissionError: [Errno 1] Operation not permitted` while binding to `127.0.0.1`. Browser rendering is therefore **not verified here**; run `./start.sh` in a normal Mac Terminal to complete that check.
- The user subsequently confirmed that `http://127.0.0.1:8765/` opens on their Mac. This confirms the page loads for them, not that search, evidence inspection, or export passed. Browser automation access was denied, so no agent-observed visual or interaction check is claimed.
- No live OpenAI API call has been made; the key is not configured in this workspace.
- No remote, push, deployment, or submission has been created.
- Independent code review found four issues; local paid-call enablement, incomplete/refusal handling, Angelman-only live UI scope, and provenance-log failure handling were addressed before committing.
- The user supplied a one-page full-site PDF capture. It visibly renders the Action Brief and three LADDER access cards without obvious clipping. Its query is `ABGELMAN`, so the capture shows "No matches found" and an empty evidence lens; it does **not** verify successful search-result selection or evidence inspection. A labeled spelling-suggestion fallback was added in response. The app server must be restarted to reload the seed/search change.
- After the spelling-suggestion change, `python3 -m unittest discover -s tests -v` passed 15 tests and `node --check web/app.js` passed.
- A later user-provided capture with the correct Angelman query shows the selected Angelman–UBE3A relationship in the evidence lens, including its MedlinePlus source, section locator, retrieval date, and limitation. The capture shows the ablation button but not its result; source-link navigation and export remain untested.

## Decisions held

- The evidence model is newly written for this project; no other product repository was copied or changed.
- No novelty claim for LADDER. No treatment transfer claim.
- Keep the deterministic demo working without external APIs.
- No push, deploy, or account-bound submission without the user's approval.
