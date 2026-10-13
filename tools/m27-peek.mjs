// M27 몸싸움 장면: node tools/m27-peek.mjs <주소> <출력> <시드> <몇 번째> <종류(shove|stop|backdown|hold|screen|screen:엘리베이터|charge)> [앞 틱] [뒤 틱]
import { chromium } from 'playwright-core';
const [url, out, seed, nth, kind, before = '8', after = '6'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
await page.goto(url);
await page.evaluate(() => { localStorage.setItem('bask.labels', 'off'); localStorage.setItem('bask.tactics', 'off'); });
await page.reload();
await page.waitForTimeout(1200);
await page.evaluate((s) => window.bask.startExhibition(Number(s)), seed);
await page.waitForTimeout(500);
const ev = await page.evaluate(([n, kind]) => {
  const g = window.bask.host.pb.game;
  const pick = (e) => (kind.startsWith('screen') ? e.type === 'screen' && (kind === 'screen' || e.text.includes(kind.slice(7))) : kind === 'charge' ? e.type === 'foul' && e.foul === 'charge' : e.type === 'contact' && e.contact === kind);
  const e = g.events.filter(pick)[Number(n)];
  const pb = window.bask.host.pb;
  const s = pb.slotOf(e.player, e.tick);
  window.bask.host.focus = e.player;
  return { tick: e.tick, text: e.text, x: g.rec.pos[e.tick * 20 + s * 2], y: g.rec.pos[e.tick * 20 + s * 2 + 1] };
}, [nth, kind]);
console.log(JSON.stringify(ev));
let i = 0;
for (let t = ev.tick - Number(before); t <= ev.tick + Number(after); t += 2) {
  for (let k = 3; k >= 0; k--) {
    await page.evaluate((t) => { const pb = window.bask.host.pb; pb.paused = true; pb.speed = 4; pb.cur = t; }, t - k);
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(120);
  const box = await page.locator('#game canvas').boundingBox();
  const s = box.width / 640;
  const cx = (40 + ev.x * 20) * s, cy = (100 + ev.y * 14) * s;
  await page.screenshot({ path: `${out}.${i++}.png`, clip: { x: box.x + Math.max(0, cx - 130), y: box.y + Math.max(0, cy - 170), width: 260, height: 210 } });
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
