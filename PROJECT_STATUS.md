# JobMatchPortal — Project Status

Last updated: 2026-10-05

## Verified state

- Golden sponsor dataset: `backend/config/sponsor-companies.json`
- Golden dataset size: 21,516 companies
- MongoDB database: `jobmatchportal`
- Latest full matching corpus observed: 9,008 jobs.
- Latest full matching quality run produced 13 `strong_unconfirmed_sponsorship` results and passed the quality gate with no Strong-result violations for low skills, role incompatibility, experience incompatibility, excluded technologies, specialist mismatches or hard seniority problems.
- The latest quality run demonstrates that the matcher can produce a non-zero Strong shortlist without weakening specialist-role protections.
- Backend matching records explicit UK/live/verified/technology eligibility metadata and keeps non-UK records in historical storage rather than deleting them.
- Backend test suite is passing after synchronising the `strong_unconfirmed_sponsorship` application-fit state with its persistence test.
- Frontend production build passes with Vite.

## Matching and eligibility milestone

The full-corpus matcher can process the 9,000+ job corpus using bounded batching without the unindexed MongoDB sort that previously exceeded the 32 MB in-memory sort limit.

Candidate-facing eligibility is explicitly UK-only. A normalised country/nation value is preferred and location text is a fallback. Non-UK jobs such as Finland remain stored for historical/audit purposes but must not enter the UK candidate pool.

Match results preserve component scores, sponsorship status, eligibility metadata and explainable reasons. Valid fit states are `strong`, `strong_unconfirmed_sponsorship`, `possible`, and `weak`.

`strong_unconfirmed_sponsorship` means strong profile/role fit with sponsorship still unconfirmed. It does not assert that the employer sponsors Skilled Worker visas.

## Nightly automation and quality gate

`.github/workflows/matching-quality.yml` provides a bounded full-corpus matching workflow with manual dispatch and a scheduled 02:15 UK target during BST (`01:15 UTC`; GitHub cron is UTC and does not follow UK daylight-saving changes).

The workflow checks out the selected ref, installs Node 20 dependencies, runs the complete backend test suite, runs `npm run nightly:matching` against the complete jobs collection, enforces the nightly quality gate, publishes a human-readable GitHub Actions Summary, and uploads the raw matcher log/report artifacts for 14 days.

The quality gate rejects unsafe Strong results such as low skill evidence, specialist mismatches, incompatible role families, incompatible experience, excluded technologies or unresolved hard seniority problems. Unconfirmed sponsorship is a warning rather than a gate failure because sponsorship readiness is intentionally separate from core job fit.

The workflow is diagnostic/reproducible automation. It does not autonomously rewrite source code.

## Discovery architecture milestone

Discovery is now separated from matching through a canonical source-adapter contract in `backend/discovery/sourceAdapter.js`.

All new discovery sources should return the normalised job shape and preserve `source`, `sourceKind`, `sourceJobId` and `applyUrl`.

The first source-specific abstraction is `backend/discovery/publicSector.js`, which provides a common public-sector adapter contract for councils, universities, NHS, Civil Service and other public bodies.

The adapter is intentionally source-agnostic: it does not claim that a discovered record is live and does not bypass canonical ingestion, deduplication or source-backed verification. Individual official feeds/connectors can therefore be added without creating separate matching logic.

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
- New source adapters must remain separate from verification and matching logic.
- The frontend should expose only verified-live, applyable, UK-eligible jobs by default.
- Historical jobs and match results are retained; eligibility is a filtering property, not a deletion instruction.

## Remaining roadmap

1. Implement the first concrete public-sector source connector using the new adapter contract, beginning with official source-backed feeds/search paths rather than scraping assumptions.
2. Add university, NHS and Civil Service connectors through the same adapter interface.
3. Re-run live-job verification and duplicate audits after material ingestion milestones.
4. Connect calibrated match results to the verified live-job feed.
5. Verify deterministic match explanations and sponsorship filtering.
6. Expand discovery across startups, scale-ups, sponsorship employers and general profile-relevant employers.
7. Application tracking.
8. CV/cover-letter workflow.
9. Automated refresh scheduling.
10. End-to-end, performance, security and release hardening.
