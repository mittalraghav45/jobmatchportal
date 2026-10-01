# JobMatchPortal — System Design Document

**Status:** Living design document  
**Repository:** `mittalraghav45/jobmatchportal`  
**Scope:** Company discovery, career/ATS resolution, job ingestion, enrichment, classification, APIs, UI filtering, candidate matching, application workflow, and future automation.

---

## 1. Purpose

JobMatchPortal is a UK-focused job intelligence and application platform designed to discover relevant vacancies across a large employer universe, determine where live vacancies can be found, normalise and enrich those vacancies, classify them by geography and employer type, expose them through APIs/UI filters, and ultimately match them against a candidate profile.

The current dataset contains a target universe of approximately **21,516 companies**. A separate public-employer population contains approximately **986 records** across NHS, councils, and universities. The architecture must support both populations without requiring a separate product architecture.

This document describes the system architecture and the engineering boundaries required to scale the current discovery pipeline into a continuously refreshed job-matching platform.

---

## 2. Design Goals

### Primary goals

1. Discover company websites and career sources reliably.
2. Detect ATS/job-board technology where possible.
3. Discover live vacancies from resolved sources.
4. Persist jobs and company resolution state in MongoDB.
5. Make discovery checkpointed and resumable.
6. Prevent duplicate jobs through deterministic fingerprints.
7. Correctly classify UK nations: England, Scotland, Wales, Northern Ireland.
8. Correctly classify employer categories including NHS, councils, universities, DWP and private employers.
9. Provide API-driven filtering and pagination to the UI.
10. Support profile-to-job matching using explicit, explainable criteria.
11. Keep long-running ingestion independent from interactive API/UI traffic.
12. Provide a path to recurring background refresh and morning result generation.

### Non-goals for the current architecture

- Fully autonomous job applications without user review.
- Circumventing employer anti-bot controls, authentication, CAPTCHAs, or access restrictions.
- Treating sponsorship as guaranteed merely because a company or vacancy appears in a source.

---

## 3. High-Level Architecture

```text
                         ┌─────────────────────────┐
                         │       React UI           │
                         │ Dashboard / Filters      │
                         │ Results / Profile        │
                         └────────────┬────────────┘
                                      │ HTTPS/REST
                                      ▼
                         ┌─────────────────────────┐
                         │     Express API         │
                         │ routes / validation     │
                         └────────────┬────────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                │                     │                     │
                ▼                     ▼                     ▼
        ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
        │ Job Queries   │     │ Company APIs  │     │ Matching API  │
        │ Filters       │     │ Discovery     │     │ Candidate      │
        └───────┬───────┘     └───────┬───────┘     └───────┬───────┘
                │                     │                     │
                └─────────────────────┼─────────────────────┘
                                      ▼
                           ┌─────────────────────┐
                           │      MongoDB        │
                           │ Companies / Jobs    │
                           │ Profiles / State    │
                           └─────────┬───────────┘
                                     ▲
                                     │
                  ┌──────────────────┴──────────────────┐
                  │                                     │
          ┌───────┴────────┐                   ┌────────┴────────┐
          │ Discovery      │                   │ Enrichment /    │
          │ Workers        │                   │ Classification  │
          └───────┬────────┘                   └────────┬────────┘
                  │                                     │
        ┌─────────┼──────────┐                  ┌───────┼─────────┐
        ▼         ▼          ▼                  ▼       ▼         ▼
    Website    Careers      ATS              Nation Employer   Job
    resolver   resolver   detector          classifier classifier normaliser
        │         │          │                  │       │         │
        └─────────┴──────────┴──────────────────┴───────┴─────────┘
                              │
                              ▼
                    External public sources
                    / employer career systems
                    / ATS endpoints
```

The interactive path and ingestion path are intentionally separated. Long-running discovery must never depend on an HTTP request remaining open.

---

## 4. Technology Stack

### Application

- **Node.js** — backend runtime and discovery workers.
- **Express** — REST API layer.
- **JavaScript / ES modules** — current backend implementation.
- **React** — UI layer.

### Persistence

