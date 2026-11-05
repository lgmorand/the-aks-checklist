import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fromRoot } from './lib.mjs';
import { startPreview } from './preview.mjs';

const preview = await startPreview();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1250 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(preview.url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await mkdir(fromRoot('src', 'web', 'img', 'screenshots'), { recursive: true });
  await page.screenshot({ path: fromRoot('src', 'web', 'img', 'screenshots', 'checklist-light.png') });
  await page.locator('#theme-toggle').click();
  await page.screenshot({ path: fromRoot('src', 'web', 'img', 'screenshots', 'checklist-dark.png') });
  const icon = await context.newPage();
  await icon.setViewportSize({ width: 256, height: 256 });
  await icon.setContent(`<body style="margin:0;background:transparent"><img src="${preview.url}/img/logos/aks-mark.svg" width="256" height="256" alt=""></body>`);
  const png = await icon.locator('img').screenshot({ omitBackground: true });
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  await writeFile(fromRoot('src', 'web', 'favicon.ico'), Buffer.concat([header, png]));
  await icon.setViewportSize({ width: 150, height: 150 });
  await icon.locator('img').evaluate((element) => { element.width = 150; element.height = 150; });
  await icon.locator('img').screenshot({ path: fromRoot('src', 'web', 'mstile-150x150.png'), omitBackground: true });
  console.log('Captured fresh light and dark screenshots for README.');
} finally {
  if (browser) await browser.close();
  await preview.close();
}
