# Sponsor Tracker / JobMatchPortal — Product Requirements Document

**Status:** Living product document  
**Repository:** `mittalraghav45/jobmatchportal`  
**Last updated:** 2026-10-01

## 1. Product overview

Sponsor Tracker / JobMatchPortal is a UK-focused job discovery and matching platform designed to turn a large employer universe into a continuously refreshed set of relevant software/technology opportunities.

The current product pipeline is built around:

1. A large company universe (currently 21,516 companies in the working dataset).
2. Company website, careers-source and ATS resolution.
3. Live job discovery and normalisation.
4. UK nation/location classification: England, Scotland, Wales and Northern Ireland.
5. Employer-type classification, including NHS, councils, universities, DWP and private employers.
6. Sponsorship-aware filtering.
7. Candidate-profile-to-job matching.
8. Application tracking and, later, scheduled refreshes and morning recommendations.

The product should separate **discovery**, **normalisation**, **classification**, **matching**, and **presentation** so failures in one stage do not corrupt downstream data.

## 2. Problem statement

UK job discovery is fragmented across company career sites, ATS platforms and employer-specific recruitment systems. A candidate looking for a technology role with UK work-visa sponsorship has to repeatedly search many sources, determine whether a role is relevant, determine its location and employer type, and assess fit against their technical profile.

The product should reduce this repeated manual work while preserving traceability to the original vacancy.

## 3. Product goals

### Primary goals

- Discover technology jobs from a broad UK employer universe.
- Resolve official employer websites and careers/job sources.
- Support ATS-specific discovery where applicable.
- Correctly classify job location by UK nation.
- Support employer-type filtering for NHS, councils, universities, DWP and private employers.
- Deduplicate and update vacancies rather than creating duplicate records.
- Match vacancies against a structured candidate profile.
- Surface a compact, actionable shortlist.
- Preserve source URLs and provenance for every discovered job.

### Secondary goals

- Make discovery resumable through checkpoints.
- Make enrichment independently rerunnable.
- Provide APIs suitable for a responsive frontend.
- Support future scheduled refreshes without coupling automation to the user interface.

### Non-goals for the current phase

- Automatically submitting job applications without explicit user review.
- Fabricating sponsorship claims where no evidence exists.
- Treating every employer classified as a public-sector type as a valid local authority/NHS/university without validation.
- Replacing the source employer's application process.

## 4. Target user

Primary user: a UK-based software/technology professional seeking relevant employment, including roles where Skilled Worker sponsorship may be required.

The initial experience is designed around a single candidate profile, but the architecture should avoid hard-coding the data model so that multiple profiles can be supported later.

## 5. Core user journeys

### Journey A — Discover jobs

1. Import/maintain company universe.
2. Resolve employer website.
3. Resolve careers/jobs source.
4. Detect ATS/source type.
5. Discover vacancies.
6. Normalise vacancy fields.
7. Classify nation and employer type.
8. Store/update vacancy.

### Journey B — Search/filter

The user can combine filters such as:

- Nation: England, Scotland, Wales, Northern Ireland.
- Employer type: NHS, councils, universities, DWP, private.
- Role type/category.
- Technology/skills.
- Sponsorship status/evidence.
- Location/work arrangement where available.
- Recency.

Filters must be composable and must not cause unrelated records to leak into the result set.

### Journey C — Match profile to jobs

1. Candidate profile is represented as structured attributes.
2. Job is represented as structured attributes.
3. Matching evaluates skills, seniority, role family, location, sponsorship relevance and other configured criteria.
4. The UI explains the important match factors rather than presenting an unexplained number only.

### Journey D — Application tracking

A discovered job can eventually move through states such as:

`discovered → reviewed → shortlisted → applied → interview → offer → closed/rejected`

The tracker must retain the original job/source information even when a vacancy later disappears from the source.

## 6. Functional requirements

### FR-1 Company universe

