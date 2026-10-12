// 올스타 위크엔드 (L6, L8)와 국가대표 (L7)
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { dunkList } from '../data/dunks';
import { generateTeam, type Team, type TeamInfo } from '../data/teams';
import { overall, type Player } from '../data/player';
import type { DunkStyle } from '../sim/types';
import type { Career, PendingGame } from './career';
import { depthChart } from './match';
import type { League } from './league';
import { withRival } from './people';

/** 시즌 시작 주에서 몇 주 뒤 (정규시즌 한가운데, 이 주는 경기가 없다) */
export const ALLSTAR_WEEK = 27;
/** 국가대표 소집 (비시즌), 조별리그 3경기, 결승 */
export const NATIONAL_CALL = 3;
export const NATIONAL_WEEKS = [4, 5, 6];

const STAR_TACTICS = { pace: 0.95, pnr: 0.3, iso: 0.4, post: 0.1, motion: 0.3, pindown: 0.2, dho: 0.1, zone: 0, zoneType: '23' as const, press: 0, switch: 0.6, double: 0 };
export const DREAM: TeamInfo = { id: 'DRM', city: '올스타', name: '드림팀', short: '드림', color: '#ffb545', color2: '#1d1406', tactics: STAR_TACTICS };
export const MAGIC: TeamInfo = { id: 'MGC', city: '올스타', name: '매직팀', short: '매직', color: '#5fb4ff', color2: '#0f2733', tactics: STAR_TACTICS };

export interface ContestRound {
  score: number;
  /** 3점: 25개 슛 결과 ('1' 성공, '2' 머니볼 성공, '0' 실패) */
  shots?: string;
  /** 덩크: 시도한 덩크와 심사위원 다섯 명 점수 */
  dunk?: DunkStyle;
  judges?: number[];
}

export interface ContestRow {
  id: string;
  name: string;
  team: string;
  rounds: ContestRound[];
}

export interface AllStarWeekend {
  season: number;
  dream: string[];
  magic: string[];
  /** 내가 뽑혔으면 어느 팀 (0 드림, 1 매직) */
  mySide: -1 | 0 | 1;
  three: ContestRow[];
  dunk: ContestRow[];
  threeWinner: string;
  dunkWinner: string;
  notes: string[];
  /** 아직 화면으로 안 봤다 */
  unseen: boolean;
  /** 올스타전 결과 */
  game?: { score: [number, number]; mvp: string };
}

/** 리그 선수 전부 (+ 나, 라이벌) */
export function everyone(c: Career, L: League = c.league!): { p: Player; team: string }[] {
  const out: { p: Player; team: string }[] = [];
  for (const t of L.teams) for (const p of withRival(c, t.info.id, t.players)) if (p.id !== 'me') out.push({ p, team: t.info.id });
  if (L === c.league) out.push({ p: c.me, team: c.pro!.team });
  return out;
}

const ovrOf = (c: Career, p: Player) => overall(p, p.id === 'me' ? c.prefPos : p.pos);

function starScore(c: Career, p: Player) {
  const s = c.league!.stats?.[p.id];
  const ppg = s ? s.pts / Math.max(1, s.g) : 0;
  const pop = p.id === 'me' ? (c.popularity ?? 0) * 0.06 : 0;
  return ovrOf(c, p) + ppg * 0.4 + pop;
}

function threeRound(rng: Rng, p: Player): ContestRound {
  const pr = clamp(0.3 + (Math.min(p.r.three, 80) - 50) * 0.009 + Math.max(0, p.r.three - 80) * 0.004 + (p.r.composure - 60) * 0.001, 0.2, 0.75);
  let shots = '';
  let score = 0;
  for (let rack = 0; rack < 5; rack++)
    for (let b = 0; b < 5; b++) {
      // 랙의 마지막 공은 머니볼 (2점)
      const made = rng.chance(pr - (b === 4 ? 0.03 : 0));
      shots += made ? (b === 4 ? '2' : '1') : '0';
      if (made) score += b === 4 ? 2 : 1;
    }
  return { score, shots };
}

