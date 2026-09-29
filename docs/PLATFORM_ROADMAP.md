# JobMatchPortal Platform Roadmap

## Architecture

```text
Company configuration
        |
        v
ATS detection / explicit ATS configuration
        |
        v
ATS adapter registry
        |
        v
Canonical job normalisation + validation
        |
        +----> MongoDB job store
        |
        v
Candidate matching
        |
        v
Application intelligence
        |
        v
Application tracker
```

## Company configuration

Edit `backend/config/companies.csv`. Do not hard-code company names in adapter code.

Fields:

- `company_id`
- `company_name`
- `enabled`
- `priority`
- `ats`
- `ats_slug`
- `careers_url`

Set `ats=auto` when the careers URL is a directly identifiable supported ATS host. Use an explicit ATS and `ats_slug` when automatic detection is insufficient.

## Discovery commands

From `backend/`:

```powershell
npm run discover:pipeline
npm run sync:jobs
```

`discover:pipeline` discovers and normalises jobs without requiring MongoDB. `sync:jobs` persists jobs into MongoDB and therefore requires `MONGODB_URI`.

## Candidate matching

The deterministic matcher is intentionally separate from the LLM application optimiser. Hard exclusions, role fit, skills, location and employment type are scored predictably. AI can be layered on later for semantic evidence without making the base score opaque.

Candidate configuration lives in `backend/config/candidateProfile.json` and is exposed through the `/api/platform/candidate` endpoint.

## Application tracker

MongoDB stores applications independently from job discovery. The same job/company pair is unique. Status transitions are recorded in `history`.

Supported statuses:

`saved -> applied -> screening -> technical -> final -> offer`

with `rejected` and `withdrawn` terminal states.

## API additions

- `GET /api/platform/candidate`
- `GET /api/platform/mongo-health`
- `POST /api/platform/discover`
- `POST /api/platform/match`
- `GET /api/platform/jobs`
- `GET /api/platform/applications`
- `POST /api/platform/applications`
- `DELETE /api/platform/applications/:companyId/:jobId`

## Testing strategy

Unit tests use deterministic fixtures and do not depend on live ATS websites. Live discovery is an operational integration concern. The CI pipeline should continue to run syntax checks, backend tests and frontend builds on every change.

## Future data import

A larger company JSON file can be imported by mapping its fields into the company configuration contract. The discovery and matching layers should not need to change when the company dataset changes.
