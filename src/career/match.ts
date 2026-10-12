// 연습경기: 출전 명단을 짜서 경기 엔진을 돌리고, 끝나면 실전 경험으로 성장시킨다 (T1).
import { Rng } from '../core/rng';
import { overall, POSITIONS, type Player, type Position } from '../data/player';
import { RATING_KEYS, RATING_LABEL, type RatingKey } from '../data/ratings';
import type { Team, TeamInfo } from '../data/teams';
import { simulateGame } from '../sim/engine';
import { boxScore, type Line } from '../sim/stats';
import type { GameResult, ShotKind } from '../sim/types';
import { addXp, CONDITION_GAME, dateOf, growthMult, MAX_RATING, teammates, trustStep, type Career, type GameLine, type Injury, type Points } from './career';
import { generateSchoolRoster, schoolById, type SchoolInfo } from './schools';
import { checkAbilities } from './abilities';
import { allStarTeam, DREAM, KOREA, koreaTeam, MAGIC, NATIONS, nationTeam, recordNational } from './allstar';
import { recordEngineGame } from './awards';
import { FOREIGN_INFOS, OVERSEAS_RULES } from './overseas';
import { traitGameBoost, traitInjury, traitSocial, traitStyle, traitUsage } from './personality';
import { comboOpts } from './combos';
import { shotMove } from '../data/moves';
import { afterGameFans, gainPopularity, interviewFor, type SnsPost } from './fans';
import { leagueTeam } from './league';
import { cheerBoost, gearBoost, has } from './money';
import { leagueTeamName, recordProGame } from './pro';
import { withRival } from './people';
import { recordMyMatch, tourDef } from './season';

const TOUR_PRESTIGE = (id: string) => tourDef(id)?.prestige ?? 1;

/** 포지션 거리: 같은 자리 0, 옆자리 1 ... */
const posDist = (a: Position, b: Position) => Math.abs(POSITIONS.indexOf(a) - POSITIONS.indexOf(b));
const POS_PENALTY = [0, 3, 8, 15, 22];

/**
 * 감독이 짜는 출전 순서 (E7). 주전 5명은 포지션마다 가장 잘 맞는 선수, 벤치는 실력순.
 * 경기 엔진은 이 순서대로 출전 시간을 나눈다.
 */
export function depthChart(players: Player[], natural: (p: Player) => Position = (p) => p.pos, bonus: (p: Player) => number = () => 0): Player[] {
  const pairs: { p: Player; pos: Position; v: number }[] = [];
  for (const p of players) for (const pos of POSITIONS) pairs.push({ p, pos, v: overall(p, pos) - POS_PENALTY[posDist(natural(p), pos)] + bonus(p) });
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
    .map((p) => ({ p, v: overall(p, natural(p)) + bonus(p) }))
    .sort((a, b) => b.v - a.v)
    .map(({ p }) => ({ ...p, pos: natural(p) }));
  return [...starters, ...bench];
}

/** 팀 id → 이름과 색 (학교, 프로 팀, 해외 팀, 올스타, 대표팀) */
export function teamInfoOf(c: Career, id: string): TeamInfo & { full: string } {
  if (id === DREAM.id || id === MAGIC.id) {
    const t = id === DREAM.id ? DREAM : MAGIC;
    return { ...t, full: `올스타 ${t.name}` };
  }
  if (id === KOREA.id) return { ...KOREA, full: KOREA.name };
  const n = NATIONS.find((x) => x.id === id);
  if (n) return { ...n, full: n.name };
  for (const L of [c.league, c.homeLeague, c.abroadLeague]) {
    const t = L?.teams.find((x) => x.info.id === id);
    if (t) return { ...t.info, full: `${t.info.city} ${t.info.name}` };
  }
  const f = FOREIGN_INFOS.find((x) => x.id === id);
  if (f) return { ...f, full: `${f.city} ${f.name}` };
  const s = schoolById(id);
  return { ...toTeamInfo(s), full: s.name };
}

/** 이 경기에서 내가 뛰는 팀 id */
export function mySideId(c: Career, special = c.pendingGame?.special): string {
  if (special === 'allstar') return c.allStar?.mySide === 1 ? MAGIC.id : DREAM.id;
  if (special === 'national') return KOREA.id;
  return c.pro ? c.pro.team : c.school;
}