function dunkRound(rng: Rng, p: Player, used: DunkStyle[]): ContestRound {
  const list = dunkList(p);
  // 아직 안 보여준 가장 화려한 덩크부터
  const fresh = list.filter((d) => !used.includes(d));
  const from = fresh.length ? fresh : list;
  const style = from[Math.max(0, from.length - 1 - rng.int(0, 1))];
  const flair = list.indexOf(style) * 0.35 + (p.r.jump - 60) * 0.03 + (p.r.dunk - 60) * 0.02;
  const repeat = used.includes(style) ? -0.8 : 0;
  const judges = Array.from({ length: 5 }, () => Math.round(clamp(7.2 + flair + repeat + rng.normal(0, 0.8), 5, 10)));
  return { score: judges.reduce((a, b) => a + b, 0), dunk: style, judges };
}

export function runAllStar(c: Career, rng: Rng): AllStarWeekend {
  const all = everyone(c);
  const ranked = [...all].sort((a, b) => starScore(c, b.p) - starScore(c, a.p)).slice(0, 24);
  const dream: string[] = [];
  const magic: string[] = [];
  // 1·4·5·8 ... 순서로 나눠서 두 팀 힘을 맞춘다
  ranked.forEach((x, i) => (i % 4 === 0 || i % 4 === 3 ? dream : magic).push(x.p.id));
  const mySide = dream.includes('me') ? 0 : magic.includes('me') ? 1 : -1;
  const season = c.league!.season + 1;
  const tag = `${c.overseas ? '해외 ' : ''}${season}시즌`;
  const notes: string[] = [];
  if (mySide >= 0) {
    notes.push(`올스타에 뽑혔다! (${mySide === 0 ? '드림팀' : '매직팀'})`);
    c.trophies.push(`${tag} 올스타`);
    c.popularity = Math.min(100, (c.popularity ?? 0) + 3);
  }

  // 3점 콘테스트: 3점 능력 상위 6명, 상위 3명 결승
  const byId = new Map(all.map((x) => [x.p.id, x]));
  const shooters = [...all].sort((a, b) => b.p.r.three - a.p.r.three).slice(0, 6);
  const three: ContestRow[] = shooters.map((x) => ({ id: x.p.id, name: x.p.name, team: x.team, rounds: [threeRound(rng, x.p)] }));
  for (const r of [...three].sort((a, b) => b.rounds[0].score - a.rounds[0].score).slice(0, 3)) r.rounds.push(threeRound(rng, byId.get(r.id)!.p));
  const threeWin = three.filter((r) => r.rounds.length === 2).sort((a, b) => b.rounds[1].score - a.rounds[1].score || b.rounds[0].score - a.rounds[0].score)[0];

  // 덩크 콘테스트: 덩크가 화려한 4명, 2번씩, 상위 2명 결승
  const flash = (p: Player) => dunkList(p).length * 10 + p.r.dunk + p.r.jump;
  const dunkers = [...all].sort((a, b) => flash(b.p) - flash(a.p)).slice(0, 4);
  const dunk: ContestRow[] = dunkers.map((x) => {
    const a = dunkRound(rng, x.p, []);
    const b = dunkRound(rng, x.p, [a.dunk!]);
    return { id: x.p.id, name: x.p.name, team: x.team, rounds: [a, b] };
  });
  const sum2 = (r: ContestRow) => r.rounds[0].score + r.rounds[1].score;
  for (const r of [...dunk].sort((a, b) => sum2(b) - sum2(a)).slice(0, 2))
    r.rounds.push(
      dunkRound(
        rng,
        byId.get(r.id)!.p,
        r.rounds.map((x) => x.dunk!),
      ),
    );
  const dunkWin = dunk.filter((r) => r.rounds.length === 3).sort((a, b) => b.rounds[2].score - a.rounds[2].score || sum2(b) - sum2(a))[0];

  for (const [w, rows, label] of [
    [threeWin, three, '3점 콘테스트'],
    [dunkWin, dunk, '덩크 콘테스트'],
  ] as const) {
    if (w.id === 'me') {
      c.trophies.push(`${tag} ${label} 우승`);
      c.popularity = Math.min(100, (c.popularity ?? 0) + 5);
      c.money += 1000;
      notes.push(`${label} 우승! 상금 1000만 원`);
    } else if (rows.some((r) => r.id === 'me')) notes.push(`${label}에 나갔다.`);
  }
  return { season, dream, magic, mySide: mySide as -1 | 0 | 1, three, dunk, threeWinner: threeWin.name, dunkWinner: dunkWin.name, notes, unseen: true };
}

