import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { DEBUG, simulateGame } from '../src/sim/engine';

const seed = Number(process.argv[2] ?? 3);
const from = Number(process.argv[3] ?? 60);
const to = Number(process.argv[4] ?? 120);
DEBUG.think = (t, i, u, v, tl, opts, chosen) => {
  if (t >= from && t <= to) console.log(`${t.toFixed(1)} p${i} u=${u.toFixed(1)} v=${v.toFixed(1)} left=${tl.toFixed(1)} -> ${chosen} | ${opts.join(' ')}`);
};
const rng = new Rng(seed);
const g = simulateGame(generateTeam(rng.fork(1), TEAM_INFOS[0]), generateTeam(rng.fork(2), TEAM_INFOS[1]), seed);
for (const e of g.events) if (e.tick * g.dt >= from && e.tick * g.dt <= to) console.log(`   [${(e.tick * g.dt).toFixed(1)}] ${e.text}`);
