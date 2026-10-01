# API Design

## 1. Purpose

This document describes the HTTP API currently used by JobMatchPortal and the intended contracts around discovery, jobs, companies, matching, and application workflow.

## 2. Conventions

- Base URL: `/api`
- JSON request/response bodies.
- Pagination uses `page` and `limit` where supported.
- APIs should return stable identifiers and direct application URLs when available.
- Backend validation is authoritative; the frontend should not infer sponsorship, nation, employer type, or ATS state from display text.

## 3. Core resources

### Jobs

`GET /api/jobs`

Primary query parameters include:

- `page`
- `limit`
- `nation`
- `employerType`
- existing job/search filters supported by the route

The response contains a `jobs` collection and `pagination` metadata.

Important job fields include title, company identity, location, nation, employer type, sponsorship information, ATS/application URL, and matching/enrichment metadata where available.

### Companies

`GET /api/companies`

Supports company discovery and filtering. Company records contain identity and enrichment fields such as website, careers URL, ATS information, employer type, and sponsorship state.

### Matching

`POST /api/match/jobs`

Request:

```json
{
  "profileId": "default",
  "page": 1,
  "limit": 20
}
```

Purpose: return jobs ranked against a candidate profile. The response is the source of truth for the **My Matches** UI.

The UI should display the returned match score and explanation fields without inventing additional scoring logic in the browser.

### Discovery status

`GET /api/intelligence/dashboard?runId=<run-id>`

Provides persisted discovery progress and run-level metrics used by the homepage monitoring panel.

The discovery UI distinguishes persisted processed records from live/current processing status when the run status is available.

## 4. Data-quality semantics

- `nation` is the classified UK nation and must not be copied from a generic `UK` location label.
- `employerType` uses the project's canonical values such as `nhs`, `councils`, and `universities`.
- `sponsorship` describes evidence/state and should not be treated as a guarantee of sponsorship for a particular vacancy.
- `ats` identifies a detected ATS where evidence exists.
- `careersUrl` is a company careers source; `applicationUrl`/ATS URL should be preferred for direct application where available.

## 5. Matching API principles

The matching API should support:

1. Candidate/profile-aware ranking.
2. Explainable match factors.
3. Sponsorship-aware filtering.
4. Location/nation compatibility.
5. Technology/skill compatibility.
6. Seniority/experience compatibility.
7. Stable pagination.

## 6. Error handling

HTTP errors should use JSON responses with a machine-readable error code/message. Frontend consumers should handle loading, empty, partial, and error states explicitly.

## 7. Security

- Never expose MongoDB credentials or provider secrets through the API.
- Validate request parameters server-side.
- Do not accept a client-provided match score as authoritative.
- Application and profile endpoints must enforce the appropriate user/profile ownership rules when authentication is introduced.

## 8. Evolution

New endpoints should preserve existing response contracts where possible. Breaking changes should be versioned or introduced with a migration period. API tests should accompany changes to filtering, matching, enrichment, and application workflows.
