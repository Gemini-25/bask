// M12 화면 확인: node tools/m12-ui.mjs <주소> <폴더> <고3 마지막 주 세이브>
// 진로 선택 → 대학 입학 → 대학 홈·일정 → 선수 만들기의 성격 칸
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
let n = 0;
const shot = async (name, full = false) => page.screenshot({ path: `${dir}/m12-${String(n++).padStart(2, '0')}-${name}.png`, fullPage: full });
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=import][data-slot="2"]')]);
await fc.setFiles(savePath);
await page.waitForTimeout(800);
const drain = async () => {
  for (let k = 0; k < 12 && !(await page.$('#modal[hidden]')); k++) {
    if (await page.$('[data-path]')) return 'path';
    if (await page.$('#pgSkip')) {
      await page.click('#pgSkip');
      await page.waitForTimeout(500);
      await page.click('#rNext');
      await page.waitForTimeout(700);
      continue;
    }
    const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice'));
    if (!b) break;
    await b.click();
    await page.waitForTimeout(400);
  }
  return 'none';
};
await drain();
for (let w = 0; w < 3; w++) {
  if ((await drain()) === 'path') break;
  await page.click('[data-do]:not([disabled])');
  await page.waitForTimeout(1600);
}
await drain();
await shot('path');
// 두 번째 선택지 = 첫 번째 대학
const choices = await page.$$('[data-path]');
await choices[1].click();
await page.waitForTimeout(600);
await shot('entered');
await drain();
await page.waitForTimeout(500);
await shot('college-home');
for (let w = 0; w < 6; w++) {
  await page.click('[data-do]:not([disabled])');
  await page.waitForTimeout(1500);
  await drain();
}
await page.click('[data-tab=schedule]');
await page.waitForTimeout(300);
await shot('college-schedule', true);
await page.click('[data-tab=week]');
await page.waitForTimeout(300);
await shot('college-week', true);
// 선수 만들기 성격 칸
await page.click('button:has-text("타이틀로")');
await page.waitForTimeout(600);
await page.click('[data-act=new][data-slot="0"]').catch(() => {});
await page.waitForTimeout(800);
await page.click('[data-g=trait][data-v=showman]').catch(() => {});
await page.waitForTimeout(300);
await shot('create', true);
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
