// M13: 포지션 전향, 전지훈련 (L8), 훈련 미니게임 배율 (T4), 3x3 길거리 대회 (L8)
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { generatePlayer, overall, POSITIONS, POSITION_LABEL, type Player, type Position } from '../data/player';
import { RATING_LABEL, type RatingKey } from '../data/ratings';
import { addXp, dateOf, FOCUS, teammates, trustStep, type Career, type FocusId } from './career';
import { gainPopularity } from './fans';
import { bestFocus } from './autoplay';

// ───────────── 포지션 전향 ─────────────

const POS_FOCUS: Record<Position, FocusId> = { PG: 'pass', SG: 'shoot', SF: 'drive', PF: 'post', C: 'post' };

/** 다른 포지션이 확실히 더 맞으면 감독이 전향을 권한다 (반년에 한 번까지) */
export function checkPosition(c: Career) {
  if (c.posOffer || c.pathPending || c.week - (c.lastPosOffer ?? -99) < 24 || c.week < 20) return;
  const now = overall(c.me, c.prefPos);
  let best = c.prefPos;
  let bv = now;
  for (const p of POSITIONS) {
    const v = overall(c.me, p);
    if (v > bv) {
      bv = v;
      best = p;
    }
  }
  if (best !== c.prefPos && bv - now >= 2.5) {
    c.posOffer = best;
    c.lastPosOffer = c.week;
  }
}

export function answerPosition(c: Career, yes: boolean): string[] {
  const to = c.posOffer;
  c.posOffer = null;
  if (!to) return [];
  if (!yes) {
    c.trust = clamp(c.trust - 1, 0, 100);
    return [`${POSITION_LABEL[c.prefPos]} 자리를 지키기로 했다. 감독님은 아쉬운 눈치다.`];
  }
  const from = c.prefPos;
  c.prefPos = to;
  c.me.pos = to;
  c.posChanges = (c.posChanges ?? 0) + 1;
  c.trust = clamp(c.trust + trustStep(c.trust, 3), 0, 100);
  const ups: Partial<Record<RatingKey, number>> = {};
  const f = FOCUS.find((x) => x.id === POS_FOCUS[to])!;
  for (const k of f.keys) addXp(c, k, 0.4, ups);
  return [`${POSITION_LABEL[from]}에서 ${POSITION_LABEL[to]}(으)로 전향했다! 적응 훈련으로 ${f.label} 경험치가 올랐다.`, ...Object.entries(ups).map(([k, n]) => `${RATING_LABEL[k as RatingKey]} +${n}`)];
}

// ───────────── 전지훈련 ─────────────

export interface CampDef {
  id: 'mountain' | 'skill' | 'mentor';
  label: string;
  desc: string;
  /** 만원 (고교·대학 / 프로) */
  cost: [number, number];
}

export const CAMPS: CampDef[] = [
  { id: 'mountain', label: '산악 전지훈련', desc: '산을 달리고 계단을 오른다. 피지컬 포인트와 지구력·근력·점프력', cost: [0, 500] },
  { id: 'skill', label: '해외 스킬캠프', desc: '유명 코치에게 기술을 배운다. 기술 포인트와 가장 필요한 분야 경험치', cost: [300, 3000] },
  { id: 'mentor', label: '은사와 합숙', desc: '은사와 2주를 함께 지낸다. 정신 포인트와 고른 분야 경험치 (은사를 만났으면)', cost: [0, 0] },
];

/** 비시즌 한 번: 고교·대학은 1월, 프로는 5월 (프리시즌 전) */
export function campDue(c: Career, week: number): boolean {
  const w = week % 48;
  const y = dateOf(week).year;
  return (c.pro ? w === 8 : w === 40) && c.campYear !== y && !c.injury;
}

export function campCost(c: Career, d: CampDef) {
  return d.cost[c.pro ? 1 : 0];
}

export function canCamp(c: Career, d: CampDef) {
  if (d.id === 'mentor' && !c.mentor.met) return false;
  return (c.money ?? 0) >= campCost(c, d);
}