/** 올스타전 두 팀 (나는 경기 컨디션이 반영된 선수로) */
export function allStarTeam(c: Career, id: string, me: Player): Team {
  const w = c.allStar!;
  const pool = new Map(everyone(c).map((x) => [x.p.id, x.p.id === 'me' ? me : x.p]));
  const info = id === DREAM.id ? DREAM : MAGIC;
  const ids = id === DREAM.id ? w.dream : w.magic;
  return { ...info, players: depthChart(ids.map((x) => pool.get(x)!).filter(Boolean), (p) => (p.id === 'me' ? c.prefPos : p.pos)) };
}

export function allStarGame(c: Career): PendingGame | null {
  const w = c.allStar;
  if (!w || w.mySide < 0) return null;
  return { kind: 'practice', pro: true, special: 'allstar', opponent: w.mySide === 0 ? MAGIC.id : DREAM.id, label: `${c.overseas ? '해외 리그' : 'BASK'} 올스타전`, home: w.mySide === 0 };
}

// ───────────── 국가대표 ─────────────

export const NATIONS: (TeamInfo & { strength: number })[] = [
  { id: 'AUS', city: '', name: '호주', short: '호주', color: '#2f8a5a', color2: '#ffd23f', strength: 9, tactics: { ...STAR_TACTICS, pace: 0.6, zone: 0.1 } },
  { id: 'IRN', city: '', name: '이란', short: '이란', color: '#f7f2e8', color2: '#2f8a5a', strength: 4, tactics: { ...STAR_TACTICS, pace: 0.5, post: 0.3 } },
  { id: 'JPN', city: '', name: '일본', short: '일본', color: '#e0473d', color2: '#f7f2e8', strength: 4, tactics: { ...STAR_TACTICS, pace: 0.8, press: 0.2 } },
  { id: 'CHN', city: '', name: '중국', short: '중국', color: '#d6413a', color2: '#ffd23f', strength: 5, tactics: { ...STAR_TACTICS, pace: 0.5, post: 0.35 } },
  { id: 'PHI', city: '', name: '필리핀', short: '필리핀', color: '#3d6fd6', color2: '#e0473d', strength: 3, tactics: { ...STAR_TACTICS, pace: 0.85 } },
  { id: 'NZL', city: '', name: '뉴질랜드', short: '뉴질랜드', color: '#1b1b1b', color2: '#e9ecf3', strength: 6, tactics: { ...STAR_TACTICS, pace: 0.6 } },
];
export const KOREA: TeamInfo = { id: 'KOR', city: '', name: '대한민국', short: '한국', color: '#f2f4f8', color2: '#d6413a', tactics: { ...STAR_TACTICS, pace: 0.6, switch: 0.4 } };

export interface NationalCamp {
  season: number;
  /** 대표팀 12명 (리그 선수 id, 나는 'me') */
  squad: string[];
  games: { week: number; opp: string; score?: [number, number]; final?: boolean }[];
  result?: string;
}

