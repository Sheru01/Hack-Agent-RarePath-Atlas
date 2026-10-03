# RarePath Atlas collaboration guardrails

## Roles and bounded work

- In a local Claude Code session, use Opus to coordinate, Sonnet for scoped implementation, Haiku for small lookups, and Fable only for consequential scientific or pitch decisions. Codex can provide independent read-only review when available.
- Keep a normal wave to at most four workers. Assign disjoint files and verify each result; an agent's report is not a test result.
- Maintain `HACKATHON_STATE.md` with actual commands, outcomes, unresolved decisions and release gates.

## Scientific and product claims

- This is a research-scoping prototype, not clinical decision support. Do not make diagnosis, therapy-transfer, patient-eligibility or patient-data-access claims.
- LADDER is an existing Angelman–Dup15q collaboration. Never present it as a discovery made by RarePath.
- Dup15q is a multi-gene copy-number condition, not a UBE3A synonym. Separate a shared locus from a shared mechanism or treatment.
- Every graph edge needs a traceable public source and a limitation. If an edge fails source review, remove it. Unsupported routes return unknown.
- OpenAI output is a candidate for human review; it never silently becomes a verified edge or final medical guidance. Keep the deterministic offline demo honest.

## Repo and operational safety

- This repository is the only write target for the product. Do not change or fork other repositories.
- Never commit keys, tokens, credentials, patient information, local personal paths, session IDs or raw sensitive logs. `.env.local` and `run/` are ignored.
- Do not claim a test, deployment, API call, review, video or submission passed without observing the result. A sandbox denial means that check was not run.
- Local commits are allowed after tests and hygiene checks. Require user approval before pushing, deploying, spending API credit, changing credentials, deleting material data, or submitting the entry.
- Preserve any published history. Keep scoped changes reversible and avoid destructive Git commands.
