# Project Handoff

## Resume point

Continue from branch `feat/source-backed-job-verification` without repeating the full discovery scan.

## Goal

Maintain a sponsorship-aware UK job discovery and matching platform with a protected company population, source-backed job verification, explainable matching and application tooling.

## Important populations

- 21,516 canonical companies.
- 3,481 discovered jobs at the 2026-10-02 checkpoint.
- Latest job verification: 1,565 live / 155 closed / 1,761 unknown / 0 unverified.
- Verification population invariant passed.
- 21,045 companies received Google fallback URLs after no direct job was discovered.

## Architecture

```text
Company population
  -> direct/ATS discovery
  -> Google careers fallback
  -> bounded careers/ATS crawler
  -> canonical job records
  -> source-backed verification
  -> job intelligence
  -> candidate matching
  -> application support
```

## Critical rules

- No-job-discovered does not mean no jobs exist.
- Google fallback URLs are discovery aids, not job evidence.
- Never fabricate vacancies, closure dates, sponsorship or match evidence.
- Preserve the full company population.
- Verification must be incremental and population-safe.
- `unknown` is a legitimate evidence state.

## Automation

GitHub Actions now contains:

- `tests.yml`
- `job-verification.yml`
- `job-discovery.yml`

The workflows require `MONGODB_URI` as a GitHub Actions Secret. The discovery workflow is intentionally bounded.

## Useful local commands

```powershell
cd backend
npm test
npm run jobs:verify
npm run jobs:analyse-unknown
npm run jobs:google-fallback
npm run jobs:crawl-google-fallback -- --limit=100
```

## Current next work

1. Run the 100-company Google crawler pilot.
2. Inspect discovered-job quality and deduplication.
3. Scale the crawler in controlled batches if the pilot passes.
4. Reduce the remaining 1,761 unknown jobs using provider-specific strategies.
5. Keep CI, API docs, architecture docs and this handoff synchronized with implementation.

## Agent instruction

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_PIPELINE.md`, `docs/OPERATIONS.md` and `docs/PROJECT_STATUS.md` before making substantial changes. Use the existing tests and implementation as the source of truth; do not reconstruct project history from chat memory when the repository documents it.
