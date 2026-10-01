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
  |     +---------> ATS discovery / source-backed live verification
  +---------------> Sponsorship + job intelligence
        |
        v
MongoDB repositories (optional/local integration)
```

### Main capabilities

- Job discovery across supported ATS platforms.
- Source-backed live/closed/unknown job verification.
- Candidate-to-job matching using skills, CV text and experience.
- **My Matches** view with globally ranked personalised results.
- Match cards expose the canonical application URL, ATS, sponsorship evidence, verified live/closed/unavailable status and closing date when available.
- Closing date shows `Not available` when the source does not provide a reliable value.
- Unknown live status is never presented as live and never enables Apply.
- Sponsorship evidence represented as `verified`, `not-sponsor` or `unknown`.
- Unknown sponsorship is never converted into a negative sponsorship claim.
- CV, cover-letter and application-pack optimisation.
- Separate NHS / DWP / Civil Service / university / council optimisation rules.
- Local application tracker with status progression.
- MongoDB models and repositories for persistent company/job data.

## Dashboard data contract

The dashboard distinguishes three different counts rather than reusing one number for everything:

- **UK jobs** - the number of UK technology jobs matching the current job query.
- **Applications** - the candidate's tracked applications.
- **Sponsor companies** - companies whose MongoDB sponsorship evidence is explicitly `verified`.

`GET /api/companies/count` returns both `total` and `sponsorTotal`. This keeps the sponsor count visible on the dashboard without changing the broader company dataset used by the Sponsors page.

Job cards also expose the canonical ATS value, live state and closing date. Unknown values are displayed as `Not available` / `Status not available`; the UI does not silently convert missing evidence into a positive status.

## My Matches contract

The personalised matching endpoint is:

```text
POST http://localhost:3001/api/match/jobs
```

Example request:

```json
{
  "profileId": "default",
  "page": 1,
  "limit": 20
}
```

Each returned `match.job` should use the canonical display fields:

```text
companyName
title
location
nation
ats
applicationUrl
postedAt
closingAt
isLive
liveState
liveVerification
```

`applicationUrl` is recovered from direct and nested ATS/application payloads. The UI must never display `[object Object]` as an ATS value and must not invent an application URL when one cannot be found.

`liveState` is `live`, `closed`, or `unknown`. Only a source-verified `live` state can enable the Apply action.

## Live verification

Run a verification pass against stored job sources with:

```bash
cd backend
npm run jobs:verify-live
```

The verifier uses known closing dates, HTTP responses and explicit source-page signals. Ambiguous or unreachable pages remain `unknown` rather than being guessed as live.

Optional controls:

```powershell
$env:JOB_VERIFY_CONCURRENCY="5"
$env:JOB_VERIFY_LIMIT="100"
npm run jobs:verify-live
```

A successful HTTP response alone is not sufficient evidence that a vacancy is live. The verifier looks for explicit source-page signals, structured `JobPosting` evidence and closing-date evidence. A page that still exists but says applications are closed is classified as closed.

## Repository layout

```text
backend/
  server.js                       Express API
  cvJobMatcher.js                 CV/job matching and document helpers
  liveJobsScraper_new.js          ATS discovery
  jobIntelligence.js              job analysis and candidate scoring
  sponsorRegistry.js              sponsorship evidence rules
  services/jobLiveVerifier.js     source-backed live verification
  scripts/verifyLiveJobs.js      bulk live-status refresh
  applicationEngine.js            structured application prompts
  applicationValidator.js         output validation
  prompts/                        commercial + public-sector prompts
  config/companies.csv             editable company discovery seed list
  models/                         MongoDB models + job canonicalisation
  repositories/                  MongoDB persistence
  tests/                          Node test suite

frontend/
  src/App.jsx                    React sponsor explorer/tracker
  src/MyMatches.jsx              personalised matching UI
  src/sponsorsOld.json           small demo dataset
  .env.example                   frontend API configuration

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

Frontend unit tests and production build:

```bash
cd frontend
npm test
npm run build
```

Browser end-to-end tests:

```bash
cd frontend
npm run test:e2e
```

The E2E suite uses Playwright and should be run after the frontend and backend are available locally. If Playwright browser installation times out, the failure is an environment/browser-install issue rather than a test assertion failure.

GitHub Actions runs the repository checks automatically when backend/frontend code changes.

## Security rules

- Never put OpenAI, Perplexity or MongoDB credentials in source files.
- Never commit `.env` files.
- Do not treat an unverified sponsor as a confirmed sponsor.
- Do not treat an unverified job as live.
- Do not invent job vacancies, sponsorship status, salaries, metrics or candidate achievements.
- Public-sector application outputs must remain grounded in supplied evidence.

## Development workflow

1. Make a focused change.
2. Add or update a regression test for the changed behaviour.
3. Run `npm test` in `backend`.
4. Run `npm test` and `npm run build` in `frontend` when frontend code changes.
5. Run `npm run test:e2e` for UI/API flow changes.
6. Run `npm run jobs:verify-live` when changing job source/liveness behaviour.
7. Review `git diff --check`.
8. Update the architecture/feature documentation when a user-visible or API/data-contract feature is added.
9. Commit with a clear message.
10. Push only after tests/build pass.

See `docs/ARCHITECTURE.md` for the detailed design and data model.
