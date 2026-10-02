# JobMatchPortal — Project Status

Last updated: 2026-10-02

## Verified state

- Golden sponsor dataset: `backend/config/sponsor-companies.json`
- Golden dataset size: 21,516 companies
- MongoDB database: `jobmatchportal`
- Source-backed verification population: 3,481 jobs
- Verification population invariant: 3,481 before and after verification processing
- Current verification state: 1,568 live, 155 closed, 1,758 unknown
- Live jobs currently have complete `applyUrl`, company identity, and title fields: 1,568 / 1,568
- Live job identity uses the canonical source/apply URL when available.
- Live URL duplicate audit: 232 duplicate URL groups, 491 documents, 259 excess duplicate documents
- All 232 duplicate groups have the same title; 230 groups contain multiple company IDs, indicating company-identity duplication rather than different job titles.
- Duplicate repair script: `backend/scripts/repairLiveUrlDuplicates.js`
- Duplicate repair is dry-run by default and requires `--apply`; cross-company URL cleanup additionally requires `--resolve-company-conflicts`.
- Backend test suite: 144 passing, 0 failing, 3 skipped.
- Frontend production build: passes with Vite.

## Current migration step

The next database migration is to remove the 259 excess live URL duplicates while preserving application references. The repair script selects a survivor using verification/source/external-identity completeness and updates application references before deleting duplicate job documents.

Run the safety preview first:

```bash
cd /workspaces/jobmatchportal/backend
node -r dotenv/config scripts/repairLiveUrlDuplicates.js --resolve-company-conflicts
```

If the preview reports the expected 232 groups and 259 excess duplicates with no unexpected conflict patterns, run:

```bash
node -r dotenv/config scripts/repairLiveUrlDuplicates.js --apply --resolve-company-conflicts
```

Then re-run the duplicate audit and verification population summary. Do not create the new unique URL index until the live duplicate count is zero.

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

## Remaining roadmap

1. Complete live URL duplicate migration.
2. Add/enforce the database uniqueness constraint for canonical job URLs.
3. Re-run ingestion and verification to prove duplicate prevention is stable.
4. Confirm MongoDB startup + bulk matching endpoint.
5. Connect match results to frontend.
6. Verify deterministic match explanations and sponsorship filtering.
7. Application tracking.
8. CV/cover-letter workflow.
9. Automated refresh scheduling.
10. End-to-end, performance, and security testing.
11. Release hardening.
