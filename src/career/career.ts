// 커리어 상태와 육성 규칙 (M4). 화면 없이 돌아가서 테스트·자동 플레이로 확인한다.
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import type { Gender } from '../data/names';
import { baseRatings, HEIGHT, overall, type Look, type Player, type Position } from '../data/player';
import { RATING_GROUPS, RATING_KEYS, RATING_LABEL, type RatingKey, type Ratings } from '../data/ratings';
import { ACT } from '../sim/types';
import { backgroundById, GROWTH_TYPES, type BackgroundId, type GrowthType } from './backgrounds';
import { generateSchoolRoster, hsHeightAdj, schoolById, type RosterEntry } from './schools';
import { coachName, createMentor, createRival, type Mentor, type Rival } from './people';
import { emptyStats, startAbilities, type CareerStats } from './abilities';
import type { PendingEvent } from './events';
import type { Season } from './season';

export const SAVE_VERSION = 2;
export const WEEKS_PER_YEAR = 48;
export const MAX_RATING = 99;
/** 선수 만들 때 자유 포인트로 올릴 수 있는 최대치 */
export const CREATE_CAP = 60;
/** 고1 신입생 출발점 (프로 평균 = 0) */
const FRESHMAN_Q = -24;

// ───────────── 포인트 ─────────────

export type PointKind = 'P' | 'T' | 'M';
export type Points = Record<PointKind, number>;
export const POINT_LABEL: Record<PointKind, string> = { P: '피지컬', T: '기술', M: '정신' };

/** 능력치 → 어느 포인트로 올리나 (피지컬 / 공격·수비 = 기술 / 정신) */
export const POINT_OF = {} as Record<RatingKey, PointKind>;
for (const g of RATING_GROUPS) for (const [k] of g.items) POINT_OF[k] = g.key === 'physical' ? 'P' : g.key === 'mental' ? 'M' : 'T';

/** 능력치 v를 v+1로 올리는 비용. 잠재력을 넘으면 비싸진다 (소프트 캡, T6) */
export function costOf(v: number, potential: number): number {
  if (v >= MAX_RATING) return Infinity;
  let c = 2 + Math.floor(Math.max(0, v - 20) / 7);
  if (v >= potential) c *= 2;
  if (v >= potential + 8) c = Math.ceil(c * 1.5);
  return c;
}

// ───────────── 상태 ─────────────

export const CONDITION_LABEL = ['최악', '나쁨', '보통', '좋음', '최고'];
/** 컨디션별 훈련 효율 */
export const CONDITION_MULT = [0.6, 0.8, 1, 1.15, 1.3];
/** 컨디션별 경기 중 능력치 보정 */
export const CONDITION_GAME = [-5, -2, 0, 2, 4];

export interface Injury {
  name: string;
  weeks: number;
  total: number;
}

export interface GameLine {
  sec: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
}

export interface PendingGame {
  kind: 'practice' | 'official';
  opponent: string;
  /** 공식전이면 대회 id */
  tour?: string;
  /** '춘계 연맹전 4강' 같은 이름 */
  label: string;
  home: boolean;
}

export interface GameRecord {
  week: number;
  kind: 'practice' | 'official';
  label: string;
  opponent: string;
  home: boolean;
  score: [number, number];
  won: boolean;
  seed: number;
  /** 결장했으면 null */
  line: GameLine | null;
  grade: string;
  started: boolean;
}

export interface WeekLog {
  week: number;
  action: ActionId;
  focus?: FocusId;
  gained: Points;
  notes: string[];
}

