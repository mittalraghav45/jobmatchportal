# JobMatchPortal — Project Status

Last updated: 2026-10-02

## Current verified state

- Golden sponsor dataset: `backend/config/sponsor-companies.json`
- Golden dataset size: 21,516 companies
- MongoDB database: `jobmatchportal`
- Golden companies imported: 21,516
- Bulk matching endpoint: `POST /api/match/jobs`
- Global matching ranking is implemented and regression-tested.
- ATS/application URL canonicalisation is implemented and regression-tested.
- Job closing-date and source-backed live-state fields are implemented.
- Live verification supports `live`, `closed`, and `unknown`; unknown does not enable Apply.
- Dashboard sponsor-company count is restored as a separate `sponsorTotal` value.
- My Matches is integrated into the main React dashboard navigation directly below Jobs.
- My Matches exposes match score, ATS, sponsorship, live state, closing date and application URL without inventing missing values.

## Regression safety

The current feature branch is:

```text
feature/my-matches-ui-and-docs
```

GitHub Actions CI for the latest My Matches integration commit has:

- backend tests: passed
- frontend unit tests: passed
- frontend production build: passed
- Playwright browser regression: running/being validated

The My Matches browser suite covers:

- sidebar navigation
- ranked job-card rendering
- match score
- ATS application URL
- API error handling
- empty results

## Data-quality rules

- Never display `[object Object]` as an ATS value.
- Never invent an application URL.
- Show `Closes: Not available` when no reliable closing date exists.
- Show `Status not available` when live status cannot be verified.
- Only a source-verified live role can expose the Apply action.
- A reachable careers/job page is not automatically considered a live vacancy.
- Unknown sponsorship remains `unknown` and is not converted into a negative claim.

## Current product stage

The project has moved from the discovery/enrichment foundation into the user-facing matching workflow.

Completed in the current matching milestone:

1. Backend bulk matching contract.
2. Global score-first ranking and deterministic tie-breakers.
3. Explainable candidate scoring.
4. ATS/application URL recovery.
5. Source-backed live/closed/unknown job verification.
6. Closing-date extraction and display.
7. My Matches UI and main-sidebar integration.
8. Dashboard sponsor-company count preservation.

## Immediate next steps

1. Finish and keep green the Playwright My Matches regression suite.
2. Build the job details view from the canonical job contract.
3. Add Save Job persistence and UI.
4. Connect the application tracker to the matched-job workflow.
5. Continue matching/data-quality hardening.
6. Add scheduled refresh/digest automation only after the core workflow is stable.

Cron/email automation remains a final-stage feature and should not drive current architecture decisions.

## Architecture rule

Do not replace or bypass the golden sponsor dataset. Job ingestion should use only verified sources from `backend/config/job-source-registry.json`. Failed/unverified career URLs must be skipped and recorded rather than guessed.

## Development rule

Every new user-visible or API/data-contract feature must include regression coverage and a documentation update. Do not trade away existing working functionality to add a new feature; fix the integration at the correct layer and rerun the affected tests before moving on.
