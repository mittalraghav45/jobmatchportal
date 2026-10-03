# Project Handoff

## Resume point

Continue from branch `feat/source-backed-job-verification`. The project is now in the scaled discovery + incremental verification phase; do not restart the historical pilot unless a new controlled experiment is required.

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

1. Let the current 21,516-company discovery ranges complete while monitoring MongoDB health and checkpoints.
2. Continue incremental verification as new jobs arrive.
3. Reconcile final discovery and verification totals against the database.
4. Harden profile-to-job matching and sponsorship-aware filtering against the growing verified population.
5. Complete vacancy → match → application end-to-end integration.
6. Run the complete backend test suite and frontend build after integration changes.
7. Keep API, architecture, operations, status and agent documentation synchronized.

## Agent instruction

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_PIPELINE.md`, `docs/OPERATIONS.md` and `docs/PROJECT_STATUS.md` before making substantial changes. Use the existing tests and implementation as the source of truth; do not reconstruct project history from chat memory when the repository documents it.