/** 상대 팀. 고교는 커리어 시드와 해로 정해지고, 프로는 리그 선수단 */
export function opponentTeam(c: Career, id: string, me?: Player): Team {
  if (id === DREAM.id || id === MAGIC.id) {
    const t = allStarTeam(c, id, me ?? c.me);
    return { ...t, players: t.players.slice(0, 12) };
  }
  if (NATIONS.some((n) => n.id === id)) return nationTeam(c, id);
  if (c.pro && c.league) {
    const t = leagueTeam(c.league, id);
    return { ...t.info, players: depthChart(withRival(c, id, t.players)).slice(0, 12) };
  }
  const info = schoolById(id);
  const year = dateOf(c.week).year;
  const roster = generateSchoolRoster(new Rng((c.seed ^ hashId(id) ^ Math.imul(year, 0x9e3779b1)) >>> 0), info, c.gender);
  // 에디터로 고친 상대 학교 선수 (그해만)
  const players = roster.map((e) => c.overrides?.[e.player.id] ?? e.player);
  return { ...toTeamInfo(info), players: depthChart(withRival(c, id, players)).slice(0, 12) };
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
  kind: 'practice' | 'official';
  pro?: boolean;
  special?: 'allstar' | 'national';
  label: string;
  tour?: string;
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

/** 감독 신뢰도가 출전 순서에 주는 보정 (종합 능력치 점수로, -5 ~ +5) */
export function trustBonus(c: Career) {
  return ((c.trust ?? 50) - 50) / 10;
}

/** 경기에 나서는 내 선수 (컨디션과 장비가 경기력에 바로 반영된다) */
export function gameMe(c: Career, official = c.pendingGame?.kind === 'official'): Player {
  const me: Player = { ...c.me, r: { ...c.me.r } };
  const d = CONDITION_GAME[c.condition];
  const gear = gearBoost(c);
  const trait = traitGameBoost(c, official);
  for (const k of RATING_KEYS) me.r[k] = Math.max(1, Math.min(MAX_RATING, me.r[k] + d + (gear[k] ?? 0) + (trait[k] ?? 0)));
  return me;
}

/** 내 학교 출전 명단. 연습경기에선 1학년에게도 기회를 준다 (최소 식스맨) */
export function myTeam(c: Career, official = c.pendingGame?.kind === 'official', special = c.pendingGame?.special): { team: Team; meIndex: number } {
  const me = gameMe(c, official);
  if (special === 'allstar' || special === 'national') {
    const t = special === 'allstar' ? allStarTeam(c, c.allStar!.mySide === 0 ? DREAM.id : MAGIC.id, me) : koreaTeam(c, me);
    // 다쳤으면 벤치에서 응원만 한다
    const players = t.players.filter((p) => !(c.injury && p.id === 'me')).slice(0, 12);
    return { team: { ...t, players }, meIndex: players.findIndex((p) => p.id === 'me') };
  }
  const info = c.pro && c.league ? leagueTeam(c.league, c.pro.team).info : toTeamInfo(schoolById(c.school));
  const pool = teammates(c).map((e) => e.player);
  if (!c.injury) pool.push(me);
  let order = depthChart(pool, (p) => (p.id === 'me' ? c.prefPos : p.pos), (p) => (p.id === 'me' ? trustBonus(c) : 0));
  let meIndex = order.findIndex((p) => p.id === 'me');
  if (meIndex > 5 && !official) {
    const [m] = order.splice(meIndex, 1);
    order.splice(5, 0, m);
    meIndex = 5;
  }
  // 엔진은 12명까지만 출전 시간을 계산한다
  order = order.slice(0, 12);
  meIndex = order.findIndex((p) => p.id === 'me');
  return { team: { ...info, players: order }, meIndex };
}

const PRACTICE_FAVOR = 4;
const PRACTICE_MINUTES = 15;
/** 콤비 짝 교체 가산점 (종합 능력치 점수) */
const COMBO_FAVOR = 3;

export function playMatch(c: Career, seed?: number): MatchSetup {
  const pg = c.pendingGame ?? { kind: 'practice', opponent: c.school, label: '연습경기', home: true };
  const oppId = pg.opponent;
  const official = pg.kind === 'official';
  const rng = Rng.fromState(c.rng);
  const s = seed ?? Math.floor(rng.next() * 2 ** 31);
  c.rng = rng.state;
  const home = pg.home;
  const { team: mine, meIndex } = myTeam(c, official, pg.special);
  const opp = opponentTeam(c, oppId);
  const [a, b] = home ? [mine, opp] : [opp, mine];
  // 누적 피로가 있으면 체력이 덜 찬 채로 시작
  const energy = [...a.players, ...b.players].map((p) => (p.id === 'me' ? 100 - Math.max(0, c.fatigue - 20) * 0.5 : 100));
  const myPid = meIndex < 0 ? -1 : (home ? 0 : a.players.length) + meIndex;
  // 연습경기라 감독이 신입생을 더 써 본다 (최소 출전 시간 약속). 공식전은 신뢰도만큼만
  const favor = myPid < 0 ? {} : { [myPid]: pg.special ? 2 : official ? trustBonus(c) : PRACTICE_FAVOR };
  const minMinutes = myPid >= 0 && !official ? { [myPid]: PRACTICE_MINUTES } : {};
  // 해외 리그는 쿼터 12분, 6반칙 퇴장
  const rules = c.overseas && pg.pro && !pg.special ? OVERSEAS_RULES : {};
  const players = [...a.players, ...b.players];
  const combos = pg.special ? [] : comboOpts(c, players, myPid);
  // 감독도 콤비 짝을 나와 같이 더 쓴다
  const fv: Record<number, number> = { ...favor };
  for (const cb of combos) fv[cb.b] = (fv[cb.b] ?? 0) + COMBO_FAVOR;
  // 성격에 따라 동작 성향 (쇼맨은 화려하게, 냉철은 기본기, 다혈질·승부욕은 힘으로)
  const style = myPid >= 0 ? { [myPid]: traitStyle(c) } : {};
  const usage = myPid >= 0 ? { [myPid]: traitUsage(c) } : {};
  const game = simulateGame(a, b, s, { energy, favor: fv, minMinutes, combos, style, usage, ...rules });
  return { kind: pg.kind, pro: pg.pro, special: pg.special, label: pg.label, tour: pg.tour, game, myPid, home, opponent: oppId, seed: s, started: meIndex >= 0 && meIndex < 5, pos: meIndex >= 0 ? (home ? a : b).players[meIndex].pos : null };
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
  trustBefore: number;
  trustAfter: number;
  /** 대회가 끝났으면 성적 한 줄 */
  tourNote?: string;
  /** 라이벌 학교와 붙었으면 라이벌 기록 */
  rival?: { name: string; number: number; line: GameLine | null };
  /** 특수능력 변화 */
  abilityNotes: string[];
  /** 인기 변화와 SNS 반응 */
  dPop: number;
  sns: SnsPost[];
  interview: ReturnType<typeof interviewFor>;
}

function lineOf(l: Line): GameLine {
  return { sec: l.sec, pts: l.pts, reb: l.oreb + l.dreb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, pf: l.pf, fgm: l.fgm, fga: l.fga, tpm: l.tpm, tpa: l.tpa, ftm: l.ftm, fta: l.fta };
}

/** 대회 성적 보상 (포인트 3종 각각) */
const FINISH_REWARD: Record<string, number> = { 우승: 6, 준우승: 4, '4강': 2, '8강': 1, '조별리그 탈락': 1 };

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
    line = lineOf(l);
    gs = gameScoreOf(l);
    grade = gradeOf(gs, l.sec);
    const min = l.sec / 60;
    const gm = growthMult(c);
    const perf = { S: 1.6, A: 1.3, B: 1.1, C: 0.95, D: 0.8, '-': 0.6 }[grade]! * (m.kind === 'official' ? 1.15 : 1);
    gained.T = Math.round((1 + min / 11) * perf * gm);
    gained.P = Math.round((min / 20) * perf * gm);
    gained.M = Math.round((1 + min / 16) * perf * gm + (won ? 1 : 0));

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
    for (const [k, v] of Object.entries(xp)) addXp(c, k as RatingKey, v * 0.25 * gm, ups);

    // 통산 기록 (특수능력 조건)
    const st = c.stats;
    const mySide = m.home ? 0 : 1;
    st.games++;
    st.ast += l.ast;
    st.reb += l.oreb + l.dreb;
    st.stlblk += l.stl + l.blk;
    st.steals = (st.steals ?? 0) + l.stl;
    st.blocks = (st.blocks ?? 0) + l.blk;
    st.minutes = (st.minutes ?? 0) + l.sec / 60;
    st.threesMade += l.tpm;
    st.ftm += l.ftm;
    st.fta += l.fta;
    if (c.me.abilities?.ftPhobia) {
      st.ftAfter.m += l.ftm;
      st.ftAfter.a += l.fta;
    }
    if (l.pts >= 25) st.big++;
    if (l.pf >= 5) st.foulOuts++;
    st.recentPf = [...st.recentPf, l.pf].slice(-6);
    for (const e of g.events) {
      if (e.player !== m.myPid) continue;
      if (e.type === 'ankle') st.ankles++;
      // 동작으로 넣은 슛 (M16 특수능력 조건)
      if (e.type === 'made') {
        const mv = e.move;
        if (e.fastBreak) st.fastMakes = (st.fastMakes ?? 0) + 1;
        if (e.andOne) st.andOnes = (st.andOnes ?? 0) + 1;
        if (mv && (mv === 'putback' || shotMove(mv)?.flashy)) st.moves = (st.moves ?? 0) + 1;
        if (e.poster || mv === 'contactDunk') st.posters = (st.posters ?? 0) + 1;
        if (mv === 'stepback' || mv === 'sidestep') st.stepbacks = (st.stepbacks ?? 0) + 1;
        if (mv === 'fadeaway' || mv === 'turnFade' || mv === 'oneLeg') st.fades = (st.fades ?? 0) + 1;
        if (mv === 'euro' || mv === 'scoop' || mv === 'reverseLay' || mv === 'doubleClutch') st.euros = (st.euros ?? 0) + 1;
      }
      if ((e.type === 'made' || e.type === 'miss') && e.quarter >= 4 && e.clock < 120) {
        const before = e.type === 'made' ? (mySide === 0 ? e.score[0] - e.pts - e.score[1] : e.score[1] - e.pts - e.score[0]) : mySide === 0 ? e.score[0] - e.score[1] : e.score[1] - e.score[0];
        if (Math.abs(before) <= 5) {
          if (e.type === 'made') st.clutchMade++;
          else st.clutchMiss++;
        }
      }
    }

    // 올스타전은 설렁설렁 뛴다
    const light = m.special === 'allstar' ? 0.35 : 1;
    c.fatigue = Math.min(100, c.fatigue + min * 0.55 * light);
    // 많이 뛰고 지쳐 있으면 다칠 수 있다
    const p = (0.006 + (min / 40) * 0.02 * (1 + Math.max(0, fatigueBefore - 50) / 25)) * light;
    if (rng.chance(p * (c.me.abilities?.glass ? 1.6 : 1) * (has(c, 'knee') ? 0.8 : 1) * traitInjury(c))) {
      const weeks = rng.int(1, 3);
      injured = { name: rng.pick(['발목 염좌', '무릎 타박상', '손목 염좌']), weeks, total: weeks };
      c.injury = injured;
      c.stats.injuries++;
      c.stats.lastInjury = c.week;
    }
    // 잘하면 기분이 좋아진다
    if ((grade === 'S' || grade === 'A') && rng.chance(0.6)) c.condition = Math.min(4, c.condition + 1);
    if (grade === 'D' && rng.chance(0.4)) c.condition = Math.max(0, c.condition - 1);
  } else {
    gained.M = 2;
  }

  // 감독 신뢰도: 잘하면 오르고, 공식전일수록 크게 움직인다
  const trustBefore = c.trust;
  const dt = ({ S: 4, A: 3, B: 1.5, C: 0.5, D: -1, '-': 0 }[grade] ?? 0) + (won ? 0.5 : 0);
  const tMul = dt > 0 ? traitSocial(c).trust : 1;
  if (!m.special) c.trust = Math.max(0, Math.min(100, c.trust + trustStep(c.trust, dt * tMul * (m.kind === 'official' ? 0.8 : 0.5))));

  // 공식전이면 대진표에 기록하고, 대회가 끝났으면 성적 보상
  let tourNote: string | undefined;
  if (m.special === 'national') {
    tourNote = recordNational(c, c.week - 1, m.opponent, score);
  } else if (m.special === 'allstar') {
    tourNote = allStarResult(c, g, score, m.myPid);
  } else if (m.pro && c.league && c.pro) {
    if (m.kind === 'official' && !m.label.includes('플레이오프') && !m.label.includes('챔피언')) recordEngineGame(c.league, g);
    tourNote = recordProGame(c, c.week - 1, m.home ? c.pro.team : m.opponent, m.home ? m.opponent : c.pro.team, [g.final[0], g.final[1]], m.kind === 'practice');
  } else if (m.kind === 'official' && m.tour) {
    const t = c.season?.tours.find((x) => x.id === m.tour);
    const had = t?.myFinish;
    recordMyMatch(c, m.tour, c.week - 1, [g.final[0], g.final[1]]);
    if (t && t.myFinish && !had) {
      const r = Math.round((FINISH_REWARD[t.myFinish] ?? 0) * TOUR_PRESTIGE(t.id));
      for (const k of ['P', 'T', 'M'] as const) gained[k] += r;
      tourNote = `${t.name} ${t.myFinish}! 보너스 포인트 +${r}씩`;
      if (t.myFinish === '우승') (c.trophies ??= []).push(c.college ? `대학 ${c.college.year}학년 ${t.name} 우승` : `고교 ${dateOf(c.week - 1).grade}학년 ${t.name} 우승`);
      if (t.myFinish === '우승') c.trust = Math.min(100, c.trust + 3);
    }
  }
  for (const k of ['P', 'T', 'M'] as const) c.points[k] += gained[k];

  // 라이벌과의 맞대결
  let rival: GameReport['rival'];
  if (c.rival && m.opponent === c.rival.school) {
    const rp = g.players.findIndex((p) => p.id === 'rival');
    const rl = rp >= 0 ? boxScore(g).players[rp] : null;
    rival = { name: c.rival.player.name, number: rp >= 0 ? g.players[rp].number : c.rival.player.number, line: rl && rl.played ? lineOf(rl) : null };
    if (won) c.rival.w++;
    else c.rival.l++;
  }

  const big = !!tourNote || g.events.some((e) => e.player === m.myPid && e.type === 'made' && (e.shot === 'dunk' || (e.quarter >= 4 && e.clock < 2)));
  const boost = m.pro && m.home && !m.special ? cheerBoost(c) : 1;
  const fans = afterGameFans(c, grade, line, won, big || !!m.special, m.special === 'national' ? '국가대표' : m.special === 'allstar' ? '올스타' : m.pro && c.pro ? leagueTeamName(c) : schoolById(c.school).name, boost);

  c.games.push({ week: c.week - 1, kind: m.kind, label: m.label, opponent: m.opponent, home: m.home, score, won, seed: m.seed, line, grade, started: m.started });
  c.pendingGame = null;
  c.rng = rng.state;
  const xpGain: Partial<Record<RatingKey, number>> = {};
  for (const k of RATING_KEYS) {
    const d = xpOf(k) - before[k];
    if (d > 0.001) xpGain[k] = Math.round(d * 100) / 100;
  }
  const comment = c.injury && m.myPid < 0 ? '부상으로 결장했다. 몸부터 만들자.' : rng.pick(COMMENTS[grade]);
  return { line, grade, gameScore: Math.round(gs * 10) / 10, gained, ups, xpGain, won, score, fatigueBefore, fatigueAfter: c.fatigue, injured, comment, trustBefore, trustAfter: c.trust, tourNote, rival, abilityNotes: checkAbilities(c), dPop: fans.dPop, sns: fans.posts, interview: interviewFor(grade, m.kind === 'official', c.traits) };
}

/** 올스타전: 이긴 팀에서 가장 잘한 선수가 MVP */
function allStarResult(c: Career, g: GameResult, score: [number, number], myPid: number): string {
  const box = boxScore(g);
  const winSide = g.final[0] > g.final[1] ? 0 : 1;
  let best = -1;
  let bv = -Infinity;
  g.players.forEach((_, pid) => {
    if (g.teamOf[pid] !== winSide || !box.players[pid].played) return;
    const v = gameScoreOf(box.players[pid]);
    if (v > bv) {
      bv = v;
      best = pid;
    }
  });
  const mvp = best >= 0 ? g.players[best].name : '';
  if (c.allStar) c.allStar.game = { score, mvp };
  if (best >= 0 && best === myPid) {
    c.trophies.push(`${c.overseas ? '해외 ' : ''}${c.league!.season + 1}시즌 올스타전 MVP`);
    gainPopularity(c, 4);
    return '올스타전 MVP! 트로피를 들어 올렸다!';
  }
  return `올스타전 MVP는 ${mvp}.`;
}

export function upsText(ups: Partial<Record<RatingKey, number>>) {
  return Object.entries(ups).map(([k, n]) => `${RATING_LABEL[k as RatingKey]} +${n}`);
}
