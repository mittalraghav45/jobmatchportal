import { test, expect } from '@playwright/test';

const matchesResponse = {
  matches: [
    {
      job: {
        id: 'e2e-job-1',
        title: 'Frontend Software Engineer',
        companyName: 'E2E Technology',
        location: 'London',
        nation: 'England',
        ats: 'greenhouse',
        applicationUrl: 'https://example.com/apply',
        closingAt: '2026-10-15T23:59:59.000Z',
        liveState: 'live',
        isLive: true,
      },
      sponsorship: 'verified',
      candidateScore: {
        score: 92,
        matchedSkills: ['React', 'TypeScript'],
      },
    },
  ],
};

async function openMyMatches(page) {
  await page.goto('/');
  const nav = page.getByRole('button', { name: 'My Matches' });
  await expect(nav).toBeVisible();
  await nav.click();
  await expect(page.getByRole('heading', { name: 'My Matches' })).toBeVisible();
}

test.describe('My Matches browser flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/match/jobs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(matchesResponse),
      });
    });
  });

  test('sidebar exposes My Matches and the page renders the ranked job card', async ({ page }) => {
    await openMyMatches(page);

    await expect(page.getByText('Frontend Software Engineer')).toBeVisible();
    await expect(page.getByText('E2E Technology')).toBeVisible();
    await expect(page.getByText('London · England')).toBeVisible();
    await expect(page.getByText('ATS: greenhouse')).toBeVisible();
    await expect(page.getByText('Sponsorship: verified')).toBeVisible();
    await expect(page.getByText('React')).toBeVisible();
    await expect(page.getByText('TypeScript')).toBeVisible();
    await expect(page.getByText('Live')).toBeVisible();
    await expect(page.getByText('Closes: 15 Oct 2026')).toBeVisible();
    await expect(page.getByLabel('92% match')).toBeVisible();
  });

  test('uses the ATS application URL from the matching response', async ({ page }) => {
    await openMyMatches(page);

    const applyLink = page.getByRole('link', { name: 'Apply' });
    await expect(applyLink).toHaveAttribute('href', 'https://example.com/apply');
    await expect(applyLink).toHaveAttribute('target', '_blank');
  });

  test('shows an API error instead of crashing the page', async ({ page }) => {
    await page.unroute('**/api/match/jobs');
    await page.route('**/api/match/jobs', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await openMyMatches(page);
    await expect(page.getByText('Matching API returned 500')).toBeVisible();
  });

  test('shows the empty state when no matches are returned', async ({ page }) => {
    await page.unroute('**/api/match/jobs');
    await page.route('**/api/match/jobs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ matches: [] }),
      });
    });

    await openMyMatches(page);
    await expect(page.getByText('No matches were returned for this profile.')).toBeVisible();
  });
});
