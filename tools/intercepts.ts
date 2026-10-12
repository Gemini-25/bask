import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { DEBUG, simulateGame } from '../src/sim/engine';
const rows: Record<string, number | string>[] = [];
DEBUG.intercept = (i) => rows.push(i);
for (let g = 0; g < 5; g++) {
  const rng = new Rng(g + 7);
  simulateGame(generateTeam(rng.fork(1), TEAM_INFOS[2]), generateTeam(rng.fork(2), TEAM_INFOS[3]), g + 7);
}
const by: Record<string, number> = {};
for (const r of rows) by[String(r.who) + '/' + r.mode] = (by[String(r.who) + '/' + r.mode] ?? 0) + 1;
console.log(rows.length / 10, by);
for (const r of rows.slice(0, 25)) console.log(JSON.stringify(r));
