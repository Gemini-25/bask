// 경기 화면 전체를 몇 장 찍는다: node tools/m21-full.mjs <주소> <폴더> <시드> <틱,틱,...> [이름표 off|number|name]
import { chromium } from 'playwright-core';
const [url, dir, seed = '7', ticks = '600,1500,3000', labels = 'number'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.evaluate((l) => localStorage.setItem('bask.labels', l), labels);
await page.reload();
await page.waitForTimeout(1200);
await page.evaluate((s) => window.bask.startExhibition(Number(s)), seed);
await page.waitForTimeout(400);
for (const t of ticks.split(',')) {
  await page.evaluate((t) => {
    const pb = window.bask.host.pb;
    pb.paused = true;
    pb.speed = 4;
    pb.cur = Number(t);
  }, t);
  await page.waitForTimeout(150);
  await page.locator('#game canvas').screenshot({ path: `${dir}/full-${seed}-${t}.png` });
}
console.log('errors', errors.length ? errors : 'none');
await browser.close();
