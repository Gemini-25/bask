// 덩크 도약 확인: npx tsx tools/leap.ts [경기 수] [능력치(자리 1 선수 전부)]
// 덩크마다 도약 거리·수직 점프·체공, 피지컬 (키·점프)별로
import { Rng } from '../src/core/rng';
import { RATING_KEYS } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { leapOf } from '../src/sim/leap';

const n = Number(process.argv[2] ?? 10);
const star = process.argv[3] ? Number(process.argv[3]) : undefined;
const rows: { d: number; h: number; air: number; jump: number; cm: number; clear: number }[] = [];
let dunks = 0;
for (let g = 0; g < n; g++) {
  const a = generateTeam(new Rng(900 + g), TEAM_INFOS[g % 10], 1);
  if (star !== undefined) for (const k of RATING_KEYS) a.players[1].r[k] = star;
  const r = simulateGame(a, generateTeam(new Rng(950 + g), TEAM_INFOS[(g + 4) % 10], 1), 600 + g);
  for (const e of r.events) {
    if (e.type !== 'made' && e.type !== 'miss') continue;
    if (e.shot === 'dunk') dunks++;
    if (!e.leap || (star !== undefined && e.player !== 1)) continue;
    const p = r.players[e.player];
    rows.push({ ...e.leap, jump: p.r.jump, cm: p.body.heightCm, clear: leapOf(p).clear });
  }
}
const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(2);
console.log(`덩크 ${(dunks / n).toFixed(1)}/경기 · 도약 기록 ${rows.length} · 도약 ${avg(rows.map((r) => r.d))}m (최대 ${Math.max(...rows.map((r) => r.d)).toFixed(1)}) · 점프 ${avg(rows.map((r) => r.h))}m · 체공 ${avg(rows.map((r) => r.air))}초`);
for (const [lo, hi] of [[0, 55], [55, 65], [65, 75], [75, 100]])
  {
    const b = rows.filter((r) => r.jump >= lo && r.jump < hi);
    if (b.length) console.log(`점프 ${lo}~${hi}: ${b.length}개 · 도약 ${avg(b.map((r) => r.d))}m · 점프 ${avg(b.map((r) => r.h))}m · 림 위 ${avg(b.map((r) => r.clear))}m · 체공 ${avg(b.map((r) => r.air))}초`);
  }
