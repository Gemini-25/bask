// 차트 탭 확인용: node tools/charts.mjs <url> <출력 폴더> [경기 번호]
import { chromium } from 'playwright-core';
const [url, dir, seed] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 980 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForTimeout(1200);
await page.evaluate((s) => window.bask.startExhibition(Number(s || 1)), seed);
// 3쿼터 중간까지 감아 두고 본다
await page.evaluate(() => {
  const pb = window.bask.host.pb;
  pb.seek(Math.floor(pb.last * 0.62));
  pb.paused = true;
});
await page.click('[data-tab=flow]');
await page.waitForTimeout(700);
const svg = await page.$('.wpsvg');
const b = await svg.boundingBox();
await page.mouse.move(b.x + b.width * 0.35, b.y + b.height * 0.5);
await page.waitForTimeout(200);
await page.screenshot({ path: `${dir}/flow.png` });
await page.click('[data-tab=shots]');
await page.waitForTimeout(700);
const dots = await page.$$('.shotsvg .shot');
if (dots.length) {
  const db = await dots[dots.length - 1].boundingBox();
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2);
}
await page.waitForTimeout(200);
await page.screenshot({ path: `${dir}/shots.png` });
// 선수 하나 고르고 샷차트 다시
await page.click('[data-tab=box]');
await page.waitForTimeout(500);
await page.click('#tab-box tr[data-p="0"]');
await page.click('[data-tab=shots]');
await page.waitForTimeout(700);
await page.mouse.move(5, 5);
await page.screenshot({ path: `${dir}/shots-focus.png` });
// 하이라이트 모드
await page.evaluate(() => (window.bask.host.pb.paused = false));
await page.click('[data-mode=highlights]');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${dir}/highlights.png` });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
