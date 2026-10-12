// M22 화면 확인: node tools/m22-ui.mjs <주소> <폴더> [시드]
// 작전마다 (픽앤롤·핀다운·아이솔·포스트·모션) 코트 표시를 찍고, 작전 탭을 찍는다
import { chromium } from 'playwright-core';
const [url, dir, seed = '7'] = process.argv.slice(2);
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
const picks = await page.evaluate(() => {
  const g = window.bask.host.pb.game;
  const out = {};
  for (const e of g.events) if (e.type === 'play' && e.tick > 600 && !out[e.play]) out[e.play] = e.tick;
  return out;
});
console.log(picks);
for (const [k, t] of Object.entries(picks)) {
  await page.evaluate((t) => {
    const pb = window.bask.host.pb;
    pb.paused = true;
    pb.speed = 4;
    pb.cur = t + 12;
  }, t);
  await page.waitForTimeout(200);
  await page.locator('#game canvas').screenshot({ path: `${dir}/m22-${k}.png` });
}
await page.evaluate(() => {
  const pb = window.bask.host.pb;
  pb.cur = pb.last - 5;
});
await page.click('[data-tab=tactics]');
await page.waitForTimeout(900);
await page.locator('#tab-tactics').screenshot({ path: `${dir}/m22-tab.png` });
await page.click('[data-tab=log]');
await page.waitForTimeout(300);
await page.locator('#tab-log').screenshot({ path: `${dir}/m22-log.png` });
console.log('errors', errors.length ? errors : 'none');
await browser.close();
