// 동작 시트 캡처: node tools/sprites-shot.mjs <주소/sprites.html> <출력.png>
import { chromium } from 'playwright-core';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
await page.goto(url);
await page.waitForTimeout(800);
const el = await page.$('canvas');
await el.screenshot({ path: out });
await browser.close();
