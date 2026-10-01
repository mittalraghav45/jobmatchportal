# Sponsor Tracker / JobMatchPortal — Engineering Design Document

**Status:** Living engineering document  
**Repository:** `mittalraghav45/jobmatchportal`  
**Last updated:** 2026-10-01

## 1. Architecture summary

The system is a Node.js/Express backend with MongoDB/Mongoose persistence and a frontend consuming HTTP APIs.

The backend is organised around these logical layers:

```text
Company Universe
      |
      v
Company Classification
      |
      v
Website / Careers Resolution
      |
      v
ATS / Source Detection
      |
      v
Job Discovery Adapters
      |
      v
Normalisation + Deduplication
      |
      +-------------------+
      |                   |
      v                   v
Location Classification  Employer Classification
      |                   |
      +---------+---------+
                |
                v
          MongoDB Job Store
                |
                v
             REST API
                |
                v
             Frontend
                |
                v
       Profile Match Engine
                |
                v
        Shortlist / Tracker
```

Long-running discovery processes are intentionally separated from the request/response API so background work does not block interactive searches.

## 2. Technology baseline

Current repository conventions include:

- Node.js
- ES modules
- Express
- Mongoose
- MongoDB
- Axios for HTTP source retrieval
- dotenv for environment configuration
- Node's built-in test runner
- GitHub as source control

The backend package currently exposes discovery, enrichment, classification and test commands through npm scripts.

## 3. Core domain models

### Company

Current company model includes:

```text
companyId
companyName
companyNumber
website
careersUrl
enabled
priority
ats
sponsorship
employerType
classificationVersion
metadata
createdAt
updatedAt
```

`employerType` supports:

```text
nhs
councils
universities
dwp
private
```

### Job

The Job model should retain at least:

```text
title
companyName / company reference
location
nation
employerType
source/source URL
fingerprint
job metadata
posting/update timestamps
classification metadata
```

The exact existing schema remains the source of truth for fields already implemented in the repository.

### Discovery checkpoint

Long-running discovery requires:

```text
runId
companyId
status
resolution/discovery result
error/reason
processedAt
```

The checkpoint key must be stable enough to resume a run without duplicating completed work.

## 4. Company resolution architecture

Company resolution is a staged pipeline:

```text
Existing company URL
      |
      +-- valid? ----------> use it
      |
      v
Candidate domain generation
      |
      v
HTTP probe
      |
      +-- resolved? --------> official website
      |
      v
Search fallback
      |
      v
Career-source resolution
      |
      +-- common career paths
      +-- homepage career links
      +-- curated overrides
      |
      v
ATS detection
```

A source resolver must never accept Google/Bing/search-engine URLs as an employer careers source.

### Public employers

NHS, councils and universities need a dedicated resolution path because their official domains frequently do not correspond cleanly to the legal company name.

The public-employer resolver is checkpointed separately from the general Golden discovery run.

Recommended resolution metadata:

```text
resolutionStatus
resolutionSource
resolutionConfidence
resolvedAt
resolutionError
```

These fields can be stored in `metadata` initially and promoted to first-class fields if operational querying requires them.

## 5. Job discovery architecture

Discovery should operate on resolved sources rather than arbitrary company names.

```text
Company
  |
  v
resolveCareerSource()
  |
  v
source adapter
  |
  v
fetch jobs
  |
  v
normalise
  |
  v
classify
  |
  v
fingerprint
  |
  v
upsert
```

Each source adapter should return a common internal job shape. Source-specific parsing must remain inside the adapter/resolver boundary.

### Idempotency

Jobs are identified using a stable fingerprint. Re-running discovery should produce:

- insert when fingerprint is new
- update when fingerprint exists and source data changed
- no duplicate document when the same job is rediscovered

## 6. Location classification

Location classification is deliberately separate from employer classification.

Resolution precedence:

1. explicit job location
2. structured job location fields
3. explicit company metadata location where appropriate
4. unknown/UK when insufficient evidence exists

A generic `UK` location must not be rewritten to `England` merely because the company is in the UK.

Nation classifier outputs:

```text
England
Scotland
Wales
Northern Ireland
UK
Unknown
Non-UK
```

The classifier should use controlled place/nation vocabularies and avoid deriving nation from job titles alone.

## 7. Employer classification

Employer classification should be based on employer identity and available structured metadata rather than the job title.

The classification layer must allow an employer to remain `unknown`/private when evidence is insufficient.

Public-sector categories should have validation rules so names containing words such as `Council` do not automatically create a local-authority classification when the entity is a different organisation.

## 8. REST API design

The API is the stable boundary between backend data processing and the UI.

Representative endpoints:

```text
GET /api/jobs
GET /api/companies
GET /api/discovery/status
```

`GET /api/jobs` should support composable filters including:

```text
page
limit
nation
employerType
roleType
market
sponsorship
```

The API must apply filters at the database/query layer wherever practical, then classify/serialise the result consistently.

### API contract rule

If `nation=England` is requested, every returned job must have a final nation classification of `England`. Returning a generic UK job because the API matched an unrelated company-level value is a correctness bug.

Likewise:

```text
employerType=nhs
```

must never return a private/council/unclassified employer.

## 9. Candidate profile and matching engine

