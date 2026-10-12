// 응원단·천장 배너 확인: node tools/cheer-ui.mjs <주소> <폴더> <프로 세이브.json>
import { chromium } from 'playwright-core';
const [url, dir, savePath] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
await page.goto(url);
await page.waitForTimeout(1000);
// 다른 커리어의 영구결번 하나 (이 팀)
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=import][data-slot="2"]')]);
await fc.setFiles(savePath);
await page.waitForTimeout(800);
const closeModals = async () => {
  for (let k = 0; k < 12 && !(await page.$('#modal[hidden]')); k++) {
    const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice')) ?? (await page.$('#asOk:not([disabled])')) ?? (await page.$('#asSkip'));
    if (!b) break;
    await b.click();
    await page.waitForTimeout(300);
  }
};
await closeModals();
await page.evaluate(() => {
  const c = window.bask.career;
  c.money += 20000;
  c.popularity = 95;
  c.league.history.push({ season: 0, champion: c.pro.team, myFinish: '우승' }, { season: 2, champion: c.pro.team, myFinish: '우승' });
  localStorage.setItem('bask.hall', JSON.stringify([{ name: '전설', number: 33, retiredTeam: c.pro.team, retiredBy: 'x', hof: true, seasons: 12, games: 1, pts: 1, trophies: [] }]));
});
await page.click('[data-tab=records]');
await page.click('[data-tab=life]');
for (const id of ['cheerBanner', 'cheerFlags', 'cheerChant', 'cheerMascot', 'cheerLeaders', 'cheerJumbo']) {
  await page.click(`[data-buy=${id}]`);
  await page.waitForTimeout(150);
}
await page.screenshot({ path: `${dir}/cheer-00-shop.png`, fullPage: true });
await page.click('[data-tab=week]');
// 홈 경기가 나올 때까지 (경기는 결과만)
for (let w = 0; w < 12; w++) {
  await page.click('[data-do]:not([disabled])');
  await page.waitForTimeout(1500);
  await closeModals();
  if (await page.$('#pgWatch')) {
    const home = (await page.textContent('#mbox')).includes('홈 경기');
    if (home) break;
    await page.click('#pgSkip');
    await page.waitForTimeout(500);
    await page.click('#rNext');
    await page.waitForTimeout(500);
    await closeModals();
  }
}
await page.click('#pgWatch');
await page.click('[data-speed="2"]');
await page.waitForTimeout(9000);
await page.screenshot({ path: `${dir}/cheer-01-game.png` });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${dir}/cheer-02-game.png` });
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