- **MongoDB** — primary operational datastore.
- **Mongoose** — MongoDB ODM and schema/model layer.

### Development and source control

- **Git** — version control.
- **GitHub** — repository, collaboration and source-of-truth for code/documentation.
- **PowerShell / Node CLI** — operational development commands on Windows.

### Discovery and data processing

- HTTP requests to publicly available employer/career sources.
- ATS/source detectors.
- Career-source resolution.
- Deterministic job fingerprints.
- Checkpoint collections for resumable long-running jobs.
- Controlled concurrency and delays.

### Testing

- Node.js built-in test runner (`node --test`).
- API-level location/filter tests.
- Classification unit tests.
- Future integration/contract tests for discovery providers.

### Configuration

- Environment variables through `dotenv`.
- Runtime configuration for MongoDB, run IDs, concurrency, delays and test limits.

---

## 5. Repository Architecture

The backend is organised around explicit responsibilities:

```text
backend/
├── ats/                  # ATS detection/configuration
├── db/                   # MongoDB connection
├── models/               # Mongoose models
├── routes/               # REST API routes
├── services/             # discovery, resolution and domain logic
├── scripts/              # long-running CLI workers and maintenance jobs
├── tests/                # automated tests
└── package.json
```

The key principle is that **scripts orchestrate work; services implement reusable business logic; models persist state; routes expose read/write APIs**.

---

## 6. Core Data Model

### Company

Represents an employer in the company universe.

Conceptual fields include:

```text
companyId
companyName
legalName
website
careersUrl
ats
sponsorship
employerType
metadata
location
resolution state
```

The company record is the anchor for subsequent job discovery.

### Job

Represents a normalised vacancy.

Conceptual fields include:

```text
fingerprint
companyId
companyName
title
location
nation
employerType
market
roleType
employmentType
jobUrl
source
posted date
salary
skills
raw source metadata
```

### Checkpoint

Represents durable progress for a discovery run.

Conceptual fields include:

```text
runId
company identifier
status
resolution status
error
requests used
processedAt
source information
```

Separate checkpoint collections are used for logically separate pipelines where appropriate, for example the Golden discovery pipeline and public-employer resolution.

---

## 7. End-to-End Company-to-Job Pipeline

```text
Company universe
      │
      ▼
Company record
      │
      ▼
Website resolution
      │
      ├── unresolved → checkpoint → continue
      │
      ▼
Careers source resolution
      │
      ├── unresolved → checkpoint → continue
      │
      ▼
ATS/source detection
      │
      ├── unknown → fallback source discovery
      │
      ▼
Job discovery
      │
      ▼
Normalisation
      │
      ▼
Fingerprint / deduplication
      │
      ▼
Location classification
      │
      ▼
Employer classification
      │
      ▼
Job enrichment
      │
      ▼
MongoDB
      │
      ▼
REST API
      │
      ▼
UI / matching engine
```

Every stage should be independently observable and recoverable.

---

## 8. Website Resolution

Website resolution converts an employer identity into an official web origin.

### Resolution strategy

1. Prefer authoritative existing company metadata.
2. Use known domain patterns where confidence is high.
3. Use controlled discovery for missing websites.
4. Reject clearly irrelevant domains.
5. Persist the resolved website and confidence/method where supported.

Public-sector organisations require specialised handling because their official domains frequently follow predictable patterns such as `.gov.uk`, `.nhs.uk`, and `.ac.uk`.

### Resolution states

```text
resolved
unresolved
invalid
```

An unresolved company is not considered a failed application opportunity; it is a separate data-quality state that can be retried later.

---

## 9. Careers Source Resolution

Once an official website is available, the system identifies the employer's actual recruitment source.

Candidate paths include:

```text
/careers
/jobs
/vacancies
/work-with-us
/join-us
/careers/jobs
```

The resolver should inspect relevant links from the official site and avoid treating generic search engines, social profiles or unrelated aggregators as the employer's career source.

The output is conceptually:

```js
{
  website,
  careersUrl,
  method,
  confidence,
  ats
}
```

---

## 10. ATS Detection

