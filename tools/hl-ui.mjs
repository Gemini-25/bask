// 하이라이트 모드 확인: node tools/hl-ui.mjs <주소> <폴더> — 데모 경기에서 빨리 감기 ↔ 1배속
import { chromium } from 'playwright-core';
const [url, dir] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(1000);
await page.click('text=프로 리그 경기 관람');
await page.waitForTimeout(1500);
await page.click('[data-mode=highlights]');
const clock = () => page.$eval('#clock', (e) => e.textContent).catch(() => '');
let fastSeen = false;
let slowSeen = false;
for (let k = 0; k < 40 && !(fastSeen && slowSeen); k++) {
  const a = await clock();
  await page.waitForTimeout(500);
  const b = await clock();
  const hint = await page.$eval('#modehint', (e) => e.textContent).catch(() => '');
  // 경기 시계가 0.5초에 몇 초 흘렀나로 본다 (빨리 감기면 수 초, 1배속이면 0.5초 안팎)
  const sec = (t) => (t.includes(':') ? Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]) : Number(t));
  const d = sec(a) - sec(b);
  const ff = d > 2;
  if (ff && !fastSeen) {
    fastSeen = true;
    await page.screenshot({ path: `${dir}/hl-fast.png`, clip: { x: 0, y: 90, width: 990, height: 700 } });
  }
  if (!ff && !slowSeen && k > 1) {
    slowSeen = true;
    await page.screenshot({ path: `${dir}/hl-slow.png`, clip: { x: 0, y: 90, width: 990, height: 700 } });
  }
  console.log(k, a, '→', b, ff ? '빨리 감기' : d > 0 ? '하이라이트 1배속' : '멈춤(공 죽음)', hint);
}
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
