// 자동 진행: 개발자 패널의 날짜 점프와 밸런스 도구가 같이 쓴다.
// 경기는 결과만 보고, 이벤트는 첫 선택지, 드래프트·시상·올스타 화면은 건너뛴다.
import { overall } from '../data/player';
import { RATING_KEYS, type RatingKey } from '../data/ratings';
import { costOf, dateOf, FOCUS, invest, mentorReady, POINT_OF, type ActionId, type Career, type FocusId } from './career';
import { buy, has, itemDef } from './money';
import { collegeOffers, declareDraft, enterCollege, stayInCollege } from './college';
import { resolveEvent } from './events';
import { answerPosition, applyStreet, CAMPS, campCost, canCamp, runCamp, runStreet, type CampDef } from './extras';
import { applyMatch, playMatch } from './match';
import { contractOffers, signContract } from './pro';
import { afterGame, playWeek } from './turn';

/** simple: 대충 (훈련 돌려 쓰기), good: 잘 키우기 (은사·트레이너·피로 관리·장비) */
export type AutoPolicy = 'simple' | 'good' | { repeat: ActionId; focus?: FocusId };

const ROTATION: ActionId[] = ['team', 'solo', 'weight', 'team', 'video'];

/** 종합 능력치가 가장 많이 오르는 훈련 분야 */
export function bestFocus(c: Career): FocusId {
  let best: FocusId = 'shoot';
  let bv = -Infinity;
  const base = overall(c.me, c.prefPos);
  for (const f of FOCUS) {
    let v = 0;
    for (const k of f.keys) {
      if (c.me.r[k] >= 99) continue;
      c.me.r[k]++;
      v += overall(c.me, c.prefPos) - base;
      c.me.r[k]--;
    }
    v /= f.keys.length;
    if (v > bv) {
      bv = v;
      best = f.id;
    }
  }
  return best;
}

/** 이번 주 행동 */
export function autoAction(c: Career, policy: AutoPolicy): { id: ActionId; focus?: FocusId } {
  if (c.injury) return { id: 'rehab' };
  if (policy === 'good') return goodAction(c);
  if (c.fatigue > 62) return { id: 'rest' };
  if (policy === 'simple') return { id: ROTATION[c.week % ROTATION.length], focus: 'shoot' };
  return { id: policy.repeat, focus: policy.focus };
}

function goodAction(c: Career): { id: ActionId; focus?: FocusId } {
  // 지치기 전에 쉬어서 컨디션을 지킨다
  if (c.fatigue > 46) return { id: 'rest' };
  if (c.condition <= 1) return { id: 'friends' };
  const focus = bestFocus(c);
  if (mentorReady(c)) return { id: 'mentor', focus };
  // 은사를 만나러 공원에 간다
  if (!c.mentor.met && c.week % 3 === 0) return { id: 'street' };
  if (c.trust < 60 && !c.pro) return { id: 'team' };
  if (c.pro && (c.money ?? 0) >= 2500) return { id: 'trainer', focus };
  if (c.pro && c.trust < 55) return { id: 'team' };
  return c.week % 3 === 2 ? { id: 'team' } : { id: 'solo', focus };
}

/** 잘 키우기: 돈이 되면 장비와 집을 산다 (싸고 효과 큰 것부터) */
const SHOPPING = ['shoeLight', 'sleeve', 'bed', 'knee', 'yardHoop', 'compression', 'goggles', 'homeGym', 'theater', 'shoePro', 'aqua', 'cheerFlags', 'cheerBanner', 'cheerChant', 'cheerMascot', 'cheerLeaders', 'cheerJumbo'];
export function autoShop(c: Career) {
  if (!c.pro) return;
  for (const id of SHOPPING) {
    const it = itemDef(id);
    if (!it || has(c, id)) continue;
    // 트레이너 비용은 남겨 둔다
    if ((c.money ?? 0) - it.price < 2000) return;
    buy(c, id);
  }
}

/** 대충 투자: 싼 능력치부터 골고루 (한 분야를 노리지 않는다) */
export function spreadInvest(c: Career) {
  for (let g = 0; g < 300; g++) {
    let best: RatingKey | null = null;
    let bc = Infinity;
    for (const k of RATING_KEYS) {
      const cost = costOf(c.me.r[k], c.potential);
      if (cost > c.points[POINT_OF[k]]) continue;
      // 같은 값이면 낮은 능력치부터
      const v = cost + c.me.r[k] * 0.01;
      if (v < bc) {
        bc = v;
        best = k;
      }
    }
    if (!best) break;
    invest(c, { [best]: 1 });
  }
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
/** 전지훈련: 잘 키우기는 돈이 되면 해외 스킬캠프, 아니면 산·은사. 단순은 공짜만 */
export function autoCamp(c: Career, policy: AutoPolicy): CampDef['id'] | null {
  const order: CampDef['id'][] = policy === 'good' ? ['skill', 'mountain', 'mentor'] : ['mountain', 'mentor'];
  for (const id of order) {
    const d = CAMPS.find((x) => x.id === id)!;
    if (canCamp(c, d) && (policy === 'good' || campCost(c, d) === 0)) return id;
  }
  return null;
}

export function autoWeek(c: Career, policy: AutoPolicy, opts: { invest?: boolean; spread?: boolean; stop?: StopAt; path?: 'draft' | 'college' } = {}): AutoWeekResult {
  const stop = opts.stop ?? 'none';
  const yearBefore = dateOf(c.week).year;
  const a = autoAction(c, policy);
  const r = playWeek(c, a.id, a.focus);
  const notes = [...r.notes];
  if (c.pendingEvent) resolveEvent(c, c.pendingEvent, 0);
  c.pendingEvent = null;
  if (c.streetPending) notes.push(...applyStreet(c, runStreet(c)));
  if (c.campPending) notes.push(...runCamp(c, autoCamp(c, policy)));
  if (c.posOffer) notes.push(...answerPosition(c, true));
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
  // 진로: 기본은 드래프트, path가 college면 대학 4년
  if (c.pathPending) {
    if (stop === 'draft') return { stopped: 'draft', notes, games };
    if (c.pathPending === 'hs' && opts.path === 'college') notes.push(...enterCollege(c, collegeOffers(c)[0].id));
    else if (c.pathPending === 'college' && opts.path === 'college') stayInCollege(c);
    else declareDraft(c);
  }
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
  if (opts.invest) {
    if (opts.spread) spreadInvest(c);
    else autoInvest(c);
  }
  if (policy === 'good') autoShop(c);
  return { stopped: null, notes, games };
}
