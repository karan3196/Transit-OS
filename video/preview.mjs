import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const out = process.argv[2];
const times = process.argv.slice(3).map(Number);
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
await p.goto('file:///home/user/Transit-OS/video/scene.html');
await p.evaluate(()=>document.fonts.ready);
await p.waitForFunction(()=>window.__ready===true);
for (let i=0;i<times.length;i++){
  await p.evaluate(t=>window.seek(t), times[i]);
  await p.screenshot({ path:`${out}/t${String(i).padStart(2,'0')}_${times[i]}.png`, clip:{x:0,y:0,width:1920,height:1080} });
}
await b.close();
console.log('captured', times.length);
