// 연습경기: 출전 명단을 짜서 경기 엔진을 돌리고, 끝나면 실전 경험으로 성장시킨다 (T1).
import { Rng } from '../core/rng';
import { overall, POSITIONS, type Player, type Position } from '../data/player';
import { RATING_KEYS, RATING_LABEL, type RatingKey } from '../data/ratings';
import type { Team } from '../data/teams';
import { simulateGame } from '../sim/engine';
import { boxScore, type Line } from '../sim/stats';
import type { GameResult, ShotKind } from '../sim/types';
import { addXp, CONDITION_GAME, growthMult, MAX_RATING, type Career, type GameLine, type Injury, type Points } from './career';
import { generateSchoolRoster, schoolById, type SchoolInfo } from './schools';

/** 포지션 거리: 같은 자리 0, 옆자리 1 ... */
const posDist = (a: Position, b: Position) => Math.abs(POSITIONS.indexOf(a) - POSITIONS.indexOf(b));
const POS_PENALTY = [0, 3, 8, 15, 22];

/**
 * 감독이 짜는 출전 순서 (E7). 주전 5명은 포지션마다 가장 잘 맞는 선수, 벤치는 실력순.
 * 경기 엔진은 이 순서대로 출전 시간을 나눈다.
 */
export function depthChart(players: Player[], natural: (p: Player) => Position = (p) => p.pos): Player[] {
  const pairs: { p: Player; pos: Position; v: number }[] = [];
  for (const p of players) for (const pos of POSITIONS) pairs.push({ p, pos, v: overall(p, pos) - POS_PENALTY[posDist(natural(p), pos)] });
  pairs.sort((a, b) => b.v - a.v);
  const used = new Set<Player>();
  const slot = new Map<Position, Player>();
  for (const { p, pos } of pairs) {
    if (used.has(p) || slot.has(pos)) continue;
    used.add(p);
    slot.set(pos, p);
    if (slot.size === 5) break;
  }
  const starters = POSITIONS.map((pos) => ({ ...slot.get(pos)!, pos }));
  const bench = players
    .filter((p) => !used.has(p))
    .map((p) => ({ p, v: overall(p, natural(p)) }))
    .sort((a, b) => b.v - a.v)
    .map(({ p }) => ({ ...p, pos: natural(p) }));
  return [...starters, ...bench];
}

/** 학교 팀 (상대 학교 선수단은 커리어 시드로 정해져서 매번 같다) */
export function opponentTeam(c: Career, id: string): Team {
  const info = schoolById(id);
  const roster = generateSchoolRoster(new Rng(c.seed ^ hashId(id)), info, c.gender);
  return { ...toTeamInfo(info), players: depthChart(roster.map((e) => e.player)) };
}

function toTeamInfo(s: SchoolInfo) {
  return { id: s.id, city: s.city, name: s.name, short: s.short, color: s.color, color2: s.color2, tactics: s.tactics };
}

function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface MatchSetup {
  game: GameResult;
  /** 경기 기록 안에서 내 선수 번호 (결장이면 -1) */
  myPid: number;
  /** 내 학교가 0번 팀(홈)인가 */
  home: boolean;
  opponent: string;
  seed: number;
  /** 주전으로 나왔나 */
  started: boolean;
  /** 감독이 정해 준 포지션 */
  pos: Position | null;
}

/** 내 학교 출전 명단. 연습경기라 1학년에게도 기회를 준다 (최소 식스맨) */
export function myTeam(c: Career): { team: Team; meIndex: number } {
  const info = schoolById(c.school);
  const me: Player = { ...c.me, r: { ...c.me.r } };
  // 컨디션은 경기력에 바로 반영된다
  const d = CONDITION_GAME[c.condition];
  if (d) for (const k of RATING_KEYS) me.r[k] = Math.max(1, Math.min(MAX_RATING, me.r[k] + d));
  const pool = c.roster.map((e) => e.player);
  if (!c.injury) pool.push(me);
  let order = depthChart(pool, (p) => (p.id === 'me' ? c.prefPos : p.pos));
  let meIndex = order.findIndex((p) => p.id === 'me');
  if (meIndex > 5) {
    const [m] = order.splice(meIndex, 1);
    order.splice(5, 0, m);
    meIndex = 5;
  }
  // 엔진은 12명까지만 출전 시간을 계산한다
  order = order.slice(0, 12);
  return { team: { ...toTeamInfo(info), players: order }, meIndex };
}

