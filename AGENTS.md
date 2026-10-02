# AGENTS.md

## Purpose

UK Job Match Portal is a sponsorship-aware UK job discovery, verification and candidate-to-job matching system. Preserve data integrity and evidence-backed behaviour above all else.

## Repository map

- `backend/` — Express API, MongoDB models/repositories, discovery, verification, matching and application tooling.
- `frontend/` — React/Vite application.
- `docs/` — architecture, API, operations, data pipeline and handoff documentation.
- `.github/workflows/` — CI and scheduled discovery/verification automation.

## Critical data invariants

- The canonical company population currently contains 21,516 companies. Never delete or silently shrink it as a side effect of discovery/verification.
- The current discovered-job population is 3,481 jobs unless a documented import/discovery change intentionally alters it.
- Job verification is source-backed and must preserve the total population. `live + closed + unknown + unverified` must equal the total job population.
- `unknown` is a valid state. Never convert insufficient evidence into `closed` or `live` merely to improve coverage.
- A Google fallback URL is a discovery aid, not evidence that a job exists.
- Never fabricate jobs, closing dates, posting dates, sponsorship status or application URLs.

## Discovery rules

1. Prefer direct company careers/ATS sources.
2. Google fallback may identify a company careers/ATS page when direct discovery finds no jobs.
3. Crawl conservatively: obey robots/rate limits, use bounded depth/pages, and retain source URLs.
4. Individual job pages are required for strong `JobPosting` evidence; generic career pages are not themselves job records.
5. Deduplicate by canonical job identity/source URL before insertion.

## Verification rules

- Verify from the job source URL, not from assumptions or search snippets alone.
- Redirects to generic boards must not automatically be classified as live.
- Structured `JobPosting` evidence can support a live classification when the posting identity is retained.
- HTTP errors and insufficient evidence remain distinguishable.
- Verification should be incremental and safe to rerun.

## Development workflow

Before changing code:

1. Read the relevant existing implementation, tests and docs.
2. Prefer small, targeted changes.
3. Add/update tests for behaviour changes.
4. Run `npm test` in `backend`.
5. Run `npm run build` in `frontend` when frontend code changes.
6. Run `git diff --check`.
7. Update relevant documentation in the same change.

## Documentation continuity

Keep these documents current:

- `README.md` — user-facing setup and project overview.
- `docs/ARCHITECTURE.md` — system architecture and data model.
- `docs/API.md` — API endpoints and contracts.
- `docs/DATA_PIPELINE.md` — company/job discovery, canonicalisation and verification pipeline.
- `docs/OPERATIONS.md` — commands, scheduled workflows, secrets and recovery procedures.
- `docs/PROJECT_STATUS.md` — current milestone, metrics and known limitations.
- `docs/PROJECT_HANDOFF.md` — concise context for a new agent/chat.
- `AGENTS.md` — durable engineering rules for future agents.

When a meaningful architectural or operational decision is made, update the appropriate document rather than relying only on chat history.

## Secrets

Never commit `.env`, MongoDB credentials, API keys or GitHub secret values. Workflows must read credentials from GitHub Actions Secrets.

## Current project branch

The active development branch for source-backed verification is `feat/source-backed-job-verification`. Confirm the branch before making changes; do not overwrite unrelated work.
