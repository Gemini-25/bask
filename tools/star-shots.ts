// 능력치 v인 선수 한 명의 슛 종류별 성공률: npx tsx tools/star-shots.ts [경기 수] [능력치] [자리 0~4]
import { Rng } from '../src/core/rng';
import { RATING_KEYS } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';

const n = Number(process.argv[2] ?? 30);
const v = Number(process.argv[3] ?? 99);
const slot = Number(process.argv[4] ?? 1);
const k: Record<string, [number, number]> = {};
let ftm = 0, fta = 0, pts = 0, fgm = 0, fga = 0, tpm = 0, tpa = 0, blk = 0, wins = 0;
for (let g = 0; g < n; g++) {
  const a = generateTeam(new Rng(300 + g), TEAM_INFOS[g % 10], 0);
  const b = generateTeam(new Rng(700 + g), TEAM_INFOS[(g + 5) % 10], 0);
  const s = a.players[slot];
  for (const kk of RATING_KEYS) s.r[kk] = v;
  s.body = { ...s.body, heightCm: Math.max(s.body.heightCm, 198), wingspanCm: Math.max(s.body.wingspanCm, 208) };
  const r = simulateGame(a, b, 900 + g);
  for (const e of r.events) {
    if ((e.type !== 'made' && e.type !== 'miss') || e.player !== slot) continue;
    const x = (k[e.shot!] ??= [0, 0]);
    x[1]++;
    if (e.type === 'made') x[0]++;
    if (e.blocked) blk++;
  }
  const l = boxScore(r).players[slot];
  ftm += l.ftm; fta += l.fta; pts += l.pts; fgm += l.fgm; fga += l.fga; tpm += l.tpm; tpa += l.tpa;
  if (r.final[0] > r.final[1]) wins++;
}
const pc = (m: number, a: number) => `${((m / a) * 100).toFixed(1)}%`;
console.log(`${v}: ${(pts / n).toFixed(1)}점 · 야투 ${pc(fgm, fga)} (${(fga / n).toFixed(1)}개) · 3점 ${pc(tpm, tpa)} (${(tpa / n).toFixed(1)}개) · 자유투 ${pc(ftm, fta)} (${(fta / n).toFixed(1)}개) · 블록당함 ${(blk / n).toFixed(1)} · 승률 ${((wins / n) * 100).toFixed(0)}%`);
console.log(Object.entries(k).map(([x, [m, a]]) => `${x} ${pc(m, a)} (${(a / n).toFixed(1)})`).join(' · '));
