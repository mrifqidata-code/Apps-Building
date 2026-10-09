import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { openCart, payButton, product, signIn, signOut } from './helpers';
import {
  clearPrinted,
  installFakeBlePrinter,
  installFakeSerialPrinter,
  printedText,
  removeBluetooth,
} from './printer-mocks';

const LOGO = fileURLToPath(new URL('../public/pwa-192x192.png', import.meta.url));

async function openSettings(page: Page) {
  await page.getByRole('link', { name: 'Pengaturan' }).click();
  await expect(page.getByRole('heading', { name: 'Pengaturan' })).toBeVisible();
}

async function sellEspressoCash(page: Page) {
  await page.getByRole('link', { name: 'Kasir' }).click();
  await product(page, 'Espresso').click();
  await payButton(page).click();
  await page.getByRole('button', { name: 'Uang pas' }).click();
  await page.getByRole('button', { name: 'Selesaikan' }).click();
  await expect(page.getByText('Transaksi berhasil disimpan')).toBeVisible();
}

test('data toko, logo, PB1 dan biaya layanan tampil di keranjang dan struk', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Pemilik');
  await openSettings(page);

  const storeSection = page.getByRole('region', { name: 'Data toko' });
  await storeSection.getByLabel('Nama toko').fill('Kopi Nusantara');
  await storeSection.getByLabel('Alamat').fill('Jl. Merdeka No. 10, Bandung');
  await storeSection.getByLabel('Nomor telepon (opsional)').fill('0812-1111-2222');
  await storeSection.getByLabel('Unggah logo').setInputFiles(LOGO);
  await expect(storeSection.getByRole('img', { name: 'Logo toko' })).toBeVisible();
  await storeSection.getByLabel('Catatan kaki struk').fill('IG: @kopinusantara');
  await storeSection.getByRole('button', { name: 'Simpan data toko' }).click();
  await expect(storeSection.getByRole('status')).toHaveText('Data toko tersimpan.');
  await expect(page.getByRole('heading', { name: 'Kopi Nusantara', level: 1 })).toBeVisible();

  const tax = page.getByRole('region', { name: 'Pajak dan biaya layanan' });
  await tax.getByLabel('Persen PB1').fill('10');
  await tax.getByLabel('Persen biaya layanan').fill('5');
  await expect(tax.getByTestId('contoh-pajak')).toContainText('total dibayar Rp115.500');
  await tax.getByRole('button', { name: 'Simpan pajak' }).click();
  await expect(tax.getByRole('status')).toContainText('Pengaturan pajak tersimpan');

  await page.getByRole('link', { name: 'Kasir' }).click();
  await product(page, 'Espresso').click();
  const cart = await openCart(page);
  await expect(cart).toContainText('Biaya layanan (5%)');
  await expect(cart).toContainText('Rp750');
  await expect(cart).toContainText('PB1 (10%)');
  await expect(cart).toContainText('Rp1.575');
  await cart.getByRole('button', { name: 'Bayar · Rp17.325' }).click();
  await page.getByRole('button', { name: 'Uang pas' }).click();
  await page.getByRole('button', { name: 'Selesaikan' }).click();

  const receipt = page.getByRole('article', { name: 'Struk' });
  await expect(receipt.getByRole('heading', { name: 'Kopi Nusantara' })).toBeVisible();
  await expect(receipt).toContainText('Jl. Merdeka No. 10, Bandung');
  await expect(receipt).toContainText('Telp. 0812-1111-2222');
  await expect(receipt).toContainText('PB1 (10%)');
  await expect(receipt).toContainText('Rp17.325');
  await expect(receipt).toContainText('IG: @kopinusantara');
  await expect(receipt.locator('img')).toBeVisible();
});

test('harga sudah termasuk pajak: total tidak bertambah', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Pemilik');
  await openSettings(page);
  const tax = page.getByRole('region', { name: 'Pajak dan biaya layanan' });
  await tax.getByLabel('Persen PB1').fill('10');
  await tax.getByLabel('Harga di menu sudah termasuk pajak dan layanan').check();
  await expect(tax.getByTestId('contoh-pajak')).toContainText('total dibayar Rp100.000');
  await tax.getByRole('button', { name: 'Simpan pajak' }).click();
  await expect(tax.getByRole('status')).toBeVisible();

  await sellEspressoCash(page);
  const receipt = page.getByRole('article', { name: 'Struk' });
  await expect(receipt).toContainText('Rp15.000');
  await expect(receipt).toContainText('Termasuk PB1 (10%)');
  await expect(receipt).toContainText('Rp1.364');
});

