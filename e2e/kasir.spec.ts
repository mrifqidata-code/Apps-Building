import { expect, test, type Locator } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  openCart,
  payButton,
  product,
  readMeta,
  signIn,
  signOut,
  waitForOfflineReady,
} from './helpers';

const QRIS_IMAGE = fileURLToPath(new URL('../public/pwa-512x512.png', import.meta.url));

test('transaksi 3 item bayar tunai selesai dalam maksimal 10 ketukan', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Kasir');

  let taps = 0;
  const tap = async (target: Locator) => {
    await target.click();
    taps++;
  };

  await tap(product(page, 'Espresso'));
  await tap(product(page, 'Americano'));
  await tap(product(page, 'Teh Tarik'));
  await tap(payButton(page));
  await expect(page.getByTestId('total-bayar')).toHaveText('Rp51.000');
  await tap(page.getByRole('button', { name: 'Uang pas' }));
  await tap(page.getByRole('button', { name: 'Selesaikan' }));

  await expect(page.getByText('Transaksi berhasil disimpan')).toBeVisible();
  await expect(page.getByTestId('nomor-struk')).toHaveText(/^No\. K1-\d{6}-0001$/);
  await tap(page.getByRole('button', { name: 'Transaksi baru' }));

  await expect(product(page, 'Espresso')).toBeVisible();
  expect(taps).toBeLessThanOrEqual(10);
  test.info().annotations.push({ type: 'ketukan', description: String(taps) });
});

test('transaksi tetap tersimpan saat perangkat offline', async ({ page, context }) => {
  await page.goto('/');
  await signIn(page, 'Kasir');
  await waitForOfflineReady(page);

  // From here on there is no internet at all.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('status-koneksi')).toHaveText('Offline');

  await product(page, 'Kopi Tubruk').click();
  await product(page, 'Kopi Tubruk').click();
  await product(page, 'Pisang Goreng').click();
  await payButton(page).click();
  await page.getByRole('button', { name: 'Rp50.000' }).click();
  await expect(page.getByTestId('kembalian')).toHaveText('KembalianRp11.000');
  await page.getByRole('button', { name: 'Selesaikan' }).click();
  await expect(page.getByText('Kembalian Rp11.000')).toBeVisible();
  const receiptNo = (await page.getByTestId('nomor-struk').textContent())!.replace('No. ', '');

  // Close and reopen the app while still offline: the sale must still be there.
  await page.reload();
  await page.getByRole('link', { name: 'Riwayat' }).click();
  const row = page.getByRole('list', { name: 'Transaksi' }).getByRole('link', { name: receiptNo });
  await expect(row).toContainText('Rp39.000');
  await row.click();
  const receipt = page.getByRole('article', { name: 'Struk' });
  await expect(receipt).toContainText('Kopi Tubruk');
  await expect(receipt).toContainText('2 x Rp12.000');
  await expect(receipt).toContainText('Pisang Goreng');
  await expect(receipt).toContainText('Tunai');

  // Stored in IndexedDB on this device, waiting to be synced later (M5).
  const stored = await page.evaluate(
    () =>
      new Promise<{ status: string; syncedAt: unknown; total: number }[]>((resolve, reject) => {
        const open = indexedDB.open('pos-sederhana');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result
            .transaction('transactions')
            .objectStore('transactions')
            .getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        };
      }),
  );
  expect(stored).toEqual([
    expect.objectContaining({ status: 'paid', syncedAt: null, total: 39_000 }),
  ]);
});

test('keranjang tidak hilang saat aplikasi dimuat ulang', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Kasir');
  await product(page, 'Espresso').click();
  await product(page, 'Espresso').click();
  // Saving to IndexedDB takes a few milliseconds; reload only once the draft is stored,
  // otherwise the test races the write instead of checking that it survives a reload.
  await expect
    .poll(async () => {
      const draft = (await readMeta(page, 'cartDraft')) as { lines: { qty: number }[] } | null;
      return draft?.lines[0]?.qty ?? 0;
    })
    .toBe(2);
  await page.reload();
  const cart = await openCart(page);
  await expect(cart.getByLabel('Jumlah Espresso')).toHaveText('2');
});

