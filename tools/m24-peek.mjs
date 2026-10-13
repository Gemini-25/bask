// M24 덩크 장면 크게: node tools/m24-peek.mjs <주소> <출력> <시드> <몇 번째 덩크> <틱...> (L0 = 도약, 0 = 꽂는 순간, 숫자 = 그 뒤)
import { chromium } from 'playwright-core';
const [url, out, seed, nth, ...offs] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
await page.goto(url);
await page.evaluate(() => { localStorage.setItem('bask.labels', 'off'); localStorage.setItem('bask.tactics', 'off'); });
await page.reload();
await page.waitForTimeout(1200);
await page.evaluate((s) => window.bask.startExhibition(Number(s)), seed);
await page.waitForTimeout(500);
if (process.env.NOFOCUS) await page.evaluate(() => (globalThis.NOFOCUS = 1));
const ev = await page.evaluate((n) => {
  const g = window.bask.host.pb.game;
  const e = g.events.filter((e) => e.type === 'made' && e.shot === 'dunk' && e.leap)[Number(n)];
  // 덩크하는 선수 위에 노란 화살표
  if (!globalThis.NOFOCUS) window.bask.host.focus = e.player;
  return { tick: e.tick, leap: e.leap, text: e.text };
}, nth);
console.log(JSON.stringify(ev));
let i = 0;
for (const o of offs) {
  const t = o.startsWith('L') ? ev.leap.t + Number(o.slice(1)) : ev.tick + Number(o);
  // 몇 틱 전부터 한 틱씩 따라가서 연출이 뜨게
  for (let k = 6; k >= 0; k--) {
    await page.evaluate((t) => { const pb = window.bask.host.pb; pb.paused = true; pb.speed = 4; pb.cur = t; }, t - k);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(150);
  const box = await page.locator('#game canvas').boundingBox();
  const s = box.width / 640;
  // 뛴 자리와 림 사이를 가운데로
  const hx = ev.leap.x > 14 ? 26.425 : 1.575;
  const cx = (40 + ((ev.leap.x + hx) / 2) * 20) * s, cy = (100 + ev.leap.y * 14) * s;
  await page.screenshot({ path: `${out}.${i++}.png`, clip: { x: box.x + Math.max(0, cx - 150), y: box.y + Math.max(0, cy - 190), width: 300, height: 240 } });
}
await browser.close();
// 한 장으로 (3칸씩)
const { execFileSync } = await import('node:child_process');
execFileSync('python3', ['-c', `
import sys
from PIL import Image
out=sys.argv[1]; n=int(sys.argv[2])
ims=[Image.open(f'{out}.{k}.png') for k in range(n)]
w,h=ims[0].size; cols=min(3,n); rows=(n+cols-1)//cols
sheet=Image.new('RGB',(w*cols,h*rows),(20,20,30))
for k,im in enumerate(ims): sheet.paste(im,((k%cols)*w,(k//cols)*h))
sheet.save(out+'.png')
`, out, String(offs.length)]);
