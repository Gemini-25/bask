// 자동 진행: 개발자 패널의 날짜 점프와 밸런스 도구가 같이 쓴다.
// 경기는 결과만 보고, 이벤트는 첫 선택지, 드래프트·시상·올스타 화면은 건너뛴다.
import { overall } from '../data/player';
import { RATING_KEYS, type RatingKey } from '../data/ratings';
import { actionById, canDo, costOf, dateOf, FOCUS, invest, mentorReady, POINT_OF, type ActionId, type Career, type FocusId } from './career';
import { buy, has, itemDef } from './money';
import { collegeOffers, declareDraft, enterCollege, stayInCollege } from './college';
import { eventById, fill, resolveEvent } from './events';
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

// ───────────── 일정 건너뛰기 (M24) ─────────────

/** 건너뛰는 동안 훈련: 알아서 (피로·컨디션 관리하며 고르게, 돈은 안 쓴다) 또는 고른 훈련 반복 */
export type SkipRoutine = 'auto' | { repeat: ActionId; focus?: FocusId };

export interface SkipOpts {
  /** 몇 주, 다음 경기 전까지, 시즌 끝까지 */
  span: number | 'game' | 'season';
  routine: SkipRoutine;
  /** 경기 앞에서 멈출지: 모든 경기, 큰 경기 (결승·플레이오프·올스타·국가대표)만, 안 멈춤 (결과만) */
  stopGames: 'all' | 'big' | 'none';
  /** 이벤트에서 멈춰 직접 고른다 (아니면 첫 선택지) */
  stopEvents: boolean;
  /** 포인트 자동 투자 */
  invest: boolean;
}

export type SkipStop = 'game' | 'event' | 'draft' | 'path' | 'contract' | 'allstar' | 'season' | 'retire' | 'camp' | 'position' | 'injury';
export const SKIP_STOP_LABEL: Record<SkipStop, string> = {
  game: '경기가 남아 있다',
  event: '이벤트가 생겼다',
  draft: '드래프트',
  path: '진로를 정할 때',
  contract: '계약할 때',
  allstar: '올스타 위크엔드',
  season: '시즌이 끝났다',
  retire: '은퇴 고민',
  camp: '전지훈련을 고를 때',
  position: '감독의 포지션 제안',
  injury: '부상',
};

export interface SkipGame {
  label: string;
  opponent: string;
  won: boolean;
  score: [number, number];
  pts: number;
  reb: number;
  ast: number;
  played: boolean;
}

export interface SkipResult {
  weeks: number;
  from: number;
  to: number;
  games: SkipGame[];
  notes: string[];
  stopped: SkipStop | null;
  ovr: [number, number];
  ups: Partial<Record<RatingKey, number>>;
}

const BIG_GAME = /플레이오프|챔피언|결승|왕중왕|올스타/;
export function isBigGame(g: { label: string; special?: string } | null): boolean {
  return !!g && (!!g.special || BIG_GAME.test(g.label));
}

/** 건너뛰는 동안 이번 주 행동 */
export function skipAction(c: Career, routine: SkipRoutine): { id: ActionId; focus?: FocusId } {
  if (c.injury) return { id: 'rehab' };
  // 고른 훈련을 못 하는 주 (돈이 모자라거나 은사를 이미 만났거나)엔 알아서
  if (routine !== 'auto' && canDo(c, actionById(routine.repeat))) return c.fatigue > 62 ? { id: 'rest' } : { id: routine.repeat, focus: routine.focus };
  if (c.fatigue > 50) return { id: 'rest' };
  if (c.condition <= 1) return { id: 'friends' };
  const focus = bestFocus(c);
  if (mentorReady(c)) return { id: 'mentor', focus };
  if (c.trust < 55) return { id: 'team' };
  return c.week % 3 === 2 ? { id: 'team' } : { id: 'solo', focus };
}

/**
 * 정한 만큼 주를 넘긴다. 사람이 봐야 할 화면이 생기면 그 앞에서 멈춘다 (그 화면은 남겨 둔다).
 * 화면이 멈추지 않게 한 주씩 (step) 돌릴 수 있다
 */
export class SkipRun {
  readonly res: SkipResult;
  finished = false;
  /** 다음 step: 새 주를 보낸다, 또는 이벤트 뒤 이 주 남은 일 */
  private stage: 'week' | 'rest' = 'week';
  private readonly limit: number;
  private readonly yearBefore: number;
  private readonly r0: Record<RatingKey, number>;