test('varian, catatan, diskon, QRIS, dan kirim struk ke WhatsApp', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Pemilik');

  // The owner uploads the store's static QRIS image first.
  await page.getByRole('link', { name: 'Pengaturan' }).click();
  await page.getByLabel('Unggah gambar QRIS').setInputFiles(QRIS_IMAGE);
  await expect(page.getByRole('img', { name: 'QRIS toko' })).toBeVisible();
  await page.getByRole('link', { name: 'Kasir' }).click();

  await product(page, 'Kopi Susu Gula Aren').click();
  const sheet = page.getByRole('dialog', { name: 'Kopi Susu Gula Aren' });
  await sheet.getByRole('button', { name: /Large/ }).click();
  await sheet.getByRole('button', { name: /Extra Shot/ }).click();
  await sheet.getByRole('button', { name: 'Tambah · Rp32.000' }).click();

  const cart = await openCart(page);
  await cart.getByRole('button', { name: 'Ubah Kopi Susu Gula Aren' }).click();
  const editor = page.getByRole('dialog', { name: 'Kopi Susu Gula Aren' });
  await editor.getByRole('textbox').first().fill('kurang manis');
  await editor.getByRole('button', { name: 'Persen (%)' }).click();
  await editor.getByLabel('Persen diskon').fill('10');
  await editor.getByRole('button', { name: 'Simpan' }).click();
  await expect(cart).toContainText('“kurang manis”');
  await expect(cart).toContainText('Rp28.800');

  await cart.getByRole('button', { name: '+ Diskon transaksi' }).click();
  const discount = page.getByRole('dialog', { name: 'Diskon transaksi' });
  await discount.getByLabel('Nominal diskon').fill('1800');
  await discount.getByRole('button', { name: 'Terapkan' }).click();
  await expect(cart).toContainText('Total');
  await cart.getByRole('button', { name: 'Bayar · Rp27.000' }).click();

  await page.getByRole('button', { name: 'QRIS', exact: true }).click();
  await expect(page.getByRole('img', { name: 'QRIS toko' })).toBeVisible();
  await page.getByRole('button', { name: 'Pembayaran QRIS diterima' }).click();

  const receipt = page.getByRole('article', { name: 'Struk' });
  await expect(receipt).toContainText('Kopi Susu Gula Aren (Large, Extra Shot)');
  await expect(receipt).toContainText('Catatan: kurang manis');
  await expect(receipt).toContainText('-Rp3.200');
  await expect(receipt).toContainText('-Rp1.800');
  await expect(receipt).toContainText('QRIS');
  await expect(receipt).not.toContainText('Kembalian');

  const share = page.getByRole('link', { name: 'Kirim struk ke WhatsApp' });
  await page.getByPlaceholder('0812xxxxxxx').fill('0812-3456-7890');
  const href = (await share.getAttribute('href'))!;
  expect(href.startsWith('https://wa.me/6281234567890?text=')).toBe(true);
  const text = decodeURIComponent(href.split('text=')[1]!);
  expect(text).toContain('*Kedai Kopi Senja (Demo)*');
  expect(text).toContain('*Total: Rp27.000*');
  expect(text).toContain('QRIS: Rp27.000');
});