export function runCamp(c: Career, id: CampDef['id'] | null): string[] {
  c.campPending = false;
  c.campYear = dateOf(c.week - 1).year;
  if (!id) return ['이번 비시즌은 전지훈련 없이 쉰다.'];
  const d = CAMPS.find((x) => x.id === id)!;
  if (!canCamp(c, d)) return ['전지훈련에 갈 수 없었다.'];
  c.money = (c.money ?? 0) - campCost(c, d);
  c.fatigue = clamp(c.fatigue + 18, 0, 100);
  const ups: Partial<Record<RatingKey, number>> = {};
  const notes: string[] = [];
  if (id === 'mountain') {
    c.points.P += 16;
    addXp(c, 'stamina', 1.2, ups);
    addXp(c, 'strength', 0.8, ups);
    addXp(c, 'jump', 0.6, ups);
    notes.push('산악 전지훈련 완주! 피지컬 포인트 +16');
  } else if (id === 'skill') {
    c.points.T += 20;
    const f = FOCUS.find((x) => x.id === bestFocus(c))!;
    for (const k of f.keys) addXp(c, k, 2 / f.keys.length, ups);
    notes.push(`해외 스킬캠프 수료! 기술 포인트 +20, ${f.label} 집중 지도`);
  } else {
    c.points.M += 14;
    c.points.T += 6;
    const f = FOCUS.find((x) => x.id === bestFocus(c))!;
    for (const k of f.keys) addXp(c, k, 1.5 / f.keys.length, ups);
    notes.push(`${c.mentor.name} 선생님과 합숙! 정신 포인트 +14, 기술 포인트 +6`);
  }
  for (const [k, n] of Object.entries(ups)) notes.push(`${RATING_LABEL[k as RatingKey]} +${n}`);
  return notes;
}

// ───────────── 훈련 미니게임 (T4) ─────────────

export type MiniKind = 'shoot' | 'drive' | 'weight';

/** 이 행동에 미니게임이 있나 (설정에서 끌 수 있다) */
export function miniFor(c: Career, id: string, focus?: string): MiniKind | null {
  if (c.settings?.minigame === false || c.injury) return null;
  if (id === 'weight') return 'weight';
  if (id === 'solo' && focus === 'shoot') return 'shoot';
  if (id === 'solo' && focus === 'drive') return 'drive';
  return null;
}

/** 점수 0~1 → 포인트 배율 0.8~1.3 */
export const miniMult = (score: number) => Math.round((0.8 + 0.5 * Math.max(0, Math.min(1, score))) * 100) / 100;

// ───────────── 3x3 길거리 대회 ─────────────

export interface StreetGame {
  opp: string;
  score: [number, number];
  myPts: number;
  /** 한 점씩 쌓인 흐름 (우리 0, 상대 1) */
  log: number[];
}

export interface StreetResult {
  team: string[];
  games: StreetGame[];
  finish: string;
  prize: number;
}

const CREWS = ['공원 터줏대감', '철조망 크루', '새벽 농구회', '골목 왕자들', '한강 러너스', '체육관 지기', '옥상 슈터즈', '야간 경비대'];

function streetPlayer(rng: Rng, level: number): Player {
  const pos = rng.pick(POSITIONS);
  return generatePlayer(rng, pos, level + rng.normal(0, 3), rng.int(0, 99));
}