ATS detection identifies the technology hosting vacancies so that the correct discovery strategy can be selected.

Examples of ATS/source families supported or intended by the architecture include:

- Greenhouse
- Lever
- Ashby
- Workday
- SmartRecruiters
- Workable
- Recruitee
- Personio
- BambooHR
- Avature
- SuccessFactors
- employer-hosted career systems

The detector should return `unknown` rather than incorrectly assigning an ATS.

ATS detection is a routing decision, not a guarantee that jobs can be accessed.

---

## 11. Public Employer Resolution

The public-sector population currently contains approximately 986 records:

```text
NHS          256
Councils     333
Universities 397
```

These records require a dedicated resolution pipeline because their websites and recruitment systems differ significantly from generic private companies.

### Pipeline

```text
Public employer
      ↓
Official domain discovery
      ↓
Careers source discovery
      ↓
ATS detection
      ↓
Checkpoint
      ↓
Vacancy discovery
```

The public-employer resolver must be independently resumable and must not block the main 21,516-company pipeline.

### Data quality requirement

`employerType = councils` must not be interpreted as proof that every record is a local authority council. Classification should eventually distinguish local authorities from other organisations whose names happen to contain terms such as “Council”.

---

## 12. Job Discovery

Job discovery is source-specific.

A discovery service should accept a resolved source and return normalised vacancy candidates rather than writing directly to the UI.

Conceptually:

```js
await discoverCompanyJobs({
  company,
  careerSource,
  atsConfig
});
```

The discovery layer is responsible for source interaction. The persistence layer is responsible for upsert/deduplication.

### Rate control

The current architecture uses configurable controls including:

```text
resolution concurrency
request/discovery delay
batch size
progress interval
```

These controls must remain configurable through environment variables rather than hard-coded operational assumptions.

---

## 13. Checkpointing and Resumability

Long-running discovery is designed to survive interruption.

### Required behaviour

For every company:

```text
not processed
      ↓
processing
      ↓
completed / unresolved / invalid / failed
```

A run can be restarted using the same run ID without unnecessarily repeating completed companies.

### Why this exists

The system has already encountered MongoDB cursor expiration during large discovery runs. A single long-lived MongoDB cursor must therefore not be treated as the durable unit of progress.

The architecture uses **bounded work + persisted checkpoints**.

### Recommended scaling pattern

Instead of:

```text
one cursor → 21,516 records → hours of processing
```

prefer:

```text
batch → process → checkpoint → release cursor
batch → process → checkpoint → release cursor
...
```

This reduces the impact of cursor lifetime, process restarts, network failures and individual bad records.

---

## 14. Deduplication

Jobs are deduplicated using a deterministic fingerprint built from stable job/source attributes.

A fingerprint should distinguish genuine vacancies while collapsing repeated ingestion of the same vacancy.

Expected persistence behaviour:

```text
new fingerprint → insert
existing fingerprint → update
same source repeated → no duplicate
```

Discovery summaries should report:

```text
jobsDiscovered
jobsAdded
jobsUpdated
duplicatesRemoved
rejected
```

---

## 15. Location Classification

Location is a first-class field and must not be inferred from the UK label alone.

The classifier uses the most specific available evidence.

### Priority

```text
specific job location
        ↓
company/location metadata
        ↓
explicit source information
        ↓
unknown
```

Supported nations:

- England
- Scotland
- Wales
- Northern Ireland

Examples of location signals include major cities and explicit nation names.

A generic `UK` value must **not** automatically become England.

Similarly, an India location must never pass an England filter simply because a company has UK metadata.

This requirement is enforced by automated tests.

---

## 16. Employer Classification

Employer classification provides UI and matching filters.

Current conceptual categories include:

```text
nhs
councils
universities
dwp
private
```

Classification should be based on employer evidence rather than job title alone.

Future improvements should include a confidence field and source/method so that questionable classifications can be audited.

---

## 17. Enrichment

Existing jobs can be enriched after ingestion without re-running discovery.

The enrichment pipeline should populate or refresh:

```text
nation
employerType
roleType
market
normalised company fields
matching metadata
```

