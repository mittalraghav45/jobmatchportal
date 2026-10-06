# API Reference

## Purpose

This document records the externally useful HTTP API surface. Keep it updated when routes, request schemas or response contracts change.

## Backend

Default local base URL:

```text
http://localhost:3001
```

In Codespaces, the frontend normally reaches the backend through the Vite `/api` proxy when no explicit API base URL is configured.

## Health

### `GET /api/health`

Returns backend health information.

## Jobs

### `GET /api/jobs`

Returns paginated UK technology jobs. The route applies the repository's UK-market and technology-role filters before returning results.

Supported query parameters include:

- `page` — 1-based page number.
- `limit` — page size, bounded by the route implementation.
- `company` — company ID filter.
- `ats` — source ATS filter.
- `location` — case-insensitive location search.
- `nation` — nation filter.
- `employerType` — employer-type filter.
- `sponsorship` — sponsorship-aware company filter.
- `employmentType` — employment-type filter.
- `workMode` — work-mode filter.
- `q` — text search.
- `live` — `true` or `false` when explicitly supplied.
- `sort` — `oldest` or `posted`; default is latest seen first.

Response shape:

```json
{
  "jobs": [],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 0,
    "pages": 0
  },
  "market": "United Kingdom",
  "roleType": "Technology"
}
```

The frontend may query `live=true` while discovery is still running. A job appearing in MongoDB does not by itself make it a verified-live job.

### `GET /api/jobs/stats`

Returns aggregate job statistics for the UK technology-job population, including total/live counts, company count, nation breakdown and employer-type breakdown.

### `GET /api/jobs/:id`

Returns one UK technology job by fingerprint or external ID when it satisfies the route's market/role filters.

## jobs.ac.uk search

### `GET /api/jobs-ac-uk`

Searches the public jobs.ac.uk vacancy search and returns source results without requiring the vacancy to already exist in the MongoDB company population.

Supported query parameters:

- `discipline` — jobs.ac.uk academic-discipline facet slug; defaults to `computer-sciences`.
- `subDiscipline` — jobs.ac.uk sub-discipline facet slug, for example `software-engineering`, `computer-science`, `artificial-intelligence`, `cyber-security` or `information-systems`.
- `q` or `keywords` — optional free-text search terms.
- `location` — optional jobs.ac.uk location search.
- `page` — 1-based page number.
- `pageSize` — requested page size, capped by the source module.

The backend translates `discipline` and `subDiscipline` into the source site's `academicDisciplineFacet[]` and `subDisciplineFacet[]` parameters rather than trying to reproduce the category filter locally.

Example:

```text
GET /api/jobs-ac-uk?discipline=computer-sciences&subDiscipline=software-engineering&q=react&location=Southampton&page=1&pageSize=25
```

### `GET /api/jobs-ac-uk/filters`

Returns the supported jobs.ac.uk discipline/subdiscipline taxonomy used by the frontend search module.

The response includes the source name and an array of disciplines with their subdisciplines. The taxonomy is intentionally kept aligned with the source search facets rather than being treated as a JobMatch classification.

The response includes the source search URL, source total when available, pagination inputs, selected discipline/subdiscipline and normalised source jobs containing the original jobs.ac.uk URL. This module is intentionally separate from the company ATS discovery pipeline because jobs.ac.uk is a multi-employer job board rather than an employer-specific ATS.

The implementation currently reads the public search HTML. If jobs.ac.uk changes its markup or blocks automated requests, the endpoint must fail explicitly rather than fabricate an empty result set. jobs.ac.uk also exposes search/filter pages that demonstrate the academic-discipline and sub-discipline facet parameters used by this integration.

## Serper discovery

Serper is currently exposed as a backend discovery script rather than a public HTTP endpoint.

From `backend/`:

```bash
npm run test:serper
npm run jobs:serper -- --limit=5 --per-query=5 --max-queries=10
```

