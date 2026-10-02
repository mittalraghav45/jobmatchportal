# Documentation Continuity Policy

The repository is the durable project memory. Important decisions should not exist only in a chat transcript.

## Required updates

Update documentation when any of the following changes:

- architecture or data flow
- MongoDB schema or persistence semantics
- API route/request/response contract
- discovery/canonicalisation/verification behaviour
- scheduled workflow or operational command
- security or secret-handling rule
- major milestone, baseline metric or known limitation

## Document ownership

| Document | Purpose |
|---|---|
| `AGENTS.md` | Rules for future coding agents and contributors |
| `README.md` | Setup and high-level user/developer overview |
| `docs/ARCHITECTURE.md` | System architecture and design decisions |
| `docs/API.md` | API contracts |
| `docs/DATA_PIPELINE.md` | Discovery, canonicalisation and verification |
| `docs/OPERATIONS.md` | Running, scheduling, recovery and secrets |
| `docs/PROJECT_STATUS.md` | Current state and next priorities |
| `docs/PROJECT_HANDOFF.md` | Fast resume point for a new chat/agent |
| `docs/DOCUMENTATION_POLICY.md` | Rules for maintaining project memory |

## Chat-to-repository workflow

At the end of a substantial development session:

1. Record important decisions in the appropriate design/operations document.
2. Update project status and handoff when milestones or baselines change.
3. Update `AGENTS.md` if a rule should persist across agents.
4. Add tests for behaviour changes.
5. Commit documentation with the implementation that it describes when practical.

## Avoiding documentation drift

Do not copy speculative plans into status documents as completed work. Distinguish clearly between implemented, tested, planned and known-limited behaviour.

Do not hard-code transient runtime counts into code merely to document them. Use status/handoff documents for checkpoints.
