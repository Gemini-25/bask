// 패스 길목 진단 (M26): 뛰어든 비율, 닿은 비율, 그냥 걸린 공
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { DEBUG, simulateGame } from '../src/sim/engine';
const N = Number(process.argv[2] ?? 20);
const c: Record<string, number> = {};
DEBUG.lane = (k) => (c[k] = (c[k] ?? 0) + 1);
let passes = 0;
let stl = 0;
for (let g = 0; g < N; g++) {
  const rng = new Rng(1000 + g);
  const ia = rng.int(0, 9);
  let ib = rng.int(0, 9);
  if (ib === ia) ib = (ib + 1) % 10;
  const r = simulateGame(generateTeam(rng.fork(1), TEAM_INFOS[ia]), generateTeam(rng.fork(2), TEAM_INFOS[ib]), 5000 + g);
  passes += r.counters.passes;
  stl += r.events.filter((e) => e.type === 'turnover' && e.other >= 0).length;
}
const pp = (k: string) => (((c[k] ?? 0) / passes) * 100).toFixed(2) + '%';
console.log(`패스 ${passes}, 뛰어듦 ${pp('read')}, 닿음 ${pp('readHit')} (뛰어든 것 중 ${(((c.readHit ?? 0) / Math.max(1, c.read ?? 0)) * 100).toFixed(0)}%), 그냥 걸림 ${pp('stray')}, 스틸 ${(stl / N / 2).toFixed(1)}/팀경기`);
