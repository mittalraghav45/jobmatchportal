# Project Status — 2026-10-02

## Current milestone

Source-backed job verification and scaled, checkpointed sponsor-company discovery are operational. The system is being hardened for the full 21,516-company population while verified jobs are exposed incrementally through the API and frontend.

## Data checkpoint

- Canonical company population: 21,516.
- Latest verified-job population checkpoint: 3,481 jobs.
- Latest verification checkpoint: 1,565 live, 155 closed, 1,761 unknown, 0 unverified.
- Verification population invariant passed.
- Earlier duplicate repair completed with no remaining duplicate live `applyUrl` groups at the final audit checkpoint.
- A 500-company discovery test produced 171 discovered jobs, 60 additions, 111 updates and 7 rejected records; this validated the checkpointed/resumable discovery path before full-scale execution.

## Current scaled pipeline

The full company population is processed in bounded, non-overlapping ranges. Multiple discovery workers may run concurrently, each with its own run ID and checkpoint state. Newly discovered jobs can be picked up by the verification worker without waiting for the entire company population to finish.

```text
21,516 companies
      |
      +--> parallel checkpointed discovery ranges
      |
      v
MongoDB canonical jobs
      |
      +--> incremental source-backed verification
      |
      +--> live / closed / unknown
      |
      v
/api/jobs
      |
      v
React/Vite frontend
```

## Implemented

- Source-backed live/closed/unknown verification.
- Conservative redirect handling.
- ATS-aware source handling and structured `JobPosting` evidence.
- Canonical job identity and duplicate auditing/repair.
- Google career-search fallback URL generation.
- Bounded Google careers/ATS crawler for second-stage discovery.
- Google result redirect unwrapping so search-result URLs can become crawl targets.
- Recursive, bounded careers → ATS/job-link crawl within a per-company page budget.
- Checkpointed/resumable golden discovery runner.
- Parallel discovery support using non-overlapping company ranges.
- Incremental verification of newly discovered jobs.
- Backend API filtering, pagination and live-job queries.
- Frontend live verified-job integration and recoverable API failure handling.
- Application dashboard and application lifecycle UI.
- Automated backend test workflow.
- Scheduled/manual source-verification workflow.
- Scheduled/manual controlled Google discovery workflow.
- Durable agent and operations documentation.

## Known limitations

- `unknown` jobs still require targeted provider-specific resolution.
- Google discovery is a fallback and can produce no useful careers URL or can be blocked/rate-limited.
- Some ATS providers rate-limit or block automated requests.
- Large crawls must remain bounded, rate-limited and observable.
- The current frontend/API integration is suitable for incremental display, but matching and application ranking still need to be hardened against the larger live population.
- API documentation should be expanded whenever route contracts are materially changed.
- The Google API is intentionally not configured; the current crawler uses existing Google search fallback URLs.

## Current next priorities

1. Let the parallel discovery ranges complete while monitoring MongoDB health, throughput, failures and checkpoints.
2. Continue incremental verification as new jobs arrive.
3. Expose verified-live jobs through the frontend without waiting for the complete 21,516-company run.
4. Harden profile-to-job matching and sponsorship-aware filtering against the growing verified population.
5. Complete the application dashboard/API integration and end-to-end vacancy → match → application flow.
6. Run the complete backend test suite and frontend build after the current integration changes.
7. Reconcile this status document with measured MongoDB totals after the full discovery run completes.