const PRACTICE_FAVOR = 4;
const PRACTICE_MINUTES = 15;

export function playMatch(c: Career, seed?: number): MatchSetup {
  const oppId = c.pendingGame ?? c.school;
  const rng = Rng.fromState(c.rng);
  const s = seed ?? Math.floor(rng.next() * 2 ** 31);
  c.rng = rng.state;
  const home = c.games.length % 2 === 0;
  const { team: mine, meIndex } = myTeam(c);
  const opp = opponentTeam(c, oppId);
  const [a, b] = home ? [mine, opp] : [opp, mine];
  // 누적 피로가 있으면 체력이 덜 찬 채로 시작
  const energy = [...a.players, ...b.players].map((p) => (p.id === 'me' ? 100 - Math.max(0, c.fatigue - 20) * 0.5 : 100));
  const myPid = meIndex < 0 ? -1 : (home ? 0 : a.players.length) + meIndex;
  // 연습경기라 감독이 신입생을 더 써 본다 (최소 출전 시간 약속)
  const favor = myPid >= 0 ? { [myPid]: PRACTICE_FAVOR } : {};
  const minMinutes = myPid >= 0 ? { [myPid]: PRACTICE_MINUTES } : {};
  const game = simulateGame(a, b, s, { energy, favor, minMinutes });
  return { game, myPid, home, opponent: oppId, seed: s, started: meIndex >= 0 && meIndex < 5, pos: meIndex >= 0 ? (home ? a : b).players[meIndex].pos : null };
}

// ───────────── 경기 후 성장 ─────────────

/** 실전 경험치: 실제로 한 플레이가 그 능력치를 키운다 */
const SHOT_XP: Record<ShotKind, RatingKey> = { dunk: 'dunk', layup: 'layup', floater: 'floater', hook: 'postUp', mid: 'midRange', three: 'three' };

export interface GameReport {
  line: GameLine | null;
  grade: string;
  gameScore: number;
  gained: Points;
  ups: Partial<Record<RatingKey, number>>;
  /** 쌓인 경험치 (1 = 능력치 1) */
  xpGain: Partial<Record<RatingKey, number>>;
  won: boolean;
  score: [number, number];
  fatigueBefore: number;
  fatigueAfter: number;
  injured: Injury | null;
  comment: string;
}

export function gameScoreOf(l: Line) {
  return l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.oreb + 0.3 * l.dreb + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov;
}

/** 30분 기준으로 환산한 게임 스코어로 등급 */
export function gradeOf(gs: number, sec: number) {
  if (sec < 60) return '-';
  const per30 = (gs / Math.max(sec / 60, 8)) * 30;
  return per30 >= 22 ? 'S' : per30 >= 15 ? 'A' : per30 >= 9 ? 'B' : per30 >= 4 ? 'C' : 'D';
}

const COMMENTS: Record<string, string[]> = {
  S: ['오늘은 네 경기였다. 이대로만 해.', '감독님이 말없이 어깨를 두드려 줬다.'],
  A: ['좋았어. 다음엔 더 믿고 맡길게.', '선배들도 인정하는 눈치다.'],
  B: ['나쁘지 않았다. 기본은 했어.', '조금만 더 과감해져도 된다.'],
  C: ['아직 몸이 굳어 있네. 연습한 걸 믿어.', '실수는 괜찮아, 같은 실수만 하지 마.'],
  D: ['오늘은 잊어버려. 다음 주부터 다시.', '벤치에서 보는 것도 공부다.'],
  '-': ['오늘은 벤치에서 경기를 봤다.', '다음 기회를 기다리자.'],
};