/** 한 경기: 21점 먼저 (또는 공격 30번씩). 안쪽 1점, 밖 2점 (3x3 규칙) */
function streetGame(rng: Rng, us: Player[], them: Player[], meIdx: number): StreetGame & { won: boolean } {
  const off = (ps: Player[]) => ps.map((p) => (p.r.layup + p.r.dunk + p.r.ballHandling) / 3);
  const out = (ps: Player[]) => ps.map((p) => (p.r.three + p.r.midRange) / 2);
  const def = (ps: Player[]) => ps.reduce((s, p) => s + (p.r.perimeterD + p.r.helpD + p.r.steal) / 3, 0) / ps.length;
  const sc: [number, number] = [0, 0];
  let myPts = 0;
  const log: number[] = [];
  for (let poss = 0; poss < 60 && sc[0] < 21 && sc[1] < 21; poss++) {
    const side = poss % 2;
    const atk = side === 0 ? us : them;
    const dv = def(side === 0 ? them : us);
    const io = off(atk);
    const oo = out(atk);
    // 공 잡는 선수: 잘하는 선수가 더 자주
    const w = atk.map((_, i) => io[i] + oo[i] + (side === 0 && i === meIdx ? 15 : 0));
    const i = rng.weighted(w);
    const outside = rng.chance(clamp(0.25 + (oo[i] - io[i]) * 0.01, 0.1, 0.6));
    const base = outside ? 0.3 + (oo[i] - 50) * 0.006 : 0.48 + (io[i] - 50) * 0.006;
    const p = clamp(base - (dv - 50) * 0.004, 0.12, 0.8);
    if (rng.chance(p)) {
      const pts = outside ? 2 : 1;
      sc[side] += pts;
      for (let k = 0; k < pts; k++) log.push(side);
      if (side === 0 && i === meIdx) myPts += pts;
    }
  }
  if (sc[0] === sc[1]) {
    const side = rng.chance(0.5) ? 0 : 1;
    sc[side]++;
    log.push(side);
  }
  return { opp: '', score: [Math.min(21, sc[0]), Math.min(21, sc[1])], myPts, log, won: sc[0] > sc[1] };
}

/** 8팀 토너먼트 (3경기). 우리 팀은 나 + 친한 팀원 둘 */
export function runStreet(c: Career): StreetResult {
  const rng = Rng.fromState(c.rng);
  const mates = teammates(c)
    .map((e) => e.player)
    .sort((a, b) => (c.friends[b.id] ?? 0) - (c.friends[a.id] ?? 0))
    .slice(0, 2);
  const us = [c.me, ...mates];
  const level = c.pro ? -3 : c.college ? -8 : -13;
  const crews = [...CREWS].sort(() => rng.next() - 0.5).slice(0, 3);
  const games: StreetGame[] = [];
  let finish = '우승';
  for (const [r, crew] of crews.entries()) {
    const them = [0, 1, 2].map(() => streetPlayer(rng, level + r * 1.5));
    const g = streetGame(rng, us, them, 0);
    games.push({ ...g, opp: crew });
    if (!g.won) {
      finish = ['1회전 탈락', '4강', '준우승'][r];
      break;
    }
  }
  const prize = finish === '우승' ? (c.pro ? 1000 : c.college ? 100 : 50) : 0;
  c.rng = rng.state;
  return { team: us.map((p) => p.name), games, finish, prize };
}

/** 대회 결과를 커리어에 */
export function applyStreet(c: Career, r: StreetResult): string[] {
  c.streetPending = false;
  const ups: Partial<Record<RatingKey, number>> = {};
  addXp(c, 'ballHandling', 0.3, ups);
  addXp(c, 'competitive', 0.2, ups);
  c.fatigue = clamp(c.fatigue + 8, 0, 100);
  const notes = [`3x3 길거리 대회 ${r.finish}!`];
  if (r.finish === '우승') {
    c.money = (c.money ?? 0) + r.prize;
    gainPopularity(c, 3);
    const y = dateOf(c.week - 1).year;
    // '우승'이라고 쓰면 학교 대회 우승으로 셈해져서 '챔피언'
    c.trophies.push(`3x3 길거리 대회 챔피언 (${c.pro ? `프로 ${y - (c.proFromYear ?? 3) + 1}년차` : c.college ? `대학 ${c.college.year}학년` : `고교 ${y + 1}학년`})`);
    notes.push(`상금 ${r.prize}만 원`);
  }
  for (const [k, n] of Object.entries(ups)) notes.push(`${RATING_LABEL[k as RatingKey]} +${n}`);
  return notes;
}
