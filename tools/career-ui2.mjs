// 공식전까지 빠르게: 만들기 → 8주 (경기는 결과만 보기) → 춘계 연맹전 결과·일정 캡처
// node tools/career-ui2.mjs <주소> <폴더>
import { chromium } from 'playwright-core';
const [url, dir] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(url);
await page.waitForTimeout(1200);
await page.click('[data-act=new][data-slot="2"]');
await page.click('.opt[data-g=school][data-v=TAML]');
await page.click('#cAuto');
await page.click('#cGo');
await page.waitForTimeout(400);
await page.click('#mbox [data-close]');
let shots = 0;
for (let w = 0; w < 9; w++) {
  const pick = await page.$(`[data-do=${w % 3 === 2 ? 'rest' : 'team'}]:not([disabled])`);
  if (pick) await pick.click();
  else if (await page.$('[data-a=game]')) await page.click('[data-a=game]');
  else await page.click('[data-do]:not([disabled])');
  await page.waitForTimeout(1500);
  for (let k = 0; k < 8; k++) {
    await page.waitForTimeout(200);
    if (await page.$('#modal[hidden]')) break;
    if (await page.$('#pgSkip')) {
      const label = await page.textContent('#mbox h2');
      if (label.includes('연맹전') && shots === 0) await page.screenshot({ path: `${dir}/o1-pregame.png` });
      await page.click('#pgSkip');
      await page.waitForTimeout(400);
      if (label.includes('연맹전') && shots++ < 2) await page.screenshot({ path: `${dir}/o2-result-${shots}.png`, fullPage: true });
      await page.click('#rNext');
      await page.waitForTimeout(300);
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
}
await page.click('[data-tab=schedule]');
await page.waitForTimeout(200);
await page.screenshot({ path: `${dir}/o3-schedule.png`, fullPage: true });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
