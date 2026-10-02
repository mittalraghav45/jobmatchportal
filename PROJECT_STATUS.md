# JobMatchPortal — Project Status

Last updated: 2026-10-02

## Verified state

- Golden sponsor dataset: `backend/config/sponsor-companies.json`
- Golden dataset size: 21,516 companies
- MongoDB database: `jobmatchportal`
- Current job population: 3,222 jobs
- Current verification state: 1,309 live, 155 closed, 1,758 unknown
- Verification classification invariant: 3,222 / 3,222 jobs classified
- Live jobs currently have complete `applyUrl`, company identity, and title fields: 1,309 / 1,309
- Live job identity uses the canonical source/apply URL when available.
- Live URL duplicate audit: 0 duplicate groups, 0 duplicate documents, 0 excess duplicates, largest group 1
- Live URL groups: 1,309 total, all unique
- Backend test suite: 145 passing, 0 failing, 3 skipped (148 total)
- Frontend production build: passes with Vite.

## Completed migration work

The live URL duplicate migration has been completed and re-audited. The database currently has no duplicate live `applyUrl` values.

The verification population also satisfies the current invariant: every job is classified as `live`, `closed`, or `unknown`, with no unverified remainder.

## Current scaling step

The next migration is to run the golden sponsor discovery pipeline across the 21,516-company dataset safely and resumably.

`backend/scripts/jobDiscoveryGoldenFull.js` now supports bounded discovery concurrency in addition to source-resolution concurrency. Discovery remains checkpointed in `golden_discovery_checkpoints`, and run state is tracked in `golden_discovery_runs`.

Relevant controls:

```bash
GOLDEN_BATCH_SIZE=50
GOLDEN_RESOLUTION_CONCURRENCY=5
GOLDEN_DISCOVERY_CONCURRENCY=3
GOLDEN_DELAY_MS=750
```

The same controls can be supplied as command-line arguments, for example:

```bash
cd /workspaces/jobmatchportal/backend
node -r dotenv/config scripts/jobDiscoveryGoldenFull.js --limit=50 --discovery-concurrency=3
```

Run a limited test first. Do not start the complete 21,516-company run until the limited run completes without unexpected failures, duplicate growth, or sustained upstream rate limiting.

The full run is resumable with the same run ID. Completed, unresolved, and invalid checkpoints are skipped unless `--retry-completed=true` is explicitly requested. Failed companies are checkpointed and can be retried on a later run.

## Identity invariants

1. A canonical source/apply URL is the strongest job identity.
2. When no URL exists, `companyId + externalId` is the fallback identity.
3. Location and title must not split an otherwise identical `companyId + externalId` job.
4. Application records referencing deleted duplicate jobs must be moved to the selected survivor before deletion.
5. After duplicate cleanup, enforce URL uniqueness at the database layer so future ingestion cannot recreate the same live job under another company identity.

## Architecture rules

- Do not replace or bypass the golden sponsor dataset.
- Job ingestion should use verified sources from `backend/config/job-source-registry.json`.
- Failed/unverified career URLs must be skipped and recorded rather than guessed.
- URL identity must remain stable across company records when the source URL is identical.
- Large discovery runs must use bounded concurrency, checkpointing, and failure isolation rather than unbounded parallel requests.

## Remaining roadmap

1. Run and validate the bounded-concurrency golden discovery pipeline on a limited company batch.
2. Scale the validated runner to the full 21,516-company dataset.
3. Re-run live-job verification and duplicate audits after discovery.
4. Add/enforce the database uniqueness constraint for canonical job URLs after the populated dataset is proven clean.
5. Confirm MongoDB startup + bulk matching endpoint.
6. Connect match results to frontend.
7. Verify deterministic match explanations and sponsorship filtering.
8. Application tracking.
9. CV/cover-letter workflow.
10. Automated refresh scheduling.
11. End-to-end, performance, and security testing.
12. Release hardening.
