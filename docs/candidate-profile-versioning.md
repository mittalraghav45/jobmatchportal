# Candidate profile versioning

JobMatchPortal keeps the candidate profile versioned so a new CV does not overwrite the previous matching basis.

## Canonical profile

The active profile is stored under `profileId=default` unless `MATCH_PROFILE_ID` is set. The active CV version is stored in `CandidateProfile.activeVersion`.

Each imported CV is also retained under `CandidateProfile.versions` with its source filename and structured skills, experience, education, certifications and target roles.

## Current CV

`v2` is the canonical profile created from `Raghav_CV(9).pdf`.

The importer preserves the previous profile as `v1` when it exists, then makes `v2` active.

## First-time migration

From `backend/` with `MONGODB_URI` available:

```bash
npm run profile:migrate-indexes
npm run profile:import:v2
```

The first command replaces the old `(profileId, jobId)` unique MatchResult index with `(profileId, profileVersion, jobId)`. This allows v1 and v2 match results to coexist.

The second command imports the CV profile and makes `v2` active.

## Matching

Nightly matching automatically reads the active version and persists it with every match result:

```text
profileId=default
profileVersion=v2
matcherVersion=v1
```

The nightly report also prints the active profile version.

## Viewing an older version

The match-results API accepts `profileVersion` as an optional query parameter. If omitted, it uses the profile's active version.

This makes it possible to compare results from different CV versions without deleting historical match data.