test('pemilik menambah produk dengan varian dan langsung bisa dijual', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Pemilik');

  await page.getByRole('link', { name: 'Produk' }).click();
  await page.getByRole('button', { name: '+ Produk' }).click();
  await page.getByLabel('Nama produk').fill('Es Kopi Susu');
  await page.getByLabel('Harga jual').fill('18000');
  await page.getByLabel('HPP').fill('6000');
  await expect(page.getByText('Laba kotor per item: Rp12.000')).toBeVisible();

  await page.getByRole('button', { name: '+ Tambah varian' }).click();
  const variants = page.getByRole('region', { name: 'Varian' });
  await variants.getByLabel('Nama varian').fill('Ukuran');
  await variants.getByLabel('Nama pilihan').fill('Reguler');
  await variants.getByRole('button', { name: '+ Pilihan' }).click();
  await variants.getByLabel('Nama pilihan').nth(1).fill('Jumbo');
  await variants.getByLabel('Tambahan harga').nth(1).fill('6000');
  await page.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByRole('region', { name: 'Kopi', exact: true })).toContainText(
    'Es Kopi Susu',
  );
  await page.getByRole('link', { name: 'Kasir' }).click();
  await product(page, 'Es Kopi Susu').click();
  const sheet = page.getByRole('dialog', { name: 'Es Kopi Susu' });
  await expect(sheet.getByRole('button', { name: /Jumbo/ })).toContainText('+Rp6.000');
  await sheet.getByRole('button', { name: /Jumbo/ }).click();
  await sheet.getByRole('button', { name: 'Tambah · Rp24.000' }).click();
  await expect(payButton(page)).toBeVisible();
});

test('kasir tidak bisa membuka menu pemilik atau memberi diskon tanpa izin', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Kasir');

  const menu = page.getByRole('navigation', { name: 'Menu utama' });
  await expect(menu.getByRole('link')).toHaveText(['Kasir', 'Riwayat']);
  await page.goto('/produk');
  await expect(page.getByRole('heading', { name: 'Khusus pemilik' })).toBeVisible();
  await page.goto('/');

  await product(page, 'Espresso').click();
  const cart = await openCart(page);
  await cart.getByRole('button', { name: '+ Diskon transaksi' }).click();
  const discount = page.getByRole('dialog', { name: 'Diskon transaksi' });
  await discount.getByLabel('Nominal diskon').fill('5000');
  await discount.getByRole('button', { name: 'Terapkan' }).click();
  await expect(cart).toContainText('Diskon melebihi batas kasir');
  await expect(cart.getByRole('button', { name: /^Bayar ·/ })).toBeDisabled();
});

test('PIN salah dihitung dan dikunci setelah 5 kali', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Kasir', '2580');
  await signOut(page);

  await page.getByRole('list', { name: 'Pengguna' }).getByRole('button', { name: 'Kasir' }).click();
  for (let i = 1; i <= 4; i++) {
    for (const digit of '0000')
      await page.getByRole('button', { name: digit, exact: true }).click();
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(`PIN salah. Sisa ${5 - i} percobaan.`);
  }
  for (const digit of '0000') await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Terlalu banyak PIN salah');
});

test('PIN bisa diketik dengan keyboard di laptop', async ({ page }) => {
  await page.goto('/masuk');
  await page
    .getByRole('list', { name: 'Pengguna' })
    .getByRole('button', { name: 'Pemilik' })
    .click();
  await page.keyboard.type('4321');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Ulangi PIN baru')).toBeVisible();
  await page.keyboard.type('4321');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Menu utama' })).toBeVisible();
});

test('keranjang bisa dikosongkan kalau produknya dinonaktifkan', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'Pemilik');
  await product(page, 'Espresso').click();

  await page.getByRole('link', { name: 'Produk' }).click();
  await page.getByRole('link', { name: /Espresso/ }).click();
  await page.getByLabel('Aktif dijual').uncheck();
  await page.getByRole('button', { name: 'Simpan' }).click();
  await page.getByRole('link', { name: 'Kasir' }).click();

  const cart = await openCart(page);
  await expect(cart.getByRole('alert')).toHaveText('Produk di keranjang sudah tidak dijual.');
  await cart.getByRole('button', { name: 'Kosongkan keranjang' }).click();
  await expect(page.getByRole('button', { name: /Lihat keranjang/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Espresso/ })).toHaveCount(0);
});