export interface Career {
  v: number;
  seed: number;
  rng: number;
  savedAt: number;
  me: Player;
  gender: Gender;
  background: BackgroundId;
  growth: GrowthType;
  potential: number;
  prefPos: Position;
  finalHeight: number;
  /** 0부터 센 주 (0 = 1학년 3월 1주) */
  week: number;
  fatigue: number;
  condition: number;
  injury: Injury | null;
  points: Points;
  /** 실전·개인 훈련으로 쌓인 능력치 경험치 (1이 차면 +1) */
  xp: Partial<Record<RatingKey, number>>;
  school: string;
  roster: RosterEntry[];
  log: WeekLog[];
  games: GameRecord[];
  /** 이번 주가 끝나고 치를 경기 */
  pendingGame: PendingGame | null;
  /** 올해 대회 일정 (고교 3년 동안) */
  season: Season | null;
  /** 감독 신뢰도 0~100 (R2). 공식전 출전 순서와 교체에 반영 */
  trust: number;
  /** 팀원 친밀도 0~100 (R1), 선수 id → 값 */
  friends: Record<string, number>;
  coach: string;
  rival: Rival | null;
  mentor: Mentor;
  /** 이벤트 id → 마지막으로 일어난 주 */
  seenEvents: Record<string, number>;
  /** 아직 고르지 않은 이벤트 */
  pendingEvent: PendingEvent | null;
  /** 커리어 통산 기록 (특수능력 조건) */
  stats: CareerStats;
  counts: Partial<Record<ActionId, number>>;
}

// ───────────── 달력 ─────────────

export function dateOf(week: number) {
  const year = Math.floor(week / WEEKS_PER_YEAR);
  const w = week % WEEKS_PER_YEAR;
  const month = ((2 + Math.floor(w / 4)) % 12) + 1;
  return { year, grade: year + 1, month, wk: (w % 4) + 1 };
}

export function dateText(week: number): string {
  const d = dateOf(week);
  return `${d.grade}학년 ${d.month}월 ${d.wk}주`;
}


// ───────────── 선수 만들기 ─────────────

export type Build = 'slim' | 'normal' | 'solid';
export const BUILD_LABEL: Record<Build, string> = { slim: '마른 체형', normal: '보통 체형', solid: '탄탄한 체형' };

export interface CreateSpec {
  name: string;
  number: number;
  gender: Gender;
  prefPos: Position;
  background: BackgroundId;
  growth: GrowthType;
  /** 기본 키에서 몇 cm 더하거나 뺄지 (-8 ~ +8) */
  heightDelta: number;
  build: Build;
  look: Look;
  /** 자유 포인트 배분 */
  alloc: Partial<Record<RatingKey, number>>;
  school: string;
}

export const HEIGHT_RANGE = 8;

export function baseHeight(pos: Position, gender: Gender, bg: BackgroundId) {
  return HEIGHT[pos][0] + hsHeightAdj(gender) - 3 + backgroundById(bg).height;
}

/** 자유 포인트를 쓰기 전 시작 능력치와 몸 */
export function creationBase(spec: Omit<CreateSpec, 'alloc' | 'name' | 'number' | 'look' | 'school'>) {
  const bg = backgroundById(spec.background);
  const r = baseRatings(spec.prefPos, FRESHMAN_Q + bg.all);
  if (bg.id === 'genius') for (const k of RATING_KEYS) r[k] = MAX_RATING;
  else {
    for (const g of RATING_GROUPS) {
      const gm = bg.mods[g.key] ?? 0;
      for (const [k] of g.items) r[k] += gm + (bg.mods[k] ?? 0);
    }
    // 키가 크면 느리고, 작으면 빠르다
    const d = Math.round(spec.heightDelta / 2);
    for (const k of ['speed', 'accel', 'agility'] as const) r[k] -= d;
    for (const k of ['block', 'defReb', 'postD'] as const) r[k] += d;
    if (spec.build === 'slim') {
      r.speed += 2;
      r.agility += 2;
      r.strength -= 4;
    } else if (spec.build === 'solid') {
      r.strength += 5;
      r.speed -= 2;
      r.agility -= 2;
    }
    for (const k of RATING_KEYS) r[k] = clamp(r[k], 15, CREATE_CAP);
  }
  const heightCm = baseHeight(spec.prefPos, spec.gender, spec.background) + clamp(Math.round(spec.heightDelta), -HEIGHT_RANGE, HEIGHT_RANGE);
  const wingspanCm = heightCm + 4;
  const weightKg = Math.round((heightCm - 100) * 0.85 + (spec.build === 'slim' ? -6 : spec.build === 'solid' ? 8 : 0) + (spec.gender === 'F' ? -4 : 0));
  return { r, body: { heightCm, wingspanCm, weightKg }, bg };
}

