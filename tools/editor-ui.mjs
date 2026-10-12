// M14 에디터 화면 확인: node tools/editor-ui.mjs <주소> <폴더> <프로 세이브> <고교 세이브>
// 내 선수 편집 → 되돌리기 → 팀 탭 ✏️로 팀원 친밀도·콤비 → 리그 선수 → 고교 상대 학교 선수 (그해 남는지)
import { chromium } from 'playwright-core';
const [url, dir, proSave, hsSave] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
let n = 0;
const shot = async (name, full = false) => page.screenshot({ path: `${dir}/m14-${String(n++).padStart(2, '0')}-${name}.png`, fullPage: full });
const load = async (slot, file) => {
  await page.goto(url);
  await page.waitForTimeout(1000);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`[data-act=import][data-slot="${slot}"]`)]);
  await fc.setFiles(file);
  await page.waitForTimeout(800);
  for (let k = 0; k < 12 && !(await page.$('#modal[hidden]')); k++) {
    const b = (await page.$('#mbox [data-close]')) ?? (await page.$('#mbox .choice:not([disabled])'));
    if (!b) break;
    await b.click();
    await page.waitForTimeout(300);
  }
};
const setVal = async (sel, v) => {
  await page.$eval(sel, (el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
  await page.waitForTimeout(150);
};
const ovr = () => page.$eval('#edOvr', (e) => e.textContent);
await load(2, proSave);
await page.keyboard.press('Backquote');
await page.click('[data-dvtab=edit]');
await page.waitForTimeout(300);
await shot('tab');
await page.click('[data-edit=me]');
await page.waitForTimeout(500);
await shot('me');
const before = await ovr();
await setVal('.edwin input[type=number][data-er=three]', 99);
await setVal('.edwin input[type=number][data-er=midRange]', 99);
await page.click('[data-etr=showman]');
await page.click('[data-etr=cool]');
await page.click('[data-etr=hothead]');
await setVal('[data-elk=hair]', 2);
await setVal('[data-elk=hairColor]', 4);
await page.waitForTimeout(300);
const after = await ovr();
await shot('me-edited');
console.log('ovr', before, '→', after);
const card1 = await page.$eval('#pcard', (e) => e.textContent);
console.log('card shows traits', card1.includes('쇼맨') && card1.includes('냉철') && card1.includes('다혈질'));
await page.click('[data-ea=revert]');
await page.waitForTimeout(300);
console.log('reverted', (await ovr()) === before);
await page.click('.edfoot [data-ea=close]');
await page.waitForTimeout(300);
// 팀 탭 ✏️ → 팀원 (패널은 접고 연 상태 유지)
await page.click('[data-tab=team]');
await page.waitForTimeout(300);
await shot('team-pencils');
const picks = await page.$$('.edpick');
await picks[3].click();
await page.waitForTimeout(400);
await setVal('[data-ef=friend]', 95);
await setVal('[data-ef=combo]', 'pnr');
await shot('mate');
await page.click('.edfoot [data-ea=close]');
await page.waitForTimeout(400);
const team = await page.$eval('#hbody', (e) => e.innerHTML).catch(async () => page.content());
console.log('team combo shown', team.includes('픽앤롤 콤비'));
// 리그 다른 팀 선수
await page.selectOption('#dvEdGroup', { index: 4 });
await page.waitForTimeout(300);
await page.click('#dvEdList [data-edit]');
await page.waitForTimeout(400);
await setVal('[data-ef=name]', '에디터왕');
await setVal('.edwin input[type=number][data-er=dunk]', 95);
await setVal('.edwin input[type=number][data-er=jump]', 95);
await shot('league');
await page.click('.edfoot [data-ea=close]');
await page.waitForTimeout(300);
await page.fill('#dvEdQ', '에디터왕');
await page.waitForTimeout(300);
console.log('search finds renamed', (await page.$$eval('#dvEdList tr', (r) => r.length)) === 1);
// 고교: 상대 학교 선수 고치고 다시 열면 남아 있나
await load(1, hsSave);
await page.click('[data-dvtab=edit]').catch(async () => {
  await page.keyboard.press('Backquote');
  await page.click('[data-dvtab=edit]');
});
await page.waitForTimeout(300);
const school = await page.$$eval('#dvEdGroup option', (o) => o.map((x) => x.value).find((v) => v.startsWith('school:')));
await page.selectOption('#dvEdGroup', school);
await page.waitForTimeout(300);
const key = await page.$eval('#dvEdList [data-edit]', (b) => b.dataset.edit);
await page.click('#dvEdList [data-edit]');
await page.waitForTimeout(400);
await page.click('[data-ea=allN]');
await page.waitForTimeout(300);
await shot('school');
await page.click('.edfoot [data-ea=close]');
await page.waitForTimeout(300);
await page.click(`#dvEdList [data-edit="${key}"]`);
await page.waitForTimeout(400);
const v = await page.$eval('.edwin input[type=number][data-er=speed]', (e) => e.value);
console.log('school override kept', key, v === '75');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
console.log('esc closes', await page.$eval('.edwin', (e) => e.hidden));
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
