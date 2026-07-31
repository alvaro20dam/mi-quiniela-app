const { test, expect } = require('@playwright/test');

/**
 * Suite E2E: Dashboard (Panel principal de pronósticos)
 * Cubre dashboard.html — acceso, estructura y flujo de uso.
 */

test.describe('Dashboard — Protección de ruta', () => {

  test('Debe redirigir a login si el usuario NO está autenticado', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForURL(/.*index\.html/, { timeout: 15000 });
    await expect(page).toHaveURL(/.*index\.html/);
  });

  test('Debe redirigir a login si se accede a mis-quinielas.html sin sesión', async ({ page }) => {
    await page.goto('/mis-quinielas.html');
    await page.waitForURL(/.*index\.html/, { timeout: 15000 });
    await expect(page).toHaveURL(/.*index\.html/);
  });

  test('Debe redirigir a login si se accede a ranking.html sin sesión', async ({ page }) => {
    await page.goto('/ranking.html');
    await page.waitForURL(/.*index\.html/, { timeout: 15000 });
    await expect(page).toHaveURL(/.*index\.html/);
  });

});

test.describe('Dashboard — Estructura estática (sin sesión interceptada)', () => {
  /**
   * Estos tests verifican la estructura HTML del dashboard SIN requerir
   * autenticación. Usamos `page.route` para interceptar la llamada a /api/auth/me
   * y simular una sesión activa, evitando el redirect.
   */

  test.beforeEach(async ({ page }) => {
    // Interceptar /api/auth/me para simular usuario autenticado
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

    // Interceptar /api/jornadas/actual para simular jornada activa
    await page.route('**/api/jornadas/actual', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jornada: {
            id: 1,
            numero_jornada: 5,
            fecha_limite_envio: new Date(Date.now() + 86400000).toISOString(),
            estado: 'Abierta',
            total_partidos: 2,
          },
          partidos: [
            {
              id: 'partido-uuid-1',
              equipo_local: 'Real Madrid CF',
              equipo_visitante: 'FC Barcelona',
              fecha_partido: new Date(Date.now() + 86400000).toISOString(),
              estado: 'Programado',
            },
            {
              id: 'partido-uuid-2',
              equipo_local: 'Atlético de Madrid',
              equipo_visitante: 'Sevilla FC',
              fecha_partido: new Date(Date.now() + 86400000 + 3600000).toISOString(),
              estado: 'Programado',
            },
          ],
        }),
      });
    });

    // Interceptar /api/quinielas/mi-quiniela para simular que no hay quiniela enviada aún
    await page.route('**/api/quinielas/mi-quiniela*', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'No has enviado quiniela para esta jornada.' }),
      });
    });

    await page.goto('/dashboard.html');
    // Esperar que el header se cargue (indicador de que auth.js procesó la respuesta)
    await expect(page.locator('#user-avatar')).not.toHaveText('?', { timeout: 8000 });
  });

  test('Debe mostrar el título de la app en el header', async ({ page }) => {
    await expect(page.locator('.header-logo')).toBeVisible();
  });

  test('Debe mostrar los 3 enlaces de navegación principal', async ({ page }) => {
    const navLinks = page.locator('.header-nav .nav-link');
    await expect(navLinks).toHaveCount(3);
  });

  test('El avatar del usuario debe mostrar la inicial del nombre', async ({ page }) => {
    await expect(page.locator('#user-avatar')).toHaveText('T');
  });

  test('Debe mostrar el botón de cerrar sesión', async ({ page }) => {
    await expect(page.locator('#btn-logout')).toBeVisible();
  });

  test('Debe mostrar la sección de matches-grid', async ({ page }) => {
    await expect(page.locator('#matches-grid')).toBeVisible();
  });

  test('Debe renderizar las tarjetas de los 2 partidos de la jornada simulada', async ({ page }) => {
    // Las tarjetas se renderizan dinámicamente por dashboard.js
    const matchCards = page.locator('.match-card');
    await expect(matchCards).toHaveCount(2, { timeout: 8000 });
  });

  test('Las tarjetas de partido deben mostrar los nombres de los equipos', async ({ page }) => {
    await expect(page.locator('.match-card').first()).toContainText('Real Madrid');
    await expect(page.locator('.match-card').first()).toContainText('FC Barcelona');
  });

  test('Los controles de goles (+/-) deben estar presentes en los partidos', async ({ page }) => {
    const scoreCounters = page.locator('.score-counter');
    // 2 partidos × 2 equipos = 4 contadores
    await expect(scoreCounters).toHaveCount(4, { timeout: 8000 });
  });

  test('El botón de Enviar Quiniela debe ser visible', async ({ page }) => {
    await expect(page.locator('#btn-submit-quiniela')).toBeVisible();
  });

  test('La barra de progreso debe iniciar mostrando el contador de partidos', async ({ page }) => {
    // El texto de progreso muestra 0/N donde N es el total de partidos de la jornada.
    // Inicialmente puede estar en 0/0 y actualizarse a 0/2 cuando carga la jornada.
    await expect(page.locator('#submit-progress-text')).toContainText('0/', { timeout: 8000 });
  });

  test('El sidebar debe mostrar las reglas de puntuación', async ({ page }) => {
    await expect(page.locator('.sidebar')).toContainText('5 pts');
    await expect(page.locator('.sidebar')).toContainText('3 pts');
  });

  test('La navegación móvil inferior debe estar presente (en viewport móvil)', async ({ page }) => {
    // La bottom-nav se oculta en desktop via CSS media query (max-width:1023px)
    // Redimensionamos a móvil para este test.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await expect(page.locator('#bnav-dashboard')).toBeVisible();
    await expect(page.locator('#bnav-ranking')).toBeVisible();
  });

  test('Incrementar goles de un equipo debe actualizar el contador a 1', async ({ page }) => {
    // El botón de incremento es el "+" de la primera tarjeta
    const firstPlusBtn = page.locator('.match-card').first().locator('.score-counter').first().locator('[data-action="increment"], button').last();
    const counterValue = page.locator('.match-card').first().locator('.score-counter').first().locator('.counter-value');
    
    await firstPlusBtn.click();
    await expect(counterValue).toHaveText('1');
  });

  test('Hacer clic en el botón Salir debe redirigir al login', async ({ page }) => {
    // Interceptar la llamada al logout
    await page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Sesión cerrada correctamente.' }),
      });
    });

    await page.locator('#btn-logout').click();
    await page.waitForURL(/.*index\.html/, { timeout: 8000 });
    await expect(page).toHaveURL(/.*index\.html/);
  });

});
