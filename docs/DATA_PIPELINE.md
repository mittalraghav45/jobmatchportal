# Data Pipeline

## Canonical flow

```text
21,516-company protected population
        |
        +--> direct/ATS discovery
        |
        +--> Serper bounded discovery
        |       |
        |       +--> direct job result
        |       |
        |       +--> career/ATS source page
        |                  |
        |                  v
        |              bounded source-page crawl
        |
        +--> source adapters (including public-sector sources)
        |
        v
Canonical job records in MongoDB
        |
        v
Incremental source-backed verification
        |
        +--> live
        +--> closed
        +--> unknown
        |
        v
UK + live + verified eligibility
        |
        v
Candidate profile matching
        |
        v
/api/jobs / frontend / applications
```

## Source adapter contract

New discovery sources use `backend/discovery/sourceAdapter.js`.

A source adapter is responsible for discovery and normalisation only. It must not bypass canonical ingestion, deduplication or verification.

Canonical discovered job fields include:

- `title`
- `companyName`
- `location`
- `description`
- `applyUrl`
- `source`
- `sourceKind`
- `sourceJobId`
- `employmentType`
- `workMode`
- `postedAt`
- `metadata`

`source`, `sourceKind`, `sourceJobId` and `applyUrl` are retained for provenance and identity.

### Public-sector abstraction

`backend/discovery/publicSector.js` provides the public-sector source contract. Supported source categories are:

- `council`
- `university`
- `nhs`
- `civil_service`
- `other_public_body`

The adapter deliberately does not implement a site-specific scraper. Concrete official feeds/search paths should plug into this interface one source at a time. A discovered public-sector job still goes through the same canonical ingestion, URL identity, deduplication and source-backed verification stages as every other source.

## Company population

The company population is a protected source dataset containing 21,516 canonical companies. Discovery and verification must not delete companies as a side effect.

A company with no discovered job is not evidence that it has no vacancies.

For large runs, company ranges may be processed in parallel. Ranges must not overlap, each run must have a unique run ID, and checkpoint state must make the run safe to resume.

## Discovery

1. Prefer direct company careers/ATS sources.
2. If direct discovery produces no jobs, a Google fallback URL may be recorded as a discovery aid.
3. The bounded crawler may follow careers pages, recognised ATS boards and individual job links.
4. A generic search result must never become a fabricated job record.
5. Source URLs and canonical identity must be retained.
6. Discovery writes canonical records through the job repository's fingerprint/idempotency path.
7. New source adapters must normalise into the common source contract before entering the existing pipeline.

## Serper discovery

Serper is an additional bounded discovery source. It searches sponsor-company names against UK technology-job queries and, when a result is a career/ATS source page rather than an individual posting, retains that page for downstream crawling.

The current script enforces application-level budgets of 2 queries per company and 100 queries per run by default. These controls protect the application from accidental overuse; they do not change Serper's own account quota/billing limits.

Source-page crawling uses the existing careers crawler's structured JobPosting extraction and job-link classification before canonical ingestion. A Serper search result or snippet alone is never considered live-job evidence.

## Google fallback

A Google fallback URL is stored when direct discovery does not produce a job. It is a discovery aid only.

The second-stage crawler may use the search result to identify:

- company careers pages
- recognised ATS boards
- individual job pages

Google search results, snippets and generic careers pages are not by themselves evidence that a specific vacancy is live.

## Job identity and canonicalisation

Every discovered job should retain its source URL and a stable canonical identity where possible. Normalisation should remove tracking parameters and provider-specific URL noise without changing the identity of the posting.

Duplicate detection must happen before insertion. Live duplicate `applyUrl` groups are audited separately from fingerprint identity because multiple company identities can incorrectly point at the same source posting.

## Verification

Verification is incremental and safe to rerun. Newly discovered jobs may be verified while other company ranges are still running.

Current states:

- `live`
- `closed`
- `unknown`
- `unverified`

The verifier may use source-page evidence, recognised ATS patterns, redirects and structured `JobPosting` data. Redirecting to a generic board without retained posting identity is not sufficient evidence of a live posting.

Insufficient evidence remains `unknown`; HTTP/network failure must not be silently converted to `closed`.

## Population invariant

After every verification run:

```text
live + closed + unknown + unverified = total
```

A verification script must report before/after totals and fail loudly if the invariant is broken.

## Incremental frontend consumption

The API can expose verified-live jobs before the complete discovery population has finished. This is intentional: waiting for all 21,516 companies would unnecessarily delay useful results.

The frontend must only present jobs according to the API's source-backed verification semantics. A job entering MongoDB is not automatically a verified-live job.

## Operational safeguards

- bounded crawl depth/pages
- request timeouts
- domain-aware rate limiting
- robots/crawl policy checks where applicable
- no credentials submitted to public job pages
- no fabricated vacancy data
- source URL retained for every job
- failed/blocked requests remain distinguishable from closure
- non-overlapping parallel company ranges
- unique run IDs
- durable checkpoints
- incremental/resumable execution
- MongoDB health monitoring during large runs

## Current checkpoint

As of the 2026-10-02 verification checkpoint:

```text
Jobs:       3,481
Live:       1,565
Closed:       155
Unknown:    1,761
Unverified:     0
```

This is a measured checkpoint, not hard-coded production truth. Ongoing discovery can intentionally increase the job population.
