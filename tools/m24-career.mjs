// M24 커리어 화면: node tools/m24-career.mjs <주소> <폴더> <세이브.json>
// 홈의 건너뛰기 막대 → 설정 → 4주 건너뛰기 결과 → 팀 탭 역할 → 다음 경기까지 → 경기 전 역할
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
await page.waitForTimeout(1000);
let n = 0;
const shot = async (name) => page.screenshot({ path: `${dir}/m24c-${String(n++).padStart(2, '0')}-${name}.png` });
/** 남은 모달을 닫는다 (경기는 결과만) */
async function drain(stopAtGame = false) {
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(400);
    if (await page.$('#modal[hidden]')) {
      if (await page.$('#scr-result:not([hidden])')) {
        await page.click('#scr-result button.primary');
        continue;
      }
      return 'none';
    }
    if (await page.$('#pgSkip')) {
      if (stopAtGame) return 'game';
      await page.click('#pgSkip');
      continue;
    }
    const b = (await page.$('#mbox button.primary:not([disabled])')) ?? (await page.$('#mbox button:not([disabled])'));
    if (!b) return 'stuck';
    await b.click();
  }
  return 'loop';
}
/** 건너뛰기가 끝날 때까지 (중간 이벤트는 첫 선택지를 고른다) */
async function waitSkip() {
  for (let k = 0; k < 200; k++) {
    await page.waitForTimeout(300);
    const h = await page.$eval('#mbox h2', (e) => e.textContent).catch(() => '');
    if (h.includes('건너뜀')) return;
    if (await page.$('#skProg')) continue;
    if (k % 3 === 0) await shot('mid-' + k);
    const b = (await page.$('#mbox button.primary:not([disabled])')) ?? (await page.$('#mbox button:not([disabled])'));
    if (b) await b.click();
  }
}
console.log('drain', await drain());
await shot('home');
await page.click('[data-a=skipset]');
await page.waitForTimeout(300);
await shot('settings');
await page.selectOption('#skGames', 'none');
await page.click('#skSave');
await page.waitForTimeout(300);
await page.click('[data-skip="4"]');
await waitSkip();
await shot('skip-result');
console.log('drain', await drain());
await page.click('[data-tab=team]');
await page.waitForTimeout(300);
await shot('team');
await page.click('[data-tab=week]');
await page.waitForTimeout(300);
await page.click('[data-skip="game"]');
await waitSkip();
await shot('skip-game');
console.log('drain', await drain(true));
await shot('pregame');
console.log('errors', errors.length ? errors : 'none');
await browser.close();
