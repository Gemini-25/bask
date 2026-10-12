// 개발자 패널 '이 경기 고급 기록' 확인: node tools/adv-ui.mjs <주소> <출력.png>
import { chromium } from 'playwright-core';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(1000);
await page.click('text=프로 리그 경기 관람');
await page.waitForTimeout(1500);
await page.keyboard.press('Backquote');
await page.click('[data-dvtab=game]');
await page.waitForTimeout(500);
await page.screenshot({ path: out });
console.log('rows', await page.$$eval('.devpanel .dvt tr', (r) => r.length), 'errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
