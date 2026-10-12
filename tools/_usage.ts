import { readFileSync } from 'node:fs';
import { importCareer } from '../src/career/save';
import { playMatch, myTeam } from '../src/career/match';
import { boxScore } from '../src/sim/stats';
import { overall } from '../src/data/player';
const c = importCareer(readFileSync(process.argv[2], 'utf8'));
const L = c.league!;
const opps = L.teams.filter((t) => t.info.id !== c.pro!.team);
const t = myTeam(c, true).team;
console.log('me', overall(c.me, c.prefPos).toFixed(1), 'r', ['three', 'midRange', 'layup', 'dunk', 'ballHandling', 'speed', 'passing', 'iq'].map((k) => `${k}:${(c.me.r as any)[k]}`).join(' '));
console.log('team', t.players.map((p) => `${p.id === 'me' ? '*' : ''}${overall(p).toFixed(0)}`).join(' '), 'trust', c.trust);
let fga = 0, tfga = 0, pts = 0, sec = 0, n = 0;
const others: Record<string, number> = {};
for (let i = 0; i < 12; i++) {
  c.pendingGame = { kind: 'official', pro: true, opponent: opps[i % opps.length].info.id, label: '정규시즌', home: i % 2 === 0 };
  const m = playMatch(c, 1000 + i);
  const box = boxScore(m.game);
  const side = m.home ? 0 : 1;
  const mine = box.players[m.myPid];
  fga += mine.fga; pts += mine.pts; sec += mine.sec; n++;
  m.game.players.forEach((p, pid) => { if (m.game.teamOf[pid] === side) { tfga += box.players[pid].fga; if (p.id !== 'me') others[p.name] = (others[p.name] ?? 0) + box.players[pid].pts; } });
}
console.log(`me ${(pts / n).toFixed(1)}pts ${(fga / n).toFixed(1)}fga share ${((fga / tfga) * 100).toFixed(0)}% ${(sec / n / 60).toFixed(1)}min`);
console.log('teammates top', Object.entries(others).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(', '));
