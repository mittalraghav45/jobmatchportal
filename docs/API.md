# API Reference

## Purpose

This document records the externally useful HTTP API surface. Keep it updated when routes, request schemas or response contracts change.

## Backend

Default local base URL:

```text
http://localhost:3001
```

## Health

### `GET /api/health`

Returns backend health information.

## Job and sponsor routes

The authoritative route list is defined by `backend/server.js` and the route modules it imports. When adding or changing a route, update this document with:

- HTTP method and path
- authentication requirements, if any
- query/path parameters
- request body
- response shape
- error responses
- persistence side effects

## Contract rules

- Do not expose MongoDB credentials or internal secrets.
- Preserve `unknown` sponsorship and verification states rather than coercing them to negative states.
- Job source URLs must remain traceable to the discovered source.
- API responses should not claim a job is live unless source-backed verification supports it.
- Changes to persisted job/company schemas must be accompanied by migration/backfill notes when needed.

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
