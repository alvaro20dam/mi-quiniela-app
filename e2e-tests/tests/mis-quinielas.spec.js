const { test, expect } = require('@playwright/test');

/**
 * Suite E2E: Mis Quinielas (historial personal)
 * Cubre mis-quinielas.html — protección y estructura.
 */

test.describe('Mis Quinielas — Estructura de página (con mock de API)', () => {

  test.beforeEach(async ({ page }) => {
    // Simular sesión activa
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-uuid-123',
          nombre: 'Test User',
          email: 'test@quiniela.com',
          rol: 'Cliente',
          suscripcion_activa: true,
        }),
      });
    });

    // Simular historial de quinielas del usuario
    await page.route('**/api/quinielas/mis-quinielas*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          quinielas: [
            {
              id: 'q-uuid-1',
              numero_jornada: 4,
              puntos_totales: 18,
              fecha_registro: new Date(Date.now() - 7 * 86400000).toISOString(),
              pronosticos: [
                { equipo_local: 'Real Madrid CF', equipo_visitante: 'FC Barcelona', goles_local: 2, goles_visitante: 1, puntos: 5 },
                { equipo_local: 'Atlético de Madrid', equipo_visitante: 'Sevilla FC', goles_local: 1, goles_visitante: 1, puntos: 3 },
              ],
            },
            {
              id: 'q-uuid-2',
              numero_jornada: 3,
              puntos_totales: 12,
              fecha_registro: new Date(Date.now() - 14 * 86400000).toISOString(),
              pronosticos: [],
            },
          ],
        }),
      });
    });

    await page.goto('/mis-quinielas.html');
    await expect(page.locator('#user-avatar')).not.toHaveText('?', { timeout: 8000 });
  });

  test('Debe tener el título correcto de pestaña', async ({ page }) => {
    await expect(page).toHaveTitle(/Historial/i);
  });

  test('Debe mostrar el encabezado "Mi Historial de Quinielas"', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Mi Historial de Quinielas');
  });

  test('Debe mostrar el badge de total de puntos históricos', async ({ page }) => {
    await expect(page.locator('#total-puntos-badge')).toBeVisible();
  });

  test('El badge de puntos históricos debe mostrar el total acumulado', async ({ page }) => {
    // 18 + 12 = 30 pts
    await expect(page.locator('#total-puntos-badge')).toContainText('30', { timeout: 8000 });
  });

  test('Debe renderizar 2 tarjetas de quiniela en el historial', async ({ page }) => {
    await expect(page.locator('#history-grid .glass-card, #history-grid > div')).toHaveCount(2, { timeout: 8000 });
  });

  test('Las tarjetas del historial deben mostrar el número de jornada', async ({ page }) => {
    await expect(page.locator('#history-grid')).toContainText('Jornada 4', { timeout: 8000 });
    await expect(page.locator('#history-grid')).toContainText('Jornada 3', { timeout: 8000 });
  });

  test('Debe mostrar el botón de logout', async ({ page }) => {
    await expect(page.locator('#btn-logout')).toBeVisible();
  });

  test('La navegación inferior debe marcar como activo "Mis Q."', async ({ page }) => {
    await expect(page.locator('#bnav-mis')).toHaveClass(/active/);
  });

});

test.describe('Mis Quinielas — Sin quinielas enviadas', () => {

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-uuid-new',
          nombre: 'Nuevo Usuario',
          email: 'nuevo@quiniela.com',
          rol: 'Cliente',
          suscripcion_activa: false,
        }),
      });
    });

    await page.route('**/api/quinielas/mis-quinielas*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ quinielas: [] }),
      });
    });

    await page.goto('/mis-quinielas.html');
    await expect(page.locator('#user-avatar')).not.toHaveText('?', { timeout: 8000 });
  });

  test('El badge de puntos debe mostrar 0 pts cuando no hay historial', async ({ page }) => {
    await expect(page.locator('#total-puntos-badge')).toContainText('0', { timeout: 8000 });
  });

  test('El grid de historial no debe mostrar tarjetas de jornada cuando no hay historial', async ({ page }) => {
    const historyGrid = page.locator('#history-grid');
    // Esperar a que mis-quinielas.js procese la respuesta vacía
    await page.waitForTimeout(1500);
    // No debe haber ninguna tarjeta con datos de jornada
    const jornada4 = historyGrid.locator('text=Jornada 4');
    const jornada3 = historyGrid.locator('text=Jornada 3');
    await expect(jornada4).toHaveCount(0);
    await expect(jornada3).toHaveCount(0);
  });

});
