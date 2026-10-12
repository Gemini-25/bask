// 선수 만들기 화면 캡처: node tools/create-ui.mjs <주소> <출력.png>
import { chromium } from 'playwright-core';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
await page.goto(url);
await page.waitForTimeout(1000);
await page.click('[data-act=new][data-slot="0"]');
await page.waitForTimeout(800);
await page.click('[data-g=trait][data-v=sniper]').catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
console.log('trait options', await page.$$eval('[data-g=trait]', (b) => b.length), 'errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
