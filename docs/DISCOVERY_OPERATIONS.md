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

A successful curated smoke run has been demonstrated in GitHub Actions against `main` with:

```text
requested:          5
selected:           5
missing:            0
successful:         5
failed:              0
unconfigured:        0
invalid:             0
discovered:        267
added:               8
updated:           259
duplicatesRemoved:    0
rejected:             0
```

The run used the merged production code and passed the smoke quality gate. A previous local repeat also demonstrated idempotent ingestion by updating existing records rather than creating duplicates.

## Batched full discovery

Full discovery is implemented by:

```text
backend/scripts/nightlyDiscoveryFull.js
```

and exposed as:

```bash
npm run nightly:discovery:full
```

The full runner invokes the canonical `nightlyDiscovery.js` runner in deterministic batches. Defaults are:

```text
batch size: 100 companies
maximum batches: 20
```

Each batch uses the existing `--skip`/`--limit` pagination, prints its normal summary, and the wrapper aggregates the totals into:

```text
=== FULL NIGHTLY DISCOVERY SUMMARY ===
```

The full-run health gate fails when:

- no companies are selected across the run;
- more than 10% of selected companies fail discovery;
- any company is classified as invalid.

`unconfigured` companies remain observable in the aggregate rather than being treated as a fatal condition because the corpus can contain companies without a configured discovery provider.

## GitHub Actions

The workflow is:

```text
.github/workflows/job-discovery.yml
```

It first synchronises configured discovery companies, then supports two modes.

### Smoke

Manual `workflow_dispatch` with `mode=smoke` runs:

```text
vercel
monzo
wise
deliveroo
revolut
```

The smoke quality gate fails when requested companies are missing, discovery fails, a company is unconfigured or invalid, records are rejected, or zero jobs are discovered.

### Full

Manual `workflow_dispatch` with `mode=full`, and the scheduled workflow, run the batched full discovery runner followed by the Google career fallback crawler.

The scheduled workflow runs daily at 03:00 UTC. Full discovery is capped at 20 batches of 100 companies by default, giving a maximum of 2,000 companies per run while keeping execution bounded and observable.

The workflow has a 240-minute job timeout. Batch size and maximum batch count can be overridden for a manual full run.

Do not increase concurrency or corpus size solely because a run completes; inspect throughput, failure rate, rejection, duplicate and database-health metrics first.

## Safe execution order

1. Run `npm run ci:validate` after code changes.
2. Run the curated smoke test locally when changing discovery orchestration.
3. Run the same smoke mode in GitHub Actions.
4. Only after the smoke gate passes, run/enable bounded full discovery.
5. Inspect the complete full-run health summary before increasing limits.
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
