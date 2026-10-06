import { test, expect } from '@playwright/test';

const profileId = 'e2e-profile';
const job = {
  id: 'e2e-followup-job',
  title: 'Frontend Software Engineer',
  companyName: 'Example Sponsor Ltd',
  location: 'London, United Kingdom',
  applyUrl: 'https://example.test/jobs/frontend-engineer',
  status: { isLive: true },
  sponsorship: { status: 'verified' },
  skills: ['React', 'TypeScript']
};

function application(status = 'saved') {
  return {
    applicationId: 'e2e-followup-application',
    profileId,
    status,
    job,
    jobTitle: job.title,
    companyName: job.companyName,
    followUpAt: null,
    statusHistory: [{ status: 'saved', at: '2026-10-01T10:00:00.000Z' }]
  };
}

test('application review saves follow-up and records status transition', async ({ page }) => {
  let current = application();
  const requests = [];

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({ method: request.method(), path: url.pathname });

    if (url.pathname === '/api/jobs') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ jobs: [job], pagination: { page: 1, pages: 1, total: 1 } }) });
    }
    if (url.pathname === '/api/applications' && request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ applications: [current] }) });
    }
    if (url.pathname === '/api/profile/default') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ profile: { id: profileId, name: 'E2E Candidate', skills: ['React', 'TypeScript'] } }) });
    }
    if (url.pathname === '/api/companies/count') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 1 }) });
    }
    if (url.pathname === '/api/match/jobs') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ matches: [{ job, candidateScore: { score: 92, matchedSkills: ['React', 'TypeScript'], missingSkills: [] }, sponsorship: 'verified' }], page: 1, pages: 1, total: 1 }) });
    }
    if (url.pathname === '/api/match/jobs/e2e-followup-job/application' && request.method() === 'POST') {
      current = application('saved');
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(current) });
    }
    if (url.pathname === '/api/applications/e2e-followup-application/follow-up' && request.method() === 'PATCH') {
      const body = JSON.parse(request.postData() || '{}');
      current.followUpAt = body.followUpAt;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) });
    }
    if (url.pathname === '/api/applications/e2e-followup-application/status' && request.method() === 'PATCH') {
      const body = JSON.parse(request.postData() || '{}');
      current = { ...current, status: body.status, statusHistory: [...current.statusHistory, { status: body.status, at: '2026-10-06T10:00:00.000Z' }] };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'My Matches', exact: true }).click();
  await expect(page.getByText(job.title)).toBeVisible();
  await page.getByRole('button', { name: 'Prepare' }).click();

  const modal = page.locator('.application-modal');
  await expect(modal.getByRole('heading', { name: job.title })).toBeVisible();

  const followUp = modal.locator('input[type="datetime-local"]');
  await followUp.fill('2026-10-13T09:30');
  await modal.getByRole('button', { name: 'Save follow-up' }).click();
  await expect(modal.getByText('Follow-up saved')).toBeVisible();

  await modal.getByRole('combobox').selectOption('interview');
  await expect(modal.getByRole('combobox')).toHaveValue('interview');
  await expect(modal.getByText(/interview ·/i)).toBeVisible();

  expect(requests).toEqual(expect.arrayContaining([
    { method: 'PATCH', path: '/api/applications/e2e-followup-application/follow-up' },
    { method: 'PATCH', path: '/api/applications/e2e-followup-application/status' }
  ]));
});

test('jobs API failure remains a recoverable frontend state', async ({ page }) => {
  await page.route('**/api/jobs**', route =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Job service unavailable' }) })
  );
  await page.route('**/api/applications**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applications: [] }) })
  );
  await page.route('**/api/companies/count', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 0 }) })
  );
  await page.route('**/api/profile/default', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: { id: 'default', name: 'Candidate', skills: [] } }) })
  );

  await page.goto('/');
  await expect(page.getByText('Job service unavailable')).toBeVisible();
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByText('JobMatch could not render this page')).toHaveCount(0);
});
