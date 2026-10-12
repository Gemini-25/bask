// 디버그용: 경기 기록을 글자 코트로 찍는다. npx tsx tools/ascii.ts [seed] [시작초] [길이초] [간격초]
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';

const seed = Number(process.argv[2] ?? 1);
const from = Number(process.argv[3] ?? 0);
const len = Number(process.argv[4] ?? 20);
const every = Number(process.argv[5] ?? 1);
const rng = new Rng(seed);
const a = generateTeam(rng.fork(1), TEAM_INFOS[0]);
const b = generateTeam(rng.fork(2), TEAM_INFOS[1]);
const g = simulateGame(a, b, seed);
const rec = g.rec;
const t0 = Math.round(from / g.dt);
const t1 = Math.min(rec.n - 1, Math.round((from + len) / g.dt));
const step = Math.max(1, Math.round(every / g.dt));
let ei = 0;
for (let t = t0; t <= t1; t += step) {
  const W = 58;
  const Hh = 17;
  const grid: string[][] = Array.from({ length: Hh }, (_, r) => Array.from({ length: W }, (_, c) => (r === 0 || r === Hh - 1 ? '-' : c === 0 || c === W - 1 ? '|' : c === 29 ? ':' : ' ')));
  const put = (x: number, y: number, ch: string) => {
    const c = Math.round(x * 2) + 1;
    const r = Math.round(y) + 1;
    if (r >= 0 && r < Hh && c >= 0 && c < W) grid[r][c] = ch;
  };
  put(1.575, 7.5, '#');
  put(28 - 1.575, 7.5, '#');
  for (let i = 0; i < 10; i++) {
    const ch = i < 5 ? String(i + 1) : 'abcde'[i - 5];
    put(rec.pos[t * 20 + i * 2], rec.pos[t * 20 + i * 2 + 1], (rec.flags[t * 10 + i] & 1) ? '*' : ch);
  }
  const bz = rec.ball[t * 3 + 2];
  put(rec.ball[t * 3], rec.ball[t * 3 + 1], bz > 2.2 ? 'O' : 'o');
  const evs: string[] = [];
  while (ei < g.events.length && g.events[ei].tick <= t) {
    if (g.events[ei].tick > t - step) evs.push(g.events[ei].text);
    ei++;
  }
  console.log(`t=${(t * g.dt).toFixed(1)} Q${rec.quarter[t]} ${rec.clock[t].toFixed(1)} sc=${rec.shotClock[t].toFixed(1)} holder=${rec.holder[t]} ${evs.join(' / ')}`);
  console.log(grid.map((r) => r.join('')).join('\n'));
}
