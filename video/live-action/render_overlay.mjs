// Renders the graphics layer to RGBA PNG sequences, one per active window.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const FPS = 30;
const OUT = process.argv[2] || new URL('./overlays', import.meta.url).pathname;
// only the windows that actually carry graphics
const SEGMENTS = [
  { name: 'title', t0: 0.00, t1: 5.10 },
  { name: 'super1', t0: 30.55, t1: 32.70 },
  { name: 'super2', t0: 39.75, t1: 41.70 },
  { name: 'eco',    t0: 46.55, t1: 54.75 },   // super3 + ecosystem overlap here
  { name: 'end',    t0: 57.60, t1: 60.00 },
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
await page.goto(new URL('./overlay.html', import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => window.__ready === true);

const clip = { x: 0, y: 0, width: 1920, height: 1080 };
for (const s of SEGMENTS) {
  const dir = `${OUT}/${s.name}`;
  mkdirSync(dir, { recursive: true });
  const n = Math.round((s.t1 - s.t0) * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.seek(t), s.t0 + i / FPS);
    await page.screenshot({
      path: `${dir}/${String(i).padStart(5, '0')}.png`,
      clip, omitBackground: true, type: 'png',
    });
  }
  console.log(`${s.name}: ${n} frames @ ${s.t0.toFixed(2)}s`);
}
await browser.close();
