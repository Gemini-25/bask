// 프로 리그 (W6, W7, R5): 10팀, 정규시즌 27경기 + 플레이오프. 선수들은 나이를 먹고 크거나 늙고, 은퇴하고, 신인이 들어온다.
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { generatePlayer, overall, POSITIONS, type Player, type Position } from '../data/player';
import { RATING_GROUPS } from '../data/ratings';
import { generateTeam, TEAM_INFOS, type Team, type TeamInfo } from '../data/teams';
import { expectedMargin, MARGIN_SD } from '../sim/winprob';
import type { SeasonAwards, SeasonLine } from './awards';

export const PRO_WEEKS = {
  /** 연습경기 */
  preseason: [9, 11],
  /** 정규시즌 첫 주 (1주에 1경기, 27주) */
  seasonStart: 13,
  games: 27,
  /** 정규시즌 몇 번째 경기 뒤에 올스타 주간 (시즌 시작 +27주) */
  allStarBreak: 14,
  /** 플레이오프: 6강(3전 2선승) → 4강(5전 3선승) → 결승(7전 4선승). 한 주에 여러 경기 */
  playoffs: [
    { name: '6강 플레이오프', wins: 2, weeks: [41, 41, 42] },
    { name: '4강 플레이오프', wins: 3, weeks: [43, 43, 44, 44, 44] },
    { name: '챔피언 결정전', wins: 4, weeks: [45, 45, 46, 46, 47, 47, 47] },
  ],
};

export interface LeagueTeam {
  info: TeamInfo;
  players: Player[];
}

export interface ProGame {
  week: number;
  a: string;
  b: string;
  score?: [number, number];
  /** 플레이오프면 시리즈 번호 */
  series?: number;
}

export interface Series {
  round: number;
  a: string;
  b: string;
  winsA: number;
  winsB: number;
  winner?: string;
}

export interface League {
  /** 프로 몇 번째 시즌 (0 = 신인 시즌) */
  season: number;
  teams: LeagueTeam[];
  games: ProGame[];
  series: Series[];
  champion?: string;
  /** 지난 시즌 순위 (드래프트 순서) */
  lastOrder: string[];
  /** 역대 우승 */
  history: { season: number; champion: string; myFinish: string }[];
  myFinish?: string;
  /** 이번 시즌 선수 기록 (정규시즌) */
  stats?: Record<string, SeasonLine>;
  /** 이번 시즌 신인 */
  rookies?: string[];
  /** 역대 시상 */
  awards?: SeasonAwards[];
}

const PRO_STRENGTH: Record<string, number> = { SEO: 2, BUS: 1, INC: 0, DAE: -1, GWA: 1, DJN: -2, ULS: 0, SUW: -1, CHW: 1, JEJ: -2 };

/** 나이: 신인 19~22, 베테랑 35까지 */
function ageFor(rng: Rng, depth: number) {
  return Math.round(clamp(rng.normal(depth < 5 ? 27 : 25, 3.5), 20, 35));
}

export function createLeague(rng: Rng): League {
  const teams: LeagueTeam[] = TEAM_INFOS.map((info) => {
    const t = generateTeam(rng.fork(info.id.charCodeAt(0) * 31 + info.id.charCodeAt(1)), info, PRO_STRENGTH[info.id] ?? 0);
    t.players.forEach((p, i) => (p.age = ageFor(rng, i)));
    return { info, players: t.players };
  });
  const lastOrder = [...teams].sort((x, y) => teamPower(x) - teamPower(y)).map((t) => t.info.id);
  return { season: 0, teams, games: [], series: [], lastOrder, history: [] };
}

export function teamPower(t: LeagueTeam): number {
  const ovr = t.players.map((p) => overall(p)).sort((a, b) => b - a);
  const w = [32, 30, 30, 30, 30, 22, 17, 12, 8, 4, 2, 2];
  let s = 0;
  let n = 0;
  ovr.forEach((v, i) => {
    s += v * (w[i] ?? 0);
    n += w[i] ?? 0;
  });
  return s / n;
}

export function leagueTeam(L: League, id: string) {
  return L.teams.find((t) => t.info.id === id)!;
}

/** 정규시즌 일정: 9팀과 3번씩 (27경기), 홈·원정 번갈아 */
export function scheduleSeason(L: League, base: number) {
  const ids = L.teams.map((t) => t.info.id);
  const rounds: [string, string][][] = [];
  const list = [...ids];
  for (let r = 0; r < list.length - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < list.length / 2; i++) pairs.push(r % 2 ? [list[list.length - 1 - i], list[i]] : [list[i], list[list.length - 1 - i]]);
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  L.games = [];
  for (let k = 0; k < 3; k++)
    rounds.forEach((pairs, r) => {
      // 올스타 주간은 비운다
      const n = k * 9 + r;
      const week = base + PRO_WEEKS.seasonStart + n + (n >= PRO_WEEKS.allStarBreak ? 1 : 0);
      for (const [a, b] of pairs) L.games.push(k === 1 ? { week, a: b, b: a } : { week, a, b });
    });
  L.series = [];
  L.champion = undefined;
  L.myFinish = undefined;
}

