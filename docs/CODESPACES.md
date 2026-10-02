# GitHub Codespaces

GitHub Codespaces is the cloud development environment for JobMatchPortal. It provides a reproducible Node.js/VS Code environment backed by the Git repository, while MongoDB Atlas remains the persistent database.

## Current development branch

Use:

```text
feat/source-backed-job-verification
```

Do not run large discovery or verification jobs from an unexpected branch.

## First-time setup

1. Open the repository on GitHub.
2. Select the intended branch.
3. Open **Code → Codespaces** and create a Codespace.
4. In **Repository Settings → Secrets and variables → Codespaces**, create:

```text
MONGODB_URI
```

Use the existing MongoDB Atlas connection string. Never commit it to the repository.
5. The `.devcontainer/` configuration installs the Node.js 24 development environment and project dependencies automatically.

The repository's Codespace environment does not create or commit a `.env` file. `MONGODB_URI` is consumed from the Codespaces environment.

## Verify the environment

From the repository root:

```bash
pwd
git branch --show-current
node --version
npm --version
```

Then:

```bash
cd backend
npm test
npm run db:check
```

For the source-backed verification population:

```bash
node -r dotenv/config scripts/verificationPopulationSummary.js
```

## MongoDB Atlas network access

Codespaces do not normally originate from the same public IP as a local laptop. Atlas therefore needs a network access rule that permits the Codespace to connect.

For temporary development, the project may use an Atlas IP access-list entry of `0.0.0.0/0` together with a dedicated least-privilege database user and strong authentication. Treat this as a development convenience, not the preferred production network architecture.

Do not put Atlas credentials in source files, shell history, issues, pull requests or documentation.

## Running the project

Normal tests:

```bash
cd backend
npm test
```

Targeted verification/discovery commands should be run deliberately because they perform network and database work:

```bash
npm run jobs:verify
npm run jobs:analyse-unknown
npm run jobs:google-fallback
npm run jobs:crawl-google-fallback -- --limit=100
```

Inspect population summaries before and after large jobs. Preserve the job population invariant.

## Git workflow

Codespaces is a normal Git working copy. Before changing code:

```bash
git status
git branch --show-current
git pull --ff-only
```

After changes:

```bash
npm test
git diff --check
git status
git add <files>
git commit -m "<message>"
git push
```

Prefer small commits and pull requests for meaningful changes.

## Recreating a Codespace

The `.devcontainer/devcontainer.json` and `.devcontainer/setup.sh` files are the source of truth for the development environment. If a Codespace is deleted, create a new one from the repository and the bootstrap script will reinstall dependencies.

Secrets are not stored in the dev container definition. Reconfigure repository Codespaces secrets if the repository/account configuration changes.
