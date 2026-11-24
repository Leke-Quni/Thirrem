import { expect, test } from '@playwright/test';

test('the built API starts against PostgreSQL and the browser can read its health check', async ({ page }) => {
  await page.goto('/health');
  await expect(page.locator('body')).toContainText('"status":"ok"');
  await expect(page.locator('body')).toContainText('"database":"up"');
});
