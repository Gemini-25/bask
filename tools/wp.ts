// 승리 확률 계수 맞추기: 전력 차 → 최종 점수 차 회귀, 남은 오차 표준편차, 구간별 보정 확인
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { teamStrength, winProbSeries } from '../src/sim/winprob';

const N = Number(process.argv[2] ?? 300);
const xs: number[] = [];
const ys: number[] = [];
const bins = Array.from({ length: 10 }, () => ({ n: 0, win: 0 }));
for (let s = 1; s <= N; s++) {
  const rng = new Rng(s * 7919);
  const ia = rng.int(0, TEAM_INFOS.length - 1);
  let ib = rng.int(0, TEAM_INFOS.length - 2);
  if (ib >= ia) ib++;
  const a = generateTeam(rng.fork(1), TEAM_INFOS[ia]);
  const b = generateTeam(rng.fork(2), TEAM_INFOS[ib]);
  const g = simulateGame(a, b, s * 7919);
  xs.push(teamStrength(a) - teamStrength(b));
  ys.push(g.final[0] - g.final[1]);
  const won = g.final[0] > g.final[1] ? 1 : 0;
  // 경기 중 무작위 시점 몇 개로 보정 확인
  const series = winProbSeries(g);
  for (let k = 0; k < 6; k++) {
    const pt = series[Math.floor(rng.next() * (series.length - 1))];
    const b = Math.min(9, Math.floor(pt.p * 10));
    bins[b].n++;
    bins[b].win += won;
  }
}
const mx = xs.reduce((a, b) => a + b, 0) / N;
const my = ys.reduce((a, b) => a + b, 0) / N;
let sxy = 0;
let sxx = 0;
for (let i = 0; i < N; i++) {
  sxy += (xs[i] - mx) * (ys[i] - my);
  sxx += (xs[i] - mx) ** 2;
}
const slope = sxy / sxx;
let res = 0;
for (let i = 0; i < N; i++) res += (ys[i] - my - slope * (xs[i] - mx)) ** 2;
console.log(`games ${N}  strength diff sd ${Math.sqrt(sxx / N).toFixed(2)}  slope ${slope.toFixed(2)}  intercept ${(my - slope * mx).toFixed(2)}  residual sd ${Math.sqrt(res / N).toFixed(2)}`);
console.log('calibration (predicted bin → actual win rate):');
bins.forEach((b, i) => console.log(`  ${i * 10}-${i * 10 + 10}%  n=${b.n}  actual ${b.n ? ((b.win / b.n) * 100).toFixed(0) : '-'}%`));