/** 자유 포인트를 쓴 결과. 넘치거나 상한을 넘는 배분은 잘라낸다 */
export function applyAlloc(base: Ratings, alloc: Partial<Record<RatingKey, number>>, free: number): { r: Ratings; used: number } {
  const r = { ...base };
  let used = 0;
  for (const k of RATING_KEYS) {
    const want = Math.max(0, Math.floor(alloc[k] ?? 0));
    const room = Math.max(0, CREATE_CAP - r[k]);
    const add = Math.min(want, room, free - used);
    r[k] += add;
    used += add;
  }
  return { r, used };
}

export function createCareer(spec: CreateSpec, seed: number): Career {
  const rng = new Rng(seed);
  const { r: base, body, bg } = creationBase(spec);
  const { r } = applyAlloc(base, spec.alloc, bg.freePoints);
  const me: Player = { id: 'me', name: spec.name.trim() || '이름없음', number: spec.number, pos: spec.prefPos, body, r, look: spec.look, abilities: startAbilities(spec.background) };
  const finalHeight = Math.max(body.heightCm, Math.round(body.heightCm + bg.growth + rng.normal(0, 2)));
  const school = schoolById(spec.school);
  const roster = generateSchoolRoster(rng.fork(7), school, spec.gender, [spec.number]);
  const c: Career = {
    v: SAVE_VERSION,
    seed,
    rng: rng.state,
    savedAt: Date.now(),
    me,
    gender: spec.gender,
    background: spec.background,
    growth: spec.growth,
    potential: bg.potential,
    prefPos: spec.prefPos,
    finalHeight,
    week: 0,
    fatigue: 10,
    condition: 2,
    injury: null,
    points: { P: 0, T: 0, M: 0 },
    xp: {},
    school: school.id,
    roster,
    log: [],
    games: [],
    pendingGame: null,
    season: null,
    trust: 40,
    friends: Object.fromEntries(roster.map((e) => [e.player.id, e.grade === 1 ? 35 : 20])),
    coach: coachName(seed),
    rival: null,
    mentor: createMentor(rng.fork(13)),
    seenEvents: {},
    pendingEvent: null,
    stats: emptyStats(),
    counts: {},
  };
  c.rival = createRival(c, rng.fork(11));
  c.rng = rng.state;
  return c;
}

/** 예상 최종 키는 ±2cm로 보여준다 (S7: 숨기는 건 없지만 정확히는 모른다) */
export function heightForecast(c: Career): [number, number] {
  return [Math.max(c.me.body.heightCm, c.finalHeight - 2), c.finalHeight + 2];
}

export function myOverall(c: Career, pos: Position = c.prefPos) {
  return overall(c.me, pos);
}

// ───────────── 주간 행동 (T2) ─────────────

export type ActionId = 'team' | 'solo' | 'mentor' | 'weight' | 'video' | 'street' | 'friends' | 'rest' | 'rehab';
export type FocusId = 'shoot' | 'drive' | 'post' | 'defense' | 'pass';

export interface ActionDef {
  id: ActionId;
  label: string;
  desc: string;
  pts: Points;
  /** 피로 변화 (자연 회복 전) */
  fatigue: number;
  /** 컨디션이 오를 가능성 (+면 오르기 쉽다) */
  mood: number;
  /** 다쳤을 때도 할 수 있나 */
  injuredOk: boolean;
  /** 다쳤을 때만 */
  injuredOnly?: boolean;
  /** 훈련 장면에서 보여줄 동작 */
  pose: number;
  /** 감독 신뢰도 변화 */
  trust: number;
}

