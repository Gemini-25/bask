// 전부 99인 선수가 경기에서 얼마나 하나: npx tsx tools/star.ts [경기 수] [능력치] [포지션 번호 0~4]
// 보통 프로 팀에 한 명을 넣고, 비슷한 팀과 붙여 경기당 득점·야투율·출전·팀 승률
import { Rng } from '../src/core/rng';
import { RATING_KEYS } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';

const n = Number(process.argv[2] ?? 30);
const v = Number(process.argv[3] ?? 99);
const slot = Number(process.argv[4] ?? 1);
let pts = 0;
let reb = 0;
let ast = 0;
let fgm = 0;
let fga = 0;
let tpm = 0;
let sec = 0;
let wins = 0;
let max = 0;
let stl = 0;
let blk = 0;
let tov = 0;
let oppFg = 0;
let oppFga = 0;
for (let g = 0; g < n; g++) {
  const a = generateTeam(new Rng(300 + g), TEAM_INFOS[g % 10], 0);
  const b = generateTeam(new Rng(700 + g), TEAM_INFOS[(g + 5) % 10], 0);
  const s = a.players[slot];
  for (const k of RATING_KEYS) s.r[k] = v;
  s.body = { ...s.body, heightCm: Math.max(s.body.heightCm, 198), wingspanCm: Math.max(s.body.wingspanCm, 208) };
  const r = simulateGame(a, b, 900 + g);
  const l = boxScore(r).players[slot];
  pts += l.pts;
  max = Math.max(max, l.pts);
  reb += l.oreb + l.dreb;
  ast += l.ast;
  fgm += l.fgm;
  fga += l.fga;
  tpm += l.tpm;
  stl += l.stl;
  blk += l.blk;
  tov += l.tov;
  const box = boxScore(r);
  // 상대 팀 야투율 (수비 영향)
  for (const q of box.players.slice(a.players.length)) {
    oppFg += q.fgm;
    oppFga += q.fga;
  }
  sec += l.sec;
  if (r.final[0] > r.final[1]) wins++;
}
console.log(`능력치 ${v} (자리 ${slot}) ${n}경기: ${(pts / n).toFixed(1)}점 ${(reb / n).toFixed(1)}리바 ${(ast / n).toFixed(1)}어시 · 야투 ${((fgm / fga) * 100).toFixed(1)}% (${(fga / n).toFixed(1)}개) · 3점 ${(tpm / n).toFixed(1)}개 · ${(sec / n / 60).toFixed(1)}분 · 스틸 ${(stl / n).toFixed(1)} 블록 ${(blk / n).toFixed(1)} 턴오버 ${(tov / n).toFixed(1)} · 상대 야투 ${((oppFg / oppFga) * 100).toFixed(1)}% · 최다 ${max}점 · 팀 승률 ${((wins / n) * 100).toFixed(0)}%`);
