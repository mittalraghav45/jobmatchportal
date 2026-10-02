# JobMatchPortal — Architecture & Developer Guide

## 1. Purpose

JobMatchPortal discovers UK technology vacancies, normalises them across ATS sources, evaluates sponsorship evidence, verifies source-backed job status, analyses job requirements, matches them against candidate evidence, and supports application tracking.

The system has two application-specialist modes:

- **All-in-One** — commercial/private-sector applications.
- **NHS & Public Sector** — NHS, DWP, Civil Service, universities, councils and similar public-sector applications.

Candidate evidence is the source of truth. The AI optimisation layer must not invent employers, technologies, achievements, responsibilities, qualifications, metrics or sector experience.

## 2. High-level architecture

```text
21,516 canonical companies
          |
          v
Checkpointed discovery
  +-----------------------+
  | bounded parallel     |
  | company ranges       |
  +-----------------------+
          |
          v
MongoDB canonical jobs
          |
          +--> incremental source-backed verification
          |        |
          |        +--> live / closed / unknown
          |
          v
/api/jobs
          |
          v
React/Vite frontend
          |
          +--> job search/filtering
          +--> explainable matching
          +--> sponsorship-aware matching
          +--> application tracker
```

Discovery and verification are deliberately separate stages. A discovered record is not automatically a verified-live vacancy.

## 3. Backend modules

| Module | Responsibility |
|---|---|
| `backend/server.js` | HTTP/API entry point and route wiring |
| `backend/routes/jobs.js` | Paginated/filterable job API |
| `backend/jobIntelligence.js` | JD parsing, skills, criteria, seniority, salary and sponsorship wording |
| `backend/applicationPack.js` | Evidence profile and application-pack construction |
| `backend/applicationPackSelector.js` | Selects the requested application output and validates it |
| `backend/applicationStore.js` | Application lifecycle/state model |
| `backend/sponsorRegistry.js` | Sponsorship evidence and status handling |
| `backend/repositories/jobRepository.js` | Canonical job persistence and fingerprint-based upsert |
| `backend/scripts/jobDiscoveryGoldenFull.js` | Checkpointed/resumable large-scale discovery |
| `backend/scripts/` audit/verification tools | Population, URL, duplicate and verification audits |
| `backend/prompts/` | Specialist optimisation prompts |
| `backend/tests/` | Automated Node tests |

## 4. Discovery and verification

The company population is protected at 21,516 companies. Large discovery runs can be split into non-overlapping ranges and executed concurrently. Each range uses a unique run ID and checkpoint state.

Discovery flow:

1. Direct company/ATS discovery.
2. Google fallback when direct discovery produces no jobs.
3. Bounded careers/ATS crawl where a useful fallback target exists.
4. Canonicalisation and fingerprint-based upsert.
5. Incremental source-backed verification.
6. API/frontend exposure of verified jobs.

Google search URLs are discovery aids only. They are not proof that a vacancy exists.

## 5. Job identity and persistence

Jobs use a stable fingerprint as the idempotency key. Canonical `applyUrl` duplication is audited separately because multiple incorrect company identities can point to the same source posting.

The repository upsert path updates an existing fingerprint rather than creating a second record. Duplicate discovery records inside one batch are collapsed before writing.

## 6. Verification model

Valid job verification states are:

- `live`
- `closed`
- `unknown`
- `unverified`

Verification must preserve the population invariant:

```text
live + closed + unknown + unverified = total jobs
```

Source evidence may include direct posting content, recognised ATS patterns, redirects with retained posting identity and structured `JobPosting` data. A generic board redirect is not sufficient evidence of a live job.

## 7. Frontend/API integration

The frontend consumes `/api/jobs` with server-side pagination and filtering. In Codespaces, the Vite development server proxies `/api` to the backend when no explicit API base URL is configured.

The frontend can display verified-live jobs incrementally while discovery is still running. This avoids waiting for the full 21,516-company population before showing useful results.

API/network failures should render recoverable UI states. The client must not fabricate job data when the backend is unavailable.

## 8. Sponsorship model

Sponsorship is deliberately separate from company identity.

Valid states include:

- `verified`
- `not-sponsor`
- `unknown`

Companies House identity/SIC information does **not** by itself prove Skilled Worker sponsorship.

`unknown` must remain unknown; it must never be silently converted into `not-sponsor`.

## 9. Job intelligence and matching

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

## 10. Application lifecycle

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

## 11. Operations and observability

Large runs should be monitored for:

- MongoDB connectivity/latency
- discovery throughput
- resolved/unresolved companies
- failed/rejected records
- checkpoint progress
- duplicate URL/fingerprint counts
- live/closed/unknown/unverified populations

The MongoDB health monitor is read-only. If database health degrades, reduce or stop discovery concurrency rather than repeatedly retrying against an unhealthy database.

## 12. Testing

Backend tests use Node's built-in test runner.

```bash
cd backend
npm install
npm test
```

Frontend changes should also run:

```bash
cd frontend
npm run build
```

Do not treat an isolated smoke test as proof that the complete repository suite passes. The full CI workflow is the authoritative integration check.

## 13. Development rules

- Preserve factual candidate chronology.
- Use British English by default.
- Never invent metrics.
- Use `[X%]`, `[X projects]`, etc. when a metric is genuinely useful but unavailable.
- Flag placeholders before submission.
- Prefer natural keyword alignment over keyword stuffing.
- Keep required and desirable criteria distinct.
- Keep sponsorship evidence separate from company identity.
- Keep deterministic validation outside the LLM where practical.
- Update the relevant documentation whenever architecture, schema, workflow or operational behaviour changes.

## 14. Current implementation phases

1. Foundation / reliability
2. Company and sponsorship intelligence
3. Job intelligence
4. Automated discovery and source-backed verification
5. Frontend job search and matching
6. Application generation and tracking
7. Scale hardening and end-to-end automation
