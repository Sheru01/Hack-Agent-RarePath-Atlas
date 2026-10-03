# Hackathon state

## Scope frozen for the first vertical slice

Research-scoping demo: Angelman → Dup15q → existing LADDER collaboration. The source-backed seed, inspectable limitations, local Action Brief, and tests are P0. Live OpenAI generation is an optional, visibly labeled candidate until key and output are verified. This is not a clinical tool.

## Pending release checks

- [ ] Real OpenAI call succeeds with the user's securely configured `OPENAI_API_KEY`.
- [ ] Human reviews generated candidate and all displayed scientific wording.
- [ ] Local UI journey is visually checked and walkthrough captured.
- [ ] Exact submission fields/videos confirmed in the live organizer portal.
- [ ] Public repository and deployment approved, then verified.
- [ ] Submission completed on each required destination before the deadline.

## First implementation check (2026-10-03)

- Local Python seed, graph routes, evidence, Action Brief, optional OpenAI adapter, and static UI created in this new repository only.
- `python3 -m unittest discover -s tests -v`: 14 tests passed after review fixes.
- `node --check web/app.js`: passed.
- Starting the local HTTP server inside this task sandbox returned `PermissionError: [Errno 1] Operation not permitted` while binding to `127.0.0.1`. Browser rendering is therefore **not verified here**; run `./start.sh` in a normal Mac Terminal to complete that check.
- No live OpenAI API call has been made; the key is not configured in this workspace.
- No remote, push, deployment, or submission has been created.
- Independent code review found four issues; local paid-call enablement, incomplete/refusal handling, Angelman-only live UI scope, and provenance-log failure handling were addressed before committing.

## Decisions held

- The evidence model is newly written for this project; no other product repository was copied or changed.
- No novelty claim for LADDER. No treatment transfer claim.
- Keep the deterministic demo working without external APIs.
- No push, deploy, or account-bound submission without the user's approval.