export interface Row {
  id: string;
  w: number;
  l: number;
  pf: number;
  pa: number;
}

export function standings(L: League): Row[] {
  const m = new Map(L.teams.map((t) => [t.info.id, { id: t.info.id, w: 0, l: 0, pf: 0, pa: 0 }]));
  for (const g of L.games) {
    if (!g.score || g.series !== undefined) continue;
    const A = m.get(g.a)!;
    const B = m.get(g.b)!;
    A.pf += g.score[0];
    A.pa += g.score[1];
    B.pf += g.score[1];
    B.pa += g.score[0];
    if (g.score[0] > g.score[1]) {
      A.w++;
      B.l++;
    } else {
      B.w++;
      A.l++;
    }
  }
  return [...m.values()].sort((a, b) => b.w - a.w || b.pf - b.pa - (a.pf - a.pa));
}

/** 리그 팀을 경기 엔진용 Team으로 (출전 순서는 match.ts의 depthChart가 정한다) */
export function asTeam(t: LeagueTeam, players: Player[] = t.players): Team {
  return { ...t.info, players };
}

/** 내 경기가 아닌 경기는 전력 차로 */
export function quickPro(L: League, a: string, b: string, rng: Rng, myTeam?: Team, myId?: string): [number, number] {
  const ta = a === myId && myTeam ? myTeam : asTeam(leagueTeam(L, a));
  const tb = b === myId && myTeam ? myTeam : asTeam(leagueTeam(L, b));
  let margin = Math.round(rng.normal(expectedMargin(ta, tb) + 2, MARGIN_SD * 0.85));
  if (margin === 0) margin = rng.chance(0.5) ? 1 : -1;
  const total = Math.round(rng.normal(162, 14));
  const sa = Math.max(50, Math.round((total + margin) / 2));
  return [sa, Math.max(45, sa - margin)];
}

/** 정규시즌이 끝나면 6강 대진 (3-6, 4-5), 4강은 1·2위가 기다린다 */
export function startPlayoffs(L: League, base: number) {
  const st = standings(L).map((r) => r.id);
  L.series = [
    { round: 0, a: st[2], b: st[5], winsA: 0, winsB: 0 },
    { round: 0, a: st[3], b: st[4], winsA: 0, winsB: 0 },
  ];
  scheduleRound(L, base, 0);
}

function scheduleRound(L: League, base: number, round: number) {
  const def = PRO_WEEKS.playoffs[round];
  L.series.forEach((s, si) => {
    if (s.round !== round) return;
    // 1, 2, 5, 7차전은 상위 시드 홈
    def.weeks.forEach((w, k) => {
      const home = k === 2 || k === 3 || k === 5 ? s.b : s.a;
      L.games.push({ week: base + w, a: home, b: home === s.a ? s.b : s.a, series: si });
    });
  });
}

/** 시리즈 결과를 반영하고, 끝난 시리즈의 남은 경기는 지운다. 라운드가 끝나면 다음 라운드 */
export function updateSeries(L: League, base: number) {
  const st = standings(L).map((r) => r.id);
  for (const [si, s] of L.series.entries()) {
    if (s.winner) continue;
    const need = PRO_WEEKS.playoffs[s.round].wins;
    let wa = 0;
    let wb = 0;
    for (const g of L.games) {
      if (g.series !== si || !g.score) continue;
      const aWon = g.score[0] > g.score[1];
      const winner = aWon ? g.a : g.b;
      if (winner === s.a) wa++;
      else wb++;
    }
    s.winsA = wa;
    s.winsB = wb;
    if (wa >= need || wb >= need) {
      s.winner = wa >= need ? s.a : s.b;
      L.games = L.games.filter((g) => g.series !== si || g.score);
    }
  }
  const rounds = [0, 1, 2];
  for (const r of rounds) {
    const rs = L.series.filter((s) => s.round === r);
    if (!rs.length || rs.some((s) => !s.winner)) continue;
    if (L.series.some((s) => s.round === r + 1)) continue;
    if (r === 0) {
      // 1위 vs 6강 승자 중 낮은 시드, 2위 vs 높은 시드
      const w = rs.map((s) => s.winner!).sort((x, y) => st.indexOf(x) - st.indexOf(y));
      L.series.push({ round: 1, a: st[0], b: w[1], winsA: 0, winsB: 0 }, { round: 1, a: st[1], b: w[0], winsA: 0, winsB: 0 });
      scheduleRound(L, base, 1);
    } else if (r === 1) {
      const w = rs.map((s) => s.winner!).sort((x, y) => st.indexOf(x) - st.indexOf(y));
      L.series.push({ round: 2, a: w[0], b: w[1], winsA: 0, winsB: 0 });
      scheduleRound(L, base, 2);
    } else {
      L.champion = rs[0].winner;
    }
  }
}

