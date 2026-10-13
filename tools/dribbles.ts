// 드리블 기술 (M25): npx tsx tools/dribbles.ts [경기 수]
// 경기당 기술 수·제친 수 (한 발 / 휘청 / 주저앉음), 기술별, 볼핸들링 구간별 제치는 비율
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { MOVE_LABEL } from '../src/sim/types';

const n = Number(process.argv[2] ?? 20);
let moves = 0;
let beats = 0;
const stage = [0, 0, 0, 0];
const by: Record<string, number[]> = {};
const bh: Record<string, [number, number, number]> = {};
const combo = [0, 0, 0, 0];
for (let g = 0; g < n; g++) {
  const r = simulateGame(generateTeam(new Rng(1000 + g), TEAM_INFOS[g % 10], 1), generateTeam(new Rng(2000 + g), TEAM_INFOS[(g + 3) % 10], 1), 500 + g);
  moves += r.counters.moves ?? 0;
  beats += r.counters.beats ?? 0;
  for (const e of r.events) {
    if ((e.type !== 'dribble' && e.type !== 'ankle') || !e.dmove) continue;
    stage[e.stage ?? 0]++;
    (by[MOVE_LABEL[e.dmove]] ??= [0, 0, 0, 0])[e.stage ?? 0]++;
    combo[Math.min(3, e.combo2 ?? 1)]++;
    const b = Math.floor(r.players[e.player].r.ballHandling / 10) * 10;
    (bh[b] ??= [0, 0, 0])[0]++;
  }
}
console.log(`경기당 기술 ${(moves / n).toFixed(1)} · 제침 ${(beats / n).toFixed(1)} (${((beats / moves) * 100).toFixed(0)}%) · 한 발 ${(stage[1] / n).toFixed(1)} · 휘청 ${(stage[2] / n).toFixed(1)} · 주저앉음 ${(stage[3] / n).toFixed(2)} · 콤보 2번째 ${(combo[2] / n).toFixed(1)} 3번째 ${(combo[3] / n).toFixed(1)}`);
console.log(Object.entries(by).map(([k, v]) => `${k} ${v[1] + v[2] + v[3]}`).join(' · '));
console.log('볼핸들링별 제친 횟수/경기', Object.entries(bh).map(([k, v]) => `${k}대 ${(v[0] / n).toFixed(1)}`).join(' · '));
