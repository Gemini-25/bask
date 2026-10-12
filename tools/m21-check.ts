// M21 확인: 체이스다운·화려한 패스·세리머니·딥쓰리 동작이 얼마나 나오나
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { ACT } from '../src/sim/types';

const n = Number(process.argv[2] ?? 10);
let chase = 0, fancy = 0, deepAct = 0;
const cel: Record<string, number> = {};
const names = Object.fromEntries(Object.entries(ACT).map(([k, v]) => [v, k]));
for (let g = 0; g < n; g++) {
  const a = generateTeam(new Rng(300 + g), TEAM_INFOS[g % 10], 1);
  const b = generateTeam(new Rng(400 + g), TEAM_INFOS[(g + 3) % 10], 1);
  for (const p of [a.players[0], b.players[0]]) p.abilities = { ...(p.abilities ?? {}), chaseDown: 3, showtime: 3, deepRange: 3 };
  const r = simulateGame(a, b, 700 + g);
  chase += r.events.filter((e) => e.chase).length;
  fancy += r.events.filter((e) => e.fancy).length;
  const seen = new Set<string>();
  for (let f = 1; f < r.rec.n; f++)
    for (let i = 0; i < 10; i++) {
      const act = r.rec.act[f * 10 + i];
      if (act === r.rec.act[(f - 1) * 10 + i]) continue;
      if ([ACT.GOGGLES, ACT.FLEX, ACT.SHIMMY, ACT.SHH, ACT.ROAR, ACT.TURNAWAY, ACT.BEHINDPASS, ACT.NOLOOK, ACT.CHASE, ACT.HANG, ACT.CELEBRATE].includes(act as never)) cel[names[act]] = (cel[names[act]] ?? 0) + 1;
      if (act === ACT.DEEP) deepAct++;
      seen.add(names[act]);
    }
}
console.log(`${n}경기: 체이스다운 ${chase}, 쇼타임 패스 어시스트 ${fancy}, 딥쓰리 동작 ${deepAct}`);
console.log(Object.entries(cel).map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(' · '));