/** 내 팀 시즌 성적 한 줄 */
export function finishOf(L: League, myId: string): string {
  if (L.champion === myId) return '우승';
  const mine = L.series.filter((s) => s.a === myId || s.b === myId);
  if (!mine.length) {
    if (!L.series.length) return '정규시즌 중';
    return '플레이오프 탈락';
  }
  const last = mine[mine.length - 1];
  if (!last.winner) return `${PRO_WEEKS.playoffs[last.round].name} 진행 중`;
  if (last.winner === myId) return last.round === 2 ? '우승' : `${PRO_WEEKS.playoffs[last.round].name} 진출`;
  return last.round === 2 ? '준우승' : last.round === 1 ? '4강' : '6강';
}

// ───────────── 비시즌: 나이·성장·은퇴·신인 ─────────────

/** 나이에 따른 한 해 변화 (능력치 평균, 피지컬은 더 빨리 늙는다) */
export function ageDelta(age: number) {
  return age <= 21 ? 3 : age <= 23 ? 2.2 : age <= 26 ? 1 : age <= 29 ? 0 : age <= 31 ? -1.2 : age <= 33 ? -2.2 : -3.5;
}

export function agePlayer(p: Player, rng: Rng) {
  const age = p.age ?? 25;
  const d = ageDelta(age);
  for (const g of RATING_GROUPS) {
    const mult = g.key === 'physical' && d < 0 ? 1.6 : g.key === 'mental' ? (d < 0 ? 0.3 : 0.8) + 0.4 : 1;
    for (const [k] of g.items) p.r[k] = Math.round(clamp(p.r[k] + rng.normal(d * mult, 1.2), 10, 95));
  }
  p.age = age + 1;
}

/** 은퇴, 신인으로 빈자리 채우기, 몇 명은 다른 팀으로 */
export function offseason(L: League, rng: Rng, rookies: Player[]): string[] {
  const notes: string[] = [];
  for (const t of L.teams) {
    for (const p of t.players) if (p.id !== 'rival') agePlayer(p, rng);
    const before = t.players.length;
    t.players = t.players.filter((p) => {
      const age = p.age ?? 25;
      const pr = age >= 33 ? 0.25 + (age - 33) * 0.2 : overall(p) < 38 && age >= 28 ? 0.4 : 0;
      return p.id === 'rival' || !rng.chance(pr);
    });
    if (before - t.players.length >= 2) notes.push(`${t.info.city} ${t.info.name}: 베테랑 ${before - t.players.length}명 은퇴`);
  }
  // 드래프트: 지난 시즌 꼴찌부터 한 명씩 (2라운드)
  L.rookies = rookies.map((p) => p.id);
  const pool = [...rookies].sort((a, b) => overall(b) - overall(a));
  for (let round = 0; round < 2; round++)
    for (const id of L.lastOrder) {
      const t = leagueTeam(L, id);
      if (!pool.length || t.players.length >= 13) continue;
      t.players.push(pool.shift()!);
    }
  // 자리가 모자라면 무명 선수로 채운다
  for (const t of L.teams) {
    while (t.players.length < 12) {
      const need = POSITIONS.find((pos) => t.players.filter((p) => p.pos === pos).length < 2) ?? 'SF';
      const p = generatePlayer(rng, need as Position, -6 + rng.normal(0, 2), freeNumber(t, rng));
      p.age = rng.int(22, 27);
      t.players.push(p);
    }
  }
  // 이적: 리그에서 3명 정도 자리를 바꾼다
  for (let k = 0; k < 3; k++) {
    const a = rng.pick(L.teams);
    const b = rng.pick(L.teams.filter((t) => t !== a));
    const ia = rng.int(5, a.players.length - 1);
    const ib = rng.int(5, b.players.length - 1);
    const pa = a.players[ia];
    const pb = b.players[ib];
    if (!pa || !pb || pa.id === 'rival' || pb.id === 'rival') continue;
    a.players[ia] = pb;
    b.players[ib] = pa;
    if (a.players.some((p, i) => i !== ia && p.number === pb.number)) pb.number = freeNumber(a, rng);
    if (b.players.some((p, i) => i !== ib && p.number === pa.number)) pa.number = freeNumber(b, rng);
  }
  return notes;
}

export function freeNumber(t: LeagueTeam, rng: Rng, extra: number[] = []) {
  const used = new Set([...t.players.map((p) => p.number), ...extra]);
  let n = rng.int(0, 99);
  while (used.has(n)) n = rng.int(0, 99);
  return n;
}

/** 드래프트에 나오는 다른 신인들 */
export function draftClass(rng: Rng, n: number): Player[] {
  const out: Player[] = [];
  for (let i = 0; i < n; i++) {
    const pos = POSITIONS[i % 5];
    const p = generatePlayer(rng, pos, -8 - i * 0.5 + rng.normal(0, 3), rng.int(0, 99), { heightAdj: -1 });
    p.age = rng.chance(0.4) ? 19 : 22;
    out.push(p);
  }
  return out;
}
