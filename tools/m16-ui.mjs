// M16 화면 확인: node tools/m16-ui.mjs <주소> <폴더> <프로 세이브>
// 에디터로 내 선수를 덩커·천재로 → 능력치·특수능력 탭 → 다음 경기 관람에서 동작 팝업 캡처
import { chromium } from 'playwright-core';
const [url, dir, savePath] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
let n = 0;
const shot = async (name, full = false) => page.screenshot({ path: `${dir}/m16-${String(n++).padStart(2, '0')}-${name}.png`, fullPage: full });
await page.goto(url);
await page.waitForTimeout(1000);
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=import][data-slot="2"]')]);
await fc.setFiles(savePath);
await page.waitForTimeout(800);
for (let k = 0; k < 12 && !(await page.$('#modal[hidden]')); k++) {
  const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice:not([disabled])'));
  if (!b) break;
  await b.click();
  await page.waitForTimeout(300);
}
const setVal = async (sel, v) => {
  await page.$eval(sel, (el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
  await page.waitForTimeout(80);
};
await page.keyboard.press('Backquote');
await page.click('[data-dvtab=edit]');
await page.click('[data-edit=me]');
await page.waitForTimeout(400);
await page.click('[data-ea=allN]');
for (const [k, v] of [['dunk', 95], ['jump', 95], ['sense', 95], ['ballHandling', 92], ['agility', 90]]) await setVal(`.edwin input[type=number][data-er=${k}]`, v);
for (const a of ['genius', 'poster', 'stepback', 'euro', 'fadeaway']) await setVal(`[data-eab=${a}]`, 3);
await shot('editor');
await page.click('.edfoot [data-ea=close]');
await page.waitForTimeout(300);
await page.click('[data-tab=abilities]');
await page.waitForTimeout(300);
await shot('abilities', true);
await page.click('[data-tab=stats]');
await page.waitForTimeout(300);
await shot('stats', true);
await page.click('[data-dvtab=time]');
await page.click('[data-stop=game]');
for (let k = 0; k < 60 && !(await page.$('#pgWatch')); k++) await page.waitForTimeout(500);
await page.keyboard.press('Backquote');
await page.click('#pgWatch');
await page.waitForTimeout(1500);
await page.click('[data-speed="4"]').catch(() => {});
const want = ['인유어페이스', '스텝백', '유로스텝', '페이드어웨이', '풋백', '더블 클러치'];
const seen = new Set();
for (let k = 0; k < 900 && seen.size < 4; k++) {
  await page.waitForTimeout(250);
  const last = await page.$eval('#log li:first-child', (e) => e.textContent).catch(() => '');
  const hit = want.find((w) => last.includes(w) && last.includes('성공') && !seen.has(w));
  if (hit) {
    seen.add(hit);
    await shot(`move-${seen.size}`);
  }
  if (await page.$('#rNext')) break;
}
console.log('seen', [...seen].join(', '));
const all = await page.$eval('#log', (e) => e.textContent).catch(() => '');
console.log('log has moves', want.filter((w) => all.includes(w)).join(', '));
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
