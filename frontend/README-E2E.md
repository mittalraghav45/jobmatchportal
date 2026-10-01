# Frontend E2E tests

Playwright tests live in `e2e/` and use `playwright.config.js`.

Run locally after installing browser binaries:

```powershell
npm install
npx playwright install chromium
npm run test:e2e
```

The suite starts Vite automatically and uses deterministic API mocks for the matching flow.
