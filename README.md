# UK Job Match Portal

A local UK job-discovery and application-support platform for sponsorship-aware job search, live ATS discovery, CV/job matching and evidence-led application optimisation.

## Current architecture

```text
Frontend (React/Vite)
        |
        v
Express API
  |     |      |
  |     |      +--> Application optimiser (OpenAI)
  |     +---------> ATS discovery / live jobs
  +---------------> Sponsorship + job intelligence
        |
        v
MongoDB repositories (optional/local integration)
```

### Main capabilities

- Live job discovery across supported ATS platforms.
- Candidate-to-job matching using skills, CV text and experience.
- Sponsorship evidence represented as `verified`, `not-sponsor` or `unknown`.
- Unknown sponsorship is never converted into a negative sponsorship claim.
- CV, cover-letter and application-pack optimisation.
- Separate NHS / DWP / Civil Service / university / council optimisation rules.
- Local application tracker with status progression.
- MongoDB models and repositories for persistent company/job data.
- Source-backed job verification with canonical URL identity and duplicate auditing.

## Job identity and verification

Jobs are persisted using `fingerprint` as the MongoDB idempotency key. Identity is resolved in this order:

1. Canonical source/application URL.
2. `companyId + externalId` when no canonical URL exists.
3. `companyId + title + location` as the final fallback.

URL identity is independent of company ID. Two discovery records with the same canonical job URL are treated as one job even if legacy company or external identifiers differ.

Repository ingestion persists both `applyUrl` and `source.url`. Google career fallback discovery does the same, so subsequent verification and deduplication use the same source identity.

Existing live URL duplicates can be audited and repaired with:

```bash
cd backend
node -r dotenv/config scripts/repairLiveUrlDuplicates.js
```

The command defaults to a dry run. By default, groups that contain different `companyId` values are reported but not deleted because choosing a company identity is a separate data-resolution decision. Safe same-company duplicate groups can be applied with:

```bash
node -r dotenv/config scripts/repairLiveUrlDuplicates.js --apply
```

If company-conflict groups have subsequently been reviewed and a deliberate destructive merge is required, use the explicit override:

```bash
node -r dotenv/config scripts/repairLiveUrlDuplicates.js --apply --resolve-company-conflicts
```

When duplicates are deleted, application records referencing a deleted job ID are first repointed to the surviving job document.

The verification population invariant remains:

```text
total = live + closed + unknown
unverified = 0
```

## Repository layout

```text
backend/
  server.js                       Express API
  cvJobMatcher.js                 CV/job matching and document helpers
  liveJobsScraper_new.js          ATS discovery
  jobIntelligence.js              job analysis and candidate scoring
  sponsorRegistry.js              sponsorship evidence rules
  applicationEngine.js            structured application prompts
  applicationValidator.js         output validation
  prompts/                        commercial + public-sector prompts
  config/companies.csv             editable company discovery seed list
  models/                         MongoDB models
  repositories/                  MongoDB persistence
  tests/                          Node test suite

docs/
  ARCHITECTURE.md                architecture notes
  IMPLEMENTATION_PLAN.md         implementation history/plan
```

## Quick start

### 1. Backend

```bash
cd backend
npm install
copy .env.example .env
npm test
npm run dev
```

On PowerShell, `copy .env.example .env` creates the local environment file. Add your real keys only to `.env`; never commit them.

Backend health endpoint:

```text
http://localhost:3001/api/health
```

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

The Vite app normally runs at:

```text
http://localhost:5173
```

`VITE_API_BASE_URL` controls which backend the frontend calls. It defaults to `http://localhost:3001` for local development.

## Environment variables

Backend `.env` is based on `backend/.env.example`:

- `PORT` - Express port; default `3001`.
- `FRONTEND_ORIGINS` - comma-separated allowed frontend origins.
- `OPENAI_API_KEY` - required for AI application optimisation and preferred AI search.
- `PERPLEXITY_API_KEY` - optional AI search fallback.
- `MONGODB_URI` - MongoDB connection string for persistence features.
- `MONGODB_DB_NAME` - MongoDB database name; default `jobmatchportal`.

Frontend `.env`:

- `VITE_API_BASE_URL` - backend API base URL.

## Changing the company list

For the current seed/discovery configuration, edit:

```text
backend/config/companies.csv
```

Keep `company_id` stable. Use `enabled=false` instead of deleting a company when historical records may depend on it.

For a future large import, JSON/CSV can be imported through the frontend or loaded into MongoDB once the persistent company-import workflow is enabled.

## Testing

Backend:

```bash
cd backend
npm test
```

Frontend production build:

```bash
cd frontend
npm install
npm run build
```

GitHub Actions now runs both automatically when backend/frontend code changes.

## Security rules

- Never put OpenAI, Perplexity or MongoDB credentials in source files.
- Never commit `.env` files.
- Do not treat an unverified sponsor as a confirmed sponsor.
- Do not invent job vacancies, sponsorship status, salaries, metrics or candidate achievements.
- Public-sector application outputs must remain grounded in supplied evidence.

## Development workflow

1. Make a focused change.
2. Run `npm test` in `backend`.
3. Run `npm run build` in `frontend` when frontend code changes.
4. Review `git diff --check`.
5. Commit with a clear message.
6. Push only after tests/build pass.

See `docs/ARCHITECTURE.md` for the detailed design and data model.
