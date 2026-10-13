// M26 빗나간 슛·리바운드 장면: node tools/m26-peek.mjs <주소> <출력> <시드> <몇 번째 실패> [종류(front|back|side|board|tipIn)]
import { chromium } from 'playwright-core';
const [url, out, seed, nth, want] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
await page.goto(url);
await page.evaluate(() => { localStorage.setItem('bask.labels', 'off'); localStorage.setItem('bask.tactics', 'off'); });
await page.reload();
await page.waitForTimeout(1200);
await page.evaluate((s) => window.bask.startExhibition(Number(s)), seed);
await page.waitForTimeout(500);
const ev = await page.evaluate(([n, want]) => {
  const g = window.bask.host.pb.game;
  const list = [];
  for (let i = 0; i < g.events.length; i++) {
    const e = g.events[i];
    if (e.type !== 'miss' || e.blocked) continue;
    const r = g.events.slice(i + 1, i + 8).find((x) => x.type === 'rebound');
    if (!r) continue;
    const tip = g.events.slice(i + 1, i + 10).find((x) => (x.type === 'made' || x.type === 'miss') && x.move === 'tipIn');
    if (want === 'tipIn' ? !tip : want && e.missKind !== want) continue;
    list.push({ tick: e.tick, reb: tip ? tip.tick + 4 : r.tick, kind: e.missKind, text: e.text + ' → ' + r.text + (tip ? ' → ' + tip.text : ''), x: g.rec.ball[e.tick * 3], y: g.rec.ball[e.tick * 3 + 1] });
  }
  return list[Number(n)];
}, [nth, want]);
console.log(JSON.stringify(ev));
const ticks = [];
for (let t = ev.tick - 1; t <= ev.reb + 1; t++) ticks.push(t);
let i = 0;
for (const t of ticks.slice(0, 12)) {
  for (let k = 3; k >= 0; k--) {
    await page.evaluate((t) => { const pb = window.bask.host.pb; pb.paused = true; pb.speed = 4; pb.cur = t; }, t - k);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(120);
  const box = await page.locator('#game canvas').boundingBox();
  const s = box.width / 640;
  const hx = ev.x > 14 ? 26.425 : 1.575;
  const cx = (40 + hx * 20 + (hx > 14 ? -60 : 60)) * s, cy = (100 + 7.5 * 14) * s;
  await page.screenshot({ path: `${out}.${i++}.png`, clip: { x: box.x + Math.max(0, cx - 160), y: box.y + Math.max(0, cy - 200), width: 320, height: 260 } });
}
await browser.close();
const { execFileSync } = await import('node:child_process');
execFileSync('python3', ['-c', `
import sys
from PIL import Image
out=sys.argv[1]; n=int(sys.argv[2])
ims=[Image.open(f'{out}.{k}.png') for k in range(n)]
w,h=ims[0].size; cols=min(4,n); rows=(n+cols-1)//cols
sheet=Image.new('RGB',(w*cols,h*rows),(20,20,30))
for k,im in enumerate(ims): sheet.paste(im,((k%cols)*w,(k//cols)*h))
sheet.save(out+'.png')
`, out, String(i)]);
