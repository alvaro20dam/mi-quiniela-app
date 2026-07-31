const { test, expect } = require('@playwright/test');

test.describe('Auth Flow', () => {
  test('should load the login page and show the login form', async ({ page }) => {
    // Va al index (login por defecto)
    await page.goto('/index.html');
    
    // Verifica que el título de la página o encabezado sea correcto
    await expect(page).toHaveTitle(/Mi Quiniela/i);
    
    // Verifica que el botón de login esté presente
    const loginButton = page.locator('button:has-text("Entrar")');
    await expect(loginButton).toBeVisible();
  });
});
