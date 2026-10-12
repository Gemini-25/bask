// 드래프트와 프로 화면 확인: node tools/career-ui3.mjs <주소> <폴더> <드래프트 직전 세이브.json>
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
// 남은 모달 정리
async function drain(shotPrefix) {
  for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(300);
    if (await page.$('#modal[hidden]')) return 'none';
    if (await page.$('#pgSkip')) return 'game';
    if (await page.$('#dSkip')) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/${shotPrefix}-draft.png` });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${dir}/${shotPrefix}-drafted.png` });
      continue;
    }
    const ch = await page.$('#mbox .choice');
    if (ch) {
      await ch.click();
      continue;
    }
    const close = await page.$('#mbox [data-close]');
    if (close) await close.click();
  }
  return 'stuck';
}
await drain('p0');
await page.click('[data-do]:not([disabled])');
await page.waitForTimeout(1600);
// 고교 마지막 연습경기가 남아 있으면 결과만 보고 드래프트로
for (let k = 0; k < 3; k++) {
  const r = await drain('p1');
  if (r !== 'game') break;
  await page.click('#pgSkip');
  await page.waitForTimeout(500);
  await page.click('#rNext');
  await page.waitForTimeout(500);
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}/p2-prohome.png` });
await page.click('[data-tab=schedule]');
await page.screenshot({ path: `${dir}/p3-schedule.png`, fullPage: true });
await page.click('[data-tab=life]');
await page.screenshot({ path: `${dir}/p4-life.png`, fullPage: true });
await page.click('[data-tab=team]');
await page.screenshot({ path: `${dir}/p5-team.png` });
await page.click('[data-tab=week]');
// 프리시즌 경기까지
let shots = 0;
for (let w = 0; w < 14 && shots < 2; w++) {
  const pick = await page.$('[data-do=team]:not([disabled])');
  if (pick) await pick.click();
  else if (await page.$('[data-a=game]')) await page.click('[data-a=game]');
  else await page.click('[data-do]:not([disabled])');
  await page.waitForTimeout(1500);
  const r = await drain('w' + w);
  if (r === 'game') {
    if (shots === 0) {
      await page.click('#pgWatch');
      await page.waitForTimeout(2500);
      await page.locator('#game canvas').screenshot({ path: `${dir}/p6-progame.png` });
      await page.click('#btnEnd');
      await page.waitForTimeout(300);
      await page.click('#btnDone');
    } else await page.click('#pgSkip');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/p7-result-${shots}.png`, fullPage: true });
    shots++;
    const iv = await page.$('[data-iv]');
    if (iv) await iv.click();
    await page.click('#rNext');
    await page.waitForTimeout(400);
    await drain('after' + w);
  }
}
console.log('errors:', errors.length ? errors : 'none', 'shots', shots);
await browser.close();
