# AGENTS.md

## Purpose

UK Job Match Portal is a sponsorship-aware UK job discovery, verification and candidate-to-job matching system. Preserve data integrity and evidence-backed behaviour above all else.

## Repository map

- `backend/` — Express API, MongoDB models/repositories, discovery, verification, matching and application tooling.
- `backend/discovery/` — source-agnostic discovery contracts and source adapters.
- `frontend/` — React/Vite application.
- `docs/` — architecture, API, operations, data pipeline and handoff documentation.
- `.github/workflows/` — CI and scheduled discovery/verification/matching automation.
- `.devcontainer/` — reproducible GitHub Codespaces development environment.

## Critical data invariants

- The canonical company population is 21,516 companies. Never delete or silently shrink it as a side effect of discovery/verification.
- Job discovery is incremental. New discovery runs may intentionally increase the job population.
- Job verification is source-backed and population-safe. `live + closed + unknown + unverified` must equal the total job population after verification.
- `unknown` is a valid state. Never convert insufficient evidence into `closed` or `live` merely to improve coverage.
- A Google fallback URL is a discovery aid, not evidence that a job exists.
- Never fabricate jobs, closing dates, posting dates, sponsorship status or application URLs.
- Historical jobs and match results must be retained unless destructive cleanup is explicitly authorised.

## Discovery rules

1. Prefer direct company careers/ATS sources.
2. Google fallback may identify a company careers/ATS page when direct discovery finds no jobs.
3. Serper is an additional discovery layer for sponsor-company job discovery. It is a discovery mechanism, not proof that a vacancy is live.
4. Serper discovery is budget-bounded in code: default maximum 2 queries per company, default maximum 100 queries per run, and maximum 10 requested results per query.
5. Prefer configured ATS queries first when an ATS is known; otherwise use the company careers hostname and broader company search within the query budget.
6. Retain useful career/ATS source pages when a result is not itself an individual job posting. These pages may be crawled for structured JobPosting data or individual job links.
7. Crawl conservatively: use bounded page limits, request timeouts and source-page budgets, preserve source URLs, and respect applicable robots/rate limits.
8. Individual job pages are required for strong JobPosting evidence; generic career pages are not themselves job records.
9. Deduplicate by canonical job identity/source URL before insertion.
10. Large company populations may be processed in parallel bounded ranges, but each worker must remain checkpointed/resumable and rate-limited.
11. Do not assume that a successful discovery request means the resulting job is live; verification remains a separate stage.
12. jobs.ac.uk is a multi-employer job board, not an employer-specific ATS. Its search module is therefore a separate source-search path and must not invent or silently create canonical company records merely because a vacancy appears in the board search.
13. jobs.ac.uk search results must retain their original source URL. If source HTML changes or automated access is blocked, fail explicitly or use the documented RSS path rather than fabricating results.
14. jobs.ac.uk category searches should use the site's own `academicDisciplineFacet[]` and `subDisciplineFacet[]` parameters. Keyword and location are refinements, not substitutes for the source-side discipline taxonomy.
15. New discovery integrations must implement the canonical `JobSourceAdapter` contract in `backend/discovery/sourceAdapter.js` and return the normalised job shape.
16. Public-sector sources use `sourceKind: public_sector`. The current abstraction supports council, university, NHS, Civil Service and other public-body sources without coupling them to matching logic.
17. Source adapters must preserve `source`, `sourceKind`, `sourceJobId` and `applyUrl` for provenance and deduplication.
18. A source adapter is responsible for discovery only. It must not classify a job as live or bypass the existing verification pipeline.
19. The curated discovery seed is `backend/config/companies.csv`. Use `backend/scripts/syncDiscoveryCompanies.js` to synchronise configured companies into MongoDB; do not manually mutate production company records to make a smoke test pass.
20. `backend/scripts/nightlyDiscovery.js` supports `--companies=a,b,c`. An explicit selection must be deterministic and must never fall back to the default corpus when requested companies are missing.
21. The discovery GitHub Actions smoke mode is a quality gate. It must fail on missing/unselected requested companies, failed/unconfigured/invalid sources, rejected records or zero discovered jobs.

## UK eligibility rules

- The user-facing candidate pool is UK-only unless a feature explicitly says otherwise.
- Prefer a normalised UK country/nation field when available; use location text as a fallback.
- Non-UK locations such as Finland must never pass a UK-only filter because of title, company, remote wording or unrelated metadata.
- UK eligibility is an explicit match-result property so the reason a job is excluded can be inspected later.
- A job can remain in the historical corpus while being ineligible for the candidate-facing pool.

## Verification rules

- Verify from the job source URL, not from assumptions or search snippets alone.
- Redirects to generic boards must not automatically be classified as live.
- Structured `JobPosting` evidence can support a live classification when the posting identity is retained.
- HTTP errors and insufficient evidence remain distinguishable.
- Verification should be incremental and safe to rerun.
- Newly discovered jobs should be allowed to enter the verification queue without waiting for the entire discovery population to finish.

## Frontend/API rules

