# JobMatchPortal — Architecture & Developer Guide

## 1. Purpose

JobMatchPortal discovers UK technology vacancies, normalises them across ATS sources, evaluates sponsorship evidence, verifies source-backed job status, analyses job requirements, matches them against candidate evidence, and supports application tracking.

The system has two application-specialist modes:

- **All-in-One** — commercial/private-sector applications.
- **NHS & Public Sector** — NHS, DWP, Civil Service, universities, councils and similar public-sector applications.

Candidate evidence is the source of truth. The AI optimisation layer must not invent employers, technologies, achievements, responsibilities, qualifications, metrics or sector experience.

## 2. High-level architecture

```text
Canonical companies
       |
       v
Source-first discovery
  +--> ATS adapters
  +--> public-sector adapters
  +--> bounded Serper discovery
  +--> Apify fallback for unresolved career sites
       |
       v
Canonical MongoDB jobs
       |
       +--> source-backed verification
       +--> UK/live/verified/technology eligibility
       +--> versioned candidate matching
       |
       v
API -> React/Vite -> application workflow
```

Discovery, verification, eligibility and matching remain separate stages.

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
          |        +--> live / closed / unknown / unverified
          |
          +--> full-corpus candidate matching
          |        |
          |        +--> UK/live/verified/technology eligibility
          |        +--> explainable component scores
          |        +--> sponsorship-aware fit
          |
          v
/api/jobs and /match/jobs
          |
          v
