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
