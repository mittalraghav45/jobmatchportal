import { test, expect } from '@playwright/test';

test('frontend renders the JobMatch dashboard without a fatal render error', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByText('JobMatch could not render this page')).toHaveCount(0);
});