Enrichment is intentionally separate from source discovery so that classification rules can improve without repeatedly scraping external websites.

---

## 18. API Architecture

The API is the contract between MongoDB-backed services and the UI.

Conceptual endpoints include:

```text
GET /api/jobs
GET /api/companies
GET /api/discovery/status
```

### Jobs filtering

The jobs endpoint supports pagination and filtering such as:

```text
nation
employerType
roleType
market
company
search terms
```

Example:

```text
GET /api/jobs?limit=20&nation=England
GET /api/jobs?limit=20&nation=Scotland&employerType=universities
GET /api/jobs?limit=20&employerType=nhs
```

### API contract

Responses should contain a stable shape similar to:

```json
{
  "jobs": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "pages": 0
  },
  "market": "United Kingdom",
  "roleType": "Technology"
}
```

API filtering must occur at the database/query layer where possible rather than loading the entire dataset into memory.

---

## 19. UI Architecture

The UI should be filter-first because the underlying dataset is large.

### Core filters

```text
Nation
├── England
├── Scotland
├── Wales
└── Northern Ireland

Employer type
├── NHS
├── Councils
├── Universities
├── DWP
└── Private
```

Additional filters should eventually include:

```text
Role
Skills
Experience
Salary
Remote / hybrid / onsite
Sponsorship relevance
ATS/source
Company
Date posted
```

Filters should map directly to API query parameters.

The UI must not maintain a second classification system that disagrees with the backend.

---

## 20. Candidate Profile and Matching Engine

The next major product layer is candidate-to-job matching.

### Candidate profile

The profile should represent structured evidence rather than one large free-text CV.

Conceptual fields:

```text
skills
languages
yearsExperience
roles
industries
education
location preferences
work authorisation
sponsorship requirement
salary preferences
employment preferences
```

### Matching pipeline

```text
Candidate profile
      ↓
Job requirements extraction
      ↓
Skill overlap
      ↓
Experience compatibility
      ↓
Location compatibility
      ↓
Sponsorship relevance
      ↓
Role compatibility
      ↓
Explainable match result
```

The matching result should explain *why* a job matches instead of producing an opaque number only.

Example conceptual output:

```json
{
  "match": true,
  "reasons": [
    "React and TypeScript match",
    "2+ years web development experience matches",
    "UK location preference matches"
  ],
  "gaps": [
    "GraphQL listed as preferred but not present in profile"
  ]
}
```

---

## 21. Sponsorship Data Model

Sponsorship must be represented carefully.

Possible states include:

```text
verified
likely
unknown
not_evidenced
```

`verified` should have a traceable source or evidence basis. Company-level sponsorship status must not automatically be interpreted as proof that every vacancy is eligible for sponsorship.

The UI should therefore distinguish:

```text
company sponsorship evidence
vacancy sponsorship evidence
unknown
```

---

## 22. Background Processing Architecture

Long-running discovery should execute as workers/CLI processes rather than as API requests.

```text
                    ┌───────────────┐
                    │ Worker runner │
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         Company batch   Public batch   Enrichment
              │             │             │
              └─────────────┼─────────────┘
                            ▼
                         MongoDB
```

Workers should expose progress information suitable for CLI monitoring and eventually an API status endpoint.

### Isolation requirement

A background discovery worker must not consume the same resources in a way that makes interactive API requests unusable. Concurrency, batch size and rate limits must be configurable.

---

## 23. Observability

Every long-running job should report:

```text
runId
startedAt
completedAt
scanned
processed
skippedCheckpoint
resolved
unresolved
invalid
failed
jobsDiscovered
jobsAdded
jobsUpdated
duplicatesRemoved
rejected
```

Progress should be emitted periodically, for example:

```text
[progress] scanned=100 resolved=39 unresolved=61 successful=39 failed=0
```

Future production observability should add structured logs and metrics rather than relying exclusively on console output.

---

## 24. Failure Handling

Failure classes should be separated:

### Company resolution failure

The company cannot be mapped to a reliable official source.

### Source failure

The source exists but cannot currently be accessed or parsed.

### ATS detection failure

