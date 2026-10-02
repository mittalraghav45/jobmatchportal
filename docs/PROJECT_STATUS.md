# Project Status — 2026-10-02

## Current milestone

Source-backed job verification and automated discovery are being hardened. The repository is moving from manual local execution toward GitHub Actions execution.

## Data checkpoint

- Company population: 21,516
- Discovered jobs: 3,481
- Latest verification: 1,565 live, 155 closed, 1,761 unknown, 0 unverified
- Latest verification preserved the 3,481-job population invariant.
- Google fallback: 21,045 companies currently have a fallback URL after direct discovery produced no jobs.

## Implemented

- Source-backed live/closed/unknown verification.
- Conservative redirect handling.
- ATS-aware source handling and structured `JobPosting` evidence.
- Unknown-job diagnostic analysis.
- Google career-search fallback URL generation.
- Bounded Google careers/ATS crawler for second-stage discovery.
- Google result redirect unwrapping so search-result URLs can become crawl targets.
- Recursive, bounded careers → ATS/job-link crawl within a per-company page budget.
- Newly discovered jobs remain `verification.status=unknown` and `status.isLive=false` until source verification runs.
- Automated backend test workflow.
- Scheduled/manual source-verification workflow.
- Scheduled/manual controlled Google discovery workflow.
- Durable agent and operations documentation.

## Known limitations

- `unknown` jobs still require targeted provider-specific resolution.
- Google discovery is a fallback and can produce no useful careers URL or can be blocked/rate-limited.
- Some ATS providers rate-limit or block automated requests.
- Large crawls must remain bounded and rate-limited.
- API documentation should be expanded whenever route contracts are materially changed.
- The Google API is intentionally not configured yet; the current crawler uses existing Google search fallback URLs.

## Next priorities

1. Pull this branch into Codespaces and run the complete backend test suite.
2. Run a small Google crawler pilot (10–25 companies), inspect discovered source quality and duplicates.
3. Run verification on any newly inserted jobs before treating them as live.
4. Scale the crawler in controlled batches if the pilot passes.
5. Target the largest remaining unknown verification clusters.
6. Run full CI and frontend build.
7. Continue incremental discovery/verification rather than rebuilding the dataset.
