import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const out = process.argv[2];
const times = process.argv.slice(3).map(Number);
const b = await chromium.launch({ args:['--force-color-profile=srgb'] });
const p = await b.newPage({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file:///home/user/Transit-OS/video/film.html');
await p.evaluate(()=>document.fonts.ready);
await p.waitForFunction(()=>window.__ready===true);
for (let i=0;i<times.length;i++){
  await p.evaluate(t=>window.seek(t), times[i]);
  await p.screenshot({ path:`${out}/f${String(i).padStart(2,'0')}_${times[i]}.png`, clip:{x:0,y:0,width:1920,height:1080} });
}
await b.close();
console.log(errs.length?('PAGE ERRORS:\n'+errs.slice(0,5).join('\n')):'no page errors');
