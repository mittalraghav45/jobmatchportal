# Project Status — 2026-10-04

## Current milestone

Source-backed job verification, frontend-ready filtering, sponsorship-aware filtering and explainable profile-to-job matching are operational. The current development focus is bounded Serper discovery and connecting it safely into the existing source-backed verification pipeline without weakening the evidence contract.

## Serper discovery checkpoint

The Serper API is confirmed working from Codespaces using the `SERPER_API_KEY` secret.

Current application-level controls:

- 2 Serper queries per company by default.
- 100 Serper queries per run by default.
- 10 requested results per query maximum.
- 2 career/ATS source pages per company are crawled by default.

Serper results are normalised/deduplicated. Direct job URLs and useful career/ATS source pages are retained. Source pages can be crawled for structured `JobPosting` data or individual job links, then records pass through canonical ingestion/upsert.

Controlled experiment:

```text
requested companies: 10,000
queries executed:    100
companies with jobs: 7
jobs discovered:     8
jobs added:          6
jobs updated:        2
failed requests:     0
```

A later 5-company experiment after the first crawl-through change still produced 0 records, with 5 Serper queries and 0 source pages fetched. Investigation showed the script could have missing `careersUrl` values in the MongoDB Company documents; the discovery script now falls back across `careersUrl`, `website` and metadata career/website fields. The next real pilot should be rerun with per-company diagnostics before increasing the Serper budget.

## Data checkpoint

Latest backend filter audit:

- Canonical company population: **21,516**.
- All jobs: **8,811**.
- UK jobs: **5,193**.
- Technology jobs: **1,729**.
- UK technology jobs: **979**.
- UK technology live jobs: **784**.
- UK technology live + verified jobs: **488**.
- UK technology live + verified + apply URL: **488**.
- Frontend-ready jobs: **309**.
- UK technology closed: **39**.
- UK technology unknown status: **0**.

Frontend-ready processing backfill completed safely:

```text
matchedBeforeUpdate: 179
modified:            179
remainingMissing:      0
frontendReadyAfter:  488
```

Live `applyUrl` duplicate audit:

```text
urlGroups:        5,018
duplicateGroups:     0
duplicateDocuments:  0
excessDuplicates:    0
largestGroup:        1
```

## Test checkpoint

Latest full backend test checkpoint:

```text
158 tests
154 passed
0 failed
4 skipped
```

Latest targeted matching checkpoint:

```text
3 tests
3 passed
0 failed
```

## Current architecture

```text
21,516 companies
      |
      +--> checkpointed discovery
      |
      v
MongoDB canonical jobs
      |
      +--> source-backed verification
      |
      +--> UK + technology classification
      |
      +--> frontend-ready processing contract
      |
      v
/api/jobs
      |
      +--> profile/job matching
      |
      +--> sponsorship-aware filtering
      |
      v
frontend
      |
      v
application workflow
```

## Implemented

- Source-backed live/closed/unknown verification.
- Conservative redirect handling.
- ATS-aware source handling and structured `JobPosting` evidence.
- Canonical job identity and duplicate auditing/repair.
- Checkpointed/resumable discovery.
- Parallel discovery support using non-overlapping company ranges.
- Incremental verification of newly discovered jobs.
- UK and technology job classification/filtering.
- Frontend-ready processing backfill.
- Server-side job pagination/filtering.
- Sponsorship and employer-type filtering.
- Explainable candidate/job matching.
- Matching filter contract aligned with verified-live/frontend-ready jobs.
- Targeted matching tests.
- Frontend live verified-job integration and recoverable API failure handling.
- Application dashboard and application lifecycle tooling.
- Codespaces auto-sync for the active development branch.
- Durable agent and migration handoff documentation.

## Known limitations

- The 309 frontend-ready count is a current data checkpoint, not a permanent limit; discovery can increase it.
- Some jobs still lack complete metadata such as posted date, employment type or location granularity.
- `unknown` source-verification evidence remains a valid state in the broader job population.
- Some ATS providers rate-limit or block automated requests.
- Matching/ranking still needs stronger candidate-specific relevance prioritisation over the frontend-ready population.
- Vacancy → match → application integration is not yet complete end-to-end.

## Current next priorities

1. Build candidate-specific relevance/ranking on top of the existing explainable matching engine.
2. Keep ranking before pagination so the best matches are visible on page one.
3. Add focused relevance tests rather than repeatedly running the full suite.
4. Complete vacancy → match → application integration.
5. Run the complete backend suite at integration checkpoints and frontend build after frontend changes.
6. Reconcile data/status documentation after meaningful discovery or verification changes.
