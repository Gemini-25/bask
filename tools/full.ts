// 4년 자동 플레이: 고교 3년 → 드래프트 → 프로 1시즌
import { createCareer, dateText, myOverall } from '../src/career/career';
import { resolveEvent } from '../src/career/events';
import { standings } from '../src/career/league';
import { applyMatch, playMatch } from '../src/career/match';
import { contractOffers, signContract, teamName } from '../src/career/pro';
import { afterGame, playWeek } from '../src/career/turn';
import { exportCareer, importCareer } from '../src/career/save';
import { lookFor } from '../src/data/player';
import { invest, costOf, POINT_OF } from '../src/career/career';
import { RATING_KEYS } from '../src/data/ratings';
import { overall } from '../src/data/player';

const c = createCareer({ name: '테스트', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('t'), alloc: {}, school: 'HANB' }, Number(process.argv[2] ?? 3));
const t0 = performance.now();
let games = 0;
for (let w = 0; w < 48 * 5; w++) {
  const id = c.injury ? 'rehab' : c.fatigue > 62 ? 'rest' : (['team', 'solo', 'weight', 'team', 'video'] as const)[w % 5];
  playWeek(c, id as never, 'shoot');
  if (c.pendingEvent) resolveEvent(c, c.pendingEvent, 0);
  while (c.pendingGame) {
    const m = playMatch(c);
    applyMatch(c, m);
    games++;
    const notes = afterGame(c);
    if (notes.length) console.log(dateText(c.week), notes.join(' | '));
  }
  if (c.draft) {
    console.log('DRAFT', c.draft.myNo, '순위', teamName(c.league!, c.draft.team), c.draft.salary, '만원');
    c.draft = null;
  }
  if (c.contractPending) {
    const o = contractOffers(c);
    console.log('계약 제안', o.mine.salary, o.others.map((x) => x.salary));
    signContract(c, o.mine);
  }
  // 자동 투자
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
  if (w % 48 === 47) console.log(dateText(c.week - 1), 'OVR', myOverall(c).toFixed(1), 'money', c.money, 'pop', c.popularity.toFixed(1), 'trust', c.trust.toFixed(0), c.pro ? `team ${c.pro.team}` : '');
}
console.log('games', games, 'ms', Math.round(performance.now() - t0));
if (c.league) {
  console.log(standings(c.league).map((r) => `${r.id} ${r.w}-${r.l}`).join(' | '));
  console.log('history', JSON.stringify(c.league.history));
  const pro = c.games.filter((g) => g.kind === 'official' && g.label.includes('정규'));
  const n = pro.filter((g) => g.line).length || 1;
  console.log('pro games', pro.length, 'avg pts', (pro.reduce((a, g) => a + (g.line?.pts ?? 0), 0) / n).toFixed(1), 'avg min', (pro.reduce((a, g) => a + (g.line?.sec ?? 0), 0) / n / 60).toFixed(1));
}
const size = exportCareer(c).length;
console.log('save size', (size / 1024).toFixed(0), 'KB', importCareer(exportCareer(c)).week === c.week);
