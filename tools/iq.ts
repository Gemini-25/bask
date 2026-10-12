// 농구 IQ·위치선정이 의미 있나 (M22): npx tsx tools/iq.ts [경기 수] [능력치,능력치] [높음] [낮음]
// 같은 팀 두 벌에 그 능력치만 높게/낮게 줘서 같은 상대와 붙이고 점수 차·슛 질·실책·어시스트를 본다
import { Rng } from '../src/core/rng';
import type { RatingKey } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';

const n = Number(process.argv[2] ?? 30);
const keys = (process.argv[3] ?? 'iq').split(',') as RatingKey[];
const hi = Number(process.argv[4] ?? 85);
const lo = Number(process.argv[5] ?? 45);
const run = (v: number) => {
  const tk: Record<string, number> = {};
  let margin = 0, win = 0, tov = 0, ast = 0, fgm = 0, fga = 0, xfg = 0, open = 0, shots = 0, oppFga = 0, oppFgm = 0, oppTov = 0, cuts = 0;
  for (let g = 0; g < n; g++) {
    const a = generateTeam(new Rng(5000 + g), TEAM_INFOS[g % 10], 0);
    const b = generateTeam(new Rng(6000 + g), TEAM_INFOS[(g + 5) % 10], 0);
    for (const p of a.players) for (const k of keys) p.r[k] = v;
    const r = simulateGame(a, b, 7000 + g);
    const box = boxScore(r);
    margin += r.final[0] - r.final[1];
    if (r.final[0] > r.final[1]) win++;
    const t = box.teams[0];
    const o = box.teams[1];
    tov += t.tov; ast += t.ast; fgm += t.fgm; fga += t.fga; oppFga += o.fga; oppFgm += o.fgm; oppTov += o.tov;
    for (const e of r.events) if ((e.type === 'made' || e.type === 'miss') && e.team === 0) {
      shots++;
      xfg += e.prob ?? 0;
      if ((e.contest ?? 1) < 0.25) open++;
    }
    cuts += r.counters.plays?.motion ?? 0;
    for (const e of r.events) if (e.type === 'turnover' && e.team === 0) tk[e.tov ?? '?'] = (tk[e.tov ?? '?'] ?? 0) + 1;
  }
  const f = (x: number) => (x / n).toFixed(1);
  console.log(`${keys.join('+')} ${v}: 점수차 ${f(margin)} 승률 ${((win / n) * 100).toFixed(0)}% | 야투 ${((fgm / fga) * 100).toFixed(1)}% 기대 ${((xfg / shots) * 100).toFixed(1)}% 노마크 ${((open / shots) * 100).toFixed(0)}% 실책 ${f(tov)} 어시 ${f(ast)} | 상대 야투 ${((oppFgm / oppFga) * 100).toFixed(1)}% 상대 실책 ${f(oppTov)}`);
  console.log('  실책 종류', Object.entries(tk).map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(' '));
};
run(hi);
run(lo);
