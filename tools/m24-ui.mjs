// M24 화면 확인: node tools/m24-ui.mjs <주소> <폴더> [세이브.json]
// 경기 화면 역할 이름표 · 작전 탭 역할 표, 커리어 홈 건너뛰기 막대·설정·결과, 팀 탭 역할, 경기 전 역할
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [url, dir, savePath] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.evaluate(() => {
  localStorage.setItem('bask.labels', 'role');
  localStorage.setItem('bask.tactics', 'off');
});
await page.reload();
await page.waitForTimeout(1200);
await page.evaluate(() => window.bask.startExhibition(7));
await page.waitForTimeout(500);
await page.evaluate(() => {
  const pb = window.bask.host.pb;
  pb.paused = true;
  pb.speed = 4;
  pb.cur = 900;
});
await page.waitForTimeout(300);
await page.locator('#game canvas').screenshot({ path: `${dir}/m24-rolelabels.png` });
await page.click('[data-tab=tactics]');
await page.waitForTimeout(900);
await page.locator('#tab-tactics').screenshot({ path: `${dir}/m24-tactics.png` });
await page.evaluate(() => localStorage.setItem('bask.labels', 'number'));
if (savePath) {
  const save = readFileSync(savePath, 'utf8');
  await page.goto(url);
  await page.waitForTimeout(800);
  await page.evaluate((s) => localStorage.setItem('bask.save.0', s), save);
  await page.evaluate(() => Object.keys(localStorage)).then((k) => console.log('keys', k.join(',')));
  await page.reload();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/m24-title.png` });
}
console.log('errors', errors.length ? errors : 'none');
await browser.close();
