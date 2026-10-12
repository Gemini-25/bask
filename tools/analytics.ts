// 분석 지표 리포트 (M17): npx tsx tools/analytics.ts [경기 수] [슈퍼스타 능력치] [자리]
// 1) 보통 리그 경기로 평균 (주전·벤치), BPM 보정값
// 2) 한 팀에 슈퍼스타(전부 N)를 넣은 경기에서 그 선수가 모든 지표에서 압도하나
import { Rng } from '../src/core/rng';
import { RATING_KEYS } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { analyzeGame, BPM_CAL, CTX_LABEL, derive, emptyRaw, mergeRaw, SHOT_CTXS, type AdvMetrics, type AdvRaw } from '../src/sim/analytics';
import { simulateGame } from '../src/sim/engine';

const n = Number(process.argv[2] ?? 30);
const starV = Number(process.argv[3] ?? 99);
const slot = Number(process.argv[4] ?? 1);

// 1) 리그 평균: 팀마다 자리(0~11)별로 합친다
const bySlot: AdvRaw[] = Array.from({ length: 12 }, () => emptyRaw());
const allPlayers: AdvRaw[] = [];
for (let g = 0; g < n; g++) {
  const a = generateTeam(new Rng(300 + g), TEAM_INFOS[g % 10], 0);
  const b = generateTeam(new Rng(700 + g), TEAM_INFOS[(g + 5) % 10], 0);
  const r = simulateGame(a, b, 900 + g);
  const raw = analyzeGame(r);
  raw.forEach((x, pid) => {
    const s = pid < a.players.length ? pid : pid - a.players.length;
    if (s < 12) bySlot[s] = mergeRaw(bySlot[s], x);
    if (x.sec > 0) allPlayers.push(x);
  });
}
// BPM 보정: 출전 공격 수로 가중한 평균이 0이 되게
let wsum = 0;
let bsum = 0;
for (const x of allPlayers) {
  const m = derive(x);
  wsum += x.on.poss;
  bsum += m.bpm * x.on.poss;
}
console.log(`BPM 보정 확인: 리그 평균 BPM ${(bsum / wsum).toFixed(2)} (지금 offset ${BPM_CAL.offset}, 0이 되려면 offset ${(BPM_CAL.offset + bsum / wsum).toFixed(2)})`);

// 2) 슈퍼스타
let star = emptyRaw();
let mate = emptyRaw();
let wins = 0;
for (let g = 0; g < n; g++) {
  const a = generateTeam(new Rng(300 + g), TEAM_INFOS[g % 10], 0);
  const b = generateTeam(new Rng(700 + g), TEAM_INFOS[(g + 5) % 10], 0);
  for (const k of RATING_KEYS) a.players[slot].r[k] = starV;
  const r = simulateGame(a, b, 900 + g);
  const raw = analyzeGame(r);
  star = mergeRaw(star, raw[slot]);
  // 같은 팀 다른 주전 평균 비교용 (자리 0~4 중 슈퍼스타 빼고 첫 번째)
  mate = mergeRaw(mate, raw[slot === 0 ? 1 : 0]);
  if (r.final[0] > r.final[1]) wins++;
}

