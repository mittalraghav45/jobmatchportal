# JobMatchPortal — Project Wrap-up (2026-10-02)

## Verified job population

The source-backed verifier is population-safe and currently operates on the complete 3,481-job dataset.

Latest verified state after the second targeted verification pass:

- Total jobs: 3,481
- Live: 1,565
- Closed: 155
- Unknown: 1,761
- Unverified: 0
- Population invariant: true

The second pass converted 477 unknown jobs to live and 3 to closed, reducing unknown from 2,241 to 1,761.

## Verification behaviour

- Exact source identity is required before a posting is considered live.
- Generic careers/ATS redirects are not sufficient evidence.
- HTTP 403/429/5xx responses remain unknown rather than being guessed as live or closed.
- Explicit closing-date and source-page closure evidence can classify a job as closed.
- Job-specific URL patterns and JobPosting JSON-LD are supported as additional live evidence.
- Reverification is incremental and can target unknown/stale records without resetting the full population.

## Commands

From `backend`:

```bash
npm run jobs:verify
npm run jobs:analyse-unknown
npm run jobs:google-fallback
```

The verifier supports `--limit=`, `--batch-size=`, `--concurrency=`, `--timeout-ms=`, `--recheck-days=` and `--only-unverified=false`.

## No-job company fallback

Companies with zero discovered jobs can receive a persistent `metadata.discoveryFallback` object containing a Google jobs/careers search URL. This does not create fake jobs and does not alter the 21,516-company population.

Run:

```bash
npm run jobs:google-fallback
```

## Data safety invariant

Discovery and verification must never delete companies or jobs merely because a source cannot be verified. A company with no discovered jobs is not evidence that the company has no jobs.

## Next operational pass

1. Pull the latest branch.
2. Run the backend test suite.
3. Run `npm run jobs:analyse-unknown` for the latest 1,761 unknown-job breakdown.
4. Run `npm run jobs:google-fallback` to populate fallback links for zero-job companies.
5. Run the API/frontend smoke test.
6. Only then merge/deploy.

Do not run another full discovery scan merely to verify existing data.
