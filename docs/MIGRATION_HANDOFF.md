# Migration Handoff

Last updated: 2026-10-04

## What this project is

JobMatchPortal is a UK job discovery, verification, sponsorship-aware filtering, profile-to-job matching and application workflow platform.

The canonical company population is **21,516 companies**. Do not shrink or replace that population as a side effect of job discovery or verification.

## Active branch

```text
feat/source-backed-job-verification
```

Continue development on this branch unless the user explicitly changes the target branch.

## Current verified data/filter checkpoints

The latest backend audit produced:

```text
allJobs:                 8,811
ukJobs:                  5,193
techJobs:                1,729
ukTechJobs:                979
ukTechLive:                784
ukTechLiveVerified:       488
ukTechLiveVerifiedApplyUrl: 488
frontendReady:             309
ukTechClosed:               39
ukTechUnknownStatus:         0
```

Frontend-ready processing was backfilled successfully:

```text
matchedBeforeUpdate: 179
modified:            179
remainingMissing:      0
frontendReadyAfter:  488
```

The live URL duplicate audit reached:

```text
urlGroups:       5,018
duplicateGroups: 0
duplicateDocs:   0
excessDuplicates: 0
largestGroup:    1
```

The full backend suite has recently reached:

```text
158 tests
154 passed
0 failed
4 skipped
```

The targeted matching suite currently passes:

```text
3 tests
3 passed
0 failed
```

## Current feature state

### Source-backed verification

Operational. Jobs have source-backed verification states and the frontend/API contract distinguishes verified-live jobs from unverified records.

### Serper discovery

Implemented on this branch and the real API smoke test succeeded.

Current application-level Serper controls:

```text
max queries/company: 2
max queries/run:     100
max results/query:   10
source pages/company: 2
```

The discovery script is:

```text
backend/scripts/discoverSerperJobs.js
```

with:

```bash
cd backend
npm run jobs:serper
npm run test:serper
```

Serper results are normalised and deduplicated. Company discovery retains both direct job URLs and useful career/ATS source pages; source pages are then crawled for structured `JobPosting` records or individual job links before canonical ingestion.

Measured experiment:

```text
requested companies: 10,000
queries executed:    100
companies with jobs: 7
jobs discovered:     8
jobs added:          6
jobs updated:        2
failed requests:     0
```

A later 5-company experiment after the first crawl-through change still produced zero records (5 Serper queries, 0 source pages fetched). The discovery script has since been hardened to derive the company source URL from `careersUrl`, `website` and metadata fields, because the persisted Company records may not have the same careers URL coverage as the CSV seed. The next step is a diagnostic rerun before increasing the Serper budget.

### Frontend-ready contract

Implemented. `/api/jobs` applies UK + technology filtering and the frontend-ready verification/apply/processing requirements unless `includeUnverified=true` is requested.

### Matching

The existing explainable profile-to-job matching engine is being reused. Do not create a second independent scoring engine.

### Codespaces

`.devcontainer/auto-sync.sh` runs every **10 seconds** and follows the currently checked-out branch when the worktree is clean. It never overwrites uncommitted changes or merges divergent history.

`.devcontainer/devcontainer.json` also runs:

```bash
cd backend && npm ci
```

on Codespace creation so backend dependencies such as `axios` are installed automatically.

## Development discipline

Do not repeatedly run the entire test suite after every tiny change.

Use this loop:

1. Inspect existing implementation.
2. Make the smallest coherent change.
3. Add/update focused tests.
4. Run focused tests.
5. Run the complete backend suite only at an integration checkpoint.
6. Run `git diff --check`.
7. Commit/push when green.

Avoid large diagnostic scripts unless a specific data invariant is unclear.

## Important existing files

### Backend filtering

```text
backend/routes/jobs.js
backend/utils/ukJobLocation.js
backend/utils/techJobRole.js
```

### Matching

```text
backend/routes/match.js
backend/routes/matchRoutes.js
backend/utils/matchFilters.js
backend/tests/matchFilters.test.js
backend/tests/matchRoute.test.js
backend/tests/profileMatching.test.js
backend/tests/cvJobMatcher.test.js
```

### Verification / ingestion

```text
backend/services/jobSourceVerification.js
backend/services/jobIngestion.js
backend/scripts/verifyJobSources.js
backend/scripts/enrichExistingJobs.js
```

## Important rules

- Never fabricate jobs, dates, sponsorship, company identity, application URLs or candidate evidence.
- `unknown` verification is legitimate; do not convert it to live/closed just to improve counts.
- Google fallback results are discovery aids, not evidence of a live vacancy.
- Preserve original source URLs.
- Do not silently overwrite local changes.
- Do not restart completed large discovery ranges without inspecting checkpoints first.
- Keep matching explainable.
- Keep the 21,516-company population intact.

## Next development direction

The next major product step is to make the 309 frontend-ready jobs more useful through stronger profile-to-job relevance/ranking while preserving the existing explainable matching engine. Prioritise application usefulness over simply increasing raw job counts.

After relevance/ranking is stable, continue toward vacancy → match → application end-to-end integration.

## If moving to a new chat/agent

Tell the new agent to:

1. Read `AGENTS.md`.
2. Read this file.
3. Read `docs/PROJECT_STATUS.md` and `docs/PROJECT_HANDOFF.md`.
4. Confirm the current branch is `feat/source-backed-job-verification`.
5. Inspect the existing matching implementation before creating new scoring logic.
6. Use focused tests and avoid blind full-suite loops.
7. Use the repository state as the source of truth rather than reconstructing history from the previous chat.

The repository documentation is intentionally sufficient to continue the project without relying on this conversation's history.
