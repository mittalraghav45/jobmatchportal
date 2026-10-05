# Project Recovery Guide

## If the ChatGPT conversation is lost

The Git repository is the durable source of truth for the JobMatchPortal codebase and technical documentation. A new ChatGPT conversation does not need to contain the entire historical chat if the repository and project status are preserved.

Start a new conversation with the repository URL and state:

> Continue development of `mittalraghav45/jobmatchportal`. Treat the repository as the source of truth. Read `PROJECT_STATUS.md`, `docs/PRD.md`, `docs/ENGINEERING_DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/SYSTEM_DESIGN.md`, `docs/API_DESIGN.md`, and `docs/DATABASE_DESIGN.md` before changing code. Check the current branch and working tree before making changes.

Then provide the current local state if relevant:

```powershell
git status
git branch --show-current
git log -5 --oneline
```

## What should be preserved outside ChatGPT

1. GitHub repository and commit history.
2. MongoDB database and backups.
3. Local `.env` files and secret-management records. Never commit secrets.
4. Current candidate-profile configuration.
5. Long-running discovery run IDs and checkpoint collections.
6. Any external service/API credentials required by the project.

## Reconstructing the development context

The documentation set is intentionally designed to recover architectural context:

- `docs/PRD.md` — product goals and requirements.
- `docs/ENGINEERING_DESIGN.md` — engineering decisions and implementation structure.
- `docs/ARCHITECTURE.md` — component architecture.
- `docs/SYSTEM_DESIGN.md` — end-to-end system design.
- `docs/API_DESIGN.md` — API contracts.
- `docs/DATABASE_DESIGN.md` — data model and persistence design.
- `PROJECT_STATUS.md` — current implementation status and next work.

A new conversation should verify the repository state before assuming that an item in an old conversation is still current.

## Local setup

Use the README and package manifests for the current setup commands. Do not recreate credentials from memory. Restore `.env` values from the user's secure secret store or local backup.

## Long-running pipelines

Discovery and enrichment are checkpointed. Preserve run IDs and checkpoint collections so an interrupted pipeline can resume rather than restarting the entire company universe.