The career source exists but the ATS cannot be confidently identified.

### Job parsing failure

The source returned data but the normaliser could not produce a valid job.

### Persistence failure

MongoDB operation failed.

A single failure must not terminate the entire dataset run unless it is a process-level or infrastructure-level failure.

---

## 25. Security and Operational Safety

- Secrets remain in environment configuration and are never committed to GitHub.
- External requests must use controlled timeouts.
- User-provided query parameters must be validated.
- Database queries should avoid unrestricted full-dataset responses.
- External sites must be accessed responsibly and according to their applicable policies.
- The system must not attempt to bypass CAPTCHAs, authentication, robots controls, or other access restrictions.
- Job/application URLs should be preserved so the user can review the source before applying.

---

## 26. Scaling Strategy

### Current scale

Approximately 21,516 companies.

### Next scale

```text
250 test companies
        ↓
1,000
        ↓
5,000
        ↓
21,516+
```

The architecture scales horizontally by partitioning companies into independent batches/runs rather than maintaining one monolithic transaction.

### Scaling principles

1. Bounded MongoDB reads.
2. Durable checkpoints.
3. Controlled concurrency.
4. Source-specific rate limits.
5. Idempotent job upserts.
6. Independent enrichment.
7. API pagination.
8. Indexes on high-frequency filters.

---

## 27. Database Indexing Strategy

As the job dataset grows, indexes should support the dominant UI/API queries.

Likely indexes include:

```text
Job:
  fingerprint
  companyId
  nation
  employerType
  roleType
  postedAt
  employerType + nation

Company:
  companyId
  employerType
  sponsorship
  website/careers resolution state

Checkpoint:
  runId + companyId
  runId + status
```

Indexes should be measured against real query patterns before adding excessive compound indexes.

---

## 28. Testing Strategy

### Unit tests

Test deterministic logic:

- location classification
- employer classification
- fingerprint creation
- ATS detection
- source resolution helpers

### API tests

Test:

- response contract
- pagination
- England filtering
- Scotland filtering
- Wales filtering
- Northern Ireland filtering
- employer type filtering
- combined filters
- exclusion of incompatible locations

### Integration tests

Test against controlled fixtures for:

- company → website
- website → careers page
- careers page → ATS
- ATS → jobs
- job → normalisation
- normalisation → MongoDB

### Regression requirement

The location tests must prevent regressions where a generic `UK` location or company metadata causes an India/other-country vacancy to appear under an England filter.

---

## 29. Deployment Topology

The initial deployment can use a simple architecture:

```text
Developer machine / server
        │
        ├── Express API
        ├── discovery workers
        └── enrichment workers
                 │
                 ▼
              MongoDB
```

As scale increases, workers should be separated from the API process:

```text
                 ┌───────────────┐
                 │ Load Balancer │
                 └───────┬───────┘
                         ▼
                  API instances
                         │
                         ▼
                      MongoDB
                         ▲
                         │
             ┌───────────┴───────────┐
             │                       │
       discovery workers       enrichment workers
```

A queue can be introduced later when worker throughput and scheduling justify it.

---

## 30. Future Queue Architecture

A future production architecture may introduce a queue such as Redis-backed BullMQ or another durable job system.

```text
Scheduler
   ↓
Queue
   ├── company-resolution jobs
   ├── careers-resolution jobs
   ├── ATS-discovery jobs
   ├── job-discovery jobs
   └── enrichment jobs
          ↓
      Worker pool
          ↓
       MongoDB
```

This is intentionally a future evolution rather than a prerequisite for the current implementation.

---

## 31. Automation Architecture

The desired future workflow is a recurring refresh, approximately every two days, with results prepared before the user's morning review.

Conceptually:

```text
Scheduler
   ↓
refresh company sources
   ↓
discover new/changed vacancies
   ↓
normalise + deduplicate
   ↓
enrich/classify
   ↓
match against candidate profile
   ↓
produce shortlist
   ↓
UI / notification
```

Automation must operate on incremental changes wherever possible rather than rescanning every source from scratch.

The scheduling mechanism is intentionally separate from discovery logic so the same workers can be invoked manually, through CI, or by a scheduler.

