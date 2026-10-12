// M10 화면 확인: node tools/m10-ui.mjs <주소> <폴더> <올스타 직전 세이브> <드래프트 직전 세이브>
// 올스타 덩크 콘테스트 코트 연출 → 개발자 패널로 해 넘김 → 시즌 카드·시상식 → 드래프트 무대
import { chromium } from 'playwright-core';
const [url, dir, allstarSave, draftSave] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(url);
await page.waitForTimeout(1000);
const load = async (slot, file) => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`[data-act=import][data-slot="${slot}"]`)]);
  await fc.setFiles(file);
  await page.waitForTimeout(800);
};
const closeModals = async () => {
  for (let k = 0; k < 12 && !(await page.$('#modal[hidden]')); k++) {
    if (await page.$('#pgSkip')) return;
    const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice')) ?? (await page.$('#asOk:not([disabled])'));
    if (!b) break;
    await b.click();
    await page.waitForTimeout(300);
  }
};
await load(2, allstarSave);
await closeModals();
await page.click('[data-do]:not([disabled])');
await page.waitForTimeout(1600);
for (let k = 0; k < 6 && !(await page.$('#asSkip')); k++) {
  const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice'));
  if (!b) break;
  await b.click();
  await page.waitForTimeout(400);
}
// 3점 콘테스트가 끝나고 덩크로 넘어갈 때까지
await page.waitForTimeout(24000);
await page.screenshot({ path: `${dir}/m10-00-dunk.png` });
await page.waitForTimeout(1300);
await page.screenshot({ path: `${dir}/m10-01-dunk.png` });
await page.click('#asSkip');
await page.waitForTimeout(1500);
await page.click('#asOk');
await page.waitForTimeout(500);
if (await page.$('#pgSkip')) {
  await page.click('#pgSkip');
  await page.waitForTimeout(600);
  await page.click('#rNext');
  await page.waitForTimeout(600);
}
await closeModals();
// 개발자 패널: 해 넘김까지
await page.keyboard.press('Backquote');
await page.click('[data-dvtab=time]');
await page.click('[data-stop=season]');
for (let k = 0; k < 120 && !(await page.$('.scard')); k++) await page.waitForTimeout(1000);
await page.keyboard.press('Backquote');
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}/m10-02-card.png` });
await page.click('#mbox [data-close]');
await page.waitForTimeout(800);
await page.screenshot({ path: `${dir}/m10-03-awards.png` });
// 드래프트 무대
await page.goto(url);
await page.waitForTimeout(1000);
await load(1, draftSave);
await closeModals();
await page.click('[data-do]:not([disabled])');
await page.waitForTimeout(1600);
for (let k = 0; k < 8; k++) {
  if (await page.$('#dSkip')) {
    await page.click('#dSkip');
    await page.waitForTimeout(1500);
    break;
  }
  if (await page.$('#pgSkip')) {
    await page.click('#pgSkip');
    await page.waitForTimeout(500);
    await page.click('#rNext');
    await page.waitForTimeout(800);
    continue;
  }
  const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice'));
  if (!b) break;
  await b.click();
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `${dir}/m10-04-draft.png` });
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
