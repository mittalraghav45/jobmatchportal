# JobMatchPortal — Project Wiki

## 1. Purpose

JobMatchPortal is a UK-focused job discovery and application-support platform. Its core pipeline discovers jobs, normalises and deduplicates them, verifies source evidence, matches jobs against a versioned candidate profile, and produces explainable application-priority signals.

## 2. System flow

```text
Discovery adapters
  -> ingestion / canonical URL identity
  -> source-backed verification
  -> UK + live eligibility
  -> candidate profile matching
  -> role-family / skills / experience / seniority analysis
  -> sponsorship readiness
  -> MatchResult persistence
  -> human-readable quality report / quality gate
  -> application workflow
```

## 3. Candidate profile

The matcher consumes the persisted `CandidateProfile` identified by `MATCH_PROFILE_ID` (default: `default`). The profile is versioned so matching results can be reproduced against the profile version that produced them.

The candidate profile should represent the active CV, target roles, technologies, experience, location constraints, employment preferences, sponsorship requirement and hard exclusions.

## 4. Matching model

### Core fit

Core job fit is evaluated independently from sponsorship readiness.

Strong-compatible web/software role families for the current software/frontend candidate include:

- software
- frontend
- backend
- fullstack
- web

Specialist families such as data science, machine learning, cybersecurity and network engineering are protected from becoming strong matches merely because their descriptions contain familiar technologies.

### Match states

```text
strong
strong_unconfirmed_sponsorship
possible
weak
```

`strong_unconfirmed_sponsorship` means the job is a strong candidate/profile fit but the available evidence does not confirm sponsorship. It is not a claim that the employer sponsors Skilled Worker visas.

### Explainability

Each `MatchResult` contains component scores, compatibility status, sponsorship status, experience status and reasons. The UI and reports should use these fields rather than opaque scores alone.

## 5. Full-corpus matching

The nightly matcher processes the jobs collection in bounded bulk-write batches and upserts `MatchResult` records. It does not delete jobs.

The main script is:

```bash
cd backend
npm run nightly:matching
```

Useful environment variables:

```text
MONGODB_URI
MATCH_PROFILE_ID=default
MATCH_BATCH_SIZE=100
MATCH_CALIBRATION_LIMIT=25
```

The nightly quality gate rejects unsafe Strong results such as low skill evidence, specialist mismatches, incompatible role families, incompatible experience, excluded technologies or unresolved hard seniority problems. Unconfirmed sponsorship is intentionally a warning rather than a failure.

## 6. GitHub Actions

`.github/workflows/matching-quality.yml` is the reproducible corpus-quality job.

It:

1. checks out the requested ref;
2. installs Node 20 dependencies;
3. runs the complete backend test suite;
4. runs the full-corpus matcher;
5. enforces the nightly quality gate;
6. renders a human-readable Markdown report;
7. publishes the report to the GitHub Actions Summary;
8. uploads the raw matcher log and Markdown report as artifacts.

The workflow is scheduled at `01:15 UTC`, corresponding to 02:15 UK during British Summer Time. GitHub cron uses UTC, so seasonal UK scheduling must be considered when changing this.

## 7. Quality evaluation

The latest complete-corpus quality run produced 13 `strong_unconfirmed_sponsorship` results and passed the quality gate. No Strong result violated the configured skill, role-family, experience, excluded-technology, specialist-mismatch or hard-seniority safeguards.

Do not change matcher thresholds because of a single job. First compare the full-corpus distribution and inspect representative examples from each classification.

## 8. Discovery architecture

Discovery is now source-agnostic at the contract layer.

`backend/discovery/sourceAdapter.js` defines the canonical `JobSourceAdapter` and normalises discovered jobs into the shared shape. Each record preserves `source`, `sourceKind`, `sourceJobId` and `applyUrl` for provenance and identity.

`backend/discovery/publicSector.js` provides the first source-group abstraction for:

- councils
- universities
- NHS
- Civil Service
- other public bodies

This is an adapter contract, not a site-specific scraper. Concrete official feeds/search paths should be added behind it one source at a time. All discovered jobs continue through canonical ingestion, deduplication and source-backed verification before becoming verified-live matches.

Target source groups include:

- direct ATS platforms such as Greenhouse, Lever and Ashby;
- UK councils and other local government;
- universities;
- NHS and public-sector employers;
- startups and scale-ups;
- known Skilled Worker sponsor companies;
- general UK software/web engineering vacancies.

All source groups feed the same downstream pipeline.

## 9. Application workflow

The long-term application pipeline is:

```text
matched job
  -> CV fit assessment
  -> sponsorship evidence assessment
  -> tailored CV context
  -> cover-letter/application-pack generation
  -> human review
  -> application tracker
```

Application-generation tools must remain grounded in the candidate profile and job evidence. They must not invent qualifications, sponsorship, salary, achievements or vacancy facts.

## 10. Development rules

Before pushing a change:

```bash
cd backend
npm test
```

For frontend changes:

```bash
cd frontend
npm run build
```

Also run:

```bash
git diff --check
```

Prefer small, explainable changes. Add regression tests for matcher or discovery behaviour before changing a policy.

## 11. Security

Secrets belong in GitHub Actions Secrets or local environment files, never source control.

Important secrets include:

- `MONGODB_URI`
- `SERPER_API_KEY`
- `OPENAI_API_KEY`
- other provider credentials

Never print secret values into Actions logs.

## 12. Current project checkpoint

Matcher v2 has reached the corpus-evaluation checkpoint. The quality gate is passing and the next engineering milestone is broader source coverage through the normalized discovery adapter layer. The immediate target is the first concrete public-sector source-backed connector, followed by university, NHS and Civil Service connectors using the same interface.

The project should not return to repeated individual-job matcher tuning unless a systematic regression is demonstrated by tests or corpus-quality evidence.
