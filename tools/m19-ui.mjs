// M19 화면 확인: node tools/m19-ui.mjs <주소> <폴더> <프로 세이브>
// 카드의 자신감·별명, 일정 탭 다른 팀 경기 보기, 도움말
import { chromium } from 'playwright-core';
const [url, dir, savePath] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(url);
await page.waitForTimeout(1000);
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=import][data-slot="2"]')]);
await fc.setFiles(savePath);
await page.waitForTimeout(800);
for (let k = 0; k < 12 && !(await page.$('#modal[hidden]')); k++) {
  const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice:not([disabled])'));
  if (!b) break;
  await b.click();
  await page.waitForTimeout(300);
}
const card = await page.$eval('#pcard', (e) => e.textContent);
console.log('card has 자신감', card.includes('자신감'), 'nick', await page.$eval('.pnick', (e) => e.textContent).catch(() => '(없음)'));
await page.click('[data-tab=schedule]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${dir}/m19-schedule.png`, fullPage: true });
const btn = await page.$('[data-watchg]');
console.log('watch buttons', (await page.$$('[data-watchg]')).length);
if (btn) {
  await btn.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/m19-watch.png` });
  console.log('banner', await page.$eval('#careerbar', (e) => e.textContent));
  await page.click('#btnEnd').catch(() => {});
  await page.waitForTimeout(800);
  await page.click('#btnDone');
  await page.waitForTimeout(800);
  console.log('back home', await page.$eval('#scr-home', (e) => !e.hidden));
}
await page.click('#btnHelp');
await page.waitForTimeout(400);
await page.screenshot({ path: `${dir}/m19-help.png` });
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