  constructor(
    private readonly c: Career,
    private readonly o: SkipOpts,
    maxWeeks = 60,
  ) {
    const ovr0 = overall(c.me, c.prefPos);
    this.res = { weeks: 0, from: c.week, to: c.week, games: [], notes: [], stopped: null, ovr: [ovr0, ovr0], ups: {} };
    this.limit = typeof o.span === 'number' ? o.span : maxWeeks;
    this.yearBefore = dateOf(c.week).year;
    this.r0 = { ...c.me.r };
    // 시작할 때 남아 있는 것부터
    const first = this.pending() ?? (c.pendingEvent && o.stopEvents ? 'event' : null) ?? this.games();
    if (first) this.done(first);
  }

  /** 끝까지 돌린다 */
  run(): SkipResult {
    while (!this.finished) this.step();
    return this.res;
  }

  /** 이벤트를 사람이 고른 뒤 그 주 남은 일 (경기 등)부터 이어 간다 */
  resume() {
    if (!this.finished || this.res.stopped !== 'event' || this.c.pendingEvent) return;
    this.finished = false;
    this.res.stopped = null;
  }

  /** 한 주. 끝났으면 true */
  step(): boolean {
    if (this.finished) return true;
    const { c, o, res } = this;
    if (this.stage === 'week') {
      if (res.weeks >= this.limit) return this.done(null);
      const injuredBefore = !!c.injury;
      const a = skipAction(c, o.routine);
      const r = playWeek(c, a.id, a.focus);
      res.weeks++;
      res.notes.push(...r.notes);
      if (r.injured && !injuredBefore) res.notes.push(`부상: ${r.injured.name} (${r.injured.weeks}주)`);
      if (c.streetPending) res.notes.push(...applyStreet(c, runStreet(c)));
      if (c.pendingEvent) {
        if (o.stopEvents) {
          // 고르고 나면 (resume) 이 주 남은 일부터
          this.stage = 'rest';
          return this.done('event');
        }
        const def = eventById(c.pendingEvent.id);
        const ev = c.pendingEvent;
        const out = resolveEvent(c, ev, 0);
        if (def) res.notes.push(`이벤트 「${fill(c, def.title, ev.mate)}」 → ${fill(c, def.choices[0].label, ev.mate)}${out.length ? ` (${out.join(' · ')})` : ''}`);
        c.pendingEvent = null;
      }
    }
    this.stage = 'week';
    const p0 = this.pending();
    if (p0) return this.done(p0);
    if (o.span === 'game' && c.pendingGame) return this.done('game');
    const g = this.games();
    if (g) return this.done(g);
    const p1 = this.pending();
    if (p1) return this.done(p1);
    if (o.invest) autoInvest(c);
    if (o.span === 'season' && dateOf(c.week).year !== this.yearBefore) return this.done('season');
    if (res.weeks >= this.limit) return this.done(null);
    return false;
  }

  /** 사람이 중간에 멈춘다 */
  stopNow() {
    this.done(null);
  }

  private done(s: SkipStop | null): true {
    const { c, res } = this;
    this.finished = true;
    res.stopped = s;
    res.to = c.week;
    res.ovr[1] = overall(c.me, c.prefPos);
    res.ups = {};
    for (const k of RATING_KEYS) if (c.me.r[k] !== this.r0[k]) res.ups[k] = c.me.r[k] - this.r0[k];
    return true;
  }

  /** 사람이 봐야 할 화면 */
  private pending(): SkipStop | null {
    const c = this.c;
    if (c.retired) return 'retire';
    if (c.pathPending) return 'path';
    if (c.draft) return 'draft';
    if (c.ceremony) return 'season';
    if (c.retirePending && c.pro) return 'retire';
    if (c.contractPending && c.pro) return 'contract';
    if (c.allStar?.unseen) return 'allstar';
    if (c.campPending) return 'camp';
    if (c.posOffer) return 'position';
    return null;
  }

  /** 경기를 치른다 (멈출 경기면 멈춘다) */
  private games(): SkipStop | null {
    const { c, o, res } = this;
    while (c.pendingGame) {
      if (o.stopGames === 'all' || (o.stopGames === 'big' && isBigGame(c.pendingGame))) return 'game';
      const g = c.pendingGame;
      const m = playMatch(c);
      const rep = applyMatch(c, m);
      const notes = afterGame(c);
      res.games.push({ label: g.label, opponent: g.opponent, won: rep.won, score: rep.score, pts: rep.line?.pts ?? 0, reb: rep.line?.reb ?? 0, ast: rep.line?.ast ?? 0, played: !!rep.line && rep.line.sec > 0 });
      res.notes.push(...rep.abilityNotes, ...notes);
      if (rep.injured) res.notes.push(`부상: ${rep.injured.name} (${rep.injured.weeks}주)`);
      if (o.invest) autoInvest(c);
    }
    return null;
  }
}

export function skipWeeks(c: Career, o: SkipOpts, maxWeeks = 60): SkipResult {
  return new SkipRun(c, o, maxWeeks).run();
}
