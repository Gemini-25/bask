// 리바운드 진단 (M26): 공리 비율, 잡힌 거리·시간, 빗나간 종류별, 팁·팁인·아웃
// npx tsx tools/rebounds.ts [경기 수]
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { hoopXY } from '../src/sim/court';
import { simulateGame } from '../src/sim/engine';

const N = Number(process.argv[2] ?? 30);
let miss = 0;
let oreb = 0;
let dreb = 0;
let tipIn = 0;
let tipInMade = 0;
let bounce = 0;
let none = 0;
const byKind: Record<string, { n: number; o: number; d: number; dt: number }> = {};
const dists: number[] = [];
const src: Record<string, { o: number; d: number }> = {};
const times: number[] = [];
const zs: number[] = [];
for (let g = 0; g < N; g++) {
  const rng = new Rng(1000 + g);
  const ia = rng.int(0, 9);
  let ib = rng.int(0, 9);
  if (ib === ia) ib = (ib + 1) % 10;
  const r = simulateGame(generateTeam(rng.fork(1), TEAM_INFOS[ia]), generateTeam(rng.fork(2), TEAM_INFOS[ib]), 5000 + g);
  const ev = r.events;
  let last = '';
  for (const e of ev) {
    if (e.type === 'miss') last = e.blocked ? 'block' : 'miss';
    else if (e.type === 'ft') last = 'ft';
    else if (e.type === 'turnover' || e.type === 'loose') last = 'loose';
    if (e.type === 'rebound') {
      const b = (src[last] ??= { o: 0, d: 0 });
      if (e.offensive) b.o++;
      else b.d++;
    }
  }
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e.type === 'bounce') bounce++;
    if ((e.type === 'made' || e.type === 'miss') && e.move === 'tipIn') {
      tipIn++;
      if (e.type === 'made') tipInMade++;
    }
    if (e.type !== 'miss' || e.blocked) continue;
    miss++;
    const k = e.missKind ?? '?';
    const b = (byKind[k] ??= { n: 0, o: 0, d: 0, dt: 0 });
    b.n++;
    let j = i + 1;
    while (j < ev.length && ev[j].type !== 'rebound' && ev[j].type !== 'miss' && ev[j].type !== 'made' && ev[j].type !== 'turnover' && ev[j].type !== 'foul' && ev[j].type !== 'quarterEnd') j++;
    const x = ev[j];
    if (!x || x.type !== 'rebound') {
      none++;
      continue;
    }
    if (x.offensive) {
      oreb++;
      b.o++;
    } else {
      dreb++;
      b.d++;
    }
    const dt = (x.tick - e.tick) * r.dt;
    b.dt += dt;
    times.push(dt);
    zs.push(r.rec.ball[(x.tick - 1) * 3 + 2]);
    const p = r.rec.pos;
    let lu = r.lineups[0];
    for (const l of r.lineups) if (l.tick <= x.tick) lu = l;
    const s = lu.pids.indexOf(x.player);
    if (s >= 0) {
      const px = p[x.tick * 20 + s * 2];
      const py = p[x.tick * 20 + s * 2 + 1];
      dists.push(Math.min(...[hoopXY(true), hoopXY(false)].map((H) => Math.hypot(H.x - px, H.y - py))));
    }
  }
}
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const pct = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)] ?? 0;
console.log(`${N}경기, 빗나간 슛 ${miss} (블록 제외), 공리 ${oreb} 수리 ${dreb} 그 밖 ${none}, 공리 비율 ${((oreb / (oreb + dreb)) * 100).toFixed(1)}%`);
console.log(`잡힌 거리 평균 ${avg(dists).toFixed(2)}m (중앙 ${pct(dists, 0.5).toFixed(2)}, 90% ${pct(dists, 0.9).toFixed(2)}), 시간 평균 ${avg(times).toFixed(2)}s (90% ${pct(times, 0.9).toFixed(2)})`);
console.log(`잡힌 높이 평균 ${avg(zs).toFixed(2)}m (10% ${pct(zs, 0.1).toFixed(2)}, 중앙 ${pct(zs, 0.5).toFixed(2)}, 90% ${pct(zs, 0.9).toFixed(2)}), 1.3m 아래 ${((zs.filter((z) => z < 1.3).length / zs.length) * 100).toFixed(0)}%`);
console.log(`팁인 ${(tipIn / N / 2).toFixed(2)}/팀경기 (성공 ${((tipInMade / Math.max(1, tipIn)) * 100).toFixed(0)}%), 튕김 이벤트 ${(bounce / N).toFixed(1)}/경기`);
for (const [k, b] of Object.entries(byKind)) console.log(`  ${k.padEnd(6)} ${b.n}개 공리 ${((b.o / Math.max(1, b.o + b.d)) * 100).toFixed(0)}% 시간 ${(b.dt / Math.max(1, b.o + b.d)).toFixed(2)}s`);
for (const [k, b] of Object.entries(src)) console.log(`  [${k}] 리바 ${((b.o + b.d) / N / 2).toFixed(1)}/팀경기, 공리 ${((b.o / Math.max(1, b.o + b.d)) * 100).toFixed(0)}%`);
