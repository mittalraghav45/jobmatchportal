# UK Job Match Portal

A local UK job-discovery and application-support platform for sponsorship-aware job search, live ATS discovery, CV/job matching and evidence-led application optimisation.

> **Project wiki:** see [`docs/PROJECT_WIKI.md`](docs/PROJECT_WIKI.md) for the current architecture, matching model, automation, discovery adapters, security rules and development workflow.

## Current architecture

> Current discovery note: Apify is integrated as a bounded fallback for unresolved career sites. The first 10-company pilot reached Apify successfully but returned 0 jobs, so the Actor/input strategy is not yet proven productive.

```text
Frontend (React/Vite)
        |
        v
Express API
  |     |      |
  |     |      +--> Application optimiser (OpenAI)
  |     +---------> Source adapters / ATS discovery / live jobs
  +---------------> Sponsorship + job intelligence
        |
        v
MongoDB repositories (optional/local integration)
```

### Main capabilities

- Live job discovery across supported ATS platforms.
- Canonical source adapters for adding new discovery families without changing matching logic.
- Public-sector discovery abstraction for councils, universities, NHS, Civil Service and other public bodies.
- Candidate-to-job matching using skills, CV text and experience.
- Explicit UK eligibility for the candidate-facing match pool.
- Sponsorship evidence represented as `verified`, `not-sponsor` or `unknown`.
- Unknown sponsorship is never converted into a negative sponsorship claim.
- CV, cover-letter and application-pack optimisation.
- Separate NHS / DWP / Civil Service / university / council optimisation rules.
- Local application tracker with status progression.
- MongoDB models and repositories for persistent company/job data.
- Source-backed job verification with canonical URL identity and duplicate auditing.

## Matching and full-corpus automation

The matcher supports explainable fit states:

```text
strong
strong_unconfirmed_sponsorship
possible
weak
```

`strong_unconfirmed_sponsorship` means the role is a strong profile match while sponsorship evidence is still unconfirmed. It is not a claim that the employer sponsors Skilled Worker visas.

The candidate-facing pool is UK-only. Non-UK jobs remain stored for historical/audit purposes but must not be surfaced as UK matches. Eligibility metadata is persisted so exclusions can be explained.

The full corpus can be matched in bounded batches. Match results are persisted with upserts; the matching workflow does not delete jobs or historical match results.

### GitHub Actions nightly matcher

`.github/workflows/matching-quality.yml` can be manually dispatched and is scheduled for a 02:15 UK target during BST (`01:15 UTC`). GitHub cron is UTC and does not automatically follow UK daylight-saving changes.

The workflow:

1. installs Node 20 dependencies;
2. runs the complete backend test suite;
3. runs `npm run nightly:matching` over the complete jobs collection;
4. enforces the nightly quality gate;
5. writes MatchResult upserts without deleting jobs;
6. renders a structured, human-readable Markdown quality report;
7. publishes that report directly into the GitHub Actions Summary;
8. uploads the raw matcher log and rendered report as 14-day artifacts.

The report contains corpus health, Strong/Possible/Weak distribution, score buckets, top matches with evidence and calibration flags. The quality gate rejects unsafe Strong results such as low skills, specialist mismatches, incompatible role families/experience, excluded technologies or hard seniority problems. Unconfirmed sponsorship is intentionally a warning rather than a failure.

A failing test prevents the matcher from running. The workflow is deliberately bounded/reproducible diagnostic automation, not an autonomous source-code rewriting loop.

## Discovery adapters

### Apify fallback

`backend/services/apifyJobDiscovery.js` calls a configurable Apify Actor using `APIFY_KEY`, normalises returned jobs and sends them through the existing canonical ingestion path. It is a fallback only; source-backed verification remains mandatory. The initial 10-company pilot selected 10 unresolved employers and returned 0 jobs from the current Actor, so broader rollout is paused pending Actor/input validation.

### Public-sector filters

Match results now support server-side employer-type filters for private, councils, universities, NHS and DWP, plus nation filters for England, Scotland, Wales, Northern Ireland and UK-wide.

New source families should implement the canonical contract in:

```text
backend/discovery/sourceAdapter.js
```

Adapters normalise records into a common shape and preserve `source`, `sourceKind`, `sourceJobId` and `applyUrl` for provenance and identity. They are discovery-only; source-backed verification remains a separate stage.

The first source-group abstraction is:

```text
backend/discovery/publicSector.js
```

It supports the categories `council`, `university`, `nhs`, `civil_service` and `other_public_body`. Concrete official feeds/search paths can be plugged into this interface without creating a second matcher.

## Serper discovery

The portal now includes a bounded Serper-based discovery path for sponsor-company technology jobs. Serper is used to find direct ATS postings and relevant career/ATS source pages; it is not treated as live-job verification.

From `backend/`:

```bash
npm run test:serper
npm run jobs:serper -- --limit=5 --per-query=5 --max-queries=10
```

Application-level safeguards currently default to:

```text
2 Serper queries/company
100 Serper queries/run
10 results/query
2 source pages/company
```

The real Serper API smoke test has succeeded in Codespaces. The API key is supplied through the `SERPER_API_KEY` environment secret and must never be committed.

Serper-discovered records still pass through canonical ingestion/deduplication and the existing source-backed verification pipeline before they can become verified-live jobs.

## Apify discovery fallback

The portal can use Apify as a bounded fallback for unresolved company career sources. It reads public career/ATS pages through the configured Apify Actor, normalises returned jobs into the canonical ingestion pipeline, classifies UK nation/employer type, and preserves the source/apply URL. The repository uses the `APIFY_KEY` Actions secret; the Actor is configurable with `APIFY_ACTOR_ID`.

A bounded integration smoke test is available with `npm run test:apify-unresolved -- --limit=10`; it selects distinct unresolved companies with real career/website URLs and persists only UK-classified results through the canonical job repository.

The production discovery path remains source-first: configured ATS/public-sector adapters run first, and Apify is used only when they return no jobs for a company with a usable career URL. Apify does not write directly to MongoDB; all results pass through the existing ingestion and deduplication layer.

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
  discovery/sourceAdapter.js      normalized source adapter contract
  discovery/publicSector.js       public-sector source-group adapter
  scripts/renderNightlyReport.js  full-corpus human-readable report
  prompts/                         commercial + public-sector prompts
  config/companies.csv             editable company discovery seed list
  models/                          MongoDB models
  repositories/                    MongoDB persistence
  tests/                           Node test suite

docs/
  ARCHITECTURE.md                 architecture notes
  IMPLEMENTATION_PLAN.md          implementation history/plan
  DATA_PIPELINE.md                discovery/verification pipeline
  PROJECT_WIKI.md                 living project wiki
AGENTS.md                          durable agent/development rules
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

GitHub Actions runs backend tests and frontend builds automatically when relevant code changes.

## Security rules

- Keep `APIFY_KEY` in GitHub Actions/Codespaces secrets; never commit or print it.
- Apify output is discovery evidence, not live-job verification.

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

See `docs/ARCHITECTURE.md`, [`docs/DATA_PIPELINE.md`](docs/DATA_PIPELINE.md) and [`docs/PROJECT_WIKI.md`](docs/PROJECT_WIKI.md) for the detailed design and current operating model.
