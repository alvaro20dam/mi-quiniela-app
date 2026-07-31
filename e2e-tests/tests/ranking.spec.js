const { test, expect } = require('@playwright/test');

/**
 * Suite E2E: Ranking / Clasificación
 * Cubre ranking.html — protección de ruta y estructura de la página.
 */

test.describe('Ranking — Estructura de página (con mock de API)', () => {

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

    // Simular respuesta del ranking
    await page.route('**/api/quinielas/ranking*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ranking: [
            { nombre: 'Ana García', email: 'ana@quiniela.com', puntos_totales: 42, total_quinielas: 5 },
            { nombre: 'Test User', email: 'test@quiniela.com', puntos_totales: 35, total_quinielas: 5 },
            { nombre: 'Carlos Ruiz', email: 'carlos@quiniela.com', puntos_totales: 28, total_quinielas: 4 },
            { nombre: 'María López', email: 'maria@quiniela.com', puntos_totales: 21, total_quinielas: 3 },
          ],
          mi_posicion: 2,
        }),
      });
    });

    await page.route('**/api/jornadas/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jornadas: [
            { id: 1, numero_jornada: 5, estado: 'Calculada', fecha_limite_envio: new Date().toISOString() },
            { id: 2, numero_jornada: 4, estado: 'Calculada', fecha_limite_envio: new Date().toISOString() },
          ],
        }),
      });
    });

    await page.goto('/ranking.html');
    await expect(page.locator('#user-avatar')).not.toHaveText('?', { timeout: 8000 });
  });

  test('Debe mostrar el título "Clasificación General"', async ({ page }) => {
    await expect(page.locator('h1.page-title')).toContainText('Clasificación General');
  });

  test('Debe mostrar el título correcto de la pestaña', async ({ page }) => {
    await expect(page).toHaveTitle(/Clasificación/i);
  });

  test('Las tarjetas de estadísticas deben estar presentes', async ({ page }) => {
    await expect(page.locator('#stat-participantes')).toBeVisible();
    await expect(page.locator('#stat-max-pts')).toBeVisible();
    await expect(page.locator('#stat-avg-pts')).toBeVisible();
    await expect(page.locator('#stat-my-pts')).toBeVisible();
  });

  test('La tabla de ranking debe renderizarse con filas de datos', async ({ page }) => {
    const tbody = page.locator('#ranking-tbody');
    await expect(tbody).toBeVisible();
    // Esperar a que aparezcan filas con datos (no el skeleton inicial)
    await expect(tbody.locator('tr')).toHaveCount(4, { timeout: 8000 });
  });

  test('La tabla debe mostrar el nombre del líder (Ana García)', async ({ page }) => {
    await expect(page.locator('#ranking-tbody')).toContainText('Ana García', { timeout: 8000 });
  });

  test('El filtro de jornada debe estar presente', async ({ page }) => {
    await expect(page.locator('#filter-jornada')).toBeVisible();
  });

  test('La sección de reglas de puntuación debe mostrar los 5 niveles de puntos', async ({ page }) => {
    // La sección de reglas está al final de la página dentro de .glass-card
    // Usamos exact: true para no confundir "5 pts" con "35 pts" de la tabla de ranking
    await expect(page.getByText('5 pts', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('4 pts', { exact: true })).toBeVisible();
    await expect(page.getByText('3 pts', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('1 pt', { exact: true })).toBeVisible();
    await expect(page.getByText('0 pts', { exact: true })).toBeVisible();
  });

  test('La nav inferior móvil debe tener activo el ítem de Ranking', async ({ page }) => {
    const rankingNavItem = page.locator('#bnav-ranking');
    await expect(rankingNavItem).toHaveClass(/active/);
  });

});
