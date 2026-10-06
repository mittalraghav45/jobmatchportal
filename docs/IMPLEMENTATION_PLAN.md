# JobMatchPortal implementation plan

## Phase 1 — Stabilise the current pipeline
- Standardise job records across ATS connectors.
- Keep unknown posting/closing dates as unknown; never manufacture dates.
- Keep live status separate from sponsorship status.
- Add deterministic CV parsing and match-breakdown tests.
- Add application-specialist routing tests.
- Run backend tests in CI.

## Phase 2 — Employer and sponsorship intelligence
- Create a company record separate from individual vacancies.
- Store sponsorship status as verified / not-sponsor / unknown with source, evidence and checked-at metadata.
- Never infer Skilled Worker eligibility from an employer name alone.
- Add company-number, website, careers URL and ATS discovery metadata.
- Deduplicate companies and vacancies by stable identifiers/URLs.

## Phase 3 — Job intelligence and matching
- Extract explicit requirements, essential/desirable criteria, seniority, location, salary and sponsorship language.
- Keep deterministic matching separate from AI explanation.
- Produce an explainable match breakdown: skills, role alignment, seniority, location, sponsorship evidence and evidence gaps.
- Preserve unknown values rather than filling gaps with assumptions.

## Phase 4 — Application generation
- Use the All in One specialist for commercial applications.
- Use the NHS/Public Sector specialist for NHS, DWP, Civil Service, universities, councils and comparable public bodies.
- Generate skills, ATS keywords, achievement bullets, projects, summaries, cover letters and public-sector supporting statements.
- Add factuality validation and placeholder detection before output.

## Phase 5 — Application pack and UI
- Generate tailored CV, cover letter/supporting statement and evidence matrix as a single application pack.
- Add save/version history so a tailored application can be reviewed before submission.
- Add recruiter-readable previews and ATS keyword/evidence views.

## Phase 6 — Discovery automation
- Expand ATS/public-sector coverage.
- Add scheduled scans, change detection and stale-job handling.
- Keep source verification and timestamps visible.
- Use Apify as a bounded fallback for unresolved employer career sites.
- Require a measured pilot with useful jobs before broad Apify rollout.
- Produce sector/nation-specific application queues.
- Expand ATS coverage and company discovery.
- Add scheduled scans, change detection and stale-job handling.
- Keep source verification and timestamps visible.

## Current implementation
- Specialist routing engine added.
- Commercial and NHS/Public Sector prompt layers separated.
- Sponsorship evidence model added.
- Source-backed verification and source-first discovery added.
- Public-sector nation/employer filters added and tested.
- Apify API fallback added; first 10-company pilot returned zero jobs, so Actor/input selection remains the active limitation.

### Next priority
1. Validate/select a productive Apify Actor/input strategy.
2. Rerun the same 10-company pilot and require useful job yield.
3. Enable broader Apify discovery only after that pilot passes.
4. Re-run canonical matching and produce application-ready shortlists.
- Specialist routing engine added.
- Commercial All in One and NHS/Public Sector prompt layers separated.
- Public-sector output includes supporting statement and evidence matrix instructions.
- `/api/optimise-application` added for OpenAI-backed structured application generation.
- Sponsorship evidence model added as a separate tri-state layer.
- Application-engine, public-sector and sponsorship tests added.
- Backend CI workflow is present and configured to run `npm ci` and `npm test` on backend changes.
