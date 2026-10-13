import { expect, test } from '@playwright/test';
import { waitForOfflineReady } from './helpers';

test('syarat layanan, kebijakan privasi, dan tombol hubungi kami, juga tanpa internet', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await waitForOfflineReady(page);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('link', { name: 'Panduan pemakaian' }).click();

  // The operator's WhatsApp number comes from the build (VITE_SUPPORT_WHATSAPP).
  const contact = page.getByRole('link', { name: 'Hubungi kami lewat WhatsApp' });
  await expect(contact).toHaveAttribute(
    'href',
    `https://wa.me/6281200001111?text=${encodeURIComponent(
      'Halo, saya butuh bantuan memakai Reqap (toko Kedai Kopi Senja (Demo)).',
    )}`,
  );

  // The links sit below the guide; the page they open starts at its top.
  await page.getByRole('link', { name: 'Syarat Layanan' }).click();
  await expect(
    page.getByRole('heading', { name: 'Syarat Layanan Reqap', level: 1 }),
  ).toBeInViewport();
  await expect(page.getByRole('main')).toContainText('uji coba gratis 30 hari');
  await page.goBack();
  await page.getByRole('link', { name: 'Kebijakan Privasi' }).click();
  await expect(
    page.getByRole('heading', { name: 'Kebijakan Privasi Reqap', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data yang tidak kami simpan' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Nomor WhatsApp pelanggan');

  await page.getByRole('link', { name: '← Kembali ke layar masuk' }).click();
  await expect(page.getByText('Siapa yang bertugas?')).toBeVisible();
});
