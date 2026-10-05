# JobMatchPortal — Project Status

Last updated: 2026-10-05

## Verified state

- Golden sponsor dataset: `backend/config/sponsor-companies.json`
- Golden dataset size: 21,516 companies
- MongoDB database: `jobmatchportal`
- Latest full matching corpus observed: 9,008 jobs.
- Latest full matching classification observed: 4,974 UK, 4,034 non-UK; 7,738 live, 1,270 not live; 6,168 verified, 2,840 unverified.
- Latest matching baseline: 3,500 possible, 5,508 weak, 0 strong, 0 strong-unconfirmed in the pre-UK-eligibility calibration run.
- Backend matching now records explicit UK/live/verified/technology eligibility metadata and keeps non-UK records in historical storage rather than deleting them.
- Backend test suite is passing after synchronising the `strong_unconfirmed_sponsorship` application-fit state with its persistence test.
- Frontend production build passes with Vite.

## Matching and eligibility milestone

The full-corpus matcher can now process the 9,000+ job corpus using bounded batching without the unindexed MongoDB sort that previously exceeded the 32 MB in-memory sort limit.

Candidate-facing eligibility is explicitly UK-only. A normalised country/nation value is preferred and location text is a fallback. Non-UK jobs such as Finland remain stored for historical/audit purposes but must not enter the UK candidate pool.

Match results preserve component scores, sponsorship status, eligibility metadata and explainable reasons. Valid fit states are `strong`, `strong_unconfirmed_sponsorship`, `possible`, and `weak`.

`strong_unconfirmed_sponsorship` means strong profile/role fit with sponsorship still unconfirmed. It does not assert that the employer sponsors Skilled Worker visas.

## Nightly automation

`.github/workflows/matching-quality.yml` provides a bounded full-corpus matching workflow with manual dispatch and a scheduled 02:15 UK target during BST (`01:15 UTC`; GitHub cron is UTC and does not follow UK daylight-saving changes).

The workflow checks out the selected ref, installs Node 20 dependencies, runs the complete backend test suite, runs `npm run nightly:matching` against the complete jobs collection, performs MatchResult upserts only, publishes a human-readable GitHub Actions Summary, and uploads the raw matcher log for 14 days.

The workflow is diagnostic/reproducible automation. It does not autonomously rewrite source code.

## Current scaling step

The golden sponsor discovery pipeline is being run across the 21,516-company dataset using bounded, checkpointed workers. `backend/scripts/jobDiscoveryGoldenFull.js` supports bounded discovery concurrency and resumable checkpoints.

Relevant controls:

```bash
GOLDEN_BATCH_SIZE=50
GOLDEN_RESOLUTION_CONCURRENCY=5
GOLDEN_DISCOVERY_CONCURRENCY=3
GOLDEN_DELAY_MS=750
```

The full discovery run remains checkpointed and resumable. Completed, unresolved, and invalid checkpoints are skipped unless explicitly retried.

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
- Large discovery and matching runs must use bounded concurrency, batching/checkpointing and failure isolation rather than unbounded parallel requests.
- The frontend should expose only verified-live, applyable, UK-eligible jobs by default.
- Historical jobs and match results are retained; eligibility is a filtering property, not a deletion instruction.

## Remaining roadmap

1. Re-run the full 9,008+ matching corpus with the corrected UK eligibility and sponsorship-fit schema.
2. Inspect top UK matches and calibrate component weights/thresholds from representative evidence.
3. Expand discovery across UK councils, universities, startups, scale-ups, sponsorship employers and general profile-relevant employers.
4. Re-run live-job verification and duplicate audits after material ingestion milestones.
5. Connect calibrated match results to the verified live-job feed.
6. Verify deterministic match explanations and sponsorship filtering.
7. Application tracking.
8. CV/cover-letter workflow.
9. Automated refresh scheduling.
10. End-to-end, performance, security and release hardening.
