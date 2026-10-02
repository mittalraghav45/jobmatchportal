# AGENTS.md — JobMatchPortal Development Guide

## Purpose
JobMatchPortal is a UK-focused job discovery, enrichment, matching and application-tracking platform. The product is being built around a large company universe, automated job discovery, data enrichment, candidate matching and, at the final stage, scheduled job digests.

## Source of truth
Treat the repository code and the documentation under `docs/` as the source of truth. Before changing architecture or shared contracts, inspect the current implementation rather than relying on old chat context.

Key documents:
- `PROJECT_STATUS.md` — current project status and roadmap
- `docs/PRD.md` — product requirements
- `docs/ENGINEERING_DESIGN.md` — engineering design
- `docs/ARCHITECTURE.md` — architecture overview
- `docs/SYSTEM_DESIGN.md` — system design and components
- `docs/API_DESIGN.md` — API contracts
- `docs/DATABASE_DESIGN.md` — MongoDB/data model design
- `docs/DEVELOPMENT_CONTEXT.md` — durable development context
- `docs/RECOVERY.md` — how to reconstruct project context after losing a chat
- `docs/NEXT_STEP.md` — immediate development priorities

## Stack
Backend: Node.js, Express, Mongoose, MongoDB.
Frontend: React/Vite.
Testing: Node test runner/backend tests and frontend tests as defined by the package scripts.
Deployment/automation: GitHub is used for source control and will be used for final-stage scheduled automation.

## Core data pipeline
The major pipeline is:

Company universe → job discovery → deduplication → enrichment → location/nation classification → employer classification → public-employer resolution → ATS/application URL resolution → matching → UI → application tracking → final-stage email automation.

The large company discovery pipeline can process roughly 21k companies. It uses checkpointing so long-running runs can resume safely.

## Critical rules
1. Do not kill, reset or invalidate a long-running discovery/enrichment process merely to deploy unrelated UI changes.
2. Do not delete checkpoint collections or reset a run unless explicitly requested.
3. Preserve run IDs and checkpoint semantics.
4. Do not invent job, company, ATS, sponsorship or application data. Unknown data must remain explicitly unknown.
5. Sponsorship information must remain distinguishable from generic company information. Do not present uncertain sponsorship as verified.
6. Location/nation classification must remain compatible with the existing API contract.
7. Public employer types currently include NHS, councils and universities; do not silently broaden or change their semantics.
8. Application/ATS URLs should be direct and usable where known. A company website alone must not be presented as an application URL.
9. Keep cron/email automation deferred until the final development stage. Do not enable scheduled production automation while core discovery, matching and application workflows are still being validated.
10. Avoid unnecessary changes to database schemas or API contracts. If a breaking change is required, update the API/database design documentation and tests in the same change.

## Git workflow
Use feature branches for meaningful changes rather than committing experimental work directly to `main`.

Preferred flow:
1. Start from an up-to-date `main`.
2. Create a focused feature branch.
3. Make one coherent feature/change set.
4. Add/update tests.
5. Run the relevant build and tests.
6. Open a pull request.
7. Review/fix failures.
8. Merge to `main` only after validation.
9. Delete the feature branch after merge when it is no longer needed.

Do not create a new branch for every tiny edit. Group related changes into one focused branch.

## Frontend rules
- Reuse existing API contracts and components where practical.
- Loading, empty and error states should be explicit.
- Job cards should expose useful application information, including location, sponsorship status and direct application/ATS URL when available.
- Match scores should be explainable rather than presented as unexplained numbers.
- Avoid UI changes that hide data-quality uncertainty.

## Backend/API rules
- Validate request parameters.
- Preserve pagination semantics.
- Keep API responses backwards compatible unless a documented migration is made.
- Add regression tests for filters and important data transformations.
- Keep long-running scripts resumable and observable.
- Use structured progress/status information for long-running discovery jobs.

## Database rules
- Use Mongoose models and existing indexes/conventions.
- Avoid destructive migrations without explicit approval.
- Prefer idempotent enrichment/resolution jobs.
- Preserve checkpoint records needed for resumability and diagnostics.

## Testing requirements
For a feature that changes backend behavior:
- Add/update backend tests.
- Test the affected API contract.

For a frontend feature:
- Add/update frontend component tests where the project test setup supports them.
- Run the frontend build.

For data-pipeline changes:
- Test a bounded range before launching a full-scale run.
- Verify progress, checkpointing and summary counts.

## Current product priority
The current product stage is moving from the discovery/enrichment pipeline into the user-facing matching workflow.

Immediate sequence:
1. My Matches UI
2. Job details view
3. Save job
4. Application tracker
5. Matching/data-quality improvements
6. Final-stage email digest
7. GitHub Actions scheduling/cron

Cron/email automation is intentionally last.

## Working style
Always report the next development step after completing a task. Prefer exact commands when the user needs to run something locally. When modifying the repository directly, report the branch, files changed, tests/build status, and whether a PR was created or merged.
