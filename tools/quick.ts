import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';

const seed = Number(process.argv[2] ?? 1);
const rng = new Rng(seed);
const a = generateTeam(rng.fork(1), TEAM_INFOS[0]);
const b = generateTeam(rng.fork(2), TEAM_INFOS[1]);
const t0 = performance.now();
const g = simulateGame(a, b, seed);
const ms = performance.now() - t0;
const box = boxScore(g);
console.log(`${a.short} ${g.final[0]} : ${g.final[1]} ${b.short}  (ticks ${g.rec.n}, ${ms.toFixed(0)}ms, quarters ${g.quarters})`);
for (const [i, t] of box.teams.entries()) {
  console.log(`team${i}: FG ${t.fgm}/${t.fga} 3P ${t.tpm}/${t.tpa} FT ${t.ftm}/${t.fta} REB ${t.oreb}+${t.dreb} AST ${t.ast} STL ${t.stl} BLK ${t.blk} TOV ${t.tov} PF ${t.pf}`);
}
const counts: Record<string, number> = {};
for (const e of g.events) counts[e.type + (e.tov ? ':' + e.tov : '') + (e.shot ? ':' + e.shot : '')] = (counts[e.type + (e.tov ? ':' + e.tov : '') + (e.shot ? ':' + e.shot : '')] ?? 0) + 1;
console.log(counts);
for (const [pid, l] of box.players.entries()) if (l.played) console.log(g.teamOf[pid], g.players[pid].pos, g.players[pid].name.padEnd(4), (l.sec / 60).toFixed(1).padStart(5), 'min', String(l.pts).padStart(3), 'pts', 'pf', l.pf, 'pm', l.pm);
if (process.argv[3] === 'log') for (const e of g.events.slice(0, 80)) console.log(e.quarter, e.clock.toFixed(1), e.text, e.score.join(':'));
