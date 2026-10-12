// 밸런스 리포트 (E10): 여러 경기를 돌려서 평균 통계를 실제 리그와 비교한다.
// npx tsx tools/report.ts [경기 수]
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';
import type { ShotKind } from '../src/sim/types';

const N = Number(process.argv[2] ?? 100);
const keys = ['pts', 'fga', 'fgm', 'tpa', 'tpm', 'fta', 'ftm', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf'] as const;
const agg: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
const extra = { poss: 0, passes: 0, intercepts: 0, drives: 0, ot: 0, ankle: 0, fbPts: 0, shotTime: 0, shotN: 0, timeouts: 0, subs: 0, fouledOut: 0, techs: 0, switches: 0, doubles: 0, alley: 0, andOne: 0 };
const kinds: Record<string, { a: number; m: number }> = {};
const tov: Record<string, number> = {};
const fouls: Record<string, number> = {};
const plays: Record<string, number> = {};
const schemes: Record<string, number> = {};
let margin = 0;
let topSum = 0;
let topMax = 0;
let starterMin = 0;
let starterN = 0;
let maxMin = 0;
let usedPlayers = 0;
const t0 = performance.now();
for (let g = 0; g < N; g++) {
  const rng = new Rng(1000 + g);
  const ia = rng.int(0, 9);
  let ib = rng.int(0, 9);
  if (ib === ia) ib = (ib + 1) % 10;
  const A = generateTeam(rng.fork(1), TEAM_INFOS[ia]);
  const B = generateTeam(rng.fork(2), TEAM_INFOS[ib]);
  const res = simulateGame(A, B, 5000 + g);
  const box = boxScore(res);
  for (const t of box.teams) for (const k of keys) agg[k] += t[k];
  margin += Math.abs(res.final[0] - res.final[1]);
  const top = Math.max(...box.players.map((p) => p.pts));
  topSum += top;
  topMax = Math.max(topMax, top);
  box.players.forEach((l, pid) => {
    const depth = res.teamOf[pid] === 0 ? pid : pid - A.players.length;
    if (depth < 5) {
      starterMin += l.sec / 60;
      starterN++;
    }
    maxMin = Math.max(maxMin, l.sec / 60);
    if (l.played) usedPlayers++;
  });
  const c = res.counters;
  extra.poss += c.possessions[0] + c.possessions[1];
  extra.passes += c.passes;
  extra.intercepts += c.intercepts;
  extra.drives += c.drives;
  extra.shotTime += c.shotTimeSum;
  extra.shotN += c.shotTimeN;
  extra.timeouts += c.timeouts;
  extra.subs += c.subs;
  extra.fouledOut += c.fouledOut;
  extra.techs += c.techs;
  extra.switches += c.switches;
  extra.doubles += c.doubles;
  extra.alley += c.alleyOops;
  for (const [k, v] of Object.entries(c.plays)) plays[k] = (plays[k] ?? 0) + v;
  for (const [k, v] of Object.entries(c.schemes)) schemes[k] = (schemes[k] ?? 0) + v;
  if (res.quarters > 4) extra.ot++;
  for (const e of res.events) {
    if (e.type === 'made' || e.type === 'miss') {
      const k = e.shot as ShotKind;
      kinds[k] ??= { a: 0, m: 0 };
      kinds[k].a++;
      if (e.type === 'made') kinds[k].m++;
      if (e.type === 'made' && e.fastBreak) extra.fbPts += e.pts;
      if (e.andOne) extra.andOne++;
    }
    if (e.type === 'turnover') tov[e.tov!] = (tov[e.tov!] ?? 0) + 1;
    if (e.type === 'foul') fouls[e.foul!] = (fouls[e.foul!] ?? 0) + 1;
    if (e.type === 'ankle') extra.ankle++;
  }
}
const ms = performance.now() - t0;
const TG = N * 2; // 팀-경기 수
const f = (v: number, d = 1) => v.toFixed(d);
const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');
const row = (name: string, val: string, ref: string) => console.log(`${name.padEnd(16)} ${val.padStart(9)}   기준 ${ref}`);
console.log(`\n${N}경기 (${f(ms / N, 0)}ms/경기), 팀당 경기 평균. 기준은 유로리그 2023-24 평균 근사\n`);
row('득점', f(agg.pts / TG), '80~82');
row('공격 횟수', f(extra.poss / TG), '71~73');
row('야투 시도', f(agg.fga / TG), '61~63');
row('야투율', pct(agg.fgm, agg.fga), '47~49%');
row('2점 성공률', pct(agg.fgm - agg.tpm, agg.fga - agg.tpa), '53~56%');
row('3점 시도', f(agg.tpa / TG), '24~27');
row('3점 성공률', pct(agg.tpm, agg.tpa), '35~37%');
row('자유투 시도', f(agg.fta / TG), '19~22');
row('자유투 성공률', pct(agg.ftm, agg.fta), '76~79%');
row('공격 리바운드', f(agg.oreb / TG), '9~11');
row('수비 리바운드', f(agg.dreb / TG), '24~26');
row('공리 비율', pct(agg.oreb, agg.oreb + agg.dreb), '27~30%');
row('어시스트', f(agg.ast / TG), '16~18');
row('스틸', f(agg.stl / TG), '6~7');
row('블록', f(agg.blk / TG), '2~3');
row('턴오버', f(agg.tov / TG), '12~13');
row('파울', f(agg.pf / TG), '19~21');
row('속공 득점', f(extra.fbPts / TG), '8~12');
row('평균 점수차', f(margin / N), '10~13');
row('연장 비율', pct(extra.ot, N), '4~6%');
row('경기 최다 득점', f(topSum / N), '24~28');
row('최다 득점 기록', String(topMax), '40점대');
row('주전 출전 시간', f(starterMin / starterN) + '분', '26~30분');
row('최장 출전', f(maxMin) + '분', '40분 안팎');
row('출전 선수', f(usedPlayers / TG), '10~11명');
console.log('');
console.log(`패스 ${f(extra.passes / TG)}/팀경기, 가로채기 ${pct(extra.intercepts, extra.passes)} / 패스, 돌파 ${f(extra.drives / TG)}, 앵클 ${f(extra.ankle / TG)}, 슛까지 평균 ${f(extra.shotTime / extra.shotN)}초`);
console.log(`타임아웃 ${f(extra.timeouts / TG)}, 교체 ${f(extra.subs / TG)}, 퇴장 ${f(extra.fouledOut / N, 2)}/경기, 테크니컬 ${f(extra.techs / N, 2)}/경기, 앤드원 ${f(extra.andOne / TG)}, 앨리웁 ${f(extra.alley / TG)}, 스위치 ${f(extra.switches / TG)}, 더블팀 ${f(extra.doubles / TG)}`);
console.log('슛 종류:', Object.entries(kinds).map(([k, v]) => `${k} ${f(v.a / TG)}개 ${pct(v.m, v.a)}`).join(', '));
console.log('턴오버 종류:', Object.entries(tov).map(([k, v]) => `${k} ${f(v / TG)}`).join(', '));
console.log('파울 종류:', Object.entries(fouls).map(([k, v]) => `${k} ${f(v / TG)}`).join(', '));
console.log('공격 전술:', Object.entries(plays).map(([k, v]) => `${k} ${f(v / TG)}`).join(', '));
console.log('수비 전술:', Object.entries(schemes).map(([k, v]) => `${k} ${f(v / TG)}`).join(', '));
