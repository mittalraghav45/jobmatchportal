# Next Development Step

The matching API, source-backed job live verification, closing-date extraction, My Matches frontend, Job Details view, and the first application-preparation workflow are integrated on the feature branch.

Application Preparation now creates or reuses the saved application record, preserves the match snapshot, tracks CV and cover-letter preparation, stores candidate notes, and moves the application through `saved` → `tailoring` → `ready_to_apply` using the existing backend transition rules.

The next product milestone is **application materials and submission tracking**: add first-class tailored CV/cover-letter artifacts and make the application workspace the central place to record the actual submission and subsequent interview/offer progress. Do not duplicate canonical job data.

Playwright browser-regression cleanup remains a separate quality task and should not block product development while backend/unit tests and production builds remain green.

Scheduled cron/email automation remains deferred until the final production stage.
