// 고교 시즌 (W8): 1년에 공식 대회 4개 + 연습경기. 내 경기만 엔진으로 돌리고, 나머지 경기는 전력 차로 빠르게 정한다.
import { Rng } from '../core/rng';
import { expectedMargin, MARGIN_SD } from '../sim/winprob';
import type { Career, PendingGame } from './career';
import { myTeam, opponentTeam } from './match';
import { SCHOOLS, schoolById } from './schools';

export type TourKind = 'knockout' | 'groups' | 'finals';

export interface TourDef {
  id: string;
  name: string;
  kind: TourKind;
  /** 시즌 안에서 경기가 열리는 주 (0 = 3월 1주). 라운드 순서대로 */
  weeks: number[];
  /** 참가 팀 수 */
  size: number;
  /** 우승 보상 무게 (전국 대회일수록 크다) */
  prestige: number;
  blurb: string;
}

/** 대회 일정 (데이터, K8). 주는 그 주 행동이 끝난 주말에 경기 */
export const TOURS: TourDef[] = [
  { id: 'spring', name: '춘계 연맹전', kind: 'knockout', weeks: [5, 6, 7], size: 8, prestige: 1, blurb: '시즌 첫 대회. 8강 토너먼트' },
  { id: 'summer', name: '협회장기', kind: 'groups', weeks: [16, 17, 18, 19, 20, 21, 22], size: 10, prestige: 1.2, blurb: '10팀이 두 조로 나뉘어 조별리그, 조 2위까지 4강' },
  { id: 'national', name: '전국체전', kind: 'knockout', weeks: [29, 30, 31], size: 8, prestige: 1.5, blurb: '시도 대표가 모이는 큰 무대' },
  { id: 'kings', name: '왕중왕전', kind: 'finals', weeks: [38, 39], size: 4, prestige: 1.8, blurb: '시즌 성적 상위 4팀만 나가는 마지막 대회' },
];

/** 대회가 없는 달의 연습경기 주 */
export const PRACTICE_WEEKS = [3, 11, 15, 27, 35, 43, 47];

export interface Match {
  /** 라운드 번호 (0부터) */
  round: number;
  /** 커리어 기준 절대 주 */
  week: number;
  a: string;
  b: string;
  score?: [number, number];
  winner?: string;
  /** 조별리그면 조 번호 */
  group?: number;
}

export interface Tour {
  id: string;
  name: string;
  kind: TourKind;
  year: number;
  teams: string[];
  groups?: string[][];
  matches: Match[];
  /** 절대 주, 라운드 순서대로 */
  weeks: number[];
  champion?: string;
  runnerUp?: string;
  /** 내 학교 최종 성적 */
  myFinish?: string;
  done: boolean;
}

export interface Season {
  year: number;
  tours: Tour[];
  /** 대회 성적 점수 (왕중왕전 출전팀 정하기) */
  points: Record<string, number>;
}

export const ROUND_LABEL: Record<TourKind, string[]> = {
  knockout: ['8강', '4강', '결승'],
  groups: ['조별 1차전', '조별 2차전', '조별 3차전', '조별 4차전', '조별 5차전', '4강', '결승'],
  finals: ['4강', '결승'],
};

export function roundLabel(t: Tour, round: number) {
  return ROUND_LABEL[t.kind][round] ?? `${round + 1}라운드`;
}

/** 학교 전력 (이번 해 선수단 기준) */
function strengthOrder(c: Career, ids: string[]): string[] {
  const s = new Map(ids.map((id) => [id, id === c.school ? schoolById(id).strength + 1 : schoolById(id).strength]));
  return [...ids].sort((a, b) => s.get(b)! - s.get(a)!);
}

/** 고교 3년 동안만 시즌이 있다 */
export function createSeason(c: Career, year: number): Season | null {
  if (year >= 3) return null;
  const base = year * 48;
  const rng = new Rng(c.seed ^ (year * 2654435761));
  const all = SCHOOLS.map((s) => s.id);
  const tours: Tour[] = [];
  for (const def of TOURS) {
    if (def.kind === 'finals') {
      // 왕중왕전 출전팀은 12월에 정해진다
      tours.push({ id: def.id, name: def.name, kind: def.kind, year, teams: [], matches: [], weeks: def.weeks.map((w) => base + w), done: false });
      continue;
    }
    let teams = all;
    if (def.size < all.length) {
      // 내 학교 + 무작위 7팀 (강한 팀이 조금 더 잘 뽑힌다)
      const others = all.filter((id) => id !== c.school);
      const pick: string[] = [];
      while (pick.length < def.size - 1) {
        const pool = others.filter((id) => !pick.includes(id));
        const k = rng.weighted(pool.map((id) => 30 + schoolById(id).strength));
        pick.push(pool[k]);
      }
      teams = [c.school, ...pick];
    }
    const t: Tour = { id: def.id, name: def.name, kind: def.kind, year, teams, matches: [], weeks: def.weeks.map((w) => base + w), done: false };
    if (def.kind === 'knockout') seedKnockout(c, t, teams, 0);
    else {
      // 두 조, 전력 순서대로 지그재그
      const order = strengthOrder(c, teams);
      const g: string[][] = [[], []];
      order.forEach((id, i) => g[i % 4 === 0 || i % 4 === 3 ? 0 : 1].push(id));
      t.groups = g;
      g.forEach((grp, gi) => roundRobin(grp).forEach((pairs, r) => pairs.forEach(([a, b]) => t.matches.push({ round: r, week: t.weeks[r], a, b, group: gi }))));
    }
    tours.push(t);
  }
  return { year, tours, points: {} };
}

