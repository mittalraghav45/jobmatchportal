# Project Handoff

## Resume point

Continue from branch `feat/source-backed-job-verification`. The project is now in the bounded Serper discovery + source-backed verification phase. Do not restart historical large discovery pilots unless a new controlled experiment is required.

## Goal

Maintain a sponsorship-aware UK job discovery and matching platform with a protected 21,516-company population, source-backed job verification, explainable matching and application tooling.

## Important populations

- Canonical companies: 21,516.
- Verified-job checkpoint: 3,481 jobs.
- Latest verification checkpoint: 1,565 live / 155 closed / 1,761 unknown / 0 unverified.
- Verification population invariant passed.
- Live duplicate `applyUrl` audit reached zero duplicate groups at the final repair checkpoint.

These are measured checkpoints, not permanent production totals; ongoing discovery can increase the job population.

## Current architecture

```text
21,516 companies
  -> parallel checkpointed discovery ranges
  -> MongoDB canonical jobs
  -> incremental source-backed verification
  -> /api/jobs
  -> frontend
  -> matching / sponsorship filtering
  -> applications
```

The four large discovery ranges are operationally independent and must not overlap. Each uses its own run ID/checkpoint state. A fifth process may handle incremental verification; the MongoDB health monitor is read-only.

## Important behaviour

- Newly discovered jobs can be verified before the full company population has finished.
- Verified-live jobs can be exposed to the frontend incrementally.
- A job entering MongoDB is not automatically live.
- `unknown` is a legitimate evidence state.
- Google fallback URLs are discovery aids, not job evidence.
- Never fabricate vacancies, closure dates, sponsorship or match evidence.
- Preserve the full company population.
- Verification must be incremental and population-safe.

## Current frontend/API integration

- `/api/jobs` provides server-side pagination and filtering.
- `live=true` can be used to consume verified-live jobs while discovery continues.
- Codespaces frontend uses the Vite `/api` proxy when no explicit API base URL is configured.
- Frontend API failures should render recoverable UI states rather than crash the page.
- The applications dashboard tracks saved → tailoring → ready_to_apply → applied → interview → offer, with rejected/withdrawn terminal states.

## Automation

GitHub Actions contains:

- `tests.yml`
- `job-verification.yml`
- `job-discovery.yml`

The workflows require `MONGODB_URI` as a GitHub Actions Secret. The discovery workflow is bounded.

## Useful local commands

```powershell
cd backend
npm test
npm run jobs:verify
npm run jobs:analyse-unknown
npm run jobs:google-fallback
npm run jobs:crawl-google-fallback -- --limit=100
```

For large discovery runs, use the checkpointed `jobDiscoveryGoldenFull.js` script with non-overlapping ranges, unique run IDs, bounded concurrency and a conservative delay. Inspect the run summary and checkpoint collection before retrying a failed range.

## Current next work

1. Rerun the Serper 5-company pilot with per-company diagnostics after the source-URL fallback fix; measure direct-job vs source-page extraction yield.
2. Harden Serper-discovered job records with automatic source-backed verification before they become eligible for verified-live/API consumption.
3. Keep the Serper query budget bounded and observable; do not scale to the full company population until pilot yield, duplicate rate, verification rate and source-page success rate are acceptable.
4. Continue incremental verification as newly discovered jobs arrive.
5. Harden profile-to-job relevance/ranking against the growing verified population.
6. Complete vacancy → match → application end-to-end integration.
7. Run the complete backend test suite and frontend build at integration checkpoints, then keep all documentation synchronized.


## Current release branch (8 October 2026)

The requested fixes are on `fix/job-search-application-evidence`, based on latest main `a7eeac4`. Continue validation there without overwriting unrelated branches. Regression coverage includes combined city/category/licensed-employer/live filters, real application lifecycle persistence, stale closed persisted matches, profile version selection and canonical job IDs/source URLs. Tests seed only isolated ephemeral MongoDB; do not seed production. Check the PR and its Matching Quality evidence before declaring release readiness.

### Deployment resume point

PR #16 contains the fixes and passed CI/full-corpus matching at `5dec911`. Subsequent deployment preparation adds `render.yaml`, fail-closed personal authentication, same-origin static serving and a read-only production-data smoke test. Render was suggested but has not been confirmed connected. Deployment is blocked on that hosting connection, not the GitHub MongoDB secret. Do not claim a live URL until a host reports successful deployment and the journey is checked.
