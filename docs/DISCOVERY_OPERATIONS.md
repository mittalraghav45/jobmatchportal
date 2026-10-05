# Discovery Operations

## Purpose

This document records the current operational model for source-backed job discovery, curated company configuration, nightly orchestration and GitHub Actions validation.

## Configuration source

The curated discovery seed is:

```text
backend/config/companies.csv
```

Synchronise enabled configured companies into MongoDB with:

```bash
cd backend
node scripts/syncDiscoveryCompanies.js
```

The sync is idempotent and can upsert configured companies that are absent from the MongoDB company population.

## Deterministic smoke test

The nightly discovery runner supports an explicit company selection:

```bash
npm run nightly:discovery -- --companies=vercel,monzo,wise,deliveroo,revolut
```

When `--companies` is supplied, the runner must process only the requested companies. It reports `requested`, `selected`, `missing`, `successful`, `failed`, `unconfigured`, `invalid`, `discovered`, `added`, `updated`, `duplicatesRemoved` and `rejected`.

It must never silently fall back to the normal corpus when an explicit selection cannot be resolved.

A successful curated smoke run has been demonstrated with:

```text
requested:          5
selected:           5
missing:            0
successful:         5
failed:              0
unconfigured:        0
invalid:             0
discovered:        268
added:             199
updated:             69
duplicatesRemoved:    0
rejected:             0
```

A repeat run updated existing records rather than creating duplicates, confirming idempotent ingestion for this source set.

## GitHub Actions

The workflow is:

```text
.github/workflows/job-discovery.yml
```

It first synchronises configured discovery companies, then supports two modes:

### Smoke

Manual `workflow_dispatch` with `mode=smoke` runs:

```text
vercel
monzo
wise
deliveroo
revolut
```

The workflow has a quality gate and fails when:

- requested companies are not all selected;
- a requested company is missing;
- discovery fails;
- a company is unconfigured or invalid;
- records are rejected;
- zero jobs are discovered.

### Full

Manual `workflow_dispatch` with `mode=full`, and the scheduled workflow, run bounded unified discovery followed by the Google career fallback crawler.

The full path should remain bounded and observable. Do not increase concurrency or corpus size solely because a run completes; inspect throughput, rejection, duplicate and database-health metrics first.

## Safe execution order

1. Run `npm test` after code changes.
2. Run the curated smoke test locally when changing discovery orchestration.
3. Run the same smoke mode in GitHub Actions.
4. Only after the smoke gate passes, run/enable bounded full discovery.
5. Inspect the complete summary before scaling.
6. Run source-backed verification incrementally over newly discovered jobs.
7. Audit duplicate URL/fingerprint behaviour after material ingestion milestones.

## Invariants

Discovery is not verification. A successfully discovered job is not automatically live or verified.

The pipeline remains:

```text
source discovery
  -> canonical normalisation
  -> idempotent ingestion
  -> source-backed verification
  -> UK/live eligibility
  -> matching
```

Do not fabricate jobs, sponsorship evidence, dates or application URLs. Preserve source URLs and source identifiers.

## Secrets

GitHub Actions uses `MONGODB_URI` from repository secrets. Provider credentials belong in GitHub Actions Secrets or the development environment and must never be committed or printed.
