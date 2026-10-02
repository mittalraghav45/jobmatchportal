# Development Context

## Current product direction

JobMatchPortal is a UK-focused job discovery and matching application. The system ingests a large company universe, discovers jobs, enriches company/job metadata, classifies UK nations and employer types, detects ATS/application sources, and ranks jobs against a candidate profile.

## Current priorities

1. Complete and monitor the large company/job discovery pipeline.
2. Keep job/company data quality high and application URLs useful.
3. Integrate the working matching API into the frontend as **My Matches**.
4. Build job details, saved jobs, and application tracking.
5. Add final-stage scheduled digest/cron automation only after the matching and application workflow is stable.

## Explicit decision

Cron/email automation is intentionally deferred to the final stages of development. It should not drive the architecture of the current UI work.

## Matching contract already verified

The backend endpoint currently used for matching is:

`POST /api/match/jobs`

Example request:

```json
{"profileId":"default","page":1,"limit":20}
```

The endpoint has been manually verified to return job match data.

## Discovery scale

The company universe is approximately 21.5k companies. Discovery/enrichment processes use bounded batches, controlled concurrency, and checkpoints so long-running operations can resume.

## Data enrichment already implemented

- UK nation classification.
- Employer-type classification.
- Existing job enrichment.
- Public employer resolution for NHS, councils, and universities.
- Website/careers URL resolution.
- ATS detection.
- Application-source resolution.
- Missing-job-company diagnostics.

## Important implementation rule

Do not assume that a historical chat message represents the current code. Read the repository, tests, status documents, and current branch first.
