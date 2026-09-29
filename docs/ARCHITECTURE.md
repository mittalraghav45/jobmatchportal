# JobMatchPortal — Architecture & Developer Guide

## 1. Purpose

JobMatchPortal discovers live UK technology vacancies, normalises them across ATS sources, evaluates sponsorship evidence, analyses job requirements, matches them against candidate evidence, and generates tailored application material.

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
      +------> Company Identity
      |
      +------> Sponsorship Evidence
      |
      v
Job Intelligence
  - seniority
  - technical skills
  - essential criteria
  - desirable criteria
  - salary
  - sponsorship wording
      |
      v
Candidate Evidence
      |
      v
Explainable Match
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
| `backend/applicationPack.js` | Evidence profile and application-pack construction |
| `backend/applicationPackSelector.js` | Selects the requested application output and validates it |
| `backend/applicationStore.js` | Application lifecycle/state model |
| `backend/sponsorRegistry.js` | Sponsorship evidence and status handling |
| `backend/prompts/` | Specialist optimisation prompts |
| `backend/tests/` | Automated Node tests |

## 4. Application specialists

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

## 5. Sponsorship model

Sponsorship is deliberately separate from company identity.

Valid states include:

- `verified`
- `not-sponsor`
- `unknown`

Companies House identity/SIC information does **not** by itself prove Skilled Worker sponsorship.

`unknown` must remain unknown; it must never be silently converted into `not-sponsor`.

## 6. Job intelligence

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

## 7. Application lifecycle

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

## 8. Where to change the company list

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
5. Run the test suite.

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

## 9. Testing

Backend tests use Node's built-in test runner.

```bash
cd backend
npm install
npm test
```

Tests cover the job-intelligence, application-pack, application-selector and application-store layers.

Do not treat an isolated smoke test as proof that the complete repository suite passes. The full CI workflow is the authoritative integration check.

## 10. Development rules

- Preserve factual candidate chronology.
- Use British English by default.
- Never invent metrics.
- Use `[X%]`, `[X projects]`, etc. when a metric is genuinely useful but unavailable.
- Flag placeholders before submission.
- Prefer natural keyword alignment over keyword stuffing.
- Keep required and desirable criteria distinct.
- Keep sponsorship evidence separate from company identity.
- Keep deterministic validation outside the LLM where practical.

## 11. Current implementation phases

1. Foundation / reliability
2. Company and sponsorship intelligence
3. Job intelligence
4. Application generation
5. Application dashboard and tracking
6. Automated job discovery and monitoring

## 12. Suggested next engineering priorities

1. Consolidate company configuration into a single editable source.
2. Connect application persistence to the API/database.
3. Complete dashboard/API integration.
4. Run the full CI suite and fix integration failures.
5. Add end-to-end tests from vacancy -> match -> application pack -> tracker.
