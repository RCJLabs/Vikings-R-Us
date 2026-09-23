import { defineConfig } from '@playwright/test';

const BASE = 'http://localhost:4173/Vikings-R-Us/';

// Smoke tests against the real web-demo build (run `pnpm build:web-demo` first).
export default defineConfig({
  testDir: '.',
  outputDir: './results',
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: './report', open: 'never' }]] : 'list',
  use: { baseURL: BASE },
  webServer: {
    command: 'pnpm preview:web-demo',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'phone',
      use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    { name: 'desktop', use: { viewport: { width: 1920, height: 1080 } } },
  ],
});
