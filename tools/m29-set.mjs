// M29 세트 화면: node tools/m29-set.mjs <주소> <출력> <시드> <세트 id>
import { chromium } from 'playwright-core';
const [url, out, seed, id] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
await page.goto(url);
await page.evaluate(() => { localStorage.setItem('bask.labels', 'num'); localStorage.setItem('bask.tactics', 'on'); });
await page.reload();
await page.waitForTimeout(1200);
await page.evaluate((s) => window.bask.startExhibition(Number(s)), seed);
await page.waitForTimeout(500);
const ev = await page.evaluate((id) => {
  const g = window.bask.host.pb.game;
  const e = g.events.filter((e) => e.type === 'play' && e.play === id)[1] ?? g.events.find((e) => e.type === 'play' && e.play === id);
  return { tick: e.tick, text: e.text };
}, id);
console.log(JSON.stringify(ev));
let i = 0;
for (const off of [2, 14, 26, 38]) {
  for (let k = 3; k >= 0; k--) {
    await page.evaluate((t) => { const pb = window.bask.host.pb; pb.paused = true; pb.speed = 4; pb.cur = t; }, ev.tick + off - k);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(150);
  const box = await page.locator('#game canvas').boundingBox();
  await page.screenshot({ path: `${out}.${i++}.png`, clip: { x: box.x, y: box.y + box.height * 0.22, width: box.width, height: box.height * 0.62 } });
}
await browser.close();
const { execFileSync } = await import('node:child_process');
execFileSync('python3', ['-c', `
import sys
from PIL import Image
out=sys.argv[1]; n=int(sys.argv[2])
ims=[Image.open(f'{out}.{k}.png') for k in range(n)]
ims=[im.resize((im.width//2, im.height//2)) for im in ims]
w,h=ims[0].size; cols=2; rows=(n+1)//2
sheet=Image.new('RGB',(w*cols,h*rows),(20,20,30))
for k,im in enumerate(ims): sheet.paste(im,((k%cols)*w,(k//cols)*h))
sheet.save(out+'.png')
`, out, String(i)]);
