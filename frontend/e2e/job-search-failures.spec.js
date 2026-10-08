import { test, expect } from '@playwright/test';
test('failed job requests show a retryable error and never fictional jobs', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Test outage' }) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Jobs', exact: true }).click();
  await expect(page.locator('article.job')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No jobs to display' })).toBeVisible();
  await expect(page.getByText('0 matching jobs', { exact: true })).toBeVisible();
  await expect(page.getByText(/Monzo|Deliveroo|Wise/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('Test outage');
});
