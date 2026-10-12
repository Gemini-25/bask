// M20 확인: 덩크가 좋은 선수가 경기에서 새 덩크(해머·슈퍼맨)를 쓰는지
import { Rng } from '../src/core/rng';
import { RATING_KEYS } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';

const counts: Record<string, number> = {};
for (let g = 0; g < 20; g++) {
  const rng = new Rng(100 + g);
  const a = generateTeam(rng, TEAM_INFOS[0], 0);
  const b = generateTeam(rng, TEAM_INFOS[1], 0);
  for (const k of RATING_KEYS) a.players[0].r[k] = 95;
  const res = simulateGame(a, b, 500 + g);
  for (const e of res.events) if (e.dunk) counts[e.dunk] = (counts[e.dunk] ?? 0) + 1;
}
console.log(counts);
