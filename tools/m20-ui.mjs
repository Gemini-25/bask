// M20 화면 확인: node tools/m20-ui.mjs <주소> <폴더> <세이브> <이벤트 id...>
// 개발자 패널로 이벤트를 걸고 이벤트 창을 찍는다 (이름이 다 바뀌었는지)
import { chromium } from 'playwright-core';
const [url, dir, savePath, ...ids] = process.argv.slice(2);
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
const clear = async () => {
  for (let k = 0; k < 12 && !(await page.$('#modal[hidden]')); k++) {
    const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice:not([disabled])'));
    if (!b) break;
    await b.click();
    await page.waitForTimeout(300);
  }
};
await clear();
for (const id of ids) {
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(300);
  await page.click('[data-dvtab=event]');
  await page.waitForTimeout(200);
  await page.click(`[data-ev="${id}"]`);
  await page.waitForTimeout(300);
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(400);
  const text = await page.$eval('#mbox', (e) => e.innerText).catch(() => '(창 없음)');
  console.log(id, '|', text.replace(/\n+/g, ' / '), '| 남은 {}', /\{\w+\}/.test(text));
  await page.screenshot({ path: `${dir}/m20-${id}.png` });
  await clear();
}
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
