import { expect, test } from '@playwright/test';

test('web demo boots with demo content only', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('./');
  await expect(page).toHaveTitle('Chooser of the Slain');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chooser of the Slain');
  await expect(page.getByTestId('target')).toHaveText('web-demo');
  await expect(page.getByTestId('edition')).toHaveText('demo');
  await expect(page.getByTestId('packs')).toHaveText('core · daily · demo');
  await expect(page.getByTestId('daily')).toHaveText(/Daily #\d+/);
  await expect(page.getByTestId('layout')).toHaveText(testInfo.project.name === 'phone' ? 'drawer' : 'desk');

  // No missing string keys, no campaign content, no Case Lab.
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('⟦');
  expect(body).not.toContain('Case Lab');
  expect(errors).toEqual([]);
});

test('web demo ships a PWA manifest', async ({ request }) => {
  const res = await request.get('manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.short_name).toBe('Chooser');
  expect(manifest.scope).toBe('/Vikings-R-Us/');
});
