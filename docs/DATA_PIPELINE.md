# Data Pipeline

## Canonical flow

```text
21,516-company population
        |
        v
Direct/ATS discovery
        |
        v
Google career fallback for companies with no discovered jobs
        |
        v
Careers/ATS crawl
        |
        v
Canonical job records
        |
        v
Source-backed verification
        |
        +--> live
        +--> closed
        +--> unknown
        |
        v
Job intelligence / matching
```

## Company population

The company population is a protected source dataset. Discovery and verification must not delete companies as a side effect.

A company with no discovered job is not evidence that it has no vacancies.

## Google fallback

A Google fallback URL is stored when direct discovery does not produce a job. It is a discovery aid only.

The second-stage crawler may use the search result to identify:

- company careers pages
- recognised ATS boards
- individual job pages

A generic search result must never become a fabricated job record.

## Job identity and canonicalisation

Every discovered job should retain its source URL and a stable canonical identity where possible. Normalisation should remove tracking parameters and provider-specific URL noise without changing the identity of the posting.

Duplicate detection must happen before insertion.

## Source-backed verification

Verification is incremental and safe to rerun.

Current states:

- `live`
- `closed`
- `unknown`
- `unverified`

The verifier may use source-page evidence, recognised ATS patterns, redirects and structured `JobPosting` data. Redirecting to a generic board without retained posting identity is not sufficient evidence of a live posting.

### Population invariant

After every verification run:

```text
live + closed + unknown + unverified = total
```

A verification script must report before/after totals and fail loudly if the invariant is broken.

## Operational safeguards

- bounded crawl depth/pages
- request timeouts
- domain-aware rate limiting
- robots/crawl policy checks where applicable
- no credentials submitted to public job pages
- no fabricated vacancy data
- source URL retained for every job
- failed/blocked requests remain distinguishable from closure

## Current baseline

As of 2026-10-02 after the second verification pass:

```text
Jobs:       3,481
Live:       1,565
Closed:       155
Unknown:    1,761
Unverified:     0
```

The baseline should be treated as a checkpoint, not hard-coded production truth; future discovery can intentionally increase the job population.
