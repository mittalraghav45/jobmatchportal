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
- Automated backend test workflow.
- Scheduled/manual source-verification workflow.
- Scheduled/manual controlled Google discovery workflow.
- Durable agent and operations documentation.

## Known limitations

- `unknown` jobs still require targeted provider-specific resolution.
- Google discovery is a fallback and can produce no useful careers URL.
- Some ATS providers rate-limit or block automated requests.
- Large crawls must remain bounded and rate-limited.
- API documentation should be expanded whenever route contracts are materially changed.

## Next priorities

1. Run the bounded Google crawler pilot and inspect jobs discovered.
2. Target the largest remaining unknown verification clusters.
3. Run full CI and frontend build.
4. Validate GitHub Actions against the real MongoDB secret.
5. Continue incremental discovery/verification rather than rebuilding the dataset.
