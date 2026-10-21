import { expect, test } from '@playwright/test';
import { enterPin, payButton, product, signIn } from './helpers';

test('pemilik mengosongkan HP ini dengan PIN, lalu aplikasi mulai lagi dari toko contoh', async ({
  page,
}) => {
  await page.goto('/');
  await signIn(page, 'Pemilik', '2468');
  await product(page, 'Espresso').click();
  await payButton(page).click();
  await page.getByRole('button', { name: 'Uang pas' }).click();
  await page.getByRole('button', { name: 'Selesaikan' }).click();
  await expect(page.getByText('Transaksi berhasil disimpan')).toBeVisible();

  await page.getByRole('link', { name: 'Pengaturan', exact: true }).click();
  await page
    .getByRole('region', { name: 'Kosongkan HP ini' })
    .getByRole('button', { name: 'Kosongkan HP ini' })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Kosongkan HP ini' });
  // Without the cloud, nothing survives: the sheet says so.
  await expect(sheet).toContainText('tidak terhubung ke cloud, jadi semua data itu hilang');

  // A wrong PIN does nothing.
  await enterPin(page, '1111', 'Kosongkan');
  await expect(sheet).toContainText('PIN salah');
  await enterPin(page, '2468', 'Kosongkan');

  // Like a new install: demo store again, and the owner PIN has to be made again.
  await expect(page.getByText('Siapa yang bertugas?')).toBeVisible();
  await page
    .getByRole('list', { name: 'Pengguna' })
    .getByRole('button', { name: 'Pemilik' })
    .click();
  await expect(page.getByText('Buat PIN baru')).toBeVisible();
  await enterPin(page, '1357', 'Lanjut');
  await enterPin(page, '1357', 'Simpan');
  await page.getByRole('link', { name: 'Riwayat', exact: true }).click();
  await expect(page.getByText('Belum ada transaksi hari ini.')).toBeVisible();
});
