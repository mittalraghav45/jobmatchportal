# JobMatchPortal — Project Status

Last updated: 2026-09-30

## Verified state

- Golden sponsor dataset: `backend/config/sponsor-companies.json`
- Golden dataset size: 21,516 companies
- MongoDB database: `jobmatchportal`
- Golden companies imported: 21,516
- Verified job sources: Confluent (Ashby), Vercel UK Limited (Greenhouse), GoCardless (Greenhouse)
- Verified jobs in MongoDB: 132
- Verified refresh result: 132 discovered, 0 added, 132 updated, 0 duplicates, 0 rejected
- Nodemon development workflow: configured via `npm run dev`
- Bulk matching endpoint: `POST /api/match/jobs`

## Current blocker

The local backend was previously started without the latest MongoDB startup fix. The current `main` branch `backend/server.js` imports `connectMongo()` and `startServer()` connects to MongoDB before listening on port 3001. The expected startup output is:

```text
MongoDB connected: jobmatchportal
Backend http://localhost:3001
```

If `MongoDB connected: jobmatchportal` does not appear, the local checkout is not running the latest `main` version or the MongoDB connection configuration is unavailable.

## Next test

After pulling the latest `main` branch and starting with `npm run dev`, test:

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/match/jobs" -Method POST -ContentType "application/json" -Body '{"profileId":"default","page":1,"limit":20}' | ConvertTo-Json -Depth 10
```

Do not proceed to frontend matching integration until the backend startup and this endpoint are confirmed.

## Architecture rule

Do not replace or bypass the golden sponsor dataset. Job ingestion should use only verified sources from `backend/config/job-source-registry.json`. Failed/unverified career URLs must be skipped and recorded rather than guessed.

## Remaining roadmap

1. Confirm MongoDB startup + bulk matching endpoint.
2. Connect match results to frontend.
3. Verify deterministic match explanations and sponsorship filtering.
4. Application tracking.
5. CV/cover-letter workflow.
6. Automated refresh scheduling.
7. End-to-end, performance, and security testing.
8. Release hardening.
