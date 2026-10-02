# JobMatchPortal — Architecture & Developer Guide

## 1. Purpose

JobMatchPortal discovers UK technology vacancies, normalises them across ATS sources, evaluates sponsorship evidence, analyses job requirements, matches them against candidate evidence, and generates tailored application material.

The system has two application-specialist modes:

- **All-in-One** — commercial/private-sector applications.
- **NHS & Public Sector** — NHS, DWP, Civil Service, universities, councils and similar public-sector applications.

Candidate evidence is the source of truth. The AI optimisation layer must not invent employers, technologies, achievements, responsibilities, qualifications, metrics or sector experience.

## 2. High-level architecture

```text
ATS / Job Sources
      |
      v
Job Discovery
      |
      v
Canonical Job Model
      |
      +------> Source-backed Live Verification <----+
      |                                             |
      +------> Company Identity                     |
      |                                             |
      +------> Sponsorship Evidence                 |
      v                                             |
Job Intelligence <---------------------------------+
      |
      v
Candidate Evidence
      |
      v
Explainable Match
      |
      v
My Matches UI
      |
      v
Application Specialist
  +-------------------------+
  | All-in-One | Public     |
  |            | Sector     |
  +-------------------------+
      |
      v
Application Pack
      |
      v
Validation
      |
      v
Application Tracker
```

## 3. Backend modules

| Module | Responsibility |
|---|---|
| `backend/server.js` | HTTP/API entry point and route wiring |
| `backend/jobIntelligence.js` | JD parsing, skills, criteria, seniority, salary and sponsorship wording |
| `backend/models/jobSchema.js` | Canonicalises legacy/ATS job payloads, including ATS/application URLs and unknown live state |
| `backend/models/Job.js` | MongoDB job persistence, closing date and source-verification state |
| `backend/routes/matchRoutes.js` | Single-job and bulk candidate matching endpoints |
| `backend/services/jobLiveVerifier.js` | Source-backed liveness verification using closing dates, HTTP status and explicit page signals |
| `backend/scripts/verifyLiveJobs.js` | Bulk refresh of stored job liveness/closing-date verification |
| `backend/applicationPack.js` | Evidence profile and application-pack construction |
| `backend/applicationPackSelector.js` | Selects the requested application output and validates it |
| `backend/applicationStore.js` | Application lifecycle/state model |
| `backend/sponsorRegistry.js` | Sponsorship evidence and status handling |
| `backend/prompts/` | Specialist optimisation prompts |
| `backend/tests/` | Automated Node tests |

## 4. My Matches

The personalised matching endpoint is:

```text
POST /api/match/jobs
```

The route globally ranks matching jobs before pagination. Ranking uses candidate score first, then sponsorship evidence, posted date and job ID as deterministic tie-breakers.

The canonical match job contract exposes:

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

`applicationUrl` may originate from direct fields or nested ATS/application payloads. Canonicalisation must recursively inspect the common `application`, `apply`, `job` and `source` wrappers and must never persist `[object Object]` as an ATS value.

### Live status is source-backed

`isLive: true` is no longer treated as authoritative merely because an ingestion payload omitted a closed flag. A job is considered **Live** in the UI only when its source has been checked and the verification result is `live`.

The supported states are:

- `live` — source check found an explicit live signal and/or a valid non-expired source with an explicit application signal.
- `closed` — source check found a closed/expired signal, a 404/410 response, or a closing date in the past.
- `unknown` — the source could not be checked reliably or did not provide an explicit live/closed signal.

Unknown values must remain unknown. The UI displays **Status not available** and disables **Apply** rather than guessing.

The verification record stores:

```text
status.liveState
status.isLive
status.verification.checkedAt
status.verification.reason
status.verification.url
```

Run a bulk verification pass with:

```bash
cd backend
npm run jobs:verify-live
```

Optional PowerShell environment controls:

```powershell
$env:JOB_VERIFY_CONCURRENCY="5"
$env:JOB_VERIFY_LIMIT="100"
npm run jobs:verify-live
```

The verifier also checks known closing dates before making an HTTP request and can recover common deadline text from the source page. It deliberately fails closed for application actions: a request timeout, blocked page or ambiguous page does not become `live`.

### Closing date

`closingAt` is displayed whenever it is known. If it is missing or cannot be recovered, the UI displays **Closes: Not available**. A known closing date in the past forces the verified state to `closed`.

### Why this matters

A careers page can remain reachable after a vacancy has closed. Therefore HTTP `200` alone is not evidence that a vacancy is still accepting applications. The portal uses the source content and deadline evidence as well as HTTP status, with an explicit unknown state when evidence is insufficient.

The UI presents:

