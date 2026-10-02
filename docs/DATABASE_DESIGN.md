# Database Design

## 1. Database

JobMatchPortal uses MongoDB with Mongoose for application persistence.

The database stores the job universe, company universe, enrichment/checkpoint state, candidate profile information, matching/application data, and operational metadata.

## 2. Core entities

### Company

Represents an employer discovered from the sponsor/company datasets and subsequent enrichment.

Important logical fields:

- `companyId`
- `companyName`
- `employerType`
- `website`
- `careersUrl`
- `ats`
- sponsorship/evidence metadata
- enabled/status metadata

Employer types currently include public-employer categories such as `nhs`, `councils`, and `universities`, alongside private employers.

### Job

Represents an individual vacancy discovered from a company/source.

Important logical fields include:

- title
- company identity / companyId
- location
- nation
- employerType
- role type / market
- source URL
- application/ATS URL where available
- sponsorship metadata
- skills/technology metadata
- discovery/enrichment timestamps

Jobs are enriched after ingestion so filtering and matching operate on normalized data.

### Candidate profile

Represents the skills, experience, location requirements, sponsorship requirement, and other preferences used by the matching engine.

The repository contains a default candidate profile configuration used by the current matching flow.

### Application

Represents a user's relationship with a job and supports the application lifecycle.

Conceptual states:

`Saved -> Applied -> Assessment -> Interview -> Offer / Rejected`

The application layer is separated from the raw Job record so job discovery can continue independently of user application state.

## 3. Operational collections

### Public employer resolution checkpoints

`public_employer_resolution_checkpoints`

Used to make long-running public employer enrichment resumable. Checkpoints record progress for a specific run and employer range so interrupted runs do not require restarting the entire dataset.

### Discovery run/status data

The discovery pipeline maintains run-level progress used by the homepage status UI. This separates durable checkpoint progress from live execution/heartbeat state.

## 4. Relationships

Conceptually:

```text
Company 1 ───────────< Job
                         │
                         │ matched against
                         ▼
                  Candidate Profile
                         │
                         ▼
                    Application
```

A Job may have company identity data even when a complete Company document is not yet available; enrichment/resolution processes progressively repair this relationship.

## 5. Data pipeline

```text
Sponsor/company universe
        |
        v
     Company
        |
        +---- website/careers/ATS enrichment
        |
        v
 Job discovery
        |
        v
      Job
        |
        +---- location/nation classification
        +---- employer classification
        +---- sponsorship enrichment
        +---- application URL/ATS enrichment
        |
        v
 Matching
        |
        v
 Application tracking
```

## 6. Indexing principles

Indexes should support the application's highest-volume access patterns:

- company identity lookup
- job-to-company lookup
- nation/location filtering
- employer type filtering
- sponsorship filtering
- source/application URL deduplication
- discovery timestamps
- matching queries

Indexes should be added based on measured query plans and production access patterns rather than indiscriminately indexing every field.

## 7. Data integrity

- Company IDs should remain stable across enrichment runs.
- Job deduplication should use source/provider identifiers and canonical URLs where available.
- Enrichment must be idempotent: rerunning a job/company enrichment process should not create duplicate logical records.
- Checkpointed processes must be safe to resume.
- Normalized fields such as `nation` and `employerType` should be generated from canonical classification logic rather than UI labels.

## 8. Scaling considerations

The current dataset is designed around a company universe of approximately 21.5k records and a growing job collection. Long-running discovery/enrichment is therefore batch-oriented and checkpointed.

Large operations should:

- process bounded batches
- use controlled concurrency
- persist checkpoints
- tolerate transient MongoDB/network failures
- avoid loading the entire job/company universe into application memory

## 9. Future data model extensions

Planned/expected product entities include:

- saved jobs
- application events/history
- candidate-specific match results/cache
- notification/digest history
- audit/observability records

These should be introduced without coupling user workflow state to the raw discovery records.