/** 1번 시드 vs 마지막 시드 식으로 대진 */
function seedKnockout(c: Career, t: Tour, teams: string[], round: number) {
  const o = strengthOrder(c, teams);
  const n = o.length;
  const order = n === 8 ? [0, 7, 3, 4, 1, 6, 2, 5] : n === 4 ? [0, 3, 1, 2] : [0, 1];
  for (let i = 0; i < n; i += 2) t.matches.push({ round, week: t.weeks[round], a: o[order[i]], b: o[order[i + 1]] });
}

/** 5팀 리그전: 5라운드, 라운드마다 한 팀은 쉰다 */
function roundRobin(teams: string[]): [string, string][][] {
  const list = [...teams];
  if (list.length % 2) list.push('');
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

export interface Standing {
  id: string;
  w: number;
  l: number;
  pf: number;
  pa: number;
}

export function groupStandings(t: Tour, gi: number): Standing[] {
  const ids = t.groups![gi];
  const m = new Map(ids.map((id) => [id, { id, w: 0, l: 0, pf: 0, pa: 0 }]));
  for (const x of t.matches) {
    if (x.group !== gi || !x.score) continue;
    const A = m.get(x.a)!;
    const B = m.get(x.b)!;
    A.pf += x.score[0];
    A.pa += x.score[1];
    B.pf += x.score[1];
    B.pa += x.score[0];
    if (x.winner === x.a) {
      A.w++;
      B.l++;
    } else {
      B.w++;
      A.l++;
    }
  }
  return [...m.values()].sort((a, b) => b.w - a.w || b.pf - b.pa - (a.pf - a.pa) || a.id.localeCompare(b.id));
}

/** 내 경기가 아닌 경기는 전력 차 + 정규분포로 결과를 정한다 */
export function quickResult(c: Career, a: string, b: string, rng: Rng): [number, number] {
  const ta = a === c.school ? myTeam(c).team : opponentTeam(c, a);
  const tb = b === c.school ? myTeam(c).team : opponentTeam(c, b);
  const exp = expectedMargin(ta, tb);
  let margin = Math.round(rng.normal(exp, MARGIN_SD * 0.85));
  if (margin === 0) margin = rng.chance(0.5) ? 1 : -1;
  const total = Math.round(rng.normal(140, 12));
  const sa = Math.max(35, Math.round((total + margin) / 2));
  return [sa, Math.max(30, sa - margin)];
}

function finish(m: Match, score: [number, number]) {
  m.score = score;
  m.winner = score[0] > score[1] ? m.a : m.b;
}

/** 이 주에 열리는 경기 중 내 경기 */
export function myMatchAt(c: Career, week: number): { tour: Tour; match: Match } | null {
  if (!c.season) return null;
  for (const t of c.season.tours) for (const m of t.matches) if (m.week === week && !m.score && (m.a === c.school || m.b === c.school)) return { tour: t, match: m };
  return null;
}

/** 그 주의 남의 경기를 모두 치른다 */
export function playOthers(c: Career, week: number, rng: Rng) {
  if (!c.season) return;
  for (const t of c.season.tours)
    for (const m of t.matches) {
      if (m.week !== week || m.score || m.a === c.school || m.b === c.school) continue;
      finish(m, quickResult(c, m.a, m.b, rng));
    }
  for (const t of c.season.tours) advanceTour(c, t, week);
}

/** 내 경기 결과를 기록한다 (score는 [a팀, b팀] 순서) */
export function recordMyMatch(c: Career, tourId: string, week: number, score: [number, number]) {
  const t = c.season?.tours.find((x) => x.id === tourId);
  if (!t) return;
  const m = t.matches.find((x) => x.week === week && (x.a === c.school || x.b === c.school) && !x.score);
  if (!m) return;
  finish(m, score);
  advanceTour(c, t, week);
}

/** 라운드가 끝났으면 다음 라운드 대진을 만들고, 끝난 대회는 성적을 정리한다 */
function advanceTour(c: Career, t: Tour, week: number) {
  const season = c.season!;
  const r = t.weeks.indexOf(week);
  if (r < 0 || t.done) return;
  const roundMatches = t.matches.filter((m) => m.round === r);
  if (!roundMatches.length || roundMatches.some((m) => !m.score)) return;
  const pts = season.points;
  const add = (id: string, p: number) => (pts[id] = (pts[id] ?? 0) + p);
  if (t.kind === 'groups' && r < 5) {
    for (const m of roundMatches) add(m.winner!, 1);
    if (r === 4) {
      // 조 1위 vs 다른 조 2위
      const g0 = groupStandings(t, 0);
      const g1 = groupStandings(t, 1);
      t.matches.push({ round: 5, week: t.weeks[5], a: g0[0].id, b: g1[1].id }, { round: 5, week: t.weeks[5], a: g1[0].id, b: g0[1].id });
      for (const id of t.teams) if (![g0[0], g0[1], g1[0], g1[1]].some((s) => s.id === id) && id === c.school) t.myFinish = '조별리그 탈락';
    }
    return;
  }
  const last = r === t.weeks.length - 1;
  const losers = roundMatches.map((m) => (m.winner === m.a ? m.b : m.a));
  const winners = roundMatches.map((m) => m.winner!);
  const stage = roundLabel(t, r);
  if (losers.includes(c.school)) t.myFinish = last ? '준우승' : stage;
  for (const id of losers) add(id, last ? 6 : stage === '4강' ? 3 : 1);
  if (last) {
    t.champion = winners[0];
    t.runnerUp = losers[0];
    add(winners[0], 10);
    if (winners[0] === c.school) t.myFinish = '우승';
    t.done = true;
    // 전국체전이 끝나면 왕중왕전 4팀이 정해진다
    if (t.id === 'national') setupFinals(c);
    return;
  }
  for (let i = 0; i < winners.length; i += 2) t.matches.push({ round: r + 1, week: t.weeks[r + 1], a: winners[i], b: winners[i + 1] });
}

function setupFinals(c: Career) {
  const s = c.season!;
  const t = s.tours.find((x) => x.kind === 'finals');
  if (!t || t.teams.length) return;
  const ranked = SCHOOLS.map((x) => x.id).sort((a, b) => (s.points[b] ?? 0) - (s.points[a] ?? 0) || schoolById(b).strength - schoolById(a).strength);
  t.teams = ranked.slice(0, 4);
  if (!t.teams.includes(c.school)) t.myFinish = '출전 못 함';
  t.matches.push({ round: 0, week: t.weeks[0], a: t.teams[0], b: t.teams[3] }, { round: 0, week: t.weeks[0], a: t.teams[1], b: t.teams[2] });
}

/** 이 주 주말에 내 경기가 있는가 (공식전 > 연습경기) */
export function gameFor(c: Career, week: number, rng: Rng): PendingGame | null {
  const mine = myMatchAt(c, week);
  if (mine) {
    const { tour, match } = mine;
    const opp = match.a === c.school ? match.b : match.a;
    return { kind: 'official', opponent: opp, tour: tour.id, label: `${tour.name} ${roundLabel(tour, match.round)}`, home: match.a === c.school };
  }
  const w = week % 48;
  if (PRACTICE_WEEKS.includes(w)) {
    const others = SCHOOLS.filter((s) => s.id !== c.school);
    const recent = new Set(c.games.slice(-3).map((g) => g.opponent));
    const pool = others.filter((s) => !recent.has(s.id));
    return { kind: 'practice', opponent: rng.pick(pool.length ? pool : others).id, label: '연습경기', home: c.games.length % 2 === 0 };
  }
  return null;
}

/** 다음 내 경기 (화면 안내용) */
export function nextGame(c: Career): { week: number; label: string; opponent?: string } | null {
  for (let w = c.week; w < c.week + 48; w++) {
    const m = myMatchAt(c, w);
    if (m) {
      const opp = m.match.a === c.school ? m.match.b : m.match.a;
      return { week: w, label: `${m.tour.name} ${roundLabel(m.tour, m.match.round)}`, opponent: opp };
    }
    if (c.season && w >= c.season.year * 48 + 48) break;
    // 아직 대진이 안 정해진 대회 주
    const tour = c.season?.tours.find((t) => t.weeks.includes(w) && !t.done && !t.myFinish && (t.teams.includes(c.school) || (t.kind === 'finals' && !t.teams.length)));
    if (tour) return { week: w, label: `${tour.name} ${roundLabel(tour, tour.weeks.indexOf(w))}` };
    if (PRACTICE_WEEKS.includes(w % 48)) return { week: w, label: '연습경기' };
  }
  return null;
}

/** 시즌 중간에 시즌을 만들었을 때 (예전 세이브) 지난 주 경기를 빠르게 채운다 */
export function catchUp(c: Career, rng: Rng) {
  if (!c.season) return;
  const start = c.season.year * 48;
  for (let w = start; w < c.week; w++) {
    for (const t of c.season.tours) for (const m of t.matches) if (m.week === w && !m.score) finish(m, quickResult(c, m.a, m.b, rng));
    for (const t of c.season.tours) advanceTour(c, t, w);
  }
}