export function applyMatch(c: Career, m: MatchSetup): GameReport {
  const g = m.game;
  const rng = Rng.fromState(c.rng);
  const score: [number, number] = m.home ? [g.final[0], g.final[1]] : [g.final[1], g.final[0]];
  const won = score[0] > score[1];
  const ups: Partial<Record<RatingKey, number>> = {};
  const gained: Points = { P: 0, T: 0, M: 0 };
  const fatigueBefore = c.fatigue;
  const xpOf = (k: RatingKey) => c.me.r[k] + (c.xp[k] ?? 0);
  const before = Object.fromEntries(RATING_KEYS.map((k) => [k, xpOf(k)])) as Record<RatingKey, number>;
  let line: GameLine | null = null;
  let gs = 0;
  let grade = '-';
  let injured: Injury | null = null;

  if (m.myPid >= 0) {
    const box = boxScore(g);
    const l = box.players[m.myPid];
    line = { sec: l.sec, pts: l.pts, reb: l.oreb + l.dreb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, pf: l.pf, fgm: l.fgm, fga: l.fga, tpm: l.tpm, tpa: l.tpa, ftm: l.ftm, fta: l.fta };
    gs = gameScoreOf(l);
    grade = gradeOf(gs, l.sec);
    const min = l.sec / 60;
    const gm = growthMult(c);
    const perf = { S: 1.6, A: 1.3, B: 1.1, C: 0.95, D: 0.8, '-': 0.6 }[grade]!;
    gained.T = Math.round((1 + min / 8) * perf * gm);
    gained.P = Math.round((min / 15) * perf * gm);
    gained.M = Math.round((1 + min / 12) * perf * gm + (won ? 1 : 0));

    // 실전 사용 보너스
    const xp: Partial<Record<RatingKey, number>> = {};
    const add = (k: RatingKey, v: number) => (xp[k] = (xp[k] ?? 0) + v);
    for (const e of g.events) {
      if (e.player !== m.myPid) continue;
      if ((e.type === 'made' || e.type === 'miss') && e.shot) add(SHOT_XP[e.shot], e.type === 'made' ? 0.1 : 0.05);
      if (e.type === 'ft') add('freeThrow', 0.06);
      if (e.type === 'ankle') add('ballHandling', 0.15);
      if (e.type === 'screen') add('screen', 0.05);
    }
    add('passing', l.ast * 0.12);
    add('vision', l.ast * 0.08);
    add('offReb', l.oreb * 0.15);
    add('defReb', l.dreb * 0.1);
    add('boxOut', (l.oreb + l.dreb) * 0.04);
    add('steal', l.stl * 0.2);
    add('block', l.blk * 0.2);
    add('perimeterD', min * 0.008);
    add('helpD', min * 0.006);
    add('stamina', min * 0.012);
    add('hustle', min * 0.008);
    add('iq', min * 0.01);
    add('composure', min * 0.006 + (Math.abs(g.final[0] - g.final[1]) <= 5 ? 0.15 : 0));
    add('ballHandling', l.tov * 0.04);
    for (const [k, v] of Object.entries(xp)) addXp(c, k as RatingKey, v * 0.6 * gm, ups);

    c.fatigue = Math.min(100, c.fatigue + min * 0.55);
    // 많이 뛰고 지쳐 있으면 다칠 수 있다
    const p = 0.006 + (min / 40) * 0.02 * (1 + Math.max(0, fatigueBefore - 50) / 25);
    if (rng.chance(p)) {
      const weeks = rng.int(1, 3);
      injured = { name: rng.pick(['발목 염좌', '무릎 타박상', '손목 염좌']), weeks, total: weeks };
      c.injury = injured;
    }
    // 잘하면 기분이 좋아진다
    if ((grade === 'S' || grade === 'A') && rng.chance(0.6)) c.condition = Math.min(4, c.condition + 1);
    if (grade === 'D' && rng.chance(0.4)) c.condition = Math.max(0, c.condition - 1);
  } else {
    gained.M = 2;
  }
  for (const k of ['P', 'T', 'M'] as const) c.points[k] += gained[k];

  c.games.push({ week: c.week - 1, opponent: m.opponent, home: m.home, score, won, seed: m.seed, line, grade, started: m.started });
  c.pendingGame = null;
  c.rng = rng.state;
  const xpGain: Partial<Record<RatingKey, number>> = {};
  for (const k of RATING_KEYS) {
    const d = xpOf(k) - before[k];
    if (d > 0.001) xpGain[k] = Math.round(d * 100) / 100;
  }
  const comment = c.injury && m.myPid < 0 ? '부상으로 결장했다. 몸부터 만들자.' : rng.pick(COMMENTS[grade]);
  return { line, grade, gameScore: Math.round(gs * 10) / 10, gained, ups, xpGain, won, score, fatigueBefore, fatigueAfter: c.fatigue, injured, comment };
}

export function upsText(ups: Partial<Record<RatingKey, number>>) {
  return Object.entries(ups).map(([k, n]) => `${RATING_LABEL[k as RatingKey]} +${n}`);
}
