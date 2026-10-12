// 빌드 파일이 열리는지: node tools/smoke.mjs <play/bask.html 절대 경로>
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('file://' + process.argv[2]);
await page.waitForTimeout(1500);
const txt = await page.textContent('body');
console.log('title ok', txt.includes('명예의 전당'), txt.includes('업적'), 'errors', errors.length ? errors : 'none');
await browser.close();
