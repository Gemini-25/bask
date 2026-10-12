// 이름표 확인: node tools/labels-ui.mjs <주소> <폴더> — 데모 경기에서 번호 / 이름 / 끔
import { chromium } from 'playwright-core';
const [url, dir] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(1000);
await page.click('text=프로 리그 경기 관람');
await page.waitForTimeout(2500);
for (const m of ['number', 'name', 'off']) {
  await page.click(`[data-label=${m}]`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/labels-${m}.png`, clip: { x: 0, y: 230, width: 990, height: 560 } });
}
await page.keyboard.press('KeyL');
await page.waitForTimeout(300);
console.log('L → ', await page.$eval('#labels button.on', (b) => b.dataset.label));
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