---

## 32. Application Workflow

The product should eventually move from discovery to assisted application management.

```text
Job discovered
     ↓
Profile match
     ↓
User reviews job
     ↓
Save / reject
     ↓
CV tailoring
     ↓
Cover letter generation
     ↓
Application URL
     ↓
User applies
     ↓
Application status tracked
```

The platform should preserve a distinction between **recommendation/assistance** and actually submitting an application.

---

## 33. Data Freshness Model

Jobs are time-sensitive. Each job should carry timestamps sufficient to distinguish:

```text
first discovered
last seen
last updated
posted date
```

Future refresh logic can then identify:

```text
new jobs
changed jobs
stale jobs
removed/closed jobs
```

A stale job should not necessarily be deleted immediately; retaining historical information can support analytics and application tracking.

---

## 34. Current Known Gaps

The architecture identifies the following areas as active development work:

1. Public employer website resolution must populate the 986 NHS/council/university records.
2. Public employer careers/ATS resolution must follow website resolution.
3. Public-sector vacancy discovery must be validated separately by employer category.
4. Employer classification needs stronger evidence and potentially finer categories.
5. Sponsorship evidence needs source-level provenance.
6. Matching engine needs to be implemented as a first-class service.
7. UI filters need complete API-backed functionality.
8. Discovery status should be exposed through a stable API endpoint.
9. Large runs should use bounded MongoDB batches to avoid cursor lifetime failures.
10. Background workers should eventually be separated from the API process.
11. Recurring automation should be introduced only after the underlying pipeline is stable.

---

## 35. Recommended Implementation Order

```text
Phase 1
Public employer website resolution
        ↓
Phase 2
Careers + ATS resolution
        ↓
Phase 3
Public-sector job discovery
        ↓
Phase 4
API filtering + UI verification
        ↓
Phase 5
Candidate profile model
        ↓
Phase 6
Explainable job matching
        ↓
Phase 7
Application tracking
        ↓
Phase 8
Incremental refresh workers
        ↓
Phase 9
Scheduled automation
```

This order keeps the system data-first. Automation is deliberately last because scheduled automation amplifies both good and bad pipeline behaviour.

---

## 36. Architectural Principles

1. **Resolve before scraping.** Do not scrape blindly when the official source is unknown.
2. **Checkpoint everything long-running.** A process restart must not mean losing hours of progress.
3. **Prefer bounded batches over long-lived database cursors.**
4. **Keep source discovery separate from job normalisation.**
5. **Keep classification deterministic and testable.**
6. **Never infer England from generic UK.**
7. **Never infer sponsorship eligibility from employer category alone.**
8. **Make API filters database-backed and paginated.**
9. **Make ingestion idempotent.**
10. **Keep the UI dependent on API contracts rather than duplicating backend business logic.**
11. **Keep background processing isolated from interactive traffic.**
12. **Prefer explainable matching over opaque ranking.**
13. **Treat unresolved data as a recoverable state.**
14. **Make external-source access rate-limited and respectful.**
15. **Automate only after the underlying data pipeline is reliable.**

---

## 37. Target State

The target architecture is a continuously refreshed UK job intelligence system:

```text
                 ┌──────────────────────────────┐
                 │       21K+ Companies         │
                 └──────────────┬───────────────┘
                                ▼
                     Source Resolution Layer
                                │
                 ┌──────────────┼───────────────┐
                 ▼              ▼               ▼
             Websites       Careers           ATS
                 └──────────────┼───────────────┘
                                ▼
                         Job Discovery
                                ▼
                       Normalise + Dedup
                                ▼
                    Classify + Enrich + Verify
                                ▼
                            MongoDB
                                ▼
                         REST API Layer
                                ▼
                            React UI
                                ▼
                       Candidate Profile
                                ▼
                      Explainable Matching
                                ▼
                     Shortlist / Applications
                                ▲
                                │
                         Scheduled Refresh
```

The architecture is deliberately modular: individual discovery providers, classifiers, enrichment rules and matching strategies can evolve without replacing the entire system.
