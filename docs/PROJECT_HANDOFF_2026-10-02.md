# JobMatchPortal — Project Handoff

Date: 2026-10-02
Branch: `feature/my-matches-ui-and-docs`
Repository: `mittalraghav45/jobmatchportal`

## 1. Project goal

Build a UK job discovery and matching platform that automatically discovers relevant jobs, canonicalises their data, verifies whether jobs are genuinely live, captures closing/posted dates where available, and ranks jobs against the candidate profile. The long-term priority is reliable automated job discovery first, then reliable verification, then matching/UI.

The system should preserve explainability: sponsorship evidence, matched/missing skills, job status, dates, source/application URL and ranking information should remain inspectable.

## 2. Current architecture

High-level pipeline:

```text
Company dataset
   -> automated discovery
   -> raw job data
   -> canonicalisation
   -> MongoDB Job collection
   -> source/live verification
   -> clean available-job dataset
   -> profile matching/ranking
   -> My Matches UI
```

Backend runs on `http://localhost:3001`.
Frontend Vite app normally runs on `http://localhost:5173`.
MongoDB database currently used: `jobmatchportal`.

Important backend API areas currently mounted:
- `/api/jobs`
- `/api/companies`
- `/api/profile`
- `/api/match`
- `/api/applications`
- `/api/discovery`
- `/api/intelligence`
- compatibility `/api/ai`

## 3. Current Git state / recent work

Relevant branch:
`feature/my-matches-ui-and-docs`

Recent commits seen during this work include:
- `34a130c` merge discovery work into feature branch
- `936ab61` docs: document automated job discovery pipeline
- `8cc7fc9` CI: schedule automated job discovery
- `5f9b9ad` expose automated discovery command
- `41bf9c2` resumable automated job discovery orchestrator
- `3518ddf` chore: ignore Playwright test artifacts
- `a619e1a` docs: refresh project status after My Matches integration
- `1fcb0db` refactor: render My Matches through dashboard navigation
- `9f64370...` / subsequent metadata-repair work was pushed during the current session; run `git log -10 --oneline` after pulling to establish the exact current tip.

Always run `git status` and `git log -5 --oneline` before changing anything. Do not overwrite working changes blindly.

## 4. My Matches feature — current state

The UI now has a **My Matches** navigation option in the sidebar under the Jobs area. The feature calls the matching API and renders ranked job cards.

The intended job-card information includes:
- company
- title
- location/nation
- match percentage
- matched skills
- missing/unmatched skills
- sponsorship status/evidence
- job status
- closing date
- application link
- prepare-application action

Important UX rule: avoid text/background camouflage; status and evidence labels need readable contrasting styling.

The matching backend has tests covering:
- unified matching contract
- global ranking by score
- sponsorship tie-breaking
- requested ranking window

Playwright was deliberately deprioritised for now. Do not make Playwright the next project milestone unless explicitly requested. Generated `frontend/playwright-report/` and `frontend/test-results/` are ignored by git.

## 5. Matching API test command

From `backend`:

```powershell
node --test tests/matchRoute.test.js
```

Previously confirmed: 4 matching tests passed.

Useful API check:

```powershell
$response = Invoke-RestMethod -Uri "http://localhost:3001/api/match/jobs" -Method POST -ContentType "application/json" -Body '{"profileId":"default","page":1,"limit":3}'
$response.matches | ForEach-Object {
  [PSCustomObject]@{
    Company        = $_.job.companyName
    Title          = $_.job.title
    ATS            = $_.job.ats
    ApplicationURL = $_.job.applicationUrl
    JobURL         = $_.job.url
    ClosingDate    = $_.job.closingAt
    Live           = $_.job.isLive
  }
} | Format-Table -AutoSize
```

Do not accept `[object object]` as a valid ATS value. Canonicalisation has tests preventing that string from being persisted as ATS.

## 6. Job canonicalisation

`backend/models/jobSchema.js` contains the canonicalisation logic.