The candidate profile should be stored independently from jobs.

Conceptual model:

```text
CandidateProfile
  |
  +-- role families
  +-- skills
  +-- years experience
  +-- seniority preference
  +-- location preferences
  +-- work arrangement
  +-- sponsorship requirement
  +-- exclusions
```

Matching should produce an explainable result rather than a single opaque score.

Example internal dimensions:

```text
skillMatch
roleMatch
seniorityMatch
locationMatch
sponsorshipMatch
recency
```

The final score should be configurable and versioned so changes to the matching algorithm do not make historical results impossible to interpret.

## 10. Search architecture

The UI should not perform source scraping directly.

```text
Frontend
   |
   v
REST API
   |
   v
MongoDB
```

Background workers perform scraping/discovery independently:

```text
Worker
   |
   +--> company resolution
   +--> career resolution
   +--> job discovery
   +--> enrichment
   +--> classification
```

This allows the user to continue searching while discovery runs.

## 11. Checkpointing and resumability

Long-running jobs must not rely on a single MongoDB cursor remaining open for the entire run. The observed `cursor id not found` failures demonstrate why the worker should process bounded batches and persist progress frequently.

Recommended pattern:

```text
fetch bounded batch
       |
       v
process batch
       |
       v
write jobs/checkpoints
       |
       v
close/advance batch
       |
       v
fetch next batch
```

Do not retain an unbounded MongoDB cursor for hours.

Checkpoint semantics:

- completed company is durable before moving forward
- failed company records an error and can be retried
- process restart resumes from checkpoint state
- a new run ID creates an independent run

## 12. Rate limiting and concurrency

Source discovery should have configurable:

```text
concurrency
request timeout
retry count
backoff
inter-request delay
```

The defaults must be conservative enough for large-scale discovery. Source-specific limits should override global settings where required.

Retries should distinguish transient failures from permanent HTTP responses.

## 13. Data refresh strategy

There are two classes of refresh:

### Source resolution refresh

Used when a company lacks or has stale website/careers/ATS information.

### Job refresh

Used for resolved sources to find:

- new jobs
- updated jobs
- removed/expired jobs

A future scheduled workflow can run these independently.

## 14. Automation architecture

Automation should be outside the HTTP request path.

Future scheduled workflow:

```text
Scheduler
   |
   +--> company/source refresh
   |
   +--> job discovery
   |
   +--> job enrichment/classification
   |
   +--> candidate matching
   |
   +--> shortlist generation
   |
   v
Morning results
```

The requested target cadence is a refresh every two days with a morning result available around 09:00. Exact scheduling should be implemented only after the underlying pipeline is reliable and observable.

## 15. Observability

Every large background run should expose:

```text
runId
startedAt
finishedAt
scanned
processed
remaining
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

For source resolution additionally track:

```text
websiteResolved
careersResolved
atsResolved
resolutionErrors
```

The UI can use these metrics for a discovery-status view without querying worker internals.

## 16. Testing strategy

### Unit tests

Test pure classifiers for:

- England
- Scotland
- Wales
- Northern Ireland
- UK/unknown
- non-UK locations

Test employer classification independently.

### API tests

For each filter verify:

1. HTTP contract
2. pagination
3. every returned document satisfies the requested filter
4. combined filters are conjunctive
5. empty result sets are valid

### Integration tests

Test:

- MongoDB connection
- company resolution
- career-source resolution
- job upsert/fingerprint behaviour
- checkpoint resume

### Regression tests

Every location-filter bug should become a regression test. In particular, generic `UK` records must never satisfy a specific nation filter without explicit evidence.

## 17. Security and operational controls

- Secrets remain in environment configuration and must never be committed.
- Source requests use explicit user-agent identification.
- HTTP timeouts are mandatory.
- External source failures must not crash the entire run.
- API pagination must be bounded.
- Background workers must not expose credentials through logs.
- Application submission automation, if ever added, must require explicit user confirmation.

## 18. Current implementation gaps

Based on the current development state:

1. Public-sector company records have been classified, but the inspected dataset contained no website/careers/ATS values, so public-employer resolution is a required stage.
2. Job location classification and API filtering have required regression fixes and must remain covered by automated tests.
3. Large discovery runs have encountered MongoDB cursor expiry; bounded batch processing and checkpointing should be used.
4. Profile matching needs to become a first-class backend capability after source/job quality is stable.
5. Scheduled automation should be enabled only after discovery, enrichment, matching and monitoring are reliable.

## 19. Recommended implementation order

```text
1. Public employer resolution
2. Careers/ATS resolution validation
3. Public employer job discovery
4. Job data-quality validation
5. Search/filter regression suite
6. Candidate profile model
7. Matching engine
8. Shortlist UI
9. Application tracker
10. Monitoring dashboard
11. Scheduled refresh
12. Morning shortlist automation
```

## 20. Architectural decision principles

- Keep workers independent of the API process.
- Keep source-specific scraping isolated from domain logic.
- Keep classification deterministic and testable.
- Prefer explicit evidence over inference.
- Persist checkpoints frequently.
- Make every large operation restartable.
- Treat the REST API as a contract, not as a scraping layer.
- Make ranking/matching explainable and versioned.
