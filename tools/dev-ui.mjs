// 개발자 패널 확인: node tools/dev-ui.mjs <주소> <폴더> <세이브.json>
import { chromium } from 'playwright-core';
const [url, dir, savePath] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(url);
await page.waitForTimeout(1200);
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=import][data-slot="2"]')]);
await fc.setFiles(savePath);
await page.waitForTimeout(800);
let n = 0;
const shot = async (name) => page.screenshot({ path: `${dir}/dev-${String(n++).padStart(2, '0')}-${name}.png` });
const closeModals = async () => {
  for (let k = 0; k < 10 && !(await page.$('#modal[hidden]')); k++) {
    const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice')) ?? (await page.$('#asOk:not([disabled])')) ?? (await page.$('#asSkip'));
    if (!b) break;
    await b.click();
    await page.waitForTimeout(300);
  }
};
await closeModals();
// 로고 5번 클릭으로 연다
for (let i = 0; i < 5; i++) await page.click('.brand');
await page.waitForTimeout(300);
await shot('player');
// 3점슛 99로
await page.fill('[data-r=three]', '99');
await page.dispatchEvent('[data-r=three]', 'change');
await page.waitForTimeout(300);
await page.click('[data-dv=money]');
await page.selectOption('[data-ab=clutch]', '3');
await page.waitForTimeout(300);
await shot('player-edited');
await page.click('[data-dvtab=time]');
await page.fill('#dvWeeks', '3');
await page.click('[data-dv=weeks]');
await page.waitForTimeout(4000);
await closeModals();
await page.click('[data-dvtab=time]').catch(() => {});
await page.waitForTimeout(300);
await shot('time-after3');
await page.click('[data-stop=game]');
await page.waitForTimeout(3000);
await shot('stop-game');
// 경기 화면으로
if (await page.$('#pgWatch')) {
  await page.click('[data-dvtab=game]');
  await page.click('[data-flag=prob]');
  await page.click('[data-flag=stamina]');
  await page.click('[data-flag=fast]');
  await page.click('#pgWatch');
  await page.waitForTimeout(4000);
  await shot('game-prob');
  await page.click('[data-speed="100"]');
  await page.waitForTimeout(1500);
  await page.click('[data-dvtab=game]');
  await page.waitForTimeout(200);
  await shot('game-100x');
  await page.click('[data-dv=reroll]');
  await page.waitForTimeout(1500);
  await shot('game-reroll');
  await page.click('[data-dv=mini]');
  await page.click('[data-speed="4"]');
  await page.waitForTimeout(6000);
  await shot('game-mini');
  await page.click('[data-dv=mini]');
  await page.click('#btnEnd');
  await page.waitForTimeout(500);
  await page.click('#btnDone');
  await page.waitForTimeout(800);
  await page.click('#rNext');
  await page.waitForTimeout(600);
}
await closeModals();
await page.click('[data-dvtab=event]');
await page.waitForTimeout(300);
await shot('event');
await page.click('[data-ev]');
await page.waitForTimeout(800);
await shot('event-forced');
await closeModals();
await page.click('[data-dvtab=league]');
await page.waitForTimeout(300);
await shot('league');
await page.click('[data-dvtab=save]');
await page.click('[data-snap="0"][data-op=take]');
await page.waitForTimeout(300);
await shot('save');
await page.click('[data-snap="0"][data-op=load]');
await page.waitForTimeout(800);
await shot('restored');
// 백틱으로 닫기
await page.keyboard.press('Backquote');
await page.waitForTimeout(300);
console.log('panel hidden', await page.$eval('.devpanel', (e) => e.hidden), 'dev mark', await page.textContent('#subtitle'));
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
