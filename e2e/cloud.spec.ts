import { expect, test, type Page } from '@playwright/test';
import { enterPin, payButton, product, signIn } from './helpers';

/**
 * Owner's phone and a cashier phone, both against a local Supabase
 * (run with `npm run test:e2e:cloud`, see playwright.cloud.config.ts).
 */

const syncChip = (page: Page) => page.getByTestId('status-koneksi');

async function openSettings(page: Page) {
  await page.getByRole('link', { name: 'Pengaturan' }).click();
  return page.getByRole('region', { name: 'Akun & sinkron' });
}

async function sellEspresso(page: Page) {
  await page.getByRole('link', { name: 'Kasir' }).click();
  await product(page, 'Espresso').click();
  await payButton(page).click();
  await page.getByRole('button', { name: 'Uang pas' }).click();
  await page.getByRole('button', { name: 'Selesaikan' }).click();
  await expect(page.getByText('Transaksi berhasil disimpan')).toBeVisible();
  return (await page.getByTestId('nomor-struk').textContent())!.replace('No. ', '');
}

test('pemilik daftar, memasang HP kasir dengan kode, dan penjualan tersinkron', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const email = `pemilik-${Date.now()}@contoh.test`;

  // 1. The owner signs up and uploads the store on this phone.
  await owner.goto('/');
  await owner.getByRole('link', { name: 'Masuk akun pemilik (email)' }).click();
  await owner.getByRole('tab', { name: 'Daftar baru' }).click();
  await owner.getByLabel('Email').fill(email);
  await owner.getByLabel('Password').fill('rahasia-123');
  await owner.getByRole('button', { name: 'Daftar', exact: true }).click();
  await owner.getByRole('button', { name: 'Simpan toko ini ke akun' }).click();
  await expect(owner.getByText('Siapa yang bertugas?')).toBeVisible();

  await signIn(owner, 'Pemilik');
  const ownerCloud = await openSettings(owner);
  await expect(ownerCloud).toContainText(email);
  await expect(syncChip(owner)).toHaveText('Tersinkron');

  // 2. A pairing code for the cashier phone.
  await ownerCloud.getByRole('button', { name: 'Tambah HP kasir' }).click();
  const code = (await ownerCloud.getByTestId('kode-pasang').textContent())!;
  expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  // 3. The cashier phone joins with the code and gets the store's data and its own code K2.
  const cashierContext = await browser.newContext();
  const cashier = await cashierContext.newPage();
  await cashier.goto('/');
  await cashier.getByRole('link', { name: 'Pasang HP kasir dengan kode' }).click();
  await cashier.getByLabel('Kode pasang').fill(code.toLowerCase().replace('-', ''));
  await cashier.getByLabel('Nama HP ini').fill('Kasir depan');
  await cashier.getByRole('button', { name: 'Pasang HP ini' }).click();
  await expect(cashier.getByText('Siapa yang bertugas?')).toBeVisible();
  await signIn(cashier, 'Kasir');
  expect(await sellEspresso(cashier)).toMatch(/^K2-/);
  await expect(syncChip(cashier)).toHaveText('Tersinkron');

  // 4. Offline sales wait on the phone and go out once the internet is back.
  await cashierContext.setOffline(true);
  const offlineReceipt = await sellEspresso(cashier);
  await expect(syncChip(cashier)).toHaveText('Offline · belum terkirim');
  await cashierContext.setOffline(false);
  await expect(syncChip(cashier)).toHaveText('Tersinkron', { timeout: 40_000 });

  // 5. The owner sees both sales from the cashier phone, each once.
  await ownerCloud.getByRole('button', { name: 'Sinkron sekarang' }).click();
  await expect(ownerCloud.getByRole('list', { name: 'Daftar perangkat' })).toContainText(
    'K2 · Kasir depan',
  );
  await owner.getByRole('link', { name: 'Riwayat' }).click();
  await expect(owner.getByRole('link', { name: offlineReceipt })).toHaveCount(1);
  await expect(owner.getByRole('link', { name: /^K2-/ })).toHaveCount(2);

  // 6. The owner disconnects the cashier phone; it stops syncing.
  await openSettings(owner);
  const devices = owner.getByRole('list', { name: 'Daftar perangkat' });
  await devices
    .getByRole('listitem')
    .filter({ hasText: 'K2' })
    .getByRole('button', { name: 'Putus' })
    .click();
  await owner.getByRole('button', { name: 'Ya, putus' }).click();
  await expect(devices).toContainText('Sudah diputus');

  await cashier.reload();
  await expect(syncChip(cashier)).toHaveText('Diputus pemilik');

  await ownerContext.close();
  await cashierContext.close();
});

test('pemilik mulai toko kosong, lalu memakai toko yang sama di HP baru', async ({ browser }) => {
  test.setTimeout(90_000);
  const email = `pemilik-${Date.now()}@contoh.test`;
  const first = await (await browser.newContext()).newPage();
  await first.goto('/akun');
  await first.getByRole('tab', { name: 'Daftar baru' }).click();
  await first.getByLabel('Email').fill(email);
  await first.getByLabel('Password').fill('rahasia-123');
  await first.getByRole('button', { name: 'Daftar', exact: true }).click();
  await first.getByLabel('Nama toko').fill('Warung Uji');
  await first.getByRole('button', { name: 'Mulai toko baru' }).click();
  await expect(first.getByRole('heading', { name: 'Warung Uji', level: 1 })).toBeVisible();
  await signIn(first, 'Pemilik', '2468');
  await openSettings(first);
  await expect(syncChip(first)).toHaveText('Tersinkron');

  // The owner's new phone: same account, same store, its own device code.
  const second = await (await browser.newContext()).newPage();
  await second.goto('/akun');
  await second.getByLabel('Email').fill(email);
  await second.getByLabel('Password').fill('rahasia-123');
  await second.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(second.getByRole('region', { name: 'Pakai toko di akun' })).toContainText(
    'Warung Uji',
  );
  await second.getByRole('button', { name: 'Pakai toko ini di HP ini' }).click();
  await expect(second.getByRole('heading', { name: 'Warung Uji', level: 1 })).toBeVisible();
  // The PIN made on the first phone works here too.
  await second
    .getByRole('list', { name: 'Pengguna' })
    .getByRole('button', { name: 'Pemilik' })
    .click();
  await enterPin(second, '2468', 'Masuk');
  const cloud = await openSettings(second);
  await expect(cloud).toContainText(email);
  const devices = cloud.getByRole('list', { name: 'Daftar perangkat' });
  await expect(devices.getByRole('listitem').filter({ hasText: 'HP ini' })).toContainText('K2');
  await expect(devices).toContainText('K1');
});
