# MongoDB Atlas development guide

## Purpose

MongoDB is the persistent store for JobMatch Portal. The main collections are:

- `companies` — sponsor/company configuration and verification metadata.
- `jobs` — canonical discovered jobs with fingerprints, source data, lifecycle timestamps, classification and source-verification state.
- Application-related collections can be added later without changing the discovery pipeline.

## Environment

Keep the real connection string only in `backend/.env`. Never commit it. The tracked `backend/.env.example` contains placeholders only.

Recommended variables:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/jobmatchportal?retryWrites=true&w=majority
MONGODB_DB_NAME=jobmatchportal
```

The application explicitly sets `MONGODB_DB_NAME` (default `jobmatchportal`). This prevents a missing database path in the URI from silently sending application data to MongoDB's default `test` database.

## Connection check

From `backend/`:

```powershell
npm run db:check
```

A successful check reports the connected database and verifies it is `jobmatchportal`.

## Discovery persistence

Company discovery uses the following path:

```
ATS adapters
  -> canonical job normalisation
  -> fingerprint
  -> MongoDB upsert
  -> jobs collection
```

The fingerprint is the idempotency key. Re-running discovery must not create duplicate job documents.

## Incremental processing

Newly discovered jobs are written to MongoDB with source and verification data. The incremental worker can process them while the company-discovery terminals continue running:

```bash
cd backend
node -r dotenv/config scripts/processJobQueue.js --batch-size=50 --concurrency=4 --poll-ms=10000
```

The worker atomically claims jobs so discovery and processing can run independently. It verifies source URLs using the existing source-verification service and records `processing.status` as `processing` or `complete`. Failed processing attempts remain retryable. Claims older than the stale threshold are recoverable after a worker interruption.

Useful options:

```text
--batch-size=50      Jobs claimed per polling cycle
--concurrency=4      Concurrent source checks
--poll-ms=10000      Wait between empty queue polls
--timeout-ms=12000   Source request timeout
--stale-ms=600000    Recover claims older than 10 minutes
--once               Process one batch and exit
```

The worker is deliberately separate from discovery so source verification cannot block the four company-discovery workers or make their MongoDB writes synchronous.

## Verification sequence

1. `npm run db:check`
2. `npm test`
3. `npm run discover:companies`
4. Check the `jobs` collection in Atlas.
5. Run discovery again and verify the document count does not double.
6. Start the incremental processor if discovery is running in parallel.
7. Start the API with `npm run dev` and check `/api/jobs/stats`.

## Sponsor dataset

The sponsor-company golden dataset is expected at:

```
backend/config/sponsor-companies.json
```

Import it only after the MongoDB connection check passes:

```powershell
npm run import:sponsors
```

The importer validates the dataset before writing and upserts by `companyId`.
