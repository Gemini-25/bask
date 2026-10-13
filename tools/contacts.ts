// 몸싸움 진단 (M27): 돌파 접촉 (밀고 들어감·막힘), 포스트 (밀어붙임·버팀), 스크린, 차징·블로킹
// npx tsx tools/contacts.ts [경기 수]
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
const N = Number(process.argv[2] ?? 20);
const c: Record<string, number> = {};
const add = (k: string) => (c[k] = (c[k] ?? 0) + 1);
for (let g = 0; g < N; g++) {
  const rng = new Rng(1000 + g);
  const ia = rng.int(0, 9);
  let ib = rng.int(0, 9);
  if (ib === ia) ib = (ib + 1) % 10;
  const r = simulateGame(generateTeam(rng.fork(1), TEAM_INFOS[ia]), generateTeam(rng.fork(2), TEAM_INFOS[ib]), 5000 + g);
  for (const e of r.events) {
    if (e.type === 'contact') add('contact:' + e.contact);
    if (e.type === 'screen') add(e.switched ? 'screen:switch' : 'screen');
    if (e.type === 'foul' && (e.foul === 'charge' || e.foul === 'block' || e.foul === 'screen')) add('foul:' + e.foul);
    if (e.type === 'play') add('play:' + e.play);
    if ((e.type === 'made' || e.type === 'miss') && e.ctx === 'post') add(e.type === 'made' ? 'postShot:made' : 'postShot:miss');
  }
}
for (const [k, v] of Object.entries(c).sort()) console.log(`${k.padEnd(18)} ${(v / N).toFixed(2)}/경기`);
