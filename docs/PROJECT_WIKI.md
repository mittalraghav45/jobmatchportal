# JobMatchPortal — Project Wiki

## 1. Purpose

JobMatchPortal is a UK-focused job discovery and application-support platform. Its core pipeline discovers jobs, normalises and deduplicates them, verifies source evidence, matches jobs against a versioned candidate profile, and produces explainable application-priority signals.

## 2. System flow

```text
Discovery
  -> ingestion / canonical URL identity
  -> source-backed verification
  -> UK + live eligibility
  -> candidate profile matching
  -> role-family / skills / experience / seniority analysis
  -> sponsorship readiness
  -> MatchResult persistence
  -> human-readable quality report
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

## 6. GitHub Actions

`.github/workflows/matching-quality.yml` is the reproducible corpus-quality job.

It:

1. checks out the requested ref;
2. installs Node 20 dependencies;
3. runs the complete backend test suite;
4. runs the full-corpus matcher;
5. renders a human-readable Markdown report;
6. publishes the report to the GitHub Actions Summary;
7. uploads the raw matcher log and Markdown report as artifacts.

The workflow is scheduled at `01:15 UTC`, corresponding to 02:15 UK during British Summer Time. GitHub cron uses UTC, so seasonal UK scheduling must be considered when changing this.

## 7. Quality evaluation

The nightly report is intentionally diagnostic. It reports:

- corpus health;
- UK/live/verified populations;
- Strong / Strong-unconfirmed / Possible / Weak distribution;
- score distribution;
- top eligible matches and their evidence;
- calibration flags.

Do not change matcher thresholds because of a single job. First compare the full-corpus distribution and inspect representative examples from each classification.

## 8. Discovery strategy

Discovery can use supported ATS sources and bounded search-provider discovery. Discovery evidence is not automatically equivalent to live-job verification. All discovered records should pass through canonical ingestion, deduplication and source-backed verification before becoming verified-live matches.

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

Prefer small, explainable changes. Add regression tests for matcher behaviour before changing a matching rule.

## 11. Security

Secrets belong in GitHub Actions Secrets or local environment files, never source control.

Important secrets include:

- `MONGODB_URI`
- `SERPER_API_KEY`
- `OPENAI_API_KEY`
- other provider credentials

Never print secret values into Actions logs.

## 12. Current project checkpoint

The current engineering priority is to validate the final matcher model against the complete corpus before further tuning. Once the corpus distribution is judged useful, freeze the matcher version and shift engineering effort toward broader source coverage and application intelligence rather than repeatedly recalibrating individual examples.