Current canonical model concepts include:
- `schemaVersion`
- `externalId`
- `companyId`
- `companyName`
- `title`
- `description`
- `location`
- `employmentType`
- `department`
- `source.ats`
- `source.url`
- `dates.postedAt`
- `dates.closingAt`
- `dates.lastSeenAt`
- `status.isLive`
- `status.liveState`
- verification metadata
- raw source payload

Canonicalisation tests that were explicitly fixed and passed:

```powershell
node --test tests/jobCanonicalisation.test.js
```

Confirmed tests:
- extracts ATS from nested source objects
- recovers application URL from nested ATS fields
- preserves closing date and live status
- never persists `[object Object]` as ATS

Important: canonicalisation finding a live-looking field is **not equivalent to independently verifying that a public job page is still live**.

## 7. Dataset discovery result

A full dataset scan was completed over the company dataset.

Recorded full scan summary:

```text
runId: golden-full-v20515
start: 1001
end: 21516
scanned: 20493
skippedCheckpoint: 1085
resolved: 5176
unresolved: 14232
invalid: 0
successful: 5176
failed: 1
jobsDiscovered: 2844
jobsAdded: 2844
jobsUpdated: 0
duplicatesRemoved: 0
rejected: 0
```

The MongoDB Job collection later contained **3,481 jobs**, so the database contains more than that individual scan's 2,844 newly added jobs. Do not wipe/rebuild the collection merely because these figures differ.

## 8. Dataset quality check

A script was added:

```text
backend/scripts/inspectJobDataset.js
```

Run:

```powershell
cd backend
node scripts/inspectJobDataset.js
```

Initial inspection before repair:

```text
totalJobs: 3481
liveJobs: 757
closedJobs: 0
jobsWithSourceUrl: 0
jobsWithKnownAts: 3481
jobsWithClosingDate: 0
jobsWithPostedDate: 0
```

## 9. Metadata repair already performed

A repair script was added:

```text
backend/scripts/repairJobMetadata.js
```

Run:

```powershell
node scripts/repairJobMetadata.js
```

The repair scanned all 3,481 jobs and produced:

```text
scanned: 3481
changed: 3481
sourceUrlsRecovered: 3481
postedDatesRecovered: 453
closingDatesRecovered: 66
liveStatesRecovered: 3481
closedStatesRecovered: 0
```

A subsequent inspection produced:

```text
totalJobs: 3481
liveJobs: 3481
closedJobs: 0
jobsWithSourceUrl: 3481
jobsWithKnownAts: 3481
jobsWithClosingDate: 66
jobsWithPostedDate: 453
```

### Critical interpretation

The source URL and metadata recovery is successful.

However, **do not treat 3,481 `isLive=true` records as proof that all 3,481 jobs are currently live**. The repair recovered live-state information from stored raw records; it did not independently fetch and validate every source page.

This is now the most important data-quality gap.

## 10. Next milestone — source-backed live verification

This is the next development task.

Do NOT start another giant discovery scan yet.

Build a source verification pipeline for the existing jobs with `source.url`.

For each job, fetch the source page and determine:

```text
live
closed
unknown
```

Verification must distinguish:
- HTTP availability
- redirects
- explicit closed/expired wording
- structured `JobPosting` evidence
- `validThrough` / closing date evidence
- ambiguous pages
- timeout/network failure

HTTP 200 alone must **not** mean the job is live.

A page can return 200 while saying the job is no longer available. This was specifically observed as a concern with the PVS Infotech example:

`https://pvsinfotech.com/jobs/software-developer/`

The desired conceptual flow is:

```text
Job.source.url
      -> fetch page
      -> inspect response + structured data + page signals
      -> live / closed / unknown
      -> store verification timestamp/reason/evidence
```

Unknown must remain unknown. Do not convert uncertainty into a negative or positive claim.

## 11. Recommended verification fields

Preserve existing data and add/extend verification metadata rather than replacing fields.

Useful shape:

```js
status: {
  isLive: true | false | null,
  liveState: 'live' | 'closed' | 'unknown',
  verification: {
    checkedAt: Date,
    reason: String,
    url: String,
    httpStatus: Number,
    finalUrl: String,
    evidence: String,
    source: String
  }
}
```

