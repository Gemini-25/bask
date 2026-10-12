// 프로 시즌 진행: 한 주의 경기, 플레이오프, 시즌 끝, 재계약
import { Rng } from '../core/rng';
import { overall } from '../data/player';
import { dateOf, WEEKS_PER_YEAR, type Career, type PendingGame } from './career';
import { agePlayer, draftClass, finishOf, leagueTeam, offseason, PRO_WEEKS, quickPro, scheduleSeason, standings, startPlayoffs, updateSeries, type League, type ProGame } from './league';
import { myTeam } from './match';
import { grantTrophies, seasonAwards, synthLines } from './awards';
import { offerFor } from './money';
import { withRival } from './people';
import { devFlags, homecomingOffers, idleSeason, joinTeam, moveLeague, overseasOffer } from './overseas';
import { RETIRE_FORCE_AGE, RETIRE_MIN_AGE } from './legacy';

export function leagueTeamName(c: Career) {
  if (!c.pro || !c.league) return '';
  const t = leagueTeam(c.league, c.pro.team).info;
  return `${t.city} ${t.name}`;
}

export function teamName(L: League, id: string) {
  const t = leagueTeam(L, id).info;
  return `${t.city} ${t.name}`;
}

/** 이번 시즌 시작 주 */
export function seasonBase(c: Career) {
  return Math.floor(c.week / WEEKS_PER_YEAR) * WEEKS_PER_YEAR;
}

function gameLabel(L: League, g: ProGame, base: number) {
  if (g.series !== undefined) {
    const s = L.series[g.series];
    const n = L.games.filter((x) => x.series === g.series && L.games.indexOf(x) <= L.games.indexOf(g)).length;
    return `${PRO_WEEKS.playoffs[s.round].name} ${n}차전`;
  }
  const n = L.games.filter((x) => x.series === undefined && x.week <= g.week && x.week >= base).length / 5;
  return `정규시즌 ${Math.ceil(n)}라운드`;
}

/** 이 주의 남의 경기를 치르고, 내 경기를 줄 세운다 */
export function proWeek(c: Career, week: number, rng: Rng): PendingGame[] {
  const L = c.league!;
  const me = c.pro!.team;
  const base = seasonBase({ ...c, week } as Career);
  const mine = myTeam(c, true).team;
  // 시리즈가 일찍 끝나면 남은 경기가 지워지니 하나씩 다시 찾는다
  for (let guard = 0; guard < 40; guard++) {
    const g = L.games.find((x) => x.week === week && !x.score && x.a !== me && x.b !== me);
    if (!g) break;
    g.score = quickPro(L, g.a, g.b, rng, mine, me);
    if (g.series === undefined) {
      synthLines(L, withRival(c, g.a, leagueTeam(L, g.a).players), g.a, g.score[0], rng);
      synthLines(L, withRival(c, g.b, leagueTeam(L, g.b).players), g.b, g.score[1], rng);
    }
    updateSeries(L, base);
  }
  settle(c, week);
  const out: PendingGame[] = [];
  for (const g of L.games.filter((x) => x.week === week && !x.score && (x.a === me || x.b === me))) {
    out.push({ kind: 'official', pro: true, opponent: g.a === me ? g.b : g.a, label: gameLabel(L, g, base), home: g.a === me });
  }
  // 프리시즌 연습경기
  const w = week - base;
  if (!out.length && PRO_WEEKS.preseason.includes(w)) {
    const opp = rng.pick(L.teams.filter((t) => t.info.id !== me)).info.id;
    out.push({ kind: 'practice', pro: true, opponent: opp, label: '프리시즌 연습경기', home: rng.chance(0.5) });
  }
  return out;
}

/** 정규시즌이 끝났으면 플레이오프를 연다 */
function settle(c: Career, week: number) {
  const L = c.league!;
  const base = seasonBase({ ...c, week } as Career);
  const regular = L.games.filter((g) => g.series === undefined && g.week >= base && g.week < base + WEEKS_PER_YEAR);
  if (!L.series.length && regular.length && regular.every((g) => g.score)) startPlayoffs(L, base);
  updateSeries(L, base);
  L.myFinish = finishOf(L, c.pro!.team);
}

/** 내 경기 결과를 리그에 적는다. 연습경기는 기록 안 함. 시리즈·우승 소식을 돌려준다 */
export function recordProGame(c: Career, week: number, a: string, b: string, score: [number, number], practice: boolean): string | undefined {
  if (practice) return undefined;
  const L = c.league!;
  const g = L.games.find((x) => x.week === week && x.a === a && x.b === b && !x.score);
  if (!g) return undefined;
  g.score = score;
  const before = L.series.map((s) => s.winner);
  settle(c, week);
  if (g.series === undefined) return undefined;
  const s = L.series[g.series];
  const me = c.pro!.team;
  if (s.winner && !before[g.series]) {
    if (L.champion === me) {
      c.trust = Math.min(100, c.trust + 5);
      c.popularity = Math.min(100, (c.popularity ?? 0) + 8);
      return '챔피언 결정전 우승! 리그 정상에 올랐다!';
    }
    return s.winner === me ? `${PRO_WEEKS.playoffs[s.round].name} 통과!` : `${PRO_WEEKS.playoffs[s.round].name}에서 탈락했다.`;
  }
  const mineA = s.a === me;
  return `시리즈 ${mineA ? s.winsA : s.winsB}승 ${mineA ? s.winsB : s.winsA}패`;
}

