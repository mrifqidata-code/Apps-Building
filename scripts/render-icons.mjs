// Renders the Reqap logo (docs/logo/*.svg) into the PNG icons the PWA needs.
// Run after changing the logo: node scripts/render-icons.mjs
import { chromium } from '@playwright/test';
import { copyFileSync, readFileSync } from 'node:fs';

const LOGO = 'docs/logo';
const icons = [
  // [source svg, output png, size]
  ['reqap-icon.svg', 'public/pwa-192x192.png', 192],
  ['reqap-icon.svg', 'public/pwa-512x512.png', 512],
  // Android crops maskable icons to its own shape; the artwork sits in the 80% safe zone.
  ['reqap-icon-maskable.svg', 'public/maskable-icon-512x512.png', 512],
  // iOS rounds the corners itself and does not allow transparency.
  ['reqap-icon-apple.svg', 'public/apple-touch-icon-180x180.png', 180],
  ['reqap-wordmark.svg', 'docs/logo/reqap-wordmark.png', 0],
];

const browser = await chromium.launch();
for (const [source, output, size] of icons) {
  const svg = readFileSync(`${LOGO}/${source}`, 'utf8');
  const [, , width, height] = svg
    .match(/viewBox="([\d.\s]+)"/)[1]
    .split(/\s+/)
    .map(Number);
  const w = size || width * 2;
  const h = size || height * 2;
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${w}px;height:${h}px}</style>${svg}`,
  );
  await page.locator('svg').screenshot({ path: output, omitBackground: true });
  await page.close();
  console.log(`${output} (${w}×${h})`);
}
await browser.close();

copyFileSync(`${LOGO}/reqap-icon.svg`, 'public/favicon.svg');
console.log('public/favicon.svg');
