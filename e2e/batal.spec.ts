import { expect, test } from '@playwright/test';
import {
  enterPin,
  openDrawer,
  payButton,
  product,
  signIn,
  signOut,
  waitForOfflineReady,
} from './helpers';

const menu = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('navigation', { name: 'Menu utama' }).getByRole('link', { name, exact: true });

async function sellCash(page: import('@playwright/test').Page, names: string[]) {
  for (const name of names) await product(page, name).click();
  await payButton(page).click();
  await page.getByRole('button', { name: 'Uang pas' }).click();
  await page.getByRole('button', { name: 'Selesaikan' }).click();
  await expect(page.getByText('Transaksi berhasil disimpan')).toBeVisible();
  return (await page.getByTestId('nomor-struk').textContent())!.replace('No. ', '');
}

test('kasir minta pemilik void transaksi dengan PIN pemilik', async ({ page }) => {
  await page.goto('/');
  // The owner makes their PIN first; the cashier sells.
  await signIn(page, 'Pemilik', '2468', { openDrawer: false });
  await signOut(page);
  await signIn(page, 'Kasir');
  await sellCash(page, ['Croissant Butter', 'Espresso']);

  await page.getByRole('button', { name: 'Batalkan transaksi' }).click();
  const sheet = page.getByRole('dialog', { name: 'Void transaksi' });
  await expect(sheet).toContainText('Hanya pemilik yang bisa membatalkan transaksi');
  // A wrong PIN is refused and counted.
  await enterPin(page, '1111', 'Setujui');
  await expect(sheet.getByRole('alert')).toContainText('PIN salah');
  await enterPin(page, '2468', 'Setujui');
  await expect(sheet).toContainText('Kasir untuk transaksi ini masih buka');
  await expect(sheet).toContainText('1 barang yang stoknya dilacak kembali ke stok');
  await expect(sheet.getByRole('button', { name: 'Ya, void transaksi' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Salah input' }).click();
  await sheet.getByRole('button', { name: 'Ya, void transaksi' }).click();

  const cancelled = page.getByRole('region', { name: 'Pembatalan' });
  await expect(cancelled).toContainText('Transaksi di-void');
  await expect(cancelled).toContainText('Alasan: Salah input');
  await expect(cancelled).toContainText('Oleh Pemilik');
  await expect(page.getByRole('article', { name: 'Struk' })).toContainText('TRANSAKSI DIBATALKAN');
  await expect(page.getByRole('button', { name: 'Batalkan transaksi' })).toHaveCount(0);

  // The cashier stays signed in; the sale no longer counts and the croissant is back.
  await expect(page.getByRole('button', { name: /Kasir, ganti pengguna/ })).toBeVisible();
  await page.getByRole('button', { name: 'Transaksi baru' }).click();
  await expect(product(page, 'Croissant Butter')).toContainText('Habis');
  await expect(product(page, 'Croissant Butter')).not.toContainText('-1');
  await menu(page, 'Riwayat').click();
  await expect(page.getByRole('list', { name: 'Transaksi' })).toContainText('Dibatalkan');
  await expect(page.getByText('0 transaksi')).toBeVisible();
});

test('pemilik refund transaksi dari kasir yang sudah ditutup', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Pemilik');
  const receipt = await sellCash(page, ['Espresso']);

  // Close the drawer, then open a new one with Rp100.000.
  await menu(page, 'Kas').click();
  await page.getByRole('link', { name: 'Tutup kasir' }).click();
  await page.getByLabel('Uang fisik di laci').fill('15000');
  await page.getByRole('button', { name: 'Simpan dan tutup kasir' }).click();
  await page.getByRole('button', { name: 'Ya, tutup kasir' }).click();
  await page.getByRole('link', { name: 'Selesai' }).click();
  await openDrawer(page, 'Rp100.000');

  await menu(page, 'Riwayat').click();
  await page.getByRole('link', { name: new RegExp(receipt) }).click();
  await page.getByRole('button', { name: 'Batalkan transaksi' }).click();
  const sheet = page.getByRole('dialog', { name: 'Refund transaksi' });
  await expect(sheet).toContainText('Uang Rp15.000 diambil dari laci kasir yang sedang buka');
  await sheet.getByLabel('Alasan pembatalan').fill('Pelanggan komplain');
  await sheet.getByRole('button', { name: 'Ya, refund Rp15.000' }).click();
  await expect(page.getByRole('region', { name: 'Pembatalan' })).toContainText(
    'Transaksi direfund',
  );

  // The refund came out of today's drawer.
  await menu(page, 'Kas').click();
  const drawer = page.getByRole('region', { name: 'Kasir sedang buka' });
  await expect(drawer).toContainText('Seharusnya di laci sekarangRp85.000');
  await expect(page.getByRole('region', { name: 'Kas masuk dan keluar' })).toContainText(
    `Refund ${receipt}`,
  );

  // The report leaves it out and says so.
  await menu(page, 'Laporan').click();
  await expect(page.getByTestId('penjualan-bersih')).toHaveText('Rp0');
  await expect(page.getByText('1 transaksi dibatalkan/direfund')).toBeVisible();
});

test('panduan bisa dibuka dari layar masuk, juga tanpa internet', async ({ page, context }) => {
  await page.goto('/');
  await waitForOfflineReady(page);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('link', { name: 'Panduan pemakaian' }).click();
  await expect(page.getByRole('heading', { name: 'Bantuan', level: 1 })).toBeVisible();
  const section = page.locator('details').filter({ hasText: 'Menutup kasir' });
  await section.locator('summary').click();
  await expect(section).toContainText('Uang fisik di laci');
  await expect(section).toContainText('selisihnya (Pas, Lebih, atau Kurang)');
});
