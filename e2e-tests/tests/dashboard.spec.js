const { test, expect } = require('@playwright/test');

test.describe('Dashboard Flow', () => {
  test('should redirect to login if not authenticated', async ({ page }) => {
    await page.goto('/dashboard.html');
    // Como no estamos logueados, el frontend debería mandarnos de vuelta al index (login)
    await expect(page).toHaveURL(/.*index\.html/);
  });
});
