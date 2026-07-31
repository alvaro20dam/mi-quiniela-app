const { test, expect } = require('@playwright/test');

/**
 * Suite E2E: Autenticación
 * Cubre la página index.html (login/registro).
 * Los tests de UI no necesitan backend — solo verifican la interfaz.
 * Los tests de integración (*_api) sí usan el backend y requieren
 * la variable de entorno PLAYWRIGHT_BASE_URL apuntando al frontend en Vercel.
 */

test.describe('Auth — Página de Login', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  // ── Estructura visual ──────────────────────────────────────────────────────

  test('Debe cargar la página con título correcto', async ({ page }) => {
    await expect(page).toHaveTitle(/Iniciar Sesión/i);
  });

  test('Debe mostrar el logo y el nombre de la app', async ({ page }) => {
    await expect(page.locator('h1.auth-title')).toContainText('Quinielas');
  });

  test('Debe mostrar los tabs de Login y Registro', async ({ page }) => {
    await expect(page.locator('#tab-login')).toBeVisible();
    await expect(page.locator('#tab-register')).toBeVisible();
  });

  test('Debe mostrar el formulario de Login por defecto', async ({ page }) => {
    await expect(page.locator('#section-login')).toBeVisible();
    await expect(page.locator('#section-register')).toBeHidden();
  });

  test('Debe mostrar los campos de email, contraseña y el botón de Login', async ({ page }) => {
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.locator('#btn-login')).toBeVisible();
  });

  // ── Interacción de tabs ────────────────────────────────────────────────────

  test('Al hacer clic en Registrarse debe mostrar el formulario de registro', async ({ page }) => {
    await page.locator('#tab-register').click();
    await expect(page.locator('#section-register')).toBeVisible();
    await expect(page.locator('#section-login')).toBeHidden();
  });

  test('El formulario de registro debe tener todos sus campos', async ({ page }) => {
    await page.locator('#tab-register').click();
    await expect(page.locator('#reg-nombre')).toBeVisible();
    await expect(page.locator('#reg-email')).toBeVisible();
    await expect(page.locator('#reg-password')).toBeVisible();
    await expect(page.locator('#reg-password2')).toBeVisible();
    await expect(page.locator('#btn-register')).toBeVisible();
  });

  test('Volver al tab de Login desde Registro debe funcionar', async ({ page }) => {
    await page.locator('#tab-register').click();
    await page.locator('#tab-login').click();
    await expect(page.locator('#section-login')).toBeVisible();
    await expect(page.locator('#section-register')).toBeHidden();
  });

  // ── Validaciones de UI (sin backend) ──────────────────────────────────────

  test('El botón de mostrar/ocultar contraseña debe existir en el login', async ({ page }) => {
    const toggle = page.locator('[data-toggle-password="login-password"]');
    await expect(toggle).toBeVisible();
  });

  test('Hacer clic en el toggle de contraseña debe cambiar el tipo del input', async ({ page }) => {
    const passwordInput = page.locator('#login-password');
    const toggle = page.locator('[data-toggle-password="login-password"]');

    await expect(passwordInput).toHaveAttribute('type', 'password');
    await toggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await toggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('Las features del servicio deben mostrarse en la sección de login', async ({ page }) => {
    await expect(page.locator('.features-list')).toBeVisible();
    await expect(page.locator('.feature-item')).toHaveCount(3);
  });

  // ── Validación de campos vacíos (UI) ──────────────────────────────────────

  test('Intentar hacer login con campos vacíos no debe navegar', async ({ page }) => {
    await page.locator('#btn-login').click();
    // El formulario tiene `novalidate` pero el JS de auth.js valida y muestra alerta
    // La URL debe seguir siendo index.html
    await expect(page).toHaveURL(/index\.html/);
  });

  test('Intentar registrar con contraseña corta debe mostrar alerta de error', async ({ page }) => {
    await page.locator('#tab-register').click();
    await page.locator('#reg-nombre').fill('Test User');
    await page.locator('#reg-email').fill('test@test.com');
    await page.locator('#reg-password').fill('123');      // < 8 chars
    await page.locator('#reg-password2').fill('123');
    await page.locator('#btn-register').click();
    // Debe aparecer un alert de error
    await expect(page.locator('#register-alert')).not.toBeEmpty();
  });

  test('Intentar registrar con contraseñas diferentes debe mostrar alerta', async ({ page }) => {
    await page.locator('#tab-register').click();
    await page.locator('#reg-nombre').fill('Test User');
    await page.locator('#reg-email').fill('test@test.com');
    await page.locator('#reg-password').fill('Contrasena1!');
    await page.locator('#reg-password2').fill('Diferente2!');
    await page.locator('#btn-register').click();
    await expect(page.locator('#register-alert')).not.toBeEmpty();
  });

});
