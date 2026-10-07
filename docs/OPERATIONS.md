# Operations Guide

## Local commands

From `backend/`:

```powershell
npm ci
npm test
npm run test:serper
npm run jobs:verify
npm run jobs:analyse-unknown
npm run jobs:google-fallback
npm run jobs:crawl-google-fallback -- --limit=100
npm run jobs:serper -- --limit=5 --per-query=5 --max-queries=10
npm run test:apify-unresolved -- --limit=10
```

Run expensive network jobs deliberately; do not repeatedly rerun a full population without a reason.

## Serper discovery

Serper is a bounded discovery source for sponsor-company jobs. The implementation lives in:

```text
backend/services/serperJobDiscovery.js
backend/scripts/discoverSerperJobs.js
```

Run a small pilot first:

```bash
npm run jobs:serper -- --limit=5 --per-query=5 --max-queries=10
```

Default application-level safeguards:

```text
2 queries/company
100 queries/run
10 results/query
2 source pages/company
```

`--max-queries` and `--max-queries-per-company` are hard application-level caps. They do not change the quota or billing rules enforced by Serper.

The pipeline may crawl retained career/ATS source pages and extract structured `JobPosting` records or individual job links. All discovered records still require canonical ingestion and source-backed verification. Never treat a Serper snippet or generic career page as proof that a vacancy is live.

## Apify unresolved-company pilot

Run the bounded pilot before any wider rollout:

```bash
npm run test:apify-unresolved -- --limit=10
```

The workflow supplies `APIFY_KEY` from the GitHub Actions secret and uses `parseforge/career-site-jobs-scraper` by default. The pilot caps results to 10 jobs per run and caps total Apify charge at the configured `APIFY_MAX_TOTAL_CHARGE_USD` value. Results are persisted only when they have a UK nation classification and retain the original job/apply URL. Apify is discovery evidence; source-backed verification still has to run before a job is treated as verified-live. If the pilot yields zero jobs, do not scale it; inspect the selected career URLs and Actor input contract first.

## Large-scale discovery

The canonical company population contains 21,516 companies. For a full run, process bounded non-overlapping company ranges in separate terminals when required. Every process should have:

- a unique `--run-id`
- a defined company range or limit
- bounded discovery/resolution concurrency
- a conservative delay/rate limit
- checkpointed/resumable state

Example pattern:

```powershell
node -r dotenv/config scripts/jobDiscoveryGoldenFull.js --run-id=golden-1-6k --start=1 --end=6000 --batch-size=10 --resolution-concurrency=3 --discovery-concurrency=2 --delay=750
node -r dotenv/config scripts/jobDiscoveryGoldenFull.js --run-id=golden-6k-12k --start=6001 --end=12000 --batch-size=10 --resolution-concurrency=3 --discovery-concurrency=2 --delay=750
```

Use the actual allocated ranges for the current run. Never overlap ranges just to increase throughput.

A discovery process may finish before the others. Do not treat a single terminal's completion as completion of the whole population.

## Incremental verification

Verification should run continuously or in bounded batches against newly discovered jobs. It is not necessary to wait for all 21,516 companies to finish discovery.

New jobs should remain unverified until source-backed verification processes them. Verified-live jobs may be consumed by `/api/jobs` and the frontend while discovery continues.

## Monitoring

The MongoDB health monitor is read-only. During large runs, watch:

- MongoDB connectivity/latency
- job count growth
- live/closed/unknown/unverified counts
- discovery throughput
- resolved vs unresolved companies
- failed/rejected records
- checkpoint progress
- duplicate URL/fingerprint counts
- process memory/CPU where available

A monitoring failure must not mutate the job or company collections.

## GitHub Codespaces

Codespaces is the cloud development environment for the repository. The setup is defined by `.devcontainer/devcontainer.json` and `.devcontainer/setup.sh`.

See `docs/CODESPACES.md` for first-time setup, MongoDB Atlas connectivity, verification commands and Git workflow.

Required Codespaces secret:

```text
MONGODB_URI
```

Never commit the value.

## GitHub Actions

Workflows live under `.github/workflows/`:

- `tests.yml` — backend test suite on pushes/PRs.
- `job-verification.yml` — manual/nightly source verification.
- `job-discovery.yml` — controlled Google career discovery, manual/weekly.

Required Actions secret:

```text
MONGODB_URI
```

Never commit the value.

## Safe execution order

1. Pull the intended branch.
2. Confirm the working tree and branch are correct.
3. Run tests before a material code change.
4. Inspect current population and duplicate summaries.
5. Start a small pilot before increasing concurrency.
6. Allocate non-overlapping company ranges for parallel execution.
7. Monitor MongoDB and checkpoints while discovery runs.
8. Verify newly discovered jobs incrementally.
9. Check population invariants and duplicate audits.
10. Review run summaries before scaling further.

## Frontend integration

The backend serves the job API and the React/Vite frontend consumes it through the Vite `/api` proxy when no explicit API base URL is configured. Restart Vite after changing proxy configuration.

The frontend may display verified-live jobs while discovery is still running. API failures should be recoverable UI states, not fatal page crashes.

## Recovery principles

- Never delete the company population to repair job data.
- Never reset the entire jobs collection just because verification changed.
- Prefer incremental re-verification.
- Preserve source URLs and verification evidence.
- Resume a failed discovery run using its existing run ID/checkpoints where appropriate.
- Do not restart completed ranges unnecessarily.
- If a run fails, inspect its summary/log before retrying.
- If MongoDB becomes unhealthy, reduce/stop discovery concurrency rather than repeatedly hammering the database.

## Environment

Local secrets belong in `backend/.env` and are excluded from Git. Codespaces secrets belong in GitHub repository Codespaces Secrets. CI secrets belong in GitHub Actions Secrets.

Do not copy MongoDB credentials into source files, documentation, issues or pull requests.

## Documentation continuity

After a material architecture, schema, workflow or operational change, update `AGENTS.md` and the relevant `docs/` document. Keep `docs/PROJECT_STATUS.md` and `docs/PROJECT_HANDOFF.md` current enough that a new chat/agent can resume without relying on conversation history.

## Frontend E2E validation

The frontend E2E suite runs through the PR validation workflow and can also be run locally from `frontend/`:

```bash
npm ci
npx playwright install --with-deps chromium
npm run e2e
```

The suite covers dashboard rendering, matched-job application preparation, application-review follow-up scheduling/status transitions, and recoverable job API failures. Keep API calls mocked in these tests so the suite validates frontend behavior without requiring MongoDB or live discovery services.

## Matching/application production path

The production candidate flow is now explicitly staged: verified-live UK technology vacancy -> persisted MatchResult ranking -> candidate-facing pagination -> saved application -> tailoring/application-pack generation. The ranking endpoint prefers persisted full-corpus results so page one represents the best available matches rather than the best matches from an arbitrary page of jobs.

The Apify fallback remains disabled from normal operation until external capacity is available. Paid discovery is not required for the matching/application pipeline to operate.


## Full Apify workflow gating

`Full Apify Unresolved Discovery` is intentionally gated. A normal push to `main` does not spend Apify capacity unless the triggering commit contains `[run-full-apify]`; a manual `workflow_dispatch` also enables the full run. When the gate is not enabled, the pilot, planning, batch, and matching jobs are expected to be skipped and the summary reports that gated skip as a successful no-op. When a full run is requested, failed Apify batches or matching still fail the workflow.
