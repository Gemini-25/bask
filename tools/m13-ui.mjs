// M13 화면 확인: node tools/m13-ui.mjs <주소> <폴더> <프로 세이브>
// 개발자 패널로 콤비·연애·3x3·전지훈련·전향 제안 → 홈 팀·생활 탭 → 훈련 미니게임 세 가지
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
const shot = async (name, full = false) => page.screenshot({ path: `${dir}/m13-${String(n++).padStart(2, '0')}-${name}.png`, fullPage: full });
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=import][data-slot="2"]')]);
await fc.setFiles(savePath);
await page.waitForTimeout(800);
const drain = async () => {
  for (let k = 0; k < 12 && !(await page.$('#modal[hidden]')); k++) {
    if (await page.$('#stSkip')) {
      await page.click('#stSkip');
      await page.waitForTimeout(800);
      await page.click('#stOk');
      await page.waitForTimeout(400);
      continue;
    }
    if (await page.$('#pgSkip')) {
      await page.click('#pgSkip');
      await page.waitForTimeout(500);
      await page.click('#rNext');
      await page.waitForTimeout(700);
      continue;
    }
    const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice:not([disabled])')) ?? (await page.$('#asOk:not([disabled])'));
    if (!b) break;
    await b.click();
    await page.waitForTimeout(400);
  }
};
await drain();
const dv = async (act) => {
  await page.keyboard.press('Backquote');
  await page.click('[data-dvtab=event]');
  await page.click(`[data-dv=${act}]`);
  await page.waitForTimeout(400);
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(400);
};
await dv('combo');
await dv('love');
await dv('street');
await page.waitForTimeout(2500);
await shot('street-run');
await page.click('#stSkip');
await page.waitForTimeout(800);
await shot('street-done');
await page.click('#stOk');
await page.waitForTimeout(400);
await shot('street-notes');
await drain();
await dv('camp');
await shot('camp');
await page.click('[data-camp=mountain]');
await page.waitForTimeout(400);
await drain();
await dv('posOffer');
await shot('position');
await page.click('[data-pos="1"]');
await page.waitForTimeout(400);
await drain();
await page.click('[data-tab=team]');
await page.waitForTimeout(300);
await shot('team', true);
await page.click('[data-tab=life]');
await page.waitForTimeout(300);
await shot('life', true);
// 미니게임: 슈팅
await page.click('[data-tab=week]');
await page.waitForTimeout(300);
const doAct = async (id, focus) => {
  if (focus) await page.click(`[data-focus=${focus}]`);
  await page.waitForTimeout(200);
  await page.click(`[data-do=${id}]:not([disabled])`);
  for (let k = 0; k < 30 && !(await page.$('#mgSkip')); k++) await page.waitForTimeout(200);
};
await doAct('solo', 'shoot');
await page.waitForTimeout(700);
await shot('mg-shoot');
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
}
await shot('mg-shoot-done');
await page.click('#mgOk');
await page.waitForTimeout(700);
await shot('mg-week');
await drain();
// Esc로 닫아도 한 주는 지나간다
await doAct('solo', 'shoot');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await shot('mg-esc');
await drain();
// 돌파: 화면의 화살표를 읽어서 누른다
await doAct('solo', 'drive');
await shot('mg-drive');
const seq = await page.$$eval('#mgSeq span', (s) => s.map((x) => x.textContent));
const KEY = { '←': 'ArrowLeft', '↑': 'ArrowUp', '↓': 'ArrowDown', '→': 'ArrowRight' };
for (const a of seq) {
  await page.keyboard.press(KEY[a]);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(300);
await shot('mg-drive-done');
await page.click('#mgOk');
await page.waitForTimeout(700);
await drain();
// 웨이트 연타
await doAct('weight');
await shot('mg-weight');
for (let i = 0; i < 30; i++) {
  await page.click('#mgMash');
  await page.waitForTimeout(60);
}
await page.waitForTimeout(4500);
await shot('mg-weight-done');
await page.click('#mgOk');
await page.waitForTimeout(700);
await drain();
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
