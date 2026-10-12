// 콤비 확인: node tools/combo-ui.mjs <주소> <폴더> <프로 세이브> — 개발자 패널로 콤비 둘 → 다음 경기 관람, 로그에 '콤비'가 나오는지
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
const drain = async () => {
  for (let k = 0; k < 12 && !(await page.$('#modal[hidden]')); k++) {
    if (await page.$('#pgWatch')) return 'game';
    if (await page.$('#stSkip')) { await page.click('#stSkip'); await page.waitForTimeout(800); await page.click('#stOk'); await page.waitForTimeout(400); continue; }
    const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice:not([disabled])'));
    if (!b) break;
    await b.click();
    await page.waitForTimeout(400);
  }
};
await drain();
// 콤비 두 명
await page.keyboard.press('Backquote');
await page.click('[data-dvtab=event]');
await page.click('[data-dv=combo]');
await page.waitForTimeout(300);
await page.click('[data-dv=combo]');
await page.waitForTimeout(300);
await page.click('[data-dvtab=time]');
await page.click('[data-stop=game]');
for (let k = 0; k < 60 && !(await page.$('#pgWatch')); k++) await page.waitForTimeout(500);
await page.keyboard.press('Backquote');
await page.click('#pgWatch');
await page.waitForTimeout(1500);
await page.click('[data-speed="16"]').catch(() => {});
let seen = false;
for (let k = 0; k < 440 && !seen; k++) {
  await page.waitForTimeout(500);
  const txt = await page.$eval('#log', (e) => e.textContent).catch(() => '');
  if (!seen && txt.includes('콤비')) {
    seen = true;
    await page.screenshot({ path: `${dir}/combo-game.png` });
  }
  if (await page.$('#rNext')) break;
}
await page.screenshot({ path: `${dir}/combo-end.png` });
console.log('combo seen', seen, 'errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
