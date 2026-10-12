// 컷인 확인: node tools/cutin.mjs <seed> <tick> <out.png>
import { chromium } from 'playwright-core';
const [seed, tick, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5179/');
await page.waitForTimeout(1500);
await page.evaluate(([s, t]) => {
  window.bask.startExhibition(Number(s));
  const pb = window.bask.host.pb;
  pb.speed = 2;
  pb.seek(Number(t) - 30);
}, [seed, tick]);
await page.waitForTimeout(1900);
await page.locator('#game canvas').screenshot({ path: out });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