export const ACTIONS: ActionDef[] = [
  { id: 'team', label: '팀 훈련', desc: '감독님 지도 아래 팀 전술 훈련. 골고루 오르고, 감독 신뢰와 팀원 친밀도가 오른다', pts: { P: 2, T: 5, M: 2 }, fatigue: 13, mood: 0, injuredOk: false, pose: ACT.DRIBBLE, trust: 1 },
  { id: 'solo', label: '개인 훈련', desc: '분야 하나를 집중 훈련. 기술 포인트 + 그 분야 경험치', pts: { P: 1, T: 7, M: 1 }, fatigue: 15, mood: -0.1, injuredOk: false, pose: ACT.SHOOT, trust: 0.3 },
  { id: 'mentor', label: '은사 특훈', desc: '전설에게 받는 특별 훈련. 고른 분야 경험치가 크게 오른다. 한 달에 한 번', pts: { P: 2, T: 9, M: 3 }, fatigue: 18, mood: 0, injuredOk: false, pose: ACT.SHOOT, trust: 0.3 },
  { id: 'weight', label: '웨이트', desc: '근력·점프·지구력을 키운다. 많이 지친다', pts: { P: 8, T: 0, M: 1 }, fatigue: 17, mood: -0.1, injuredOk: false, pose: ACT.STANCE, trust: 0.3 },
  { id: 'video', label: '영상 분석', desc: '프로 경기와 내 경기를 돌려 본다. 정신 포인트, 덜 지친다', pts: { P: 0, T: 1, M: 6 }, fatigue: -2, mood: 0, injuredOk: true, pose: ACT.IDLE, trust: 0.5 },
  { id: 'street', label: '길거리 3x3', desc: '공원 코트 내기 농구. 가끔 고수를 만난다. 감독님은 별로 안 좋아한다', pts: { P: 2, T: 4, M: 2 }, fatigue: 11, mood: 0.25, injuredOk: false, pose: ACT.DRIBBLE, trust: -0.4 },
  { id: 'friends', label: '친구와 놀기', desc: '팀원들과 논다. 피로가 풀리고 기분과 친밀도가 오른다', pts: { P: 0, T: 0, M: 2 }, fatigue: -12, mood: 0.7, injuredOk: true, pose: ACT.CELEBRATE, trust: 0 },
  { id: 'rest', label: '휴식', desc: '푹 쉰다. 피로가 많이 풀린다', pts: { P: 0, T: 0, M: 0 }, fatigue: -26, mood: 0.45, injuredOk: true, pose: ACT.IDLE, trust: 0 },
  { id: 'rehab', label: '재활', desc: '부상 회복이 두 배 빨라진다', pts: { P: 1, T: 0, M: 1 }, fatigue: -16, mood: 0.1, injuredOk: true, injuredOnly: true, pose: ACT.STANCE, trust: 0.2 },
];

/** 은사 특훈은 만난 뒤 4주에 한 번 */
export function mentorReady(c: Career) {
  return c.mentor.met && c.week - c.mentor.last >= 4;
}

export function actionById(id: ActionId): ActionDef {
  return ACTIONS.find((a) => a.id === id)!;
}

export const FOCUS: { id: FocusId; label: string; keys: RatingKey[]; pose: number }[] = [
  { id: 'shoot', label: '슈팅', keys: ['three', 'midRange', 'freeThrow'], pose: ACT.SHOOT },
  { id: 'drive', label: '돌파', keys: ['ballHandling', 'layup', 'floater', 'dunk'], pose: ACT.DRIBBLE },
  { id: 'post', label: '골밑', keys: ['postUp', 'offReb', 'boxOut', 'layup'], pose: ACT.POST },
  { id: 'defense', label: '수비', keys: ['perimeterD', 'steal', 'helpD', 'postD'], pose: ACT.STANCE },
  { id: 'pass', label: '패스', keys: ['passing', 'vision', 'offBall'], pose: ACT.PASS },
];

const INJURIES: { name: string; weeks: [number, number]; w: number }[] = [
  { name: '발목 염좌', weeks: [1, 2], w: 40 },
  { name: '허벅지 근육 뭉침', weeks: [1, 2], w: 25 },
  { name: '손가락 탈구', weeks: [2, 3], w: 14 },
  { name: '무릎 인대 부분 손상', weeks: [4, 6], w: 12 },
  { name: '발등 피로골절', weeks: [8, 12], w: 6 },
  { name: '전방십자인대 파열', weeks: [20, 30], w: 2 },
];