- match score when available
- company and role
- location and nation
- ATS
- sponsorship evidence
- matched skills
- verified live/closed/unavailable state
- posting date when available
- closing date when available, otherwise `Not available`
- application link only when a source-verified live role has a real URL

The sidebar exposes **My Matches** immediately below **Jobs** so the feature is discoverable from the main navigation.

## 5. Application specialists

### All-in-One

Use for normal commercial/private-sector roles. Supports:

- Functional Competencies
- Technical Tools
- top 15 keywords
- achievement-oriented experience bullets
- project tailoring
- three-line professional summary
- cover letters
- cold emails

### NHS & Public Sector

Use for NHS, DWP, Civil Service, universities, councils and other public-sector roles. Supports:

- essential/desirable criteria
- person specifications
- evidence mapping
- supporting statements
- competency evidence
- public-sector application questions
- cover letters where required

Do not claim NHS, DWP, Civil Service or other sector experience unless candidate evidence explicitly supports it.

## 6. Sponsorship model

Sponsorship is deliberately separate from company identity.

Valid states include:

- `verified`
- `not-sponsor`
- `unknown`

Companies House identity/SIC information does **not** by itself prove Skilled Worker sponsorship.

`unknown` must remain unknown; it must never be silently converted into `not-sponsor`.

## 7. Job intelligence

A job can be analysed into:

- seniority
- technical skills
- essential criteria
- desirable criteria
- sponsorship language
- salary
- location
- employment type
- source/ATS

Candidate scoring is explainable rather than a black-box LLM judgement. Current components include skill coverage, role alignment, experience and evidence.

## 8. Application lifecycle

```text
saved
  -> tailoring
  -> ready_to_apply
  -> applied
  -> interview
  -> offer
```

Alternative terminal states:

- `rejected`
- `withdrawn`

Invalid transitions should be rejected by the application store.

## 9. Where to change the company list

**Important:** the company list should eventually live in one configuration/data source rather than being scattered through scraper code.

For the current repository, first search the backend for the company-list source using:

```bash
rg -n "companies|organisations|organisations|company_number|techCompanies|sponsor" backend
```

The repository already contains CSV-based discovery inputs. If you are manually changing the target company population, the primary files are the CSV inputs used by the discovery stage (for example `techCompanies.csv` / `techCompaniesThatSponsor.csv` where present).

### Recommended manual workflow

1. Edit the company input CSV.
2. Keep the company name/company number stable where available.
3. Do **not** manually mark a company as a sponsor unless there is verified evidence.
4. Run the discovery pipeline.
5. Run the live-job verification pipeline.
6. Run the test suite.

### Future improvement

We should consolidate this into a single file such as:

```text
config/companySources.json
```

or

```text
config/companySources.csv
```

with fields such as:

```text
organisation_name,company_number,enabled,priority,source
```

This will make changing the target company list a one-file operation without touching application logic.

## 10. Testing and regression safety

Backend tests use Node's built-in test runner.

```bash
cd backend
npm test
```

Frontend unit/build checks:

```bash
cd frontend
npm test
npm run build
```

Browser end-to-end checks:

```bash
cd frontend
npm run test:e2e
```

Every new user-visible or API/data-contract feature should add or update a regression test before being considered complete. For My Matches, regression coverage includes loading, successful rendering, application URL handling, API errors, empty results, ATS object handling, verified/closed/unknown live states and closing-date rendering.

Do not treat an isolated smoke test as proof that the complete repository suite passes. The full CI workflow is the authoritative integration check.

## 11. Development rules

- Preserve factual candidate chronology.
- Use British English by default.
- Never invent metrics.
- Use `[X%]`, `[X projects]`, etc. when a metric is genuinely useful but unavailable.
- Flag placeholders before submission.
- Prefer natural keyword alignment over keyword stuffing.
- Keep required and desirable criteria distinct.
- Keep sponsorship evidence separate from company identity.
- Treat job liveness as evidence-backed data, not an ingestion assumption.
- Never enable Apply for an unverified job.
- Keep deterministic validation outside the LLM where practical.
- Do not merge a feature while its focused regression test is failing.
- When a feature changes the API/data contract or user-facing workflow, update this guide and the README in the same change.

## 12. Current implementation phases

1. Foundation / reliability
2. Company and sponsorship intelligence
3. Job intelligence
4. Application generation
5. Application dashboard and tracking
6. Automated job discovery and monitoring

## 13. Suggested next engineering priorities

1. Schedule recurring source refresh and live verification so stale jobs are automatically retired.
2. Consolidate company configuration into a single editable source.
3. Connect application persistence to the API/database.
4. Complete dashboard/API integration.
5. Run the full CI suite and fix integration failures.
6. Add end-to-end tests from vacancy -> verified match -> application pack -> tracker.
