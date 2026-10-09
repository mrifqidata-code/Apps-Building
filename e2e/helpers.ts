import { expect, type Locator, type Page } from '@playwright/test';

export const isWide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** Types a PIN on the on-screen keypad and presses the submit key. */
export async function enterPin(page: Page, pin: string, submit: string) {
  for (const digit of pin) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: submit, exact: true }).click();
}

/** Signs in as a user, creating their PIN first if they have none yet. */
export async function signIn(page: Page, userName: string, pin = '1234') {
  if (!page.url().includes('/masuk')) await page.goto('/masuk');
  await page
    .getByRole('list', { name: 'Pengguna' })
    .getByRole('button', { name: userName })
    .click();
  if (await page.getByText('Buat PIN baru').isVisible()) {
    await enterPin(page, pin, 'Lanjut');
    await enterPin(page, pin, 'Simpan');
  } else {
    await enterPin(page, pin, 'Masuk');
  }
  await expect(page.getByRole('navigation', { name: 'Menu utama' })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: /ganti pengguna/ }).click();
  await expect(page.getByText('Siapa yang bertugas?')).toBeVisible();
}

export function product(page: Page, name: string): Locator {
  return page
    .getByRole('list', { name: 'Produk' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
}

/** The "Bayar" button for the current layout (bottom bar on phones, cart panel on laptops). */
export function payButton(page: Page): Locator {
  return isWide(page)
    ? page
        .getByRole('complementary', { name: 'Keranjang' })
        .getByRole('button', { name: /^Bayar ·/ })
    : page.getByRole('button', { name: 'Bayar', exact: true });
}

/** Opens the cart (a sheet on phones; always visible on laptops) and returns it. */
export async function openCart(page: Page): Promise<Locator> {
  if (isWide(page)) return page.getByRole('complementary', { name: 'Keranjang' });
  await page.getByRole('button', { name: /Lihat keranjang/ }).click();
  return page.getByRole('dialog', { name: 'Keranjang' });
}

/**
 * Waits until the service worker is active and has cached the app. From the
 * next page load on, the app opens without internet.
 */
export async function waitForOfflineReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

/** Reads a value from the app's local `meta` table in IndexedDB. */
export function readMeta(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (metaKey) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('pos-sederhana');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction('meta').objectStore('meta').get(metaKey);
          request.onsuccess = () => {
            open.result.close();
            resolve(request.result?.value ?? null);
          };
          request.onerror = () => reject(request.error);
        };
      }),
    key,
  );
}