export function growthMult(c: Career) {
  const t = GROWTH_TYPES.find((g) => g.id === c.growth)!;
  return t.mult[Math.min(t.mult.length - 1, dateOf(c.week).year)];
}

/** 이 행동을 하면 대략 얻는 포인트 (화면 미리보기용, 난수 없음) */
export function expectedPoints(c: Career, a: ActionDef): Points {
  const m = CONDITION_MULT[c.condition] * growthMult(c);
  return { P: Math.round(a.pts.P * m), T: Math.round(a.pts.T * m), M: Math.round(a.pts.M * m) };
}

/** 훈련으로 느는 피로. 지구력이 좋으면 덜 지친다 */
export function fatigueGain(c: Career, a: ActionDef) {
  if (a.fatigue <= 0) return a.fatigue;
  return a.fatigue * (1.15 - c.me.r.stamina / 250);
}

/** 이번 주 훈련으로 다칠 확률 */
export function injuryRisk(c: Career, a: ActionDef): number {
  if (a.fatigue <= 0) return 0;
  const f = clamp(c.fatigue + fatigueGain(c, a) * 0.5, 0, 100);
  const p = 0.004 + Math.max(0, f - 45) ** 2 * 0.00012;
  return clamp(p * (1.2 - c.me.r.recovery / 250) * (c.me.abilities?.glass ? 1.6 : 1), 0, 0.4);
}

export function canDo(c: Career, a: ActionDef): boolean {
  if (a.id === 'mentor' && !mentorReady(c)) return false;
  if (c.injury) return a.injuredOk;
  return !a.injuredOnly;
}

function stoch(rng: Rng, x: number) {
  const f = Math.floor(x);
  return f + (rng.chance(x - f) ? 1 : 0);
}

/** 능력치 경험치를 더하고, 1이 차면 능력치를 올린다. 오른 능력치 목록을 돌려준다 */
export function addXp(c: Career, k: RatingKey, amount: number, ups: Partial<Record<RatingKey, number>>) {
  if (c.me.r[k] >= MAX_RATING) return;
  // 잠재력을 넘으면 경험치도 반만 찬다
  const eff = c.me.r[k] >= c.potential ? amount * 0.5 : amount;
  let x = (c.xp[k] ?? 0) + eff;
  while (x >= 1 && c.me.r[k] < MAX_RATING) {
    x -= 1;
    c.me.r[k]++;
    ups[k] = (ups[k] ?? 0) + 1;
  }
  c.xp[k] = Math.round(x * 1000) / 1000;
}

export interface WeekResult {
  action: ActionDef;
  focus?: FocusId;
  gained: Points;
  ups: Partial<Record<RatingKey, number>>;
  /** 이번 주에 쌓인 경험치 (1 = 능력치 1) */
  xpGain: Partial<Record<RatingKey, number>>;
  fatigueBefore: number;
  fatigueAfter: number;
  conditionBefore: number;
  conditionAfter: number;
  injured: Injury | null;
  healed: boolean;
  grew: number;
  notes: string[];
  /** 이번 주 주말 경기 (turn.ts에서 채운다) */
  game: PendingGame | null;
  /** 이번 주 이벤트 */
  event: PendingEvent | null;
}

