// Builds the app icons from the Reqap logo symbol (docs/logo/reqap-symbol.png).
// Run after changing the logo: node scripts/render-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const symbol = `data:image/png;base64,${readFileSync('docs/logo/reqap-symbol.png').toString('base64')}`;

// [output, size, corner radius (fraction of size), symbol size (fraction of size)]
const icons = [
  // Regular icons: a white rounded tile, transparent outside the corners.
  ['public/pwa-192x192.png', 192, 0.22, 0.86],
  ['public/pwa-512x512.png', 512, 0.22, 0.86],
  // Android crops maskable icons to its own shape; the symbol stays inside the 80% safe zone.
  ['public/maskable-icon-512x512.png', 512, 0, 0.66],
  // iOS rounds the corners itself and does not allow transparency.
  ['public/apple-touch-icon-180x180.png', 180, 0, 0.8],
  // Browser tab: as large as possible, details are tiny anyway.
  ['public/favicon-48x48.png', 48, 0.18, 0.96],
];

const browser = await chromium.launch();
for (const [output, size, radius, scale] of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`
    <style>
      html, body { margin: 0; background: transparent; }
      .tile {
        width: ${size}px; height: ${size}px; background: #fff;
        border-radius: ${radius * size}px;
        display: flex; align-items: center; justify-content: center;
      }
      img { width: ${scale * size}px; height: ${scale * size}px; }
    </style>
    <div class="tile"><img src="${symbol}"></div>`);
  await page.locator('img').evaluate((img) => img.decode());
  await page.locator('.tile').screenshot({ path: output, omitBackground: true });
  await page.close();
  console.log(`${output} (${size}×${size})`);
}
await browser.close();
