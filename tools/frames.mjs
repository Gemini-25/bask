// 경기 화면을 연속으로 찍어 한 장에 모은다 (움직임 확인용).
// node tools/frames.mjs [출력.png] [시드] [시작 초] [장 수] [간격 초(게임 시간)]
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const [out = 'frames.png', seed = '42', start = '60', count = '12', step = '0.6'] = process.argv.slice(2);
const dir = mkdtempSync(resolve(tmpdir(), 'frames-'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForTimeout(1500);
await page.evaluate((s) => window.bask.startGame(Number(s)), seed);
await page.waitForTimeout(300);
const files = [];
for (let k = 0; k < Number(count); k++) {
  await page.evaluate(([st, sp, kk]) => {
    const pb = window.bask.host.pb;
    pb.paused = true;
    pb.seek((Number(st) + Number(sp) * kk) / pb.game.dt);
  }, [start, step, k]);
  await page.waitForTimeout(120);
  const f = `${dir}/f${String(k).padStart(2, '0')}.png`;
  await page.locator('#game canvas').screenshot({ path: f });
  files.push(f);
}
await browser.close();
execFileSync('montage', [...files, '-tile', '3x', '-geometry', '+4+4', '-background', '#000', out]);
console.log(out);
