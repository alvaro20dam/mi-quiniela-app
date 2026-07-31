const { test, expect } = require('@playwright/test');

/**
 * Suite E2E: Flujos de Navegación entre páginas
 * Verifica que los enlaces de navegación funcionan correctamente
 * cuando el usuario está autenticado (con API mockeada).
 */

/** Helper: configura los mocks de autenticación y datos básicos */
async function setupAuthMocks(page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'nav-test-uuid',
        nombre: 'Nav Test User',
        email: 'nav@quiniela.com',
        rol: 'Cliente',
        suscripcion_activa: true,
      }),
    });
  });

  await page.route('**/api/jornadas/actual', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'No hay jornada abierta.' }),
    });
  });

  await page.route('**/api/jornadas/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jornadas: [] }),
    });
  });

  await page.route('**/api/quinielas/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ quinielas: [], ranking: [] }),
    });
  });
}

test.describe('Navegación entre páginas (usuario autenticado)', () => {

  test('Desde dashboard, el link "Mis Quinielas" lleva a mis-quinielas.html', async ({ page }) => {
    await setupAuthMocks(page);
    await page.goto('/dashboard.html');
    await expect(page.locator('#user-avatar')).not.toHaveText('?', { timeout: 8000 });

    await page.locator('.header-nav a[href="mis-quinielas.html"]').click();
    await expect(page).toHaveURL(/mis-quinielas\.html/);
  });

  test('Desde dashboard, el link "Clasificación" lleva a ranking.html', async ({ page }) => {
    await setupAuthMocks(page);
    await page.goto('/dashboard.html');
    await expect(page.locator('#user-avatar')).not.toHaveText('?', { timeout: 8000 });

    await page.locator('.header-nav a[href="ranking.html"]').click();
    await expect(page).toHaveURL(/ranking\.html/);
  });

  test('Desde ranking, el link "Mi Quiniela" regresa al dashboard', async ({ page }) => {
    await setupAuthMocks(page);
    await page.goto('/ranking.html');
    await expect(page.locator('#user-avatar')).not.toHaveText('?', { timeout: 8000 });

    await page.locator('.header-nav a[href="dashboard.html"]').click();
    await expect(page).toHaveURL(/dashboard\.html/);
  });

  test('El logo en cualquier página lleva de vuelta al dashboard', async ({ page }) => {
    await setupAuthMocks(page);
    await page.goto('/ranking.html');
    await expect(page.locator('#user-avatar')).not.toHaveText('?', { timeout: 8000 });

    await page.locator('.header-logo').click();
    await expect(page).toHaveURL(/dashboard\.html/);
  });

  test('La navegación inferior en dashboard lleva a ranking.html', async ({ page }) => {
    await setupAuthMocks(page);
    await page.goto('/dashboard.html');
    await expect(page.locator('#user-avatar')).not.toHaveText('?', { timeout: 8000 });
    // La bottom-nav está oculta en desktop; forzamos viewport móvil
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#bnav-ranking').click();
    await expect(page).toHaveURL(/ranking\.html/);
  });

  test('La navegación inferior en ranking lleva a mis-quinielas.html', async ({ page }) => {
    await setupAuthMocks(page);
    await page.goto('/ranking.html');
    await expect(page.locator('#user-avatar')).not.toHaveText('?', { timeout: 8000 });
    // La bottom-nav está oculta en desktop; forzamos viewport móvil
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#bnav-mis').click();
    await expect(page).toHaveURL(/mis-quinielas\.html/);
  });

});

test.describe('Accesibilidad básica', () => {

  test('La página de login tiene aria-labels en el formulario', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('[role="tablist"]')).toBeVisible();
    await expect(page.locator('#login-email')).toHaveAttribute('autocomplete', 'email');
    await expect(page.locator('#login-password')).toHaveAttribute('autocomplete', 'current-password');
  });

  test('El toast-container existe en la página de login', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#toast-container')).toBeAttached();
  });

  test('La página de login tiene role=tabpanel en las secciones', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#section-login')).toHaveAttribute('role', 'tabpanel');
    await expect(page.locator('#section-register')).toHaveAttribute('role', 'tabpanel');
  });

  test('El botón de login tiene type=submit', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#btn-login')).toHaveAttribute('type', 'submit');
  });

  test('El campo de contraseña tiene minlength=8 en el registro', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#reg-password')).toHaveAttribute('minlength', '8');
  });

});
