// 밸런스 리포트 (E10): 여러 경기를 돌려서 평균 통계를 실제 리그와 비교한다.
// npx tsx tools/report.ts [경기 수]
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';
import type { ShotKind } from '../src/sim/types';

const N = Number(process.argv[2] ?? 100);
const agg = { pts: 0, fga: 0, fgm: 0, tpa: 0, tpm: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, poss: 0, passes: 0, intercepts: 0, drives: 0, ot: 0, ankle: 0, fbPts: 0, shotTime: 0, shotN: 0 };
const kinds: Record<string, { a: number; m: number }> = {};
const tov: Record<string, number> = {};
const plays: Record<string, number> = {};
let margin = 0;
let topSum = 0;
let topMax = 0;
const t0 = performance.now();
for (let g = 0; g < N; g++) {
  const rng = new Rng(1000 + g);
  const ia = rng.int(0, 9);
  let ib = rng.int(0, 9);
  if (ib === ia) ib = (ib + 1) % 10;
  const A = generateTeam(rng.fork(1), TEAM_INFOS[ia]);
  const B = generateTeam(rng.fork(2), TEAM_INFOS[ib]);
  const res = simulateGame(A, B, 5000 + g);
  const box = boxScore(res.events);
  for (const t of box.teams) {
    agg.pts += t.pts;
    agg.fga += t.fga;
    agg.fgm += t.fgm;
    agg.tpa += t.tpa;
    agg.tpm += t.tpm;
    agg.oreb += t.oreb;
    agg.dreb += t.dreb;
    agg.ast += t.ast;
    agg.stl += t.stl;
    agg.blk += t.blk;
    agg.tov += t.tov;
  }
  margin += Math.abs(res.final[0] - res.final[1]);
  const top = Math.max(...box.players.map((p) => p.pts));
  topSum += top;
  topMax = Math.max(topMax, top);
  agg.poss += res.counters.possessions[0] + res.counters.possessions[1];
  agg.passes += res.counters.passes;
  agg.intercepts += res.counters.intercepts;
  agg.drives += res.counters.drives;
  agg.shotTime += res.counters.shotTimeSum;
  agg.shotN += res.counters.shotTimeN;
  for (const [k, v] of Object.entries(res.counters.plays)) plays[k] = (plays[k] ?? 0) + v;
  if (res.quarters > 4) agg.ot++;
  for (const e of res.events) {
    if (e.type === 'made' || e.type === 'miss') {
      const k = e.shot as ShotKind;
      kinds[k] ??= { a: 0, m: 0 };
      kinds[k].a++;
      if (e.type === 'made') kinds[k].m++;
      if (e.type === 'made' && e.fastBreak) agg.fbPts += e.pts;
    }
    if (e.type === 'turnover') tov[e.tov!] = (tov[e.tov!] ?? 0) + 1;
    if (e.type === 'ankle') agg.ankle++;
  }
}
const ms = performance.now() - t0;
const TG = N * 2; // 팀-경기 수
const f = (v: number, d = 1) => v.toFixed(d);
const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');
const row = (name: string, val: string, ref: string) => console.log(`${name.padEnd(16)} ${val.padStart(9)}   기준 ${ref}`);
console.log(`\n${N}경기 (${f(ms / N, 0)}ms/경기), 팀당 경기 평균. 기준은 유로리그 2023-24 평균 근사`);
console.log('※ 아직 파울·자유투가 없어서 득점은 자유투 몫(경기당 약 15점)만큼 낮게 나온다.\n');
row('득점', f(agg.pts / TG), '80~82');
row('공격 횟수', f(agg.poss / TG), '71~73');
row('야투 시도', f(agg.fga / TG), '61~63');
row('야투율', pct(agg.fgm, agg.fga), '47~49%');
row('2점 성공률', pct(agg.fgm - agg.tpm, agg.fga - agg.tpa), '53~56%');
row('3점 시도', f(agg.tpa / TG), '24~27');
row('3점 성공률', pct(agg.tpm, agg.tpa), '35~37%');
row('공격 리바운드', f(agg.oreb / TG), '9~11');
row('수비 리바운드', f(agg.dreb / TG), '24~26');
row('공리 비율', pct(agg.oreb, agg.oreb + agg.dreb), '27~30%');
row('어시스트', f(agg.ast / TG), '16~18');
row('스틸', f(agg.stl / TG), '6~7');
row('블록', f(agg.blk / TG), '2~3');
row('턴오버', f(agg.tov / TG), '12~13');
row('속공 득점', f(agg.fbPts / TG), '8~12');
row('평균 점수차', f(margin / N), '10~13');
row('연장 비율', pct(agg.ot, N), '4~6%');
row('경기 최다 득점', f(topSum / N), '24~28');
row('최다 득점 기록', String(topMax), '40점대');
console.log('');
console.log(`패스 ${f(agg.passes / TG)}/팀경기, 가로채기 ${pct(agg.intercepts, agg.passes)} / 패스, 돌파 ${f(agg.drives / TG)}, 앵클 ${f(agg.ankle / TG)}, 슛까지 평균 ${f(agg.shotTime / agg.shotN)}초`);
console.log('슛 종류:', Object.entries(kinds).map(([k, v]) => `${k} ${f(v.a / TG)}개 ${pct(v.m, v.a)}`).join(', '));
console.log('턴오버 종류:', Object.entries(tov).map(([k, v]) => `${k} ${f(v / TG)}`).join(', '));
console.log('전술:', Object.entries(plays).map(([k, v]) => `${k} ${f(v / TG)}`).join(', '));
