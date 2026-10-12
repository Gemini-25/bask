// 개발 서버 페이지를 찍는다: node tools/devshot.mjs <url> <출력.png> [기다릴 ms]
import { chromium } from 'playwright-core';
const [url, out, wait = '1500'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