/** 다음 내 경기 (화면 안내) */
export function nextProGame(c: Career): { week: number; label: string; opponent?: string } | null {
  const L = c.league;
  if (!L || !c.pro) return null;
  const me = c.pro.team;
  const base = seasonBase(c);
  const g = L.games.filter((x) => !x.score && x.week >= c.week && (x.a === me || x.b === me)).sort((x, y) => x.week - y.week)[0];
  const pre = PRO_WEEKS.preseason.map((w) => base + w).find((w) => w >= c.week);
  if (pre !== undefined && (!g || pre < g.week)) return { week: pre, label: '프리시즌 연습경기' };
  if (g) return { week: g.week, label: gameLabel(L, g, base), opponent: g.a === me ? g.b : g.a };
  return null;
}

/** 시즌이 끝나고 새 시즌: 기록, 나이, 은퇴·신인, 계약 */
export function proNewYear(c: Career): string[] {
  const L = c.league!;
  const rng = Rng.fromState(c.rng);
  const notes: string[] = [];
  const finish = finishOf(L, c.pro!.team);
  L.history.push({ season: L.season, champion: L.champion ?? '', myFinish: finish });
  notes.push(`시즌 끝! 내 팀 성적: ${finish}${L.champion ? ` · 우승 ${teamName(L, L.champion)}` : ''}`);
  // 시상식
  const wins = Object.fromEntries(standings(L).map((r) => [r.id, r.w]));
  const aw = seasonAwards(L, c.overseas ? '해외 리그' : 'BASK 리그', L.rookies ?? [], wins);
  (L.awards ??= []).push(aw);
  const prefix = `${c.overseas ? '해외 ' : ''}${L.season + 1}시즌`;
  const mine = grantTrophies(c, aw, prefix);
  if (L.champion === c.pro!.team) c.trophies.push(`${prefix} 우승`);
  c.ceremony = aw;
  if (mine.length) notes.push(`수상: ${mine.join(', ')}`);
  L.stats = {};
  L.lastOrder = standings(L)
    .map((r) => r.id)
    .reverse();
  notes.push(...offseason(L, rng, draftClass(rng, 20)));
  L.season++;
  c.pro!.season++;
  // 나도 나이를 먹는다 (서른이 넘으면 몸이 먼저 늙는다)
  c.me.age = (c.me.age ?? 19) + 1;
  if ((c.me.age ?? 0) >= 30) {
    const copy = { ...c.me, r: { ...c.me.r } };
    agePlayer(copy, rng);
    for (const k of ['speed', 'accel', 'jump', 'agility', 'stamina'] as const) c.me.r[k] = Math.min(c.me.r[k], copy.r[k]);
    notes.push('몸이 예전 같지 않다. 스피드와 점프가 조금 줄었다.');
  }
  if (c.rival) agePlayer(c.rival.player, rng);
  // 내가 없는 리그도 한 해가 간다
  for (const other of [c.homeLeague, c.abroadLeague]) if (other) idleSeason(other, rng);
  c.allStar = null;
  c.pro!.years--;
  if ((c.me.age ?? 0) >= RETIRE_FORCE_AGE) c.retirePending = 'forced';
  else if (c.pro!.years <= 0) {
    c.contractPending = true;
    // 계약이 끝났는데 나이가 찼으면 은퇴할지 먼저 묻는다
    if ((c.me.age ?? 0) >= RETIRE_MIN_AGE) c.retirePending = 'choice';
  }
  // 새 시즌 팀원과 친밀도
  const t = leagueTeam(L, c.pro!.team);
  for (const p of t.players) c.friends[p.id] ??= 25;
  scheduleSeason(L, seasonBase(c));
  c.rng = rng.state;
  return notes;
}

export interface Offer {
  team: string;
  salary: number;
  years: number;
  /** 해외 리그 팀 */
  abroad?: boolean;
  /** 해외에서 국내로 돌아오는 제안 */
  home?: boolean;
}

/** 재계약 제안: 지금 팀 + 다른 팀 두 곳 (FA) + 해외 진출이나 국내 복귀 */
export function contractOffers(c: Career): { mine: Offer; others: Offer[]; abroad: Offer[] } {
  const rng = Rng.fromState(c.rng);
  const ovr = overall(c.me, c.prefPos);
  const base = offerFor(ovr, c.popularity ?? 0) * (c.overseas ? 1.6 : 1);
  // 서른 넘으면 계약 기간이 짧아진다
  const age = c.me.age ?? 25;
  const yrs = (n: number) => Math.max(1, age >= 33 ? Math.min(n, 1) : age >= 30 ? Math.min(n, 2) : n);
  const mine = { team: c.pro!.team, salary: Math.round(base * (0.9 + c.trust / 500)), years: yrs(3) };
  const others = c
    .league!.teams.filter((t) => t.info.id !== c.pro!.team)
    .map((t) => ({ t, k: rng.next() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 2)
    .map(({ t }) => ({ team: t.info.id, salary: Math.round((base * rng.range(0.85, 1.2)) / 100) * 100, years: yrs(rng.pick([2, 3, 4])) }));
  const abroad = c.overseas ? homecomingOffers(c, offerFor(ovr, c.popularity ?? 0), rng) : [overseasOffer(c, base, rng)].filter((o): o is Offer => !!o);
  return { mine, others, abroad: abroad.map((o) => ({ ...o, years: yrs(o.years) })) };
}

export function signContract(c: Career, o: Offer) {
  devFlags.forceAbroad = false;
  if (o.abroad || o.home) moveLeague(c, !!o.abroad, seasonBase(c));
  if (c.pro!.team !== o.team || o.abroad || o.home) {
    joinTeam(c, o.team);
    c.teamHistory.push({ team: o.team, name: teamName(c.league!, o.team), season: c.pro!.season });
  }
  c.pro!.salary = o.salary;
  c.pro!.years = o.years;
  c.contractPending = false;
}

export function isPro(c: Career) {
  return !!c.pro && dateOf(c.week).year >= 3;
}
