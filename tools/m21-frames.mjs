// M21 동작 확인: 경기에서 그 장면을 찾아 0.05초씩 찍어 한 장으로 붙인다
// node tools/m21-frames.mjs <주소> <출력.png> <시드> <종류: dunk|layup|three|mid|hook|floater|move이름|dribble> [몇 장면] [몇 칸 전부터] [장 수]
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const [url, out, seed = '7', kind = 'dunk', scenes = '3', back = '12', count = '12'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.evaluate(() => localStorage.setItem('bask.labels', 'off'));
await page.reload();
await page.waitForTimeout(1200);
await page.evaluate((s) => window.bask.startExhibition(Number(s)), seed);
await page.waitForTimeout(500);
const found = await page.evaluate(
  ([kind, n]) => {
    const g = window.bask.host.pb.game;
    const ev = g.events.filter((e) => (e.type === 'made' || e.type === 'miss') && (kind === 'deep' ? e.type === 'made' && e.pts === 3 && e.dist >= 8 : kind === 'chase' ? e.chase : e.shot === kind || e.move === kind || e.dunk === kind));
    return ev.slice(0, Number(n)).map((e) => ({ tick: e.tick, x: e.x, y: e.y, text: e.text, player: e.player }));
  },
  [kind, scenes],
);
const files = [];
let si = 0;
for (const f of found) {
  for (let k = 0; k < Number(count); k++) {
    await page.evaluate(
      ([t]) => {
        const pb = window.bask.host.pb;
        pb.paused = true;
        pb.speed = 4; // 확대 연출 없이
        pb.cur = t;
      },
      [f.tick - Number(back) + k * 1.0],
    );
    await page.waitForTimeout(90);
    const file = `${out}.s${si}.${String(k).padStart(2, '0')}.png`;
    await page.locator('#game canvas').screenshot({ path: file });
    files.push({ file, x: f.x, y: f.y, si, k });
  }
  console.log(si, f.text);
  si++;
}
console.log(JSON.stringify(files.map((f) => [f.file, f.x, f.y, f.si, f.k])).slice(0, 0));
await browser.close();
// 이어 붙이기 (파이썬)
execFileSync('python3', ['-c', `
import json,sys
from PIL import Image
fs=json.loads(sys.argv[1]); out=sys.argv[2]
ims=[]
for f,x,y,si,k in fs:
    im=Image.open(f); W,H=im.size; s=W/640
    cx=(40+x*20)*s; cy=(100+y*14)*s
    hw=int(__import__("os").environ.get("WIDE","45")); box=(int(cx-hw*s),int(cy-80*s),int(cx+hw*s),int(cy+12*s))
    c=im.crop(box); c=c.resize((c.width*2,c.height*2),Image.NEAREST)
    ims.append((si,k,c))
cw,ch=ims[0][2].size
rows=max(i[0] for i in ims)+1; cols=max(i[1] for i in ims)+1
sheet=Image.new('RGB',(cw*min(cols,6),ch*rows*((cols+5)//6)),(20,20,30))
for si,k,im in ims:
    r=si*((cols+5)//6)+k//6; c=k%6
    sheet.paste(im,(c*cw,r*ch))
sheet.save(out)
`, JSON.stringify(files.map((f) => [f.file, f.x, f.y, f.si, f.k])), out]);
console.log('errors', errors.length ? errors : 'none');
