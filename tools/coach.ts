// 판단 AI·감독 조정 진단 (M28): 조정 종류별 횟수, 수비 읽기, 막판 (3점 지는 마지막 14초에 3점 비율, 마지막 공격 슛 시각)
// npx tsx tools/coach.ts [경기 수]
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
const N = Number(process.argv[2] ?? 30);
const c: Record<string, number> = {};
const add = (k: string, v = 1) => (c[k] = (c[k] ?? 0) + v);
const lastShotClock: number[] = [];
let down3 = 0;
let down3three = 0;
const samples: string[] = [];
for (let g = 0; g < N; g++) {
  const rng = new Rng(1000 + g);
  const ia = rng.int(0, 9);
  let ib = rng.int(0, 9);
  if (ib === ia) ib = (ib + 1) % 10;
  const r = simulateGame(generateTeam(rng.fork(1), TEAM_INFOS[ia]), generateTeam(rng.fork(2), TEAM_INFOS[ib]), 5000 + g);
  for (const e of r.events) {
    if (e.type === 'adjust') {
      add('adj:' + e.adj);
      if (samples.length < 14 && e.adj !== 'twoForOne') samples.push(`${e.quarter}Q ${Math.floor(e.clock / 60)}:${String(Math.floor(e.clock % 60)).padStart(2, '0')} ${e.text}`);
    }
    if (e.type === 'read') add('read:' + e.read);
    if ((e.type === 'made' || e.type === 'miss') && e.quarter >= 4 && e.clock < 14) {
      const margin = e.score[e.team] - e.score[1 - e.team] + (e.type === 'made' ? -e.pts : 0);
      if (margin === -3) {
        down3++;
        if (e.pts === 3) down3three++;
      }
    }
  }
  // 쿼터 마지막 공격의 슛 시각
  for (const e of r.events) if ((e.type === 'made' || e.type === 'miss') && e.clock < 24 && e.clock > 0) {
    const nxt = r.events.find((x) => x.tick > e.tick && (x.type === 'made' || x.type === 'miss' || x.type === 'quarterEnd'));
    if (nxt?.type === 'quarterEnd') lastShotClock.push(e.clock);
  }
}
for (const [k, v] of Object.entries(c).sort()) console.log(`${k.padEnd(16)} ${(v / N).toFixed(2)}/경기`);
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
console.log(`3점 지는 마지막 14초 슛 ${down3}개 중 3점 ${down3three} (${((down3three / Math.max(1, down3)) * 100).toFixed(0)}%)`);
console.log(`쿼터 마지막 슛의 남은 시간 평균 ${avg(lastShotClock).toFixed(1)}초 (${lastShotClock.length}개), 3초 안 ${((lastShotClock.filter((x) => x <= 3).length / Math.max(1, lastShotClock.length)) * 100).toFixed(0)}%`);
console.log(samples.join('\n'));