/** 국내 리그 최고 12명 (해외에서 뛰면 나는 무조건 뽑힌다) */
export function callUp(c: Career, base: number, rng: Rng): NationalCamp | null {
  const home = c.homeLeague ?? c.league!;
  const pool = everyone(c, home).filter((x) => x.p.id !== 'me');
  pool.push({ p: c.me, team: c.pro!.team });
  const v = (p: Player) => ovrOf(c, p) + (p.id === 'me' && c.overseas ? 50 : 0);
  const squad = pool
    .sort((a, b) => v(b.p) - v(a.p))
    .slice(0, 12)
    .map((x) => x.p.id);
  if (!squad.includes('me') || c.injury) return null;
  const opps = NATIONS.filter((n) => n.id !== 'AUS')
    .map((n) => ({ n, k: rng.next() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 3)
    .map((x) => x.n);
  return { season: c.league!.season, squad, games: opps.map((o, i) => ({ week: base + NATIONAL_WEEKS[i], opp: o.id })) };
}

export function isNation(id: string) {
  return id === KOREA.id || NATIONS.some((n) => n.id === id);
}

export function nationTeam(c: Career, id: string): Team {
  const n = NATIONS.find((x) => x.id === id)!;
  const rng = new Rng((c.seed ^ Math.imul(id.charCodeAt(0) * 131 + id.charCodeAt(1), 2654435761) ^ ((c.league?.season ?? 0) * 7919)) >>> 0);
  return generateTeam(rng, n, n.strength);
}

export function koreaTeam(c: Career, me: Player): Team {
  const camp = c.national!;
  const home = c.homeLeague ?? c.league!;
  const pool = new Map(everyone(c, home).map((x) => [x.p.id, x.p]));
  pool.set('me', me);
  return { ...KOREA, players: depthChart(camp.squad.map((id) => pool.get(id)!).filter(Boolean), (p) => (p.id === 'me' ? c.prefPos : p.pos)) };
}

export function nationalGames(c: Career, week: number): PendingGame[] {
  const camp = c.national;
  if (!camp) return [];
  return camp.games
    .filter((g) => g.week === week && !g.score)
    .map((g) => ({ kind: 'official' as const, pro: true, special: 'national' as const, opponent: g.opp, label: `아시아컵 ${g.final ? '결승' : '조별리그'}`, home: true }));
}

/** 국가대표 경기 결과. 조별 2승 이상이면 결승 */
export function recordNational(c: Career, week: number, opp: string, score: [number, number]): string | undefined {
  const camp = c.national;
  if (!camp) return;
  const g = camp.games.find((x) => x.week === week && x.opp === opp && !x.score);
  if (!g) return;
  g.score = score;
  const group = camp.games.filter((x) => !x.final);
  if (g.final) {
    camp.result = score[0] > score[1] ? '우승' : '준우승';
    if (camp.result === '우승') {
      c.trophies.push(`${camp.season + 1}시즌 아시아컵 우승 (국가대표)`);
      c.popularity = Math.min(100, (c.popularity ?? 0) + 10);
      return '아시아컵 우승! 태극기를 들고 코트를 돌았다!';
    }
    c.trophies.push(`${camp.season + 1}시즌 아시아컵 준우승 (국가대표)`);
    return '아시아컵 준우승. 결승에서 아쉽게 졌다.';
  }
  if (group.every((x) => x.score)) {
    const wins = group.filter((x) => x.score![0] > x.score![1]).length;
    if (wins >= 2) {
      // 결승 상대는 다른 조 1위 (보통 호주)
      const finalOpp = NATIONS.filter((n) => !group.some((x) => x.opp === n.id)).sort((a, b) => b.strength - a.strength)[0];
      camp.games.push({ week: week + 1, opp: finalOpp.id, final: true });
      return `조별리그 ${wins}승! 결승 진출`;
    }
    camp.result = '조별리그 탈락';
    return `조별리그 ${wins}승. 아쉽게 탈락했다.`;
  }
  const w = group.filter((x) => x.score && x.score[0] > x.score[1]).length;
  const l = group.filter((x) => x.score && x.score[0] < x.score[1]).length;
  return `조별리그 ${w}승 ${l}패`;
}
