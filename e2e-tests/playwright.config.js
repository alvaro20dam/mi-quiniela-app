const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: 'html',

  // Levanta el servidor de frontend automáticamente antes de los tests
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'python -m http.server 8000',
    cwd: path.join(__dirname, '..', 'frontend'),
    url: 'http://localhost:8000',
    reuseExistingServer: true, // Si ya está corriendo, lo reutiliza
    timeout: 15000,
  },

  use: {
    // En CI o cuando se apunta a Vercel, usa PLAYWRIGHT_BASE_URL
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8000',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ],
});
