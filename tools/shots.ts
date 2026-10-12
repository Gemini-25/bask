import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { DEBUG, simulateGame } from '../src/sim/engine';
const b: Record<string, { n: number; c: number; p: number; m: number; hist: number[]; late: number }> = {};
DEBUG.shot = (k, c, p, made, tl) => {
  b[k] ??= { n: 0, c: 0, p: 0, m: 0, hist: [0, 0, 0, 0, 0], late: 0 };
  const x = b[k];
  x.n++;
  x.c += c;
  x.p += p;
  if (made) x.m++;
  x.hist[Math.min(4, Math.floor(c * 5))]++;
  if (tl < 5) x.late++;
};
for (let g = 0; g < 10; g++) {
  const rng = new Rng(g + 100);
  simulateGame(generateTeam(rng.fork(1), TEAM_INFOS[4]), generateTeam(rng.fork(2), TEAM_INFOS[5]), g + 100);
}
for (const [k, x] of Object.entries(b)) console.log(k.padEnd(8), 'n', (x.n / 20).toFixed(1), 'avgC', (x.c / x.n).toFixed(2), 'avgP', (x.p / x.n).toFixed(2), 'contest hist(0-.2-.4-.6-.8-1)', x.hist.map((h) => ((h / x.n) * 100).toFixed(0) + '%').join(' '), 'late', ((x.late / x.n) * 100).toFixed(0) + '%');
