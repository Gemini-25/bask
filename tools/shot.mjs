// 빌드된 dist/index.html 을 file:// 로 열어서 스크린샷을 찍는다 (화면 확인용).
// node tools/shot.mjs [출력 폴더] [기다릴 ms]
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const out = process.argv[2] ?? '.';
const wait = Number(process.argv[3] ?? 4000);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForTimeout(wait);
await page.screenshot({ path: `${out}/shot-1.png` });
await page.keyboard.press('5'); // 16배속
await page.waitForTimeout(3000);
await page.click('[data-tab="box"]');
await page.screenshot({ path: `${out}/shot-2.png` });
await page.click('tr[data-p="2"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/shot-3.png` });
await page.setViewportSize({ width: 420, height: 900 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/shot-phone.png`, fullPage: true });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