Exact implementation should follow the existing repository conventions rather than blindly copying this shape.

## 12. Closing-date rules

The UI should display a closing date wherever reliable evidence exists.

If no closing date is known, display:

`Not available`

Do not fabricate dates.

Potential evidence sources include structured `JobPosting` fields such as `validThrough`, explicit deadline/closing-date fields in ATS payloads, and clearly identified source-page evidence.

The existing dataset currently has 66 jobs with a stored closing date and 453 with a stored posted date.

## 13. Automated discovery

The automated discovery command is:

```powershell
cd backend
npm run discover:auto
```

Environment example:

```powershell
$env:DISCOVERY_LIMIT="10"
npm run discover:auto
```

Earlier there was a startup conflict error:

`Updating the path 'startedAt' would create a conflict at 'startedAt'`

The relevant script was:

`backend/scripts/automatedJobDiscovery.js`

The problematic pattern involved both `$setOnInsert.startedAt` and a later `$set` of `startedAt` during the running state update. If this error reappears, inspect the current GitHub version before modifying it.

The automated discovery architecture is intended to be resumable and checkpointed. Do not remove checkpointing just to simplify the code.

## 14. Project priority order from this handoff

Use this order unless a new requirement explicitly changes it:

### Priority 1 — Verify existing 3,481 jobs

Implement source-backed live/closed/unknown verification.

### Priority 2 — Verify and enrich dates

Capture `postedAt` and `closingAt` from structured data and source evidence wherever possible.

### Priority 3 — Establish dataset quality gates

After verification, produce counts for:
- total
- live
- closed
- unknown
- URL coverage
- ATS coverage
- posted-date coverage
- closing-date coverage
- verification coverage

### Priority 4 — Automated discovery

Once verification is reliable, run automated discovery regularly and feed new jobs through the same canonicalisation + verification pipeline.

### Priority 5 — Matching

Only rank jobs using the clean canonical dataset. Keep sponsorship evidence and candidate-match explanations visible.

### Priority 6 — UI refinement

Then refine My Matches around trustworthy live status, closing date, source/application links and match score.

## 15. Non-negotiable development rule

**Do not break existing functionality while adding new features.**

Before changes:

```powershell
git status
git log -5 --oneline
```

After changes:

```powershell
node --test tests/jobCanonicalisation.test.js
node --test tests/matchRoute.test.js
```

Run relevant additional tests when changing the affected area.

Do not delete working matching/UI code to solve discovery problems.
Do not reset the database without explicit reason.
Do not replace unknown values with guesses.
Do not treat an HTTP 200 page as proof of a live vacancy.
Do not persist `[object Object]` as ATS.

## 16. Documentation rule

Update the relevant documentation whenever a meaningful feature/pipeline stage is added. Keep this handoff/current-status document refreshed so a new chat can resume without reconstructing project history.

## 17. Useful commands

Backend:

```powershell
cd C:\Users\mitta\Downloads\sponsor-tracker-project\Project\backend
npm run dev
```

Frontend:

```powershell
cd C:\Users\mitta\Downloads\sponsor-tracker-project\Project\frontend
npm run dev
```

Frontend production build:

```powershell
npm run build
```

Dataset inspection:

```powershell
node scripts/inspectJobDataset.js
```

Metadata repair (already completed; do not repeatedly run unless necessary):

```powershell
node scripts/repairJobMetadata.js
```

Automated discovery:

```powershell
npm run discover:auto
```

## 18. New-chat starting instruction

When continuing this project in a new chat, start by reading this file and then say:

> "We are at the source-backed verification stage. The database has 3,481 jobs, all have source URLs and known ATS, 453 have posted dates, 66 have closing dates, but the 3,481 live flags are not independently verified. Do not run another full discovery scan yet. Build and test the source verification pipeline first."

Then inspect the current GitHub branch before coding so that the implementation matches the latest repository state.
