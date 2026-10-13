// M28 감독 조정 화면: node tools/m28-ui.mjs <주소> <출력> <시드>
import { chromium } from 'playwright-core';
const [url, out, seed] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
await page.goto(url);
await page.waitForTimeout(1200);
await page.evaluate((s) => window.bask.startExhibition(Number(s)), seed);
await page.waitForTimeout(500);
const ev = await page.evaluate(() => {
  const g = window.bask.host.pb.game;
  const e = g.events.find((e) => e.type === 'adjust' && e.adj === 'focus') ?? g.events.find((e) => e.type === 'adjust' && e.adj !== 'twoForOne');
  return { tick: e.tick, text: e.text };
});
console.log(JSON.stringify(ev));
for (let k = 8; k >= 0; k--) {
  await page.evaluate((t) => { const pb = window.bask.host.pb; pb.paused = true; pb.speed = 4; pb.cur = t; }, ev.tick - k);
  await page.waitForTimeout(60);
}
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}-banner.png` });
// 작전 탭
await page.evaluate((t) => { window.bask.host.pb.cur = t + 900; }, ev.tick);
await page.waitForTimeout(300);
await page.click('button[data-tab="tactics"]');
await page.waitForTimeout(600);
const panel = await page.locator('button[data-tab="tactics"]').boundingBox();
await page.screenshot({ path: `${out}-tactics.png`, clip: { x: panel.x - 400, y: panel.y - 10, width: 440, height: 640 } });
await browser.close();