/** 한 주를 보낸다 */
export function doWeek(c: Career, id: ActionId, focus?: FocusId): WeekResult {
  const a = actionById(id);
  if (!canDo(c, a)) throw new Error(`지금은 할 수 없는 행동: ${a.label}`);
  const rng = Rng.fromState(c.rng);
  const notes: string[] = [];
  const ups: Partial<Record<RatingKey, number>> = {};
  const xpBefore = (k: RatingKey) => c.me.r[k] + (c.xp[k] ?? 0);
  const before = Object.fromEntries(RATING_KEYS.map((k) => [k, xpBefore(k)])) as Record<RatingKey, number>;
  const fatigueBefore = c.fatigue;
  const conditionBefore = c.condition;

  // 포인트
  const mult = CONDITION_MULT[c.condition] * growthMult(c) * (c.injury && id !== 'rehab' ? 0.5 : 1);
  const gained: Points = { P: 0, T: 0, M: 0 };
  for (const k of ['P', 'T', 'M'] as const) gained[k] = stoch(rng, a.pts[k] * mult * rng.range(0.85, 1.15));

  // 개인 훈련·은사 특훈: 고른 분야 경험치
  if (id === 'solo' || id === 'mentor') {
    const f = FOCUS.find((x) => x.id === focus) ?? FOCUS[0];
    const big = id === 'mentor' ? 2.2 : 1;
    for (const k of f.keys) addXp(c, k, ((0.9 * big) / f.keys.length) * CONDITION_MULT[c.condition] * rng.range(0.8, 1.2), ups);
    if (id === 'mentor') {
      c.mentor.last = c.week;
      notes.push(`${c.mentor.name} 선생님: "${rng.pick(['기본이 전부다.', '몸이 기억할 때까지.', '좋아, 그 감각이야.', '오늘은 여기까지. 쉬는 것도 훈련이다.'])}"`);
    }
  }
  // 길거리에서 은사를 만난다
  if (id === 'street' && !c.mentor.met && (c.counts.street ?? 0) >= 2 && rng.chance(0.3)) {
    c.mentor.met = true;
    c.mentor.last = c.week - 4;
    notes.push(`공원 코트에서 은퇴한 전설 ${c.mentor.name}을(를) 만났다! 이제 '은사 특훈'을 할 수 있다.`);
  }
  // 감독 신뢰도와 친밀도
  let dTrust = a.trust;
  if (id === 'rest' && c.fatigue < 25) dTrust -= 0.3;
  c.trust = clamp(c.trust + dTrust, 0, 100);
  const mates = c.roster.map((e) => e.player.id);
  if (id === 'team') {
    for (const pid of mates) c.friends[pid] = clamp((c.friends[pid] ?? 20) + 0.6, 0, 100);
    for (let i = 0; i < 2; i++) {
      const pid = rng.pick(mates);
      c.friends[pid] = clamp(c.friends[pid] + 1.5, 0, 100);
    }
  } else if (id === 'friends' && mates.length) {
    const picked: string[] = [];
    for (let i = 0; i < 2; i++) {
      const pool = mates.filter((m) => !picked.includes(m));
      const pid = pool[rng.weighted(pool.map((m) => 30 + (c.friends[m] ?? 20)))];
      picked.push(pid);
      c.friends[pid] = clamp((c.friends[pid] ?? 20) + 7, 0, 100);
    }
    const names = picked.map((pid) => c.roster.find((e) => e.player.id === pid)!.player.name);
    notes.push(`${names.join(', ')}와(과) ${rng.pick(['PC방에 갔다', '떡볶이를 먹었다', '노래방에 갔다', '영화를 봤다', '한강에서 자전거를 탔다'])}.`);
  }
  // 길거리: 가끔 고수에게 배운다
  if (id === 'street' && rng.chance(0.18)) {
    const k = rng.pick(['ballHandling', 'layup', 'floater', 'three', 'competitive'] as RatingKey[]);
    addXp(c, k, 1, ups);
    gained.T += 3;
    notes.push(`공원에서 만난 고수에게 ${RATING_LABEL[k]}을(를) 배웠다!`);
  }
  if (id === 'weight') addXp(c, rng.pick(['strength', 'jump', 'stamina'] as RatingKey[]), 0.25, ups);
  if (id === 'video') addXp(c, rng.pick(['iq', 'vision', 'composure'] as RatingKey[]), 0.2, ups);

  // 피로: 훈련으로 쌓이고, 매주 조금씩 자연 회복
  const natural = 6 * (0.7 + (c.me.r.recovery / 100) * 0.6);
  c.fatigue = clamp(c.fatigue + fatigueGain(c, a) - natural, 0, 100);

  // 부상
  let injured: Injury | null = null;
  let healed = false;
  if (c.injury) {
    c.injury.weeks -= id === 'rehab' ? 2 : 1;
    if (c.injury.weeks <= 0) {
      notes.push(`${c.injury.name}에서 회복했다.`);
      c.injury = null;
      healed = true;
    }
  } else if (rng.chance(injuryRisk({ ...c, fatigue: fatigueBefore }, a))) {
    const inj = INJURIES[rng.weighted(INJURIES.map((x) => x.w))];
    const weeks = rng.int(inj.weeks[0], inj.weeks[1]);
    injured = { name: inj.name, weeks, total: weeks };
    c.injury = injured;
    c.stats.injuries++;
    c.stats.lastInjury = c.week;
    notes.push(`훈련 중 ${inj.name}! ${weeks}주 동안 쉬어야 한다.`);
  }

  // 컨디션: 지치면 떨어지고, 쉬거나 놀면 오른다
  const drift = a.mood + (c.fatigue > 70 ? -0.45 : c.fatigue > 55 ? -0.15 : c.fatigue < 25 ? 0.15 : 0) + (injured ? -1 : 0);
  const roll = rng.normal(drift, 0.6);
  if (roll > 0.65) c.condition = Math.min(4, c.condition + 1);
  else if (roll < -0.65) c.condition = Math.max(0, c.condition - 1);

  // 키: 고교 동안 조금씩 큰다 (M4)
  let grew = 0;
  const left = Math.max(1, WEEKS_PER_YEAR * 2.5 - c.week);
  const remain = c.finalHeight - c.me.body.heightCm;
  if (remain > 0 && rng.chance(Math.min(0.9, (remain / left) * 1.1))) {
    grew = 1;
    c.me.body.heightCm++;
    c.me.body.wingspanCm++;
    c.me.body.weightKg++;
    notes.push(`키가 1cm 자랐다! (${c.me.body.heightCm}cm)`);
  }
  if (id === 'weight' && rng.chance(0.3)) c.me.body.weightKg++;

  for (const k of ['P', 'T', 'M'] as const) c.points[k] += gained[k];
  c.counts[id] = (c.counts[id] ?? 0) + 1;
  const xpGain: Partial<Record<RatingKey, number>> = {};
  for (const k of RATING_KEYS) {
    const d = xpBefore(k) - before[k];
    if (d > 0.001) xpGain[k] = Math.round(d * 100) / 100;
  }
  for (const [k, n] of Object.entries(ups)) notes.push(`${RATING_LABEL[k as RatingKey]} +${n}`);
  c.log.push({ week: c.week, action: id, focus, gained, notes: notes.slice() });
  if (c.log.length > 80) c.log.shift();

  c.week++;
  c.rng = rng.state;
  return { action: a, focus, gained, ups, xpGain, fatigueBefore, fatigueAfter: c.fatigue, conditionBefore, conditionAfter: c.condition, injured, healed, grew, notes, game: null, event: null };
}

// ───────────── 능력치 투자 ─────────────

/** pending만큼 올리는 데 드는 포인트 */
export function investCost(c: Career, pending: Partial<Record<RatingKey, number>>): Points {
  const cost: Points = { P: 0, T: 0, M: 0 };
  for (const k of RATING_KEYS) {
    const n = pending[k] ?? 0;
    for (let i = 0; i < n; i++) cost[POINT_OF[k]] += costOf(c.me.r[k] + i, c.potential);
  }
  return cost;
}

export function canAfford(c: Career, pending: Partial<Record<RatingKey, number>>): boolean {
  const cost = investCost(c, pending);
  return cost.P <= c.points.P && cost.T <= c.points.T && cost.M <= c.points.M;
}

export function invest(c: Career, pending: Partial<Record<RatingKey, number>>): boolean {
  if (!canAfford(c, pending)) return false;
  const cost = investCost(c, pending);
  for (const k of ['P', 'T', 'M'] as const) c.points[k] -= cost[k];
  for (const k of RATING_KEYS) c.me.r[k] = Math.min(MAX_RATING, c.me.r[k] + (pending[k] ?? 0));
  return true;
}
