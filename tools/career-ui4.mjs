// M8 화면 확인: node tools/career-ui4.mjs <주소> <폴더> <세이브.json> <이름표>
// 세이브를 불러와서 한 주 진행 → 뜨는 모달(올스타 위크엔드, 국가대표, 은퇴)을 찍는다
import { chromium } from 'playwright-core';
const [url, dir, savePath, tag = 'm8'] = process.argv.slice(2);
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
const shot = async (name, full = false) => page.screenshot({ path: `${dir}/${tag}-${String(n++).padStart(2, '0')}-${name}.png`, fullPage: full });

/** 모달을 하나씩 넘긴다. 올스타·은퇴 모달은 찍는다 */
async function drain() {
  for (let k = 0; k < 30; k++) {
    await page.waitForTimeout(350);
    if (await page.$('#modal[hidden]')) return 'none';
    if (await page.$('#pgSkip')) return 'game';
    if (await page.$('#asSkip')) {
      await page.waitForTimeout(2500);
      await shot('allstar-3pt');
      await page.waitForTimeout(6000);
      await shot('allstar-mid');
      await page.click('#asSkip');
      await page.waitForTimeout(1500);
      await shot('allstar-done');
      await page.click('#asOk');
      continue;
    }
    if (await page.$('#rtGo')) {
      await shot('retire-ask');
      await page.click('#rtGo');
      await page.waitForTimeout(800);
      await shot('retire-summary');
      return 'retired';
    }
    const ch = await page.$('#mbox .choice');
    if (ch) {
      await shot('choice');
      await ch.click();
      continue;
    }
    const close = await page.$('#mbox [data-close]');
    if (close) {
      if ((await page.textContent('#mbox h2'))?.includes('·')) await shot('week');
      await close.click();
    }
  }
  return 'stuck';
}

await drain();
if (process.env.RETIRE) {
  // 은퇴할 수 있는 나이로
  await page.evaluate(() => (window.bask.career.me.age = 33));
  await page.click('[data-tab=records]');
  await page.click('[data-tab=life]');
  await page.waitForTimeout(300);
  await shot('life-retire', true);
  await page.click('[data-retire]');
  await page.waitForTimeout(600);
  await drain();
}
for (let week = 0; week < (process.env.RETIRE ? 0 : 1) * Number(process.env.WEEKS ?? 3); week++) {
  await page.click('[data-do]:not([disabled])');
  await page.waitForTimeout(1800);
  for (let g = 0; g < 4; g++) {
    const r = await drain();
    if (r === 'retired') break;
    if (r !== 'game') break;
    await shot('pregame');
    if (process.env.WATCH && g === 0) {
      await page.click('#pgWatch');
      await page.waitForTimeout(5000);
      await shot('watch');
      await page.keyboard.press('KeyE').catch(() => {});
      // 끝까지 넘긴다
      for (let t = 0; t < 30 && !(await page.$('#rNext')); t++) {
        const end = await page.$('#btnEnd, [data-k=end]');
        if (end) await end.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    } else await page.click('#pgSkip');
    await page.waitForTimeout(600);
    await shot('result', true);
    await page.click('#rNext');
    await page.waitForTimeout(600);
  }
}
if (await page.$('#rtLegacy')) {
  await page.click('#rtLegacy');
  await page.waitForTimeout(800);
  await shot('legacy-create', true);
  await page.click('#cGo');
  await page.waitForTimeout(800);
  await shot('legacy-start');
  await page.click('#mbox [data-close]');
  await page.click('[data-act=title], #btnTitle, button:has-text("타이틀로")').catch(() => {});
  await page.waitForTimeout(800);
  await shot('title', true);
} else {
  await page.click('[data-tab=schedule]');
  await page.waitForTimeout(300);
  await shot('schedule', true);
  await page.click('[data-tab=records]');
  await page.waitForTimeout(300);
  await shot('records', true);
  await page.click('[data-tab=life]');
  await page.waitForTimeout(300);
  await shot('life', true);
}
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
