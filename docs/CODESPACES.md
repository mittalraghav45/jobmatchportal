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
5. The `.devcontainer/` configuration provides the Node.js 24 development environment.
6. Project dependencies must be installed with `npm install` if the image does not already contain them.

The repository's Codespace environment does not create or commit a `.env` file. `MONGODB_URI` is consumed from the Codespaces environment.

## Automatic branch sync

The Codespace automatically starts `.devcontainer/auto-sync.sh` through `postStartCommand`.

The helper:

- checks `feat/source-backed-job-verification` every 30 seconds;
- fetches the remote branch;
- fast-forwards only when the local worktree is clean and the histories are compatible;
- never overwrites uncommitted local work;
- does not merge divergent histories;
- logs activity to `/tmp/jobmatchportal-auto-sync.log`.

Therefore, when an agent commits/pushes a change to the active branch, a running clean Codespace should normally receive it without a manual `git pull`.

If you have local changes, the helper waits. If the branch is changed, it does nothing until the configured development branch is checked out again.

To inspect the helper log:

```bash
tail -50 /tmp/jobmatchportal-auto-sync.log
```

Manual synchronization remains available:

```bash
git fetch origin
git merge --ff-only origin/feat/source-backed-job-verification
```

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

Targeted verification/discovery commands should be run deliberately because they perform network and database work.

Inspect population summaries before and after large jobs. Preserve the job population invariant.

## Git workflow

The normal agent-assisted workflow is:

1. Keep the Codespace on `feat/source-backed-job-verification`.
2. Make sure local work is committed before expecting automatic remote sync.
3. Let the auto-sync helper receive agent-side commits.
4. Use targeted tests during development.
5. Run the complete suite at meaningful integration checkpoints.

For manual work, standard Git commands remain valid:

```bash
git status
git branch --show-current
git fetch origin
git merge --ff-only origin/feat/source-backed-job-verification
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

## Recreating a Codespace

The `.devcontainer/devcontainer.json` and `.devcontainer/auto-sync.sh` files are the source of truth for the cloud development environment. If a Codespace is deleted, create a new one from the repository and allow the dev container to initialise.

Secrets are not stored in the dev container definition. Reconfigure repository Codespaces secrets if the repository/account configuration changes.
