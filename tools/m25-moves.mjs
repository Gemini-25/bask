// M25 드리블 기술 장면: node tools/m25-moves.mjs <주소> <출력> <시드> [몇 번째] [종류 dribble|ankle]
// 기술 전후를 한 틱씩 찍어 공 가진 선수 둘레를 잘라 붙인다
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const [url, out, seed = '7', nth = '0', kind = 'dribble', before = '6', after = '9'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
await page.goto(url);
await page.evaluate(() => {
  localStorage.setItem('bask.labels', 'off');
  localStorage.setItem('bask.tactics', 'off');
});
await page.reload();
await page.waitForTimeout(1200);
await page.evaluate((s) => window.bask.startExhibition(Number(s)), seed);
await page.waitForTimeout(500);
const ev = await page.evaluate(
  ([n, kind]) => {
    const g = window.bask.host.pb.game;
    const list = g.events.filter((e) => e.type === kind && (kind !== 'dribble' || (e.stage ?? 0) >= 1));
    const e = list[Number(n)];
    let lu = g.lineups[0];
    for (const l of g.lineups) if (l.tick <= e.tick) lu = l;
    const s = lu.pids.indexOf(e.player);
    return { tick: e.tick, text: e.text, x: g.rec.pos[e.tick * 20 + s * 2], y: g.rec.pos[e.tick * 20 + s * 2 + 1] };
  },
  [nth, kind],
);
console.log(JSON.stringify(ev));
const files = [];
for (let t = ev.tick - Number(before); t <= ev.tick + Number(after); t++) {
  await page.evaluate((t) => {
    const pb = window.bask.host.pb;
    pb.paused = true;
    pb.speed = 4;
    pb.cur = t;
  }, t);
  await page.waitForTimeout(70);
  const box = await page.locator('#game canvas').boundingBox();
  const s = box.width / 640;
  const cx = (40 + ev.x * 20) * s;
  const cy = (100 + ev.y * 14) * s;
  const f = `${out}.${files.length}.png`;
  await page.screenshot({ path: f, clip: { x: box.x + Math.max(0, cx - 110), y: box.y + Math.max(0, cy - 110), width: 220, height: 140 } });
  files.push(f);
}
await browser.close();
execFileSync('python3', ['-c', `
import sys,os
from PIL import Image
fs=sys.argv[2:]; out=sys.argv[1]
ims=[Image.open(f) for f in fs]
w,h=ims[0].size; cols=4; rows=(len(ims)+cols-1)//cols
sheet=Image.new('RGB',(w*cols,h*rows),(20,20,30))
for k,im in enumerate(ims): sheet.paste(im,((k%cols)*w,(k//cols)*h))
sheet.save(out+'.png')
for f in fs: os.remove(f)
`, out, ...files]);
