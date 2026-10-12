// 테스트용 세이브 만들기: 자동으로 N주 진행해서 세이브 파일로 저장
// npx tsx tools/make-save.ts <주 수> <출력.json> [시드]
import { writeFileSync } from 'node:fs';
import { costOf, createCareer, invest, POINT_OF } from '../src/career/career';
import { resolveEvent } from '../src/career/events';
import { applyMatch, playMatch } from '../src/career/match';
import { contractOffers, signContract } from '../src/career/pro';
import { exportCareer } from '../src/career/save';
import { afterGame, playWeek } from '../src/career/turn';
import { lookFor, overall } from '../src/data/player';
import { RATING_KEYS } from '../src/data/ratings';

const [weeks, out, seed] = [Number(process.argv[2] ?? 143), process.argv[3] ?? 'save.json', Number(process.argv[4] ?? 3)];
const c = createCareer({ name: '자동선수', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 2, build: 'normal', look: { ...lookFor('auto'), hair: 3 }, alloc: { three: 20, speed: 20, ballHandling: 20, midRange: 20, perimeterD: 20 }, school: 'HANB' }, seed);
for (let w = 0; w < weeks; w++) {
  const id = c.injury ? 'rehab' : c.fatigue > 62 ? 'rest' : (['team', 'solo', 'weight', 'team', 'video'] as const)[w % 5];
  playWeek(c, id as never, 'shoot');
  if (c.pendingEvent) resolveEvent(c, c.pendingEvent, 0);
  while (c.pendingGame) {
    applyMatch(c, playMatch(c));
    afterGame(c);
  }
  if (c.draft && w < weeks - 1) c.draft = null;
  if (c.contractPending) {
    const o = contractOffers(c);
    signContract(c, process.argv.includes('abroad') && o.abroad[0] ? o.abroad[0] : o.mine);
  }
  c.retirePending = null;
  if (c.allStar) c.allStar.unseen = false;
  for (let g = 0; g < 200; g++) {
    let best: (typeof RATING_KEYS)[number] | null = null;
    let bv = 0;
    for (const k of RATING_KEYS) {
      if (costOf(c.me.r[k], c.potential) > c.points[POINT_OF[k]]) continue;
      const b = overall(c.me, c.prefPos);
      c.me.r[k]++;
      const v = (overall(c.me, c.prefPos) - b) / costOf(c.me.r[k] - 1, c.potential) + 0.001;
      c.me.r[k]--;
      if (v > bv) {
        bv = v;
        best = k;
      }
    }
    if (!best) break;
    invest(c, { [best]: 1 });
  }
}
writeFileSync(out, exportCareer(c));
console.log('week', c.week, 'pro', !!c.pro, 'ovr', overall(c.me, c.prefPos).toFixed(1), 'overseas', c.overseas, c.pro?.team);