test('pemilik mengatur batas diskon kasir', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Pemilik');
  await openSettings(page);
  const limit = page.getByRole('region', { name: 'Batas diskon kasir' });
  await limit.getByLabel('Persen batas diskon kasir').fill('10');
  await limit.getByRole('button', { name: 'Simpan batas diskon' }).click();
  await expect(limit.getByRole('status')).toHaveText('Batas diskon kasir tersimpan.');

  await signOut(page);
  await signIn(page, 'Kasir');
  await product(page, 'Espresso').click();
  const cart = await openCart(page);
  const applyDiscount = async (percent: string) => {
    await cart.getByRole('button', { name: /Diskon transaksi/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Diskon transaksi' });
    await sheet.getByRole('button', { name: 'Persen (%)' }).click();
    await sheet.getByLabel('Persen diskon').fill(percent);
    await sheet.getByRole('button', { name: 'Terapkan' }).click();
  };

  await applyDiscount('10');
  await expect(cart.getByRole('button', { name: 'Bayar · Rp13.500' })).toBeEnabled();
  await applyDiscount('15');
  await expect(cart).toContainText('Diskon melebihi batas kasir (10%)');
  await expect(cart.getByRole('button', { name: /^Bayar ·/ })).toBeDisabled();
});

test('cetak lewat printer Bluetooth BLE: tes cetak, cetak otomatis, cetak ulang', async ({
  page,
}) => {
  await installFakeBlePrinter(page, 'Putian 583-01');
  await page.goto('/');
  await signIn(page, 'Pemilik');
  await openSettings(page);

  const section = page.getByRole('region', { name: 'Printer' });
  await expect(section.getByTestId('status-printer')).toHaveText('Belum ada printer.');
  await section.getByRole('button', { name: 'Hubungkan printer (Bluetooth BLE)' }).click();
  await expect(section.getByTestId('status-printer')).toHaveText(
    'Terhubung: Putian 583-01 (Bluetooth BLE)',
  );
  await section.getByRole('button', { name: 'Tes cetak' }).click();
  await expect(section.getByRole('status')).toHaveText('Halaman tes terkirim ke printer.');
  expect(await printedText(page)).toContain('TES PRINTER BERHASIL');

  await section.getByLabel('Cetak otomatis setelah pembayaran').check();
  await clearPrinted(page);
  await sellEspressoCash(page);

  // Printed by itself right after payment.
  await expect(page.getByText('Struk terkirim ke printer.')).toBeVisible();
  const receiptNo = (await page.getByTestId('nomor-struk').textContent())!;
  const printed = await printedText(page);
  expect(printed).toContain('Kedai Kopi Senja (Demo)');
  expect(printed).toContain(receiptNo);
  expect(printed).toContain('Espresso');
  expect(printed).toMatch(/TOTAL +Rp15\.000/);
  expect(printed).toMatch(/Kembalian +Rp0/);

  // Reprint from history.
  await clearPrinted(page);
  await page.getByRole('link', { name: 'Riwayat' }).click();
  await page.getByRole('link', { name: receiptNo.replace('No. ', '') }).click();
  await page.getByRole('button', { name: 'Cetak struk' }).click();
  await expect(page.getByText('Struk terkirim ke printer.')).toBeVisible();
  expect(await printedText(page)).toContain(receiptNo);
});

test('cetak lewat printer Bluetooth Classic (Web Serial)', async ({ page }) => {
  await installFakeSerialPrinter(page);
  await page.goto('/');
  await signIn(page, 'Pemilik');
  await openSettings(page);

  const section = page.getByRole('region', { name: 'Printer' });
  await expect(
    section.getByRole('button', { name: 'Hubungkan printer (Bluetooth BLE)' }),
  ).toHaveCount(0);
  await section.getByRole('button', { name: 'Hubungkan printer (Bluetooth Classic)' }).click();
  await expect(section.getByTestId('status-printer')).toContainText('Bluetooth Classic');

  await sellEspressoCash(page);
  await page.getByRole('button', { name: 'Cetak struk' }).click();
  await expect(page.getByText('Struk terkirim ke printer.')).toBeVisible();
  expect(await printedText(page)).toMatch(/TOTAL +Rp15\.000/);
});

test('simpan struk sebagai PDF berukuran 58 mm', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Kasir');
  await page.evaluate(() => {
    (window as unknown as { printCalls: number }).printCalls = 0;
    window.print = () => {
      (window as unknown as { printCalls: number }).printCalls++;
    };
  });
  await sellEspressoCash(page);
  await page.getByRole('button', { name: 'Simpan PDF' }).click();

  expect(await page.evaluate(() => (window as unknown as { printCalls: number }).printCalls)).toBe(
    1,
  );
  const pageSize = await page.evaluate(
    () => document.getElementById('receipt-page-size')?.textContent ?? '',
  );
  expect(pageSize).toMatch(/@page \{ size: 58mm \d+mm; margin: 0; \}/);

  // Render the PDF the browser would save: one narrow page with the receipt.
  const pdf = await page.pdf({ preferCSSPageSize: true });
  const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
  expect(pages).toHaveLength(1);
});

test('browser tanpa Bluetooth tetap bisa simpan PDF dan kirim WhatsApp', async ({ page }) => {
  await removeBluetooth(page);
  await page.goto('/');
  await signIn(page, 'Kasir');
  await sellEspressoCash(page);
  await expect(page.getByRole('button', { name: 'Cetak struk' })).toHaveCount(0);
  await expect(
    page.getByText('Browser ini tidak bisa terhubung ke printer Bluetooth'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simpan PDF' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kirim struk ke WhatsApp' })).toBeVisible();
});
