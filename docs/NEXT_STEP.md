# Next Development Step

The matching API, source-backed job live verification, closing-date extraction, and My Matches frontend are integrated on the feature branch. My Matches now exposes canonical ATS/application data, verified-or-unknown live status, closing dates, match explanations, a working Save action into the application pipeline, and a richer Job Details view.

The next product milestone is **application preparation**: from a saved job, build the candidate-facing preparation workflow around the existing application states. The workflow should preserve the canonical job evidence and match snapshot, then support tailoring and a clear ready-to-apply state without duplicating job data.

Playwright browser-regression cleanup remains a separate quality task and should not block product development while backend/unit tests and production builds remain green.

Scheduled cron/email automation remains deferred until the final production stage.
