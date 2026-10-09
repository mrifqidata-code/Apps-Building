import { expect, test } from '@playwright/test';
import { signIn, waitForOfflineReady } from './helpers';

test('menampilkan toko demo dengan 15 produk dalam 3 kategori', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/masuk$/);
  await signIn(page, 'Pemilik');

  await expect(page.getByRole('heading', { name: 'Kedai Kopi Senja (Demo)' })).toBeVisible();
  const products = page.getByRole('list', { name: 'Produk' }).getByRole('listitem');
  await expect(products).toHaveCount(15);
  // "Semua" follows category order: Kopi first, Makanan last.
  await expect(products.first()).toContainText('Espresso');
  await expect(products.first()).toContainText('Rp15.000');
  await expect(products.last()).toContainText('Croissant Butter');

  const categories = page.getByRole('navigation', { name: 'Kategori' }).getByRole('button');
  await expect(categories).toHaveText(['Semua', 'Kopi', 'Non-Kopi', 'Makanan']);

  await page.getByRole('button', { name: 'Makanan' }).click();
  await expect(products).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Makanan' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('tetap bisa dibuka tanpa internet setelah kunjungan pertama', async ({ page, context }) => {
  await page.goto('/');
  await signIn(page, 'Pemilik');
  await waitForOfflineReady(page);

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Kedai Kopi Senja (Demo)' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Produk' }).getByRole('listitem')).toHaveCount(15);
  await expect(page.getByTestId('status-koneksi')).toHaveText('Offline');
});

test('manifest memenuhi syarat agar bisa dipasang di layar utama', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();

  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of manifest.icons as { src: string }[]) {
    const iconResponse = await request.get(`/${icon.src}`);
    expect(iconResponse.ok(), icon.src).toBe(true);
    expect(iconResponse.headers()['content-type']).toBe('image/png');
  }
});
