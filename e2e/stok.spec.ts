import { expect, test, type Page } from '@playwright/test';
import { payButton, product, signIn, signOut } from './helpers';

const menu = (page: Page, name: string | RegExp) =>
  page
    .getByRole('navigation', { name: 'Menu utama' })
    .getByRole('link', { name, exact: typeof name === 'string' });

test('pemilik melacak stok, kasir mencatat stok masuk, pemilik opname', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Pemilik');

  // Turn on stock tracking for Pisang Goreng with 5 on hand, low at 2.
  await menu(page, 'Produk').click();
  await page.getByRole('link', { name: /Pisang Goreng/ }).click();
  const stock = page.getByRole('region', { name: 'Stok' });
  await stock.getByRole('checkbox', { name: /Lacak stok/ }).check();
  await stock.getByLabel('Stok sekarang').fill('5');
  await stock.getByLabel('Batas stok menipis').fill('2');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByRole('link', { name: /Pisang Goreng/ })).toContainText('Stok 5');

  // Selling takes it down; at the threshold the tile warns.
  await menu(page, 'Kasir').click();
  await expect(product(page, 'Pisang Goreng')).toContainText('Stok 5');
  for (let i = 0; i < 3; i++) await product(page, 'Pisang Goreng').click();
  await payButton(page).click();
  await page.getByRole('button', { name: 'Uang pas' }).click();
  await page.getByRole('button', { name: 'Selesaikan' }).click();
  await page.getByRole('button', { name: 'Transaksi baru' }).click();
  await expect(product(page, 'Pisang Goreng')).toContainText('Sisa 2');

  // The cashier records goods coming in, but cannot do an opname.
  await signOut(page);
  await signIn(page, 'Kasir');
  await menu(page, /^Stok/).click();
  const list = page.getByRole('list', { name: 'Daftar stok' });
  const row = list.getByRole('listitem').filter({ hasText: 'Pisang Goreng' });
  await expect(row).toContainText('Sisa 2');
  await expect(row.getByRole('button', { name: /Opname/ })).toHaveCount(0);
  await row.getByRole('button', { name: 'Stok masuk Pisang Goreng' }).click();
  const sheetIn = page.getByRole('dialog', { name: 'Stok masuk: Pisang Goreng' });
  await sheetIn.getByLabel('Jumlah masuk').fill('10');
  await sheetIn.getByPlaceholder('Misalnya: dari supplier').fill('Pak Budi');
  await sheetIn.getByRole('button', { name: 'Simpan stok masuk' }).click();
  await expect(row).toContainText('Stok 12');

  // The owner counts 11: one is missing.
  await signOut(page);
  await signIn(page, 'Pemilik');
  await menu(page, /^Stok/).click();
  await row.getByRole('button', { name: 'Opname Pisang Goreng' }).click();
  const sheet = page.getByRole('dialog', { name: 'Stok opname: Pisang Goreng' });
  await expect(sheet).toContainText('Stok menurut aplikasi: 12');
  await sheet.getByLabel('Hasil hitung').fill('11');
  await expect(sheet.getByRole('status')).toContainText('Selisih -1');
  await sheet.getByPlaceholder('Misalnya: 2 rusak').fill('1 gosong');
  await sheet.getByRole('button', { name: 'Simpan hasil hitung' }).click();
  await expect(row).toContainText('Stok 11');

  // The history tells the whole story, newest first.
  await row.getByRole('link', { name: /Pisang Goreng/ }).click();
  await expect(page.getByTestId('stok-sekarang')).toHaveText('Stok 11');
  const history = page.getByRole('region', { name: 'Riwayat stok' }).getByRole('listitem');
  await expect(history).toHaveCount(4);
  await expect(history.nth(0)).toContainText('Dihitung 11');
  await expect(history.nth(0)).toContainText('selisih -1');
  await expect(history.nth(0)).toContainText('1 gosong');
  await expect(history.nth(1)).toContainText('Stok masuk');
  await expect(history.nth(1)).toContainText('Pak Budi');
  await expect(history.nth(2)).toContainText('Terjual');
  await expect(history.nth(2)).toContainText('-3');
  await expect(history.nth(3)).toContainText('Dihitung 5');
});

test('stok habis tetap bisa dijual, dengan tanda Habis', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Kasir');
  // The demo croissant tracks stock and has none recorded.
  await expect(product(page, 'Croissant Butter')).toContainText('Habis');
  await product(page, 'Croissant Butter').click();
  await payButton(page).click();
  await page.getByRole('button', { name: 'Uang pas' }).click();
  await page.getByRole('button', { name: 'Selesaikan' }).click();
  await expect(page.getByText('Transaksi berhasil disimpan')).toBeVisible();
  await page.getByRole('button', { name: 'Transaksi baru' }).click();
  await expect(product(page, 'Croissant Butter')).toContainText('Habis (-1)');
});

test('peringatan margin tipis saat HPP mendekati harga jual', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Pemilik');
  await menu(page, 'Produk').click();
  await page.getByRole('link', { name: /Es Teh Manis/ }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  // Price 8.000: HPP 7.000 leaves 12,5%.
  await page.getByLabel('HPP').fill('7000');
  const warning = page.getByRole('alert');
  await expect(warning).toContainText('Margin tipis: di bawah 20% dari harga jual.');
  await expect(warning).toContainText('margin 12,5%');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByRole('link', { name: /Es Teh Manis/ })).toContainText('Margin tipis');
});
