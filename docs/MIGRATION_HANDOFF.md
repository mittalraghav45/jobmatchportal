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

### Frontend-ready contract

Implemented. `/api/jobs` applies UK + technology filtering and the frontend-ready verification/apply/processing requirements unless `includeUnverified=true` is requested.

### Matching

The existing explainable profile-to-job matching engine is being reused. Do not create a second independent scoring engine.

The match path now applies the verified-live/frontend-ready contract before returning jobs, and ranking/scoring occurs before pagination where ranking is requested.

### Codespaces

A safe auto-sync mechanism has been added:

- `.devcontainer/auto-sync.sh`
- `.devcontainer/devcontainer.json` starts it automatically.
- It checks the active branch every 30 seconds.
- It only fast-forwards when the worktree is clean.
- It never overwrites uncommitted changes.
- It does not merge divergent histories.
- Log: `/tmp/jobmatchportal-auto-sync.log`.

This means an agent can commit to `feat/source-backed-job-verification` and the running Codespace will normally pick up the commit automatically.

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
