import { test, expect } from '@playwright/test';

const profileId = '6abd944a55aaae3b647b0463';
const jobId = 'e2e-job-1';

const match = {
  job: {
    id: jobId,
    title: 'Software Engineer – Query Engines',
    companyName: 'Palantir UK Limited',
    companyId: '93454',
    location: 'London, United Kingdom',
    employmentType: 'Full time',
    workMode: 'Hybrid',
    applyUrl: 'https://jobs.lever.co/palantir/e2e-job-1',
    source: { name: 'Lever', url: 'https://jobs.lever.co/palantir/e2e-job-1' },
    status: { isLive: true }
  },
  candidateScore: {
    score: 78,
    matchedSkills: ['React', 'TypeScript', 'JavaScript'],
    missingSkills: []
  },
  sponsorship: 'unknown'
};

function application(status = 'saved') {
  return {
    applicationId: 'e2e-application-1',
    profileId,
    jobId,
    jobTitle: match.job.title,
    companyName: match.job.companyName,
    status,
    job: match.job
  };
}

test('runs the matched-job application smoke flow', async ({ page }) => {
  let currentApplication = null;
  let createCount = 0;

  // The application flow is mocked at the API boundary; the E2E job must not
  // depend on a live Mongo/Express backend or external job data.
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/jobs') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs: [], total: 0, page: 1, pages: 1 }) });
      return;
    }
    if (url.pathname === '/api/intelligence/dashboard') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      return;
    }
    if (url.pathname === '/api/match-results') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], matches: [], total: 0 }) });
      return;
    }
    if (url.pathname === '/api/profile' || url.pathname === '/api/candidate-profile') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: null }) });
      return;
    }
    if (url.pathname === '/api/companies') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ companies: [], total: 0 }) });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/match/jobs', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        matches: [match],
        page: 1,
        pages: 1,
        total: 1,
        market: 'United Kingdom',
        verifiedLiveOnly: true
      })
    });
  });

  await page.route('**/api/applications', async route => {
    if (route.request().method() === 'POST') {
      createCount += 1;
      if (createCount > 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Application already exists for this job' })
        });
        return;
      }
      currentApplication = application('saved');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ application: currentApplication })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ applications: currentApplication ? [currentApplication] : [] })
    });
  });

  await page.route('**/api/applications/*', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ application: currentApplication })
      });
      return;
    }
    if (request.method() === 'PATCH' && request.url().endsWith('/status')) {
      const body = JSON.parse(request.postData() || '{}');
      currentApplication = application(body.status);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ application: currentApplication })
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'My Matches', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'My Matches' })).toBeVisible();
  await expect(page.getByText('Software Engineer – Query Engines')).toBeVisible();
  await expect(page.getByText('78%')).toBeVisible();
  await expect(page.getByText('unknown')).toBeVisible();
  await expect(page.getByText('✓ Verified live')).toBeVisible();
  await expect(page.getByText('Application: Not tracked')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prepare' })).toBeVisible();

  await page.getByRole('button', { name: 'View details' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const applyLink = page.getByRole('link', { name: 'Open original job' });
  await expect(applyLink).toHaveAttribute('href', match.job.applyUrl);

  await page.getByRole('button', { name: 'Close job details' }).click();
  await page.getByRole('button', { name: 'Prepare' }).click();

  await expect(page.getByRole('heading', { name: match.job.title })).toBeVisible();
  const statusSelect = page.getByRole('combobox');
  await expect(statusSelect).toHaveValue('saved');

  await statusSelect.selectOption('applied');
  await expect(statusSelect).toHaveValue('applied');

  await statusSelect.selectOption('interview');
  await expect(statusSelect).toHaveValue('interview');

  await page.reload();
  await page.getByRole('button', { name: 'Applications', exact: true }).click();
  await expect(page.getByText('Software Engineer – Query Engines')).toBeVisible();
  await expect(page.getByText('Interview')).toBeVisible();

  expect(createCount).toBe(1);
});