const cols: [string, AdvMetrics][] = [
  [`슈퍼스타 ${starV}`, derive(star)],
  ['같은 팀 주전', derive(mate)],
  ['리그 주전 (자리 0~4)', derive(bySlot.slice(0, 5).reduce(mergeRaw, emptyRaw()))],
  ['리그 에이스 자리', derive(bySlot[0])],
  ['리그 벤치 (자리 5~8)', derive(bySlot.slice(5, 9).reduce(mergeRaw, emptyRaw()))],
];
const f1 = (v: number) => v.toFixed(1);
const pc = (v: number) => `${(v * 100).toFixed(1)}%`;
const rows: [string, (m: AdvMetrics) => string][] = [
  ['출전 (분)', (m) => f1(m.mpg)],
  ['득점', (m) => f1(m.ppg)],
  ['리바운드', (m) => f1(m.rpg)],
  ['어시스트', (m) => f1(m.apg)],
  ['스틸', (m) => f1(m.spg)],
  ['블록', (m) => f1(m.bpg)],
  ['TS%', (m) => pc(m.ts)],
  ['eFG%', (m) => pc(m.efg)],
  ['USG% (팀 공격 중 내가 끝낸 몫)', (m) => pc(m.usg)],
  ['AST% (동료 득점 중 내 어시스트)', (m) => pc(m.astPct)],
  ['TOV% (공격 중 실책)', (m) => pc(m.tovPct)],
  ['REB% (잡을 수 있던 리바운드)', (m) => pc(m.rebPct)],
  ['STL% (상대 공격 중 스틸)', (m) => pc(m.stlPct)],
  ['BLK% (상대 슛 중 블록)', (m) => pc(m.blkPct)],
  ['공격 레이팅 (코트에 있을 때)', (m) => f1(m.ortg)],
  ['수비 레이팅 (낮을수록 좋다)', (m) => f1(m.drtg)],
  ['넷 레이팅', (m) => f1(m.net)],
  ['온/오프 (넷 차이)', (m) => f1(m.onOff)],
  ['BPM', (m) => f1(m.bpm)],
  ['WAR (27경기로 환산)', (m) => f1((m.war / Math.max(1, m.games)) * 27)],
  ['돌파 (경기당)', (m) => f1(m.drivesPg)],
  ['돌파 → 슛 / 패스 / 실책', (m) => `${pc(m.driveShotPct)} / ${pc(m.drivePassPct)} / ${pc(m.driveTovPct)}`],
  ['터치 (경기당)', (m) => f1(m.touchesPg)],
  ['공 보유 (초/경기)', (m) => f1(m.holdPg)],
  ['잠재 어시스트', (m) => f1(m.potAstPg)],
  ['그래비티: 공 가졌을 때 도움 수비 (명)', (m) => m.gravityBall.toFixed(2)],
  ['그래비티: 공 없을 때 맡은 수비 거리 (m)', (m) => m.gravityOff.toFixed(2)],
  ['수비 그래비티 (상대 골밑 시도 억제)', (m) => f1(m.rimDeter)],
  ...SHOT_CTXS.map((k) => [`슛 · ${CTX_LABEL[k]}`, (m: AdvMetrics) => `${f1(m.ctx[k][0])}개 ${pc(m.ctx[k][1])}`] as [string, (m: AdvMetrics) => string]),
  ['슛 · 노마크 (견제 25% 미만)', (m) => `${f1(m.open[0])}개 ${pc(m.open[1])}`],
  ['슛 · 약한 견제', (m) => `${f1(m.light[0])}개 ${pc(m.light[1])}`],
  ['슛 · 강한 견제 (50% 넘게)', (m) => `${f1(m.tight[0])}개 ${pc(m.tight[1])}`],
  ['기대 야투율 (슛 고르기)', (m) => pc(m.xfg)],
  ['슛 메이킹 (실제 - 기대)', (m) => `${m.shotMaking >= 0 ? '+' : ''}${(m.shotMaking * 100).toFixed(1)}`],
  ['막은 슛 (1차 수비) / 상대 야투율', (m) => `${f1(m.dfgaPg)}개 ${pc(m.dfgPct)}`],
  ['골밑 지킨 슛 / 상대 야투율', (m) => `${f1(m.rimPg)}개 ${pc(m.rimPct)}`],
];
// 주전·벤치 묶음은 경기 수도 같이 더해져서 이미 한 명 평균이다
const per = new Map<string, number>();
const fix = (label: string, m: AdvMetrics): AdvMetrics => {
  const k = per.get(label);
  if (!k) return m;
  const sc = (v: number) => v / k;
  return { ...m, mpg: sc(m.mpg), ppg: sc(m.ppg), rpg: sc(m.rpg), apg: sc(m.apg), spg: sc(m.spg), bpg: sc(m.bpg), war: sc(m.war), drivesPg: sc(m.drivesPg), touchesPg: sc(m.touchesPg), holdPg: sc(m.holdPg), potAstPg: sc(m.potAstPg), dfgaPg: sc(m.dfgaPg), rimPg: sc(m.rimPg), ctx: Object.fromEntries(Object.entries(m.ctx).map(([c, [a, p]]) => [c, [sc(a), p]])) as AdvMetrics['ctx'], open: [sc(m.open[0]), m.open[1]], light: [sc(m.light[0]), m.light[1]], tight: [sc(m.tight[0]), m.tight[1]] };
};
const fixed = cols.map(([l, m]) => [l, fix(l, m)] as [string, AdvMetrics]);
const w0 = 30;
const w = 18;
console.log(`\n${n}경기 · 슈퍼스타 팀 승률 ${((wins / n) * 100).toFixed(0)}%\n`);
console.log(''.padEnd(w0) + fixed.map(([l]) => l.padStart(w)).join(''));
for (const [label, fn] of rows) console.log(label.padEnd(w0) + fixed.map(([, m]) => fn(m).padStart(w)).join(''));
