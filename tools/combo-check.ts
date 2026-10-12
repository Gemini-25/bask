// 콤비가 실제 경기에서 얼마나 나오나: npx tsx tools/combo-check.ts <세이브.json> [경기 수]
import { readFileSync } from 'node:fs';
import { teammates } from '../src/career/career';
import { checkCombos, COMBO_FRIEND } from '../src/career/combos';
import { playMatch } from '../src/career/match';
import { importCareer } from '../src/career/save';
import { autoWeek } from '../src/career/autoplay';
import { boxScore } from '../src/sim/stats';

const [file, nArg] = process.argv.slice(2);
const c = importCareer(readFileSync(file, 'utf8'));
const best = [...teammates(c)].sort((a, b) => (c.friends[b.player.id] ?? 0) - (c.friends[a.player.id] ?? 0)).slice(0, 2);
for (const e of best) c.friends[e.player.id] = COMBO_FRIEND;
console.log(checkCombos(c).join('\n'));
let games = 0;
let combos = 0;
let pairMade = 0;
for (let w = 0; w < 200 && games < Number(nArg ?? 10); w++) {
  const r = autoWeek(c, 'good', { stop: 'game' });
  if (r.stopped !== 'game' || !c.pendingGame || c.pendingGame.special) continue;
  const rep = playMatch(c);
  const g = rep.game;
  const me = g.players.findIndex((p) => p.id === 'me');
  const mates = c.combos.map((cb) => g.players.findIndex((p) => p.id === cb.mate));
  combos += g.events.filter((e) => e.combo).length;
  pairMade += g.events.filter((e) => e.type === 'made' && ((e.player === me && mates.includes(e.other)) || (mates.includes(e.player) && e.other === me))).length;
  const box = boxScore(g);
  if (process.env.V) console.log(games, [me, ...mates].map((i) => `${g.players[i]?.name} ${((box.players[i]?.sec ?? 0) / 60).toFixed(0)}분`).join(' / '));
  games++;
  c.pendingGame = null;
  c.gameQueue = [];
}
console.log({ games, combos, pairMade, combo: c.combos });
