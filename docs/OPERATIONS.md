# Operations Guide

## Local commands

From `backend/`:

```powershell
npm install
npm test
npm run jobs:verify
npm run jobs:analyse-unknown
npm run jobs:google-fallback
npm run jobs:crawl-google-fallback -- --limit=100
```

Run expensive network jobs deliberately; do not repeatedly rerun a full population without a reason.

## GitHub Codespaces

Codespaces is the cloud development environment for the repository. The setup is defined by `.devcontainer/devcontainer.json` and `.devcontainer/setup.sh`.

See [`docs/CODESPACES.md`](CODESPACES.md) for first-time setup, MongoDB Atlas connectivity, verification commands and Git workflow.

Required Codespaces secret:

```text
MONGODB_URI
```

Never commit the value.

## GitHub Actions

Workflows live under `.github/workflows/`:

- `tests.yml` — backend test suite on pushes/PRs.
- `job-verification.yml` — manual/nightly source verification.
- `job-discovery.yml` — controlled Google career discovery, manual/weekly.

Required Actions secret:

```text
MONGODB_URI
```

Never commit the value.

## Safe execution order

1. Pull the intended branch.
2. Run tests.
3. Inspect the current population summary.
4. Run targeted discovery/verification.
5. Check population invariants.
6. Review summaries before scaling a crawl.
7. Commit code/docs separately from generated data when practical.

## Recovery principles

- Never delete the company population to repair job data.
- Never reset the entire jobs collection just because verification changed.
- Prefer incremental re-verification.
- Preserve source URLs and verification evidence.
- If a run fails, inspect its summary/log before retrying.

## Environment

Local secrets belong in `backend/.env` and are excluded from Git. Codespaces secrets belong in GitHub repository Codespaces Secrets. CI secrets belong in GitHub Actions Secrets.

Do not copy MongoDB credentials into source files, documentation, issues or pull requests.

## Documentation continuity

After a material architecture, schema, workflow or operational change, update `AGENTS.md` and the relevant `docs/` document. Keep `docs/PROJECT_STATUS.md` and `docs/PROJECT_HANDOFF.md` current enough that a new chat/agent can resume without relying on conversation history.
