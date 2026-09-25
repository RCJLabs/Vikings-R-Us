import { defineConfig } from '@playwright/test';

/*
 * The store capture (docs/tech-spec.md §37), against the Steam build (`pnpm build:electron-full` first).
 * Steam's shots are the desk as a 1280×720 window drawn at 1.5×, which is 1920×1080: the size Steam asks for,
 * with text big enough to read in its thumbnails. Google Play's phone shots are a 432×768 phone at 2.5×,
 * which is 1080×1920 (9:16).
 */
const URL = 'http://localhost:4175/';

export default defineConfig({
  testDir: '.',
  testMatch: 'capture.spec.ts',
  outputDir: '../../dist/store-results',
  fullyParallel: true,
  timeout: 180_000,
  reporter: 'list',
  use: { baseURL: URL, timezoneId: 'UTC', locale: 'en-GB' },
  webServer: {
    command: 'pnpm preview:electron-full',
    url: URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'steam', use: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 } },
    {
      name: 'phone',
      use: { viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true },
    },
  ],
});
