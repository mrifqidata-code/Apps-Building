import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { enterPin, openDrawer, payButton, product, signIn } from './helpers';

/**
 * Owner's phone and a cashier phone, both against a local Supabase
 * (run with `npm run test:e2e:cloud`, see playwright.cloud.config.ts).
 */

const syncChip = (page: Page) => page.getByTestId('status-koneksi');

/** The operator's view of the local Supabase (secret key from the environment, see CI). */
function admin() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY belum diisi (lihat src/test/cloud.ts)');
  return createClient(process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321', key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Signs up a new owner on the account page, agreeing to the terms. */
async function signUp(page: Page, email: string) {
  await page.getByRole('tab', { name: 'Daftar baru' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('rahasia-123');
  await page.getByRole('checkbox', { name: /menyetujui Syarat Layanan/ }).check();
  await page.getByRole('button', { name: 'Daftar', exact: true }).click();
}

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
  // Signing up needs the owner's agreement to the terms, which are one tap away.
  await owner.getByRole('tab', { name: 'Daftar baru' }).click();
  await owner.getByLabel('Email').fill(email);
  await owner.getByLabel('Password').fill('rahasia-123');
  await owner.getByRole('button', { name: 'Daftar', exact: true }).click();
  await expect(owner.getByText('Centang persetujuan Syarat Layanan')).toBeVisible();
  await signUp(owner, email);
  await owner.getByRole('button', { name: 'Simpan toko ini ke akun' }).click();
  await expect(owner.getByText('Siapa yang bertugas?')).toBeVisible();

  await signIn(owner, 'Pemilik');
  const ownerCloud = await openSettings(owner);
  await expect(ownerCloud).toContainText(email);
  await expect(syncChip(owner)).toHaveText('Tersinkron');
  // A new cloud store starts with a 30-day trial.
  const plan = ownerCloud.getByRole('region', { name: 'Paket' });
  await expect(plan).toContainText('Uji coba gratis');
  await expect(plan.getByTestId('masa-aktif')).toHaveText(/^Aktif sampai .+ \(30 hari lagi\)$/);

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

  // 6. The owner voids the offline sale on their phone; the cashier phone hears of it.
  await owner.getByRole('link', { name: offlineReceipt }).click();
  await owner.getByRole('button', { name: 'Batalkan transaksi' }).click();
  const voidSheet = owner.getByRole('dialog', { name: 'Void transaksi' });
  await voidSheet.getByRole('button', { name: 'Salah input' }).click();
  await voidSheet.getByRole('button', { name: 'Ya, void transaksi' }).click();
  await expect(owner.getByRole('region', { name: 'Pembatalan' })).toContainText('di-void');
  await expect(syncChip(owner)).toHaveText('Tersinkron', { timeout: 40_000 });
  await cashier.getByRole('link', { name: 'Riwayat' }).click();
  await expect(cashier.getByRole('link', { name: new RegExp(offlineReceipt) })).toContainText(
    'Dibatalkan',
    { timeout: 40_000 },
  );

  // 7. The owner disconnects the cashier phone; it stops syncing.
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
  await signUp(first, email);
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

test('masa aktif habis: sinkron berhenti, kasir tetap jalan, lalu lanjut setelah diperpanjang', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const email = `pemilik-${Date.now()}@contoh.test`;
  await page.goto('/akun');
  await signUp(page, email);
  await page.getByRole('button', { name: 'Simpan toko ini ke akun' }).click();
  await expect(page.getByText('Siapa yang bertugas?')).toBeVisible();
  await signIn(page, 'Pemilik');
  await page.getByRole('link', { name: 'Kasir' }).click();
  await openDrawer(page);
  const cloud = await openSettings(page);
  await expect(syncChip(page)).toHaveText('Tersinkron');
  const plan = cloud.getByRole('region', { name: 'Paket' });
  await expect(plan).toContainText('Uji coba gratis');

  // The trial is over (the operator's records say so).
  const { data: stores } = await admin().rpc('admin_stores');
  const storeId = (stores as { store_id: string; owner_email: string }[]).find(
    (s) => s.owner_email === email,
  )!.store_id;
  await admin()
    .from('store_plans')
    .update({ active_until: new Date(Date.now() - 60_000).toISOString() })
    .eq('store_id', storeId);
  await cloud.getByRole('button', { name: 'Sinkron sekarang' }).click();
  await expect(syncChip(page)).toHaveText('Masa aktif habis');
  await expect(plan.getByTestId('masa-aktif')).toHaveText(/^Berakhir /);
  await expect(plan).toContainText('Kasir tetap jalan');
  const renew = plan.getByRole('link', { name: 'Perpanjang lewat WhatsApp' });
  await expect(renew).toHaveAttribute(
    'href',
    `https://wa.me/6281200001111?text=${encodeURIComponent(
      `Halo, saya ingin memperpanjang paket Reqap.\nToko: Kedai Kopi Senja (Demo)\nID toko: ${storeId}`,
    )}`,
  );
  const reminder = page.getByRole('status').filter({ hasText: 'Masa aktif paket habis' });
  await expect(reminder).toBeVisible();

  // Selling goes on; the sale waits on the phone.
  const receipt = await sellEspresso(page);

  // After the transfer the operator extends the plan by a month: the sale goes out.
  await admin().rpc('admin_extend_plan', { p_store_id: storeId, p_months: 1 });
  await reminder.getByRole('link', { name: 'Perpanjang' }).click();
  await cloud.getByRole('button', { name: 'Sinkron sekarang' }).click();
  await expect(syncChip(page)).toHaveText('Tersinkron');
  await expect(plan).toContainText('Paket Toko');
  await expect(plan.getByTestId('masa-aktif')).toHaveText(/^Aktif sampai .+ hari lagi\)$/);
  await expect(reminder).toBeHidden();
  const { data: sales } = await admin()
    .from('transactions')
    .select('receipt_no')
    .eq('store_id', storeId);
  expect(sales).toEqual([{ receipt_no: receipt }]);
});
