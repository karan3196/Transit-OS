import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';

const FPS = Number(process.env.FPS || 30);
const DUR = Number(process.env.DUR || 60);
const OUT = process.env.OUT;
const FFMPEG = process.env.FFMPEG;
const total = Math.round(FPS * DUR);

const ff = spawn(FFMPEG, ['-y','-hide_banner','-loglevel','error',
  '-f','image2pipe','-framerate',String(FPS),'-i','-',
  '-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p',
  '-profile:v','high','-level','4.2','-movflags','+faststart', OUT]);
ff.stderr.on('data', d => process.stderr.write(d));
const done = new Promise((res, rej) => ff.on('close', c => c===0?res():rej(new Error('ffmpeg '+c))));

const browser = await chromium.launch({ args:['--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('file:///home/user/Transit-OS/video/film.html');
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => window.__ready === true);

const clip = { x:0, y:0, width:1920, height:1080 };
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate(t => window.seek(t), i / FPS);
  const buf = await page.screenshot({ clip, type:'jpeg', quality:96, animations:'disabled' });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 150 === 0 || i === total-1) {
    const el=(Date.now()-t0)/1000, eta=i?(el/(i+1))*(total-i-1):0;
    console.log(`frame ${i+1}/${total}  ${el.toFixed(0)}s  ~${eta.toFixed(0)}s left`);
  }
}
ff.stdin.end();
await browser.close();
await done;
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0,3).join(' | '));
console.log('WROTE', OUT);
