// 경기장 단계·교체 입장·경기 끝 연출 확인: node tools/scene.mjs <폴더> [시드]
import { chromium } from 'playwright-core';
const [dir, seed = '7'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1460, height: 920 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5179/');
await page.waitForTimeout(1200);
const setup = async (tier, tick, speed) =>
  page.evaluate(
    ([s, tier, tick, speed]) => {
      window.bask.startExhibition(Number(s));
      const h = window.bask.host;
      h.tier = tier;
      h.banner = '한빛고 농구부 파이팅';
      h.gameId++;
      h.pb.speed = speed;
      h.pb.seek(tick < 0 ? h.pb.last + tick : tick);
    },
    [seed, tier, tick, speed],
  );
for (const tier of [0, 2]) {
  await setup(tier, 3000, 1);
  await page.waitForTimeout(1200);
  await page.locator('#game canvas').screenshot({ path: `${dir}/tier${tier}.png` });
}
// 교체 장면
const subTick = await page.evaluate(() => window.bask.host.pb.game.events.find((e) => e.type === 'sub' && e.tick > 2000).tick);
await setup(1, subTick - 3, 1);
for (let k = 0; k < 4; k++) {
  await page.waitForTimeout(350);
  await page.locator('#game canvas').screenshot({ path: `${dir}/sub${k}.png` });
}
console.log(await page.evaluate((t) => { const pb = window.bask.host.pb; return { t, lu: pb.game.lineups.filter((l) => Math.abs(l.tick - t) < 5).map((l) => l.tick), cur: pb.cur }; }, subTick));
// 경기 끝
await setup(2, -50, 2);
await page.waitForTimeout(2200);
await page.locator('#game canvas').screenshot({ path: `${dir}/outro.png` });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
