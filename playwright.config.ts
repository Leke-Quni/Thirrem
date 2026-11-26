import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  projects: [
    { name: 'api', testMatch: 'smoke.spec.ts', use: { baseURL: 'http://localhost:3100' } },
    { name: 'rider', testMatch: 'rider.spec.ts', use: { baseURL: 'http://localhost:5173' } },
  ],
  webServer: [
    {
      command: 'yarn workspace @thirrem/api build && yarn workspace @thirrem/api migrate && yarn workspace @thirrem/api start',
      url: 'http://localhost:3100/health',
      env: { PORT: '3100', AUTH_RATE_LIMIT: '10000', OSRM_URL: 'http://127.0.0.1:1' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'yarn workspace @thirrem/rider dev --port 5173 --strictPort',
      url: 'http://localhost:5173',
      env: { API_URL: 'http://localhost:3100' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