- `/api/jobs` is the canonical job-list API for the frontend.
- `/api/jobs-ac-uk` is a separate source-search API for direct jobs.ac.uk searches.
- `/api/jobs-ac-uk/filters` exposes the supported jobs.ac.uk discipline/subdiscipline taxonomy used by the UI.
- jobs.ac.uk search requests support `discipline`, `subDiscipline`, `q`/`keywords`, `location`, `page` and `pageSize`; the backend translates the taxonomy into source-side facet parameters.
- Preserve server-side pagination, filtering and source-backed verification semantics.
- Frontend development must work in Codespaces through the Vite `/api` proxy when no explicit API base URL is supplied.
- The frontend may display verified-live jobs incrementally while discovery is still running; it must not present unverified jobs as verified.
- Source-search results from jobs.ac.uk must be visibly distinguishable from the verified MongoDB job index and must retain their external source link.
- API/network failures should produce a recoverable UI state rather than a page crash.

## Matching rules

- Reuse the existing profile/job matching engine rather than creating parallel scoring implementations.
- Matching must remain explainable: preserve matched skills, missing skills, role-fit/seniority evidence and sponsorship recommendation.
- `/match/jobs` should apply the frontend-ready/verified-live/UK candidate contract before returning match results.
- Match scoring must happen before pagination when ranking is requested, so page boundaries do not hide higher-scoring matches.
- Do not invent candidate skills or job evidence.
- Valid persisted application-fit states are `strong`, `strong_unconfirmed_sponsorship`, `possible`, and `weak`.
- `strong_unconfirmed_sponsorship` means strong profile/role fit while sponsorship evidence remains unconfirmed; it must not be treated as confirmed sponsorship.
- Do not lower thresholds merely to manufacture Strong matches. Calibrate against representative results and inspect component scores/reasons.
- Preserve component scores, sponsorship status, eligibility and reasons so a human can understand each match.

## Large matching runs

- Full-corpus matching must use bounded batching/pagination and indexed queries.
- Avoid unindexed MongoDB sorts that can exceed MongoDB's 32 MB in-memory sort limit.
- Match persistence should be idempotent/upsert-based.
- Large runs must not delete jobs or historical match data as a side effect.
- The nightly matching workflow runs the backend test suite before the full-corpus matcher and publishes a human-readable GitHub Actions Summary plus a raw matcher-log artifact.
- A failed test must prevent the matcher from running.

## Operational rules

- MongoDB is the source of persisted job/company state.
- Health monitoring must be read-only and must not mutate or delete production data.
- Parallel discovery terminals must use non-overlapping company ranges and unique run IDs.
- Checkpoint collections must be used for resumability; do not restart a completed range unnecessarily.
- Before scaling a crawl, inspect a smaller pilot and confirm throughput, error rate, duplicate rate and database health.
- If a process fails, inspect its run summary/checkpoint before retrying.
- The curated five-company discovery smoke path has been proven idempotent: a first run discovered 268 jobs, adding 199 and updating 69; a repeat updated existing records without creating duplicates.

## Codespaces auto-sync

The `.devcontainer/auto-sync.sh` helper keeps the development branch `feat/source-backed-job-verification` current with GitHub.

- It starts automatically when the Codespace starts.
- It checks every 30 seconds.
- It only fast-forwards when the working tree is clean and the remote history is an ancestor of the local branch.
- It never overwrites uncommitted changes.
- It does not auto-merge divergent histories.
- Its log is written to `/tmp/jobmatchportal-auto-sync.log`.

## Development workflow

Before changing code:

1. Read the relevant existing implementation, tests and docs.
2. Prefer small, targeted changes.
3. Add/update tests for behaviour changes.
4. Run targeted tests first; run the complete `npm test` suite at meaningful integration checkpoints rather than after every small edit.
5. Run `npm run build` in `frontend` when frontend code changes.
6. Run `git diff --check`.
7. Update relevant documentation in the same change.

Do not use Playwright as a blocker for backend matching work. E2E/browser setup can be addressed separately.

## Documentation continuity

Keep these documents current:

- `README.md` — user-facing setup and project overview.
- `docs/ARCHITECTURE.md` — system architecture and data model.
- `docs/API.md` — API endpoints and contracts.
- `docs/DATA_PIPELINE.md` — company/job discovery, canonicalisation and verification pipeline.
- `docs/OPERATIONS.md` — commands, parallel runs, monitoring and recovery procedures.
- `docs/DISCOVERY_OPERATIONS.md` — discovery configuration sync, deterministic smoke testing and CI discovery gates.
- `docs/CODESPACES.md` — cloud development environment and MongoDB connectivity.
- `PROJECT_STATUS.md` — current milestone, metrics and known limitations.
- `docs/PROJECT_HANDOFF.md` — concise context for a new agent/chat.
- `docs/MIGRATION_HANDOFF.md` — current context and rules for moving development to a new chat/agent.
- `docs/PROJECT_WIKI.md` — durable project architecture, matching, discovery and application roadmap.
- `AGENTS.md` — durable engineering rules for future agents.

When a meaningful architectural or operational decision is made, update the appropriate document rather than relying only on chat history.

## Secrets

Never commit `.env`, MongoDB credentials, API keys or GitHub secret values. Workflows must read credentials from GitHub Actions Secrets. Codespaces should consume development secrets through GitHub Codespaces repository secrets; do not create or commit a `.env` file for the cloud environment.

## Cloud development

The repository includes a reproducible Codespaces configuration under `.devcontainer/`. The Codespace uses Node.js 24 and bootstraps backend/frontend dependencies. `MONGODB_URI` is supplied through the Codespaces environment and must never be committed.

## Current project branch

The active development branch for source-backed verification is `feat/source-backed-job-verification`. Confirm the branch before making changes; do not overwrite unrelated work.
