// M24 덩크 도약 확인: 덩크마다 도약 전부터 꽂을 때까지 한 틱씩, 날아가는 길 전체가 보이게 잘라 붙인다
// node tools/m24-glide.mjs <주소> <출력.png> <시드> [장면 수] [kind]
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const [url, out, seed = '7', scenes = '4', kind = 'dunk', skip = '0'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.evaluate(() => {
  localStorage.setItem('bask.labels', 'off');
  localStorage.setItem('bask.tactics', 'off');
});
await page.reload();
await page.waitForTimeout(1200);
await page.evaluate((s) => window.bask.startExhibition(Number(s)), seed);
await page.waitForTimeout(500);
const found = await page.evaluate(
  ([kind, n, skip]) => {
    const g = window.bask.host.pb.game;
    const out = [];
    for (const e of g.events) {
      if (e.type !== 'made' || e.shot !== kind || e.blocked) continue;
      let lu = g.lineups[0];
      for (const l of g.lineups) if (l.tick <= e.tick) lu = l;
      const slot = lu.pids.indexOf(e.player);
      if (slot < 0) continue;
      // 발이 땅을 떠난 첫 틱
      let f = e.tick;
      while (f > 0 && g.rec.pz[(f - 1) * 10 + slot] > 0) f--;
      const xs = [];
      for (let k = f - 5; k <= e.tick + 2; k++) xs.push([g.rec.pos[k * 20 + slot * 2], g.rec.pos[k * 20 + slot * 2 + 1]]);
      out.push({ tick: e.tick, from: f - 5, text: e.text, xs });
      if (out.length >= Number(n) + Number(skip)) break;
    }
    return out.slice(Number(skip));
  },
  [kind, scenes, skip],
);
const files = [];
let si = 0;
for (const f of found) {
  const xs = f.xs.slice(5).map((p) => p[0]);
  const ys = f.xs.slice(5).map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const n = f.tick + 2 - f.from + 1;
  for (let k = 0; k < n; k++) {
    await page.evaluate(
      ([t]) => {
        const pb = window.bask.host.pb;
        pb.paused = true;
        pb.speed = 4;
        pb.cur = t;
      },
      [f.from + k],
    );
    await page.waitForTimeout(80);
    const file = `${out}.s${si}.${String(k).padStart(2, '0')}.png`;
    await page.locator('#game canvas').screenshot({ path: file });
    files.push([file, cx, cy, si, k]);
  }
  console.log(si, f.text, `takeoff→slam ${f.tick - f.from - 5} ticks`);
  si++;
}
await browser.close();
execFileSync('python3', ['-c', `
import json,sys,os
from PIL import Image
fs=json.loads(sys.argv[1]); out=sys.argv[2]
rows={}
for f,x,y,si,k in fs:
    im=Image.open(f); W,H=im.size; s=W/640
    cx=(40+x*20)*s; cy=(100+y*14)*s
    hw=int(os.environ.get("HW","60"))
    box=(int(cx-hw*s),int(cy-62*s),int(cx+hw*s),int(cy+14*s))
    c=im.crop(box)
    z=float(os.environ.get("Z","1"))
    if z!=1: c=c.resize((int(c.width*z),int(c.height*z)),Image.NEAREST)
    rows.setdefault(si,[]).append(c)
    os.remove(f)
cw,ch=rows[0][0].size
cols=max(len(v) for v in rows.values())
per=int(os.environ.get("PER","8"))
R=sum((len(v)+per-1)//per for v in rows.values())
sheet=Image.new('RGB',(cw*per,ch*R),(20,20,30))
r=0
for si in sorted(rows):
    for k,im in enumerate(rows[si]):
        sheet.paste(im,((k%per)*cw,(r+k//per)*ch))
    r+=(len(rows[si])+per-1)//per
sheet.save(out)
`, JSON.stringify(files), out]);
console.log('errors', errors.length ? errors : 'none');