React/Vite frontend
```

Discovery, verification, eligibility and matching are separate stages. A discovered record is not automatically a verified-live vacancy, and a profile match is not automatically a sponsorship claim.

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
| `backend/scripts/apifyUnresolvedBatch.js` | Checkpointed Apify discovery for unresolved-company batches |
| `backend/services/apifySourceQuality.js` | Rejects obviously invalid/parked/incompatible Apify source URLs |
| `backend/scripts/` audit/verification tools | Population, URL, duplicate and verification audits |
| `backend/prompts/` | Specialist optimisation prompts |
| `backend/tests/` | Automated Node tests |

## 4. Discovery and verification

The production strategy is source-first. Known ATS/public-sector sources are preferred; bounded Serper discovery is supplementary; Apify is a fallback for configured employer career/website URLs when primary discovery returns no jobs. Google fallback is no longer part of the production nightly workflow.

Apify is implemented in `backend/services/apifyJobDiscovery.js`. It uses `APIFY_KEY`, a configurable Actor ID, normalises dataset records and sends them through canonical ingestion. It never marks a job live/verified and never bypasses deduplication.

The unresolved-company Apify path runs one career site per Actor invocation. `maxItems` is therefore scoped to the individual company run, results are attributed only to the company whose URL was submitted, and per-company Actor failures are retained. The full workflow adds a source-quality gate, a 50-company pilot, stable company-ID batches, bounded matrix concurrency and checkpoint metadata so completed companies are not reprocessed accidentally. Apify output still passes through canonical normalisation/upsert and does not imply live/verified status. The full crawl is followed by the corpus matcher and backend test suite only after all discovery batches succeed.

The company population is protected at 21,516 companies. Large discovery runs can be split into non-overlapping ranges and executed concurrently. The full Apify workflow uses stable company-ID batches of 100 with a maximum of four GitHub Actions jobs in parallel; each batch executes its Actor calls sequentially. Company-level completion metadata makes the process resumable without relying on mutable pagination offsets.

Discovery flow:

1. Direct company/ATS discovery.
2. Bounded Serper discovery for sponsor-company job search.
4. When Serper returns a useful career/ATS source page rather than an individual posting, crawl that page for structured `JobPosting` data and job links.
5. Canonicalisation and fingerprint-based upsert.
6. Incremental source-backed verification.
7. UK/live/verified/technology eligibility evaluation for candidate-facing matching.
8. API/frontend exposure of eligible verified jobs.

Serper is an additional discovery source, not a verification source. Application-level safeguards currently default to 2 queries per company, 100 queries per run and 10 requested results per query. These controls do not alter Serper's provider-side quota or billing.

Search snippets and generic career pages are discovery evidence only. A specific vacancy must retain a source URL and still pass the existing source-backed verification contract before it is eligible as verified-live.

## 5. Job identity and persistence

Jobs use a stable fingerprint as the idempotency key. Canonical `applyUrl` duplication is audited separately because multiple incorrect company identities can point to the same source posting.

The repository upsert path updates an existing fingerprint rather than creating a second record. Duplicate discovery records inside one batch are collapsed before writing.

Historical job records are retained when they are excluded from the candidate-facing pool. Eligibility is filtering metadata, not an instruction to delete the source record.

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

## 7. Candidate eligibility and matching

Candidate-facing matching is currently UK-only. The matcher prefers a normalised country/nation value and falls back to location text. Non-UK jobs, including Finland, remain in MongoDB for audit/history but are excluded from the UK candidate pool.

Eligibility is persisted alongside MatchResult data so the reason for inclusion/exclusion can be inspected. The normal candidate-facing contract is:

```text
UK + live + verified + technology-eligible
```

The matcher preserves explainable components such as title, skills, seniority, location, employment type, freshness, verification, sponsorship and experience. It also persists a list of reasons.

Valid fit states are:

- `strong`
- `strong_unconfirmed_sponsorship`
- `possible`
- `weak`

`strong_unconfirmed_sponsorship` is deliberately distinct from `strong`: it means the role is a strong profile/role fit while sponsorship remains unconfirmed. It must never be rendered as confirmed Skilled Worker sponsorship.

Do not calibrate by simply lowering the Strong threshold. Inspect representative top results and component scores first.

## 8. Full-corpus matching operations

Large matching runs must use bounded batching/pagination and indexed access. An unindexed MongoDB sort that exceeds the 32 MB in-memory limit must not be reintroduced.

MatchResult persistence is idempotent/upsert-based. Matching runs do not delete jobs or historical MatchResults.

The GitHub Actions workflow `.github/workflows/matching-quality.yml` is the reproducible nightly/manual full-corpus path. It:

1. checks out the selected ref;
2. installs Node 20 dependencies;
3. runs the complete backend test suite;
4. runs `npm run nightly:matching` against the complete jobs collection;
5. writes MatchResult upserts only;
6. publishes a human-readable GitHub Actions Summary;
7. uploads the raw matcher log for 14 days.

The workflow is diagnostic/reproducible automation. It is intentionally not an autonomous code-writing loop.

## 9. Frontend/API integration

Match-result filtering is server-side. Supported employer types are private, councils, universities, NHS and DWP; supported nations are England, Scotland, Wales, Northern Ireland and UK-wide. The API validates the same values exposed by the frontend.

The frontend consumes `/api/jobs` with server-side pagination and filtering. In Codespaces, the Vite development server proxies `/api` to the backend when no explicit API base URL is configured.

The frontend can display verified-live, UK-eligible jobs incrementally while discovery is still running. This avoids waiting for the full company population before showing useful results.

API/network failures should render recoverable UI states. The client must not fabricate job data when the backend is unavailable.

## 10. Sponsorship model

Sponsorship is deliberately separate from company identity and profile fit.

Valid states include:

- `verified`
- `not-sponsor`
- `unknown`

Companies House identity/SIC information does **not** by itself prove Skilled Worker sponsorship.

`unknown` must remain unknown; it must never be silently converted into `not-sponsor` or `verified`.

## 11. Application lifecycle

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

## 12. Operations and observability

Large runs should be monitored for:

- MongoDB connectivity/latency
- discovery throughput
- resolved/unresolved companies
- failed/rejected records
- checkpoint progress
- duplicate URL/fingerprint counts
- live/closed/unknown/unverified populations
- UK-eligible candidate pool size
- Strong/Possible/Weak/Strong-unconfirmed distribution
- component-score distributions and reason frequencies

The MongoDB health monitor is read-only. If database health degrades, reduce or stop discovery/matching concurrency rather than repeatedly retrying against an unhealthy database.

## 13. Testing

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

## 14. Development rules

- Preserve factual candidate chronology.
- Use British English by default.
- Never invent metrics.
- Use `[X%]`, `[X projects]`, etc. when a metric is genuinely useful but unavailable.
- Flag placeholders before submission.
- Prefer natural keyword alignment over keyword stuffing.
- Keep required and desirable criteria distinct.
- Keep sponsorship evidence separate from company identity and profile fit.
- Keep deterministic validation outside the LLM where practical.
- Update the relevant documentation whenever architecture, schema, workflow or operational behaviour changes.

## 15. Current implementation phases

1. Foundation / reliability
2. Company and sponsorship intelligence
3. Job intelligence
4. Automated discovery and source-backed verification
5. Frontend job search and matching
6. Application generation and tracking
7. Scale hardening and end-to-end automation

Current priority within phases 5–7: validate the UK-only full-corpus candidate pool, calibrate explainable matching from representative results, then expand discovery across councils, universities, startups, scale-ups, sponsorship employers and general profile-relevant UK employers.