Current application-level defaults:

- 2 Serper queries per company.
- 100 Serper queries per run.
- 10 requested results per query.
- 2 retained career/ATS source pages per company for downstream crawling.

The Serper API key is supplied through `SERPER_API_KEY`. It must never be returned by the API, committed to source control or written to documentation.

A Serper result is not automatically a JobMatchPortal verified-live job. Direct job URLs are canonicalised and ingested; career/ATS source pages may be crawled for individual postings. All resulting jobs remain subject to the existing source-backed verification states and live-job filters.

## Application routes

The application tracker is exposed through the application route module. When changing application routes, update this section with the exact method, path, parameters and response contract from the implementation and tests.

## Contract rules

- Do not expose MongoDB credentials or internal secrets.
- Preserve `unknown` sponsorship and verification states rather than coercing them to negative states.
- Job source URLs must remain traceable to the discovered source.
- API responses should not claim a job is live unless source-backed verification supports it.
- Changes to persisted job/company schemas must be accompanied by migration/backfill notes when needed.
- Pagination and filtering must remain server-side for large job populations.
- Network/API failures should be represented as recoverable client states rather than fabricated empty data.

## Verification response concepts

Job verification uses:

- `live` — source evidence supports an active posting.
- `closed` — source evidence supports closure.
- `unknown` — available evidence is insufficient to classify the source.
- `unverified` — the job has not yet been processed by the verification pipeline.

Population invariant:

```text
live + closed + unknown + unverified = total jobs
```

## Updating this document

Do not invent endpoints from memory. Inspect the route definitions and tests, then update the contract from the implementation.


## Apify discovery fallback

The unresolved-company discovery worker may call the configured Apify Actor through the Apify HTTP API. The current default is `parseforge/career-site-jobs-scraper`. It accepts `careerSiteUrls` plus bounded technical `searchTerms` and returns structured job rows. `APIFY_KEY` is supplied from the runtime/Actions secret and is never returned by the application.

## Ranked matching and application bridge

The candidate-facing `POST /api/match/jobs` endpoint ranks the global candidate pool before pagination when persisted `MatchResult` records exist for the requested profile. It falls back to bounded dynamic ranking only when no persisted match corpus is available.

A verified-live vacancy can be converted directly into a saved application with `POST /api/match/jobs/:jobId/application`. The endpoint revalidates UK/live/verified/technology eligibility, calculates the current profile match, prevents duplicate applications for the same profile/job, and creates the application in `saved` state.



## Application tracking

### `GET /api/applications`
Returns application records, newest updates first. Optional `profileId`, `status`, and `limit` (1–100, default 50). Response includes `applications` and a status summary.

### `GET /api/applications/summary`
Returns aggregate application lifecycle counts, optionally filtered by `profileId`.

### `GET /api/applications/follow-ups`
Returns the active follow-up queue, optionally filtered by `profileId`. Explicit `followUpAt` values override the default seven-day follow-up for applied/interview applications. The response contains `count` and sorted applications with due/stale information.

### `GET /api/applications/:applicationId`
Returns one application by stable application ID.

### `POST /api/applications`
Creates a saved application; job title and company are required.

### `PATCH /api/applications/:applicationId/status`
Transitions an application through its lifecycle. Rejected transitions may include `rejectionReason`; transitions are appended to `statusHistory`.

### `PATCH /api/applications/:applicationId/follow-up`
Sets or clears `followUpAt`; invalid dates are rejected.

### `PATCH /api/applications/:applicationId/materials`
Merges application materials.

### `PATCH /api/applications/:applicationId`
Updates supported metadata: `notes`, `specialist`, `match`, and `profileId`.

### `POST /api/applications/:applicationId/generate-pack`
Generates and persists an application pack when generation succeeds.

Application persistence also supports recruiter metadata, source, rejection reason, explicit follow-up scheduling and status history. Follow-up queueing is deterministic.