- Store a stable company identifier.
- Store company name, website, careers URL, ATS, sponsorship state, employer type and metadata.
- Support enabled/disabled companies.
- Preserve classification versioning.

### FR-2 Website/careers resolution

- Resolve official employer websites when missing.
- Reject search engines, social networks and generic job boards as employer websites.
- Resolve common careers paths and homepage career links.
- Store resolution status and provenance.
- Support checkpointed/resumable processing.

### FR-3 Job discovery

- Discover vacancies from resolved sources.
- Support multiple source/ATS adapters.
- Respect configured concurrency/delay controls.
- Continue after individual source failures.
- Avoid duplicate jobs through stable fingerprints.
- Update existing jobs when source data changes.

### FR-4 Location classification

A job's explicit location must take precedence over generic company location metadata.

The system must distinguish:

- England
- Scotland
- Wales
- Northern Ireland
- UK/unknown where the nation cannot be established
- Non-UK locations

A job whose title mentions an overseas location must not become an England job merely because its company is UK-based.

### FR-5 Employer classification

Support at least:

- NHS
- Councils
- Universities
- DWP
- Private

Classification must be stored separately from nation classification.

### FR-6 Sponsorship

The product must distinguish documented/verified sponsorship information from unknown status. Unknown must never silently become verified.

### FR-7 Search API

The API must support pagination and composable filters without returning records that fail the requested filter.

### FR-8 Matching

Candidate/job matching should produce:

- matched skills
- missing/uncertain skills
- role-family relevance
- seniority compatibility
- location compatibility
- sponsorship relevance
- an overall configurable match score

### FR-9 Provenance

Every job should retain its source URL and enough provenance to identify where it was discovered and when it was last refreshed.

### FR-10 Monitoring

Discovery and resolution jobs should expose progress, totals, checkpoints, failures and unresolved counts.

## 7. Data-quality principles

1. **Do not infer precision from generic data.** `UK` is not equivalent to `England`.
2. **Source-specific evidence wins.** Explicit job location wins over company-level location.
3. **Unknown stays unknown.** Missing sponsorship/ATS/location evidence must not be converted into a positive classification.
4. **Idempotency.** Re-running discovery should update existing records rather than multiply them.
5. **Checkpointing.** Long-running discovery must be resumable.
6. **Traceability.** A user-visible job should be traceable to its source.

## 8. Success metrics

Operational metrics:

- company resolution rate
- careers-source resolution rate
- ATS detection rate
- jobs discovered per resolved employer
- job update/add ratio
- duplicate rate
- unresolved/error rate
- API filter correctness
- discovery completion/resume success

Product metrics:

- relevant jobs surfaced
- candidate match quality
- shortlist usefulness
- application conversion
- stale-job rate

## 9. Release phases

### Phase 1 — Data foundation

- Company universe
- Company classification
- Location classification
- Job normalisation
- Deduplication
- API filters

### Phase 2 — Source resolution

- Public-employer resolution
- Careers URL resolution
- ATS detection
- Resolution checkpoints

### Phase 3 — Matching

- Candidate profile model
- Job matching engine
- Explainable match results
- Search and shortlist UI

### Phase 4 — Application workflow

- Saved jobs
- Application states
- Notes and reminders
- Interview/application history

### Phase 5 — Automation

- Scheduled source refresh
- Scheduled enrichment
- Morning shortlist generation
- Failure/retry monitoring

## 10. Risks

- Employer websites change structure.
- ATS providers change APIs/pages.
- Search-engine result quality can vary.
- Public-sector employer classifications may contain duplicates or organisations that are not the intended employer category.
- Sponsorship information may be incomplete or change over time.
- Large-scale discovery can hit rate limits or MongoDB cursor/session limits.

## 11. Product principles

- Accuracy before breadth.
- Source provenance over inference.
- Resumability over fragile batch jobs.
- Explainability over opaque ranking.
- Filtering must be trustworthy.
- Automation should reduce repetitive work without removing user control over applications.
