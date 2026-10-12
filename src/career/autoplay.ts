// 자동 진행: 개발자 패널의 날짜 점프와 밸런스 도구가 같이 쓴다.
// 경기는 결과만 보고, 이벤트는 첫 선택지, 드래프트·시상·올스타 화면은 건너뛴다.
import { overall } from '../data/player';
import { RATING_KEYS, type RatingKey } from '../data/ratings';
import { costOf, dateOf, invest, POINT_OF, type ActionId, type Career, type FocusId } from './career';
import { resolveEvent } from './events';
import { applyMatch, playMatch } from './match';
import { contractOffers, signContract } from './pro';
import { afterGame, playWeek } from './turn';

export type AutoPolicy = 'simple' | { repeat: ActionId; focus?: FocusId };

const ROTATION: ActionId[] = ['team', 'solo', 'weight', 'team', 'video'];

/** 이번 주 행동 */
export function autoAction(c: Career, policy: AutoPolicy): { id: ActionId; focus?: FocusId } {
  if (c.injury) return { id: 'rehab' };
  if (c.fatigue > 62) return { id: 'rest' };
  if (policy === 'simple') return { id: ROTATION[c.week % ROTATION.length], focus: 'shoot' };
  return { id: policy.repeat, focus: policy.focus };
}

/** 포인트를 종합 능력치가 가장 많이 오르는 곳부터 쓴다 */
export function autoInvest(c: Career) {
  for (let g = 0; g < 300; g++) {
    let best: RatingKey | null = null;
    let bv = 0;
    for (const k of RATING_KEYS) {
      const cost = costOf(c.me.r[k], c.potential);
      if (cost > c.points[POINT_OF[k]]) continue;
      const b = overall(c.me, c.prefPos);
      c.me.r[k]++;
      const v = (overall(c.me, c.prefPos) - b) / cost + 0.001;
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

export type StopAt = 'none' | 'game' | 'draft' | 'allstar' | 'season' | 'contract' | 'retire' | 'national';

export interface AutoWeekResult {
  /** 멈춘 이유 (화면에서 보여줄 것이 남았다) */
  stopped: StopAt | null;
  notes: string[];
  games: number;
}

/**
 * 한 주 자동 진행. stop에 걸리는 일이 생기면 그 화면은 남겨 두고 멈춘다
 * (경기면 경기를 치르기 전에, 드래프트면 결과를 안 지운 채로).
 */
export function autoWeek(c: Career, policy: AutoPolicy, opts: { invest?: boolean; stop?: StopAt } = {}): AutoWeekResult {
  const stop = opts.stop ?? 'none';
  const yearBefore = dateOf(c.week).year;
  const a = autoAction(c, policy);
  const r = playWeek(c, a.id, a.focus);
  const notes = [...r.notes];
  if (c.pendingEvent) resolveEvent(c, c.pendingEvent, 0);
  c.pendingEvent = null;
  let games = 0;
  if (stop === 'game' && c.pendingGame) return { stopped: 'game', notes, games };
  if (stop === 'national' && c.pendingGame?.special === 'national') return { stopped: 'national', notes, games };
  if (stop === 'allstar' && c.allStar?.unseen) return { stopped: 'allstar', notes, games };
  while (c.pendingGame) {
    applyMatch(c, playMatch(c));
    games++;
    notes.push(...afterGame(c));
  }
  if (c.allStar?.unseen) c.allStar.unseen = false;
  if (c.draft) {
    if (stop === 'draft') return { stopped: 'draft', notes, games };
    c.draft = null;
  }
  if (c.ceremony) {
    if (stop === 'season') return { stopped: 'season', notes, games };
    c.ceremony = null;
  }
  if (stop === 'season' && dateOf(c.week).year !== yearBefore) return { stopped: 'season', notes, games };
  if (c.retirePending) {
    // 은퇴는 사람이 정한다
    return { stopped: 'retire', notes, games };
  }
  if (c.contractPending && c.pro) {
    if (stop === 'contract') return { stopped: 'contract', notes, games };
    signContract(c, contractOffers(c).mine);
  }
  if (opts.invest) autoInvest(c);
  return { stopped: null, notes, games };
}
