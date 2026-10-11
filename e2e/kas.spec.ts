import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openCart, payButton, product, signIn, signOut } from './helpers';

/** Sells the products for exact cash and goes back to the kasir screen. */
async function sellCash(page: Page, names: string[], discount?: string) {
  for (const name of names) await product(page, name).click();
  if (discount) {
    const cart = await openCart(page);
    await cart.getByRole('button', { name: '+ Diskon transaksi' }).click();
    const dialog = page.getByRole('dialog', { name: 'Diskon transaksi' });
    await dialog.getByLabel('Nominal diskon').fill(discount);
    await dialog.getByRole('button', { name: 'Terapkan' }).click();
    await cart.getByRole('button', { name: /^Bayar ·/ }).click();
  } else {
    await payButton(page).click();
  }
  await page.getByRole('button', { name: 'Uang pas' }).click();
  await page.getByRole('button', { name: 'Selesaikan' }).click();
  await expect(page.getByText('Transaksi berhasil disimpan')).toBeVisible();
  await page.getByRole('button', { name: 'Transaksi baru' }).click();
}

test('buka kasir, kas keluar, lalu tutup kasir dengan menghitung uang dulu', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Kasir', '1234', { openDrawer: false });

  // No selling before the drawer is opened.
  const open = page.getByRole('region', { name: 'Buka kasir' });
  await expect(open).toBeVisible();
  await expect(page.getByRole('list', { name: 'Produk' })).toBeHidden();
  await open.getByRole('button', { name: 'Rp200.000', exact: true }).click();
  await open.getByRole('button', { name: 'Buka kasir', exact: true }).click();

  await sellCash(page, ['Espresso']); // 15.000
  await sellCash(page, ['Americano']); // 18.000

  await page.getByRole('link', { name: 'Kas', exact: true }).click();
  const drawer = page.getByRole('region', { name: 'Kasir sedang buka' });
  await expect(drawer).toContainText('Rp200.000');
  // The cashier does not see what the drawer should hold.
  await expect(drawer).not.toContainText('Seharusnya');

  await drawer.getByRole('button', { name: /Kas keluar/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Kas keluar' });
  await sheet.getByLabel('Jumlah').fill('10000');
  await sheet.getByPlaceholder('Misalnya: beli es batu').fill('Beli es batu');
  await sheet.getByRole('button', { name: 'Simpan kas keluar' }).click();
  const movements = page.getByRole('region', { name: 'Kas masuk dan keluar' });
  await expect(movements).toContainText('Beli es batu');
  await expect(movements).toContainText('−Rp10.000');

  await drawer.getByRole('link', { name: 'Tutup kasir' }).click();
  // 200.000 + 15.000 + 18.000 - 10.000 = 223.000, not shown before counting.
  await expect(page.getByRole('main')).not.toContainText('223.000');
  await page.getByLabel('Uang fisik di laci').fill('220000');
  await page.getByRole('button', { name: 'Simpan dan tutup kasir' }).click();
  await page
    .getByRole('dialog', { name: 'Tutup kasir?' })
    .getByRole('button', { name: 'Ya, tutup kasir' })
    .click();

  await expect(page.getByText('Kasir sudah ditutup')).toBeVisible();
  await expect(page.getByTestId('selisih-kas')).toContainText('Kurang Rp3.000');
  await expect(page.getByTestId('selisih-kas')).toContainText('Seharusnya Rp223.000');
  const cash = page.getByRole('region', { name: 'Uang tunai' });
  await expect(cash).toContainText('Penjualan tunai');
  await expect(cash).toContainText('Rp33.000');
  const href = (await page.getByRole('link', { name: 'Kirim ke WhatsApp' }).getAttribute('href'))!;
  const text = decodeURIComponent(href.split('text=')[1]!);
  expect(text).toContain('Selisih: Kurang Rp3.000');
  expect(text).toContain('- Kas keluar Rp10.000: Beli es batu');

  // Selling again needs a new shift.
  await page.getByRole('link', { name: 'Selesai' }).click();
  await expect(page.getByRole('region', { name: 'Buka kasir' })).toBeVisible();
  await page.getByRole('link', { name: 'Kas', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Riwayat tutup kasir' })).toContainText(
    'Kurang Rp3.000',
  );
});

test('pemilik melihat laporan, laba kotor, jam ramai, dan mengekspor CSV', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Pemilik');

  // 2 Espresso + Pisang Goreng = 45.000 (HPP 15.000), minus Rp4.500 transaction discount.
  await sellCash(page, ['Espresso', 'Espresso', 'Pisang Goreng'], '4500');

  await page.getByRole('link', { name: 'Kas', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Kasir sedang buka' })).toContainText(
    'Seharusnya di laci sekarangRp40.500',
  );

  await page.getByRole('link', { name: 'Laporan' }).click();
  await expect(page.getByTestId('penjualan-bersih')).toHaveText('Rp40.500');
  // HPP 15.000; the discount lowers the profit too.
  await expect(page.getByTestId('laba-kotor')).toHaveText('Rp25.500');
  await expect(page.getByText('Margin 62,96%', { exact: true })).toBeVisible();
  await expect(page.getByTestId('jumlah-transaksi')).toHaveText('1');
  await expect(page.getByTestId('jam-ramai')).toContainText('Paling ramai');
  await expect(page.getByTestId('jam-ramai')).toContainText('1 transaksi');

  // The discount is spread over the products: 27.000 and 13.500.
  const products = page.getByRole('region', { name: 'Per produk' });
  await expect(products.getByRole('row', { name: /Espresso/ })).toContainText('Rp27.000');
  await expect(products.getByRole('row', { name: /Espresso/ })).toContainText('Rp17.000');
  await expect(products.getByRole('row', { name: /Pisang Goreng/ })).toContainText('Rp13.500');
  await expect(page.getByRole('region', { name: 'Rekap tutup kasir' })).toContainText('Masih buka');

  const exports = page.getByRole('region', { name: 'Ekspor CSV' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exports.getByRole('button', { name: 'Per produk' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^reqap-produk-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv.startsWith('﻿Produk,Qty terjual,')).toBe(true);
  expect(csv).toContain('Espresso,2,30000,27000,10000,17000\r\n');
  expect(csv).toContain('Pisang Goreng,1,15000,13500,5000,8500\r\n');

  const [transactions] = await Promise.all([
    page.waitForEvent('download'),
    exports.getByRole('button', { name: 'Transaksi' }).click(),
  ]);
  const rows = (await readFile((await transactions.path())!, 'utf8')).trim().split('\r\n');
  expect(rows).toHaveLength(2);
  expect(rows[1]).toMatch(/,K1-\d{6}-0001,K1,Pemilik,Lunas,Tunai,45000,4500,40500,0,0,40500,/);

  // The week and month include today's sale too.
  await page.getByRole('button', { name: 'Mingguan' }).click();
  await expect(page.getByTestId('periode')).toContainText('–');
  await expect(page.getByTestId('penjualan-bersih')).toHaveText('Rp40.500');
  await expect(page.getByRole('region', { name: 'Per hari' })).toBeVisible();
  await page.getByRole('button', { name: 'Periode sebelumnya' }).click();
  await expect(page.getByTestId('penjualan-bersih')).toHaveText('Rp0');
  await page.getByRole('button', { name: 'Bulanan' }).click();
  await expect(page.getByTestId('jumlah-transaksi')).toHaveText('1');
});

test('kasir tidak bisa membuka laporan', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Kasir');
  await expect(page.getByRole('link', { name: 'Laporan' })).toHaveCount(0);
  await page.goto('/laporan');
  await expect(page.getByText('Khusus pemilik')).toBeVisible();
  await page.goto('/');
  await signOut(page);
});
