# MongoDB Atlas development guide

## Purpose

MongoDB is the persistent store for JobMatch Portal. The main collections are:

- `companies` — sponsor/company configuration and verification metadata.
- `jobs` — canonical discovered jobs with fingerprints, source data, lifecycle timestamps and classification.
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

## Verification sequence

1. `npm run db:check`
2. `npm test`
3. `npm run discover:companies`
4. Check the `jobs` collection in Atlas.
5. Run discovery again and verify the document count does not double.
6. Start the API with `npm run dev` and check `/api/jobs/stats`.

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
