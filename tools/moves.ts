// 슛 동작이 얼마나 나오나 (M16): npx tsx tools/moves.ts [경기 수]
// 리그 팀끼리 경기를 돌려서 동작별 시도·성공률, 인유어페이스·풋백 수를 센다
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';

const n = Number(process.argv[2] ?? 40);
const cnt: Record<string, { a: number; m: number; and1: number }> = {};
let shots = 0;
let posters = 0;
for (let g = 0; g < n; g++) {
  const a = generateTeam(new Rng(1000 + g), TEAM_INFOS[g % 10], 1);
  const b = generateTeam(new Rng(2000 + g), TEAM_INFOS[(g + 3) % 10], 1);
  const r = simulateGame(a, b, 500 + g);
  for (const e of r.events) {
    if (e.type !== 'made' && e.type !== 'miss') continue;
    shots++;
    const k = e.move ?? '(없음)';
    const c = (cnt[k] ??= { a: 0, m: 0, and1: 0 });
    c.a++;
    if (e.type === 'made') c.m++;
    if (e.andOne) c.and1++;
    if (e.poster) posters++;
  }
}
console.log(`${n}경기, 슛 ${shots}개 (경기당 ${(shots / n).toFixed(1)})`);
for (const [k, c] of Object.entries(cnt).sort((x, y) => y[1].a - x[1].a)) console.log(`${k.padEnd(14)} ${(c.a / n).toFixed(2).padStart(6)}/경기  ${((c.m / c.a) * 100).toFixed(1)}%  앤드원 ${c.and1}`);
console.log(`인유어페이스 ${posters} (${(posters / n).toFixed(2)}/경기)`);
