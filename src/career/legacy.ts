// 은퇴, 명예의 전당, 영구결번, 2세 (L10~L12), 업적 (K6)
import { overall, type Player } from '../data/player';
import { ITEMS } from './money';
import { WEEKS_PER_YEAR, type Career, type GameRecord } from './career';

/** 은퇴를 고를 수 있는 나이, 무조건 은퇴하는 나이 */
export const RETIRE_MIN_AGE = 31;
export const RETIRE_FORCE_AGE = 39;
/** 명예의 전당 점수 기준 */
export const HOF_SCORE = 100;

export interface RetireSummary {
  name: string;
  number: number;
  pos: string;
  age: number;
  seasons: number;
  peakOvr: number;
  games: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  hsGames: number;
  trophies: string[];
  hofScore: number;
  hof: boolean;
  /** 영구결번한 팀 이름과 id */
  retiredBy: string | null;
  retiredTeam?: string;
  teams: string[];
  money: number;
  player: Player;
  /** 마지막 팀 색 */
  color: string;
  gender: Career['gender'];
  retiredAt: number;
  /** 개발자 패널을 쓴 커리어 */
  dev?: boolean;
}


/** 프로 공식 기록 (정규시즌 + 플레이오프, 국가대표 제외) */
export function proGames(c: Career): GameRecord[] {
  const from = (c.proFromYear ?? 3) * WEEKS_PER_YEAR;
  return c.games.filter((g) => g.week >= from && g.kind === 'official' && !g.label.startsWith('아시아컵'));
}

const TROPHY_POINTS: [RegExp, number][] = [
  [/올스타전 MVP/, 1],
  [/MVP/, 12],
  [/시즌 우승$/, 6],
  [/신인왕/, 3],
  [/득점왕|리바운드왕|어시스트왕|수비상/, 3],
  [/베스트 5/, 3],
  [/올스타$/, 2],
  [/아시아컵 우승/, 4],
  [/아시아컵 준우승/, 1],
  [/콘테스트 우승/, 1],
  [/고교 .*우승/, 0.5],
  [/대학 .*우승/, 1],
];

export function trophyPoints(t: string) {
  for (const [re, v] of TROPHY_POINTS) if (re.test(t)) return v * (t.startsWith('해외') ? 1.5 : 1);
  return 0;
}

export function hofScore(c: Career) {
  const g = proGames(c);
  const pts = g.reduce((s, x) => s + (x.line?.pts ?? 0), 0);
  return Math.round(c.trophies.reduce((s, t) => s + trophyPoints(t), 0) + pts / 500);
}

export function canRetire(c: Career) {
  return !!c.pro && (c.me.age ?? 0) >= RETIRE_MIN_AGE;
}

export function retire(c: Career, teamName: (id: string) => string, teamColor: (id: string) => string): RetireSummary {
  const g = proGames(c);
  const sum = (k: 'pts' | 'reb' | 'ast' | 'stl' | 'blk') => g.reduce((s, x) => s + (x.line?.[k] ?? 0), 0);
  const score = hofScore(c);
  const hof = score >= HOF_SCORE;
  // 한 팀에서 5시즌 이상 뛰었거나 명예의 전당이면 그 팀이 번호를 영구결번
  const hist = c.teamHistory ?? [];
  const lastTeam = c.pro?.team ?? '';
  const stint = (() => {
    const mine = hist.filter((h) => h.team === lastTeam);
    if (!mine.length) return 0;
    return (c.pro?.season ?? 0) - mine[mine.length - 1].season + 1;
  })();
  const retiredBy = c.pro && (stint >= 5 || hof) ? teamName(lastTeam) : null;
  const s: RetireSummary = {
    name: c.me.name,
    number: c.me.number,
    pos: c.prefPos,
    age: c.me.age ?? 0,
    seasons: (c.pro?.season ?? 0) + 1,
    peakOvr: Math.round(Math.max(c.peakOvr ?? 0, overall(c.me, c.prefPos))),
    games: g.length,
    pts: sum('pts'),
    reb: sum('reb'),
    ast: sum('ast'),
    stl: sum('stl'),
    blk: sum('blk'),
    hsGames: c.games.filter((x) => x.week < (c.proFromYear ?? 3) * WEEKS_PER_YEAR && x.line).length,
    trophies: [...c.trophies],
    hofScore: score,
    hof,
    retiredBy,
    retiredTeam: retiredBy ? lastTeam : undefined,
    teams: [...new Set(hist.map((h) => h.name))],
    money: c.money,
    player: JSON.parse(JSON.stringify(c.me)) as Player,
    color: teamColor(lastTeam),
    gender: c.gender,
    retiredAt: c.week,
    dev: !!c.dev,
  };
  c.retired = s;
  return s;
}

/** 2세 보너스: 부모 기록이 좋을수록 자유 포인트·잠재력·용돈이 많다 */
export interface LegacyBonus {
  parent: string;
  points: number;
  potential: number;
  money: number;
  generation: number;
}

export function legacyBonus(s: RetireSummary, generation = 1): LegacyBonus {
  return {
    parent: s.name,
    points: Math.min(30, 6 + Math.round(s.hofScore / 3)),
    potential: s.hof ? 4 : 2,
    money: Math.min(20000, Math.round(s.money * 0.1)),
    generation: generation + 1,
  };
}

// ───────────── 브라우저 전체에 남는 기록 (명예의 전당, 업적) ─────────────

const HALL_KEY = 'bask.hall';
const ACH_KEY = 'bask.ach';

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, v: unknown) {
  try {
    store()?.setItem(key, JSON.stringify(v));
  } catch {
    // 저장 공간이 없으면 넘어간다
  }
}

/** 은퇴한 선수 전부 (명예의 전당은 hof) */
export function hallOfFame(): RetireSummary[] {
  return readJson<RetireSummary[]>(HALL_KEY, []);
}

export function enshrine(s: RetireSummary) {
  const list = hallOfFame().filter((x) => !(x.name === s.name && x.retiredAt === s.retiredAt));
  list.push(s);
  writeJson(HALL_KEY, list.slice(-50));
}

export interface Achievement {
  id: string;
  label: string;
  desc: string;
  test: (c: Career) => boolean;
}

const has = (c: Career, re: RegExp) => c.trophies.some((t) => re.test(t));
const best = (c: Career, f: (g: GameRecord) => boolean) => c.games.some((g) => g.line && f(g));
const doubles = (g: GameRecord) => [g.line!.pts, g.line!.reb, g.line!.ast, g.line!.stl, g.line!.blk].filter((v) => v >= 10).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'firstWin', label: '첫 승리', desc: '경기에서 처음 이겼다', test: (c) => c.games.some((g) => g.won && g.line) },
  { id: 'firstStart', label: '주전 데뷔', desc: '처음으로 선발 출전했다', test: (c) => c.games.some((g) => g.started) },
  { id: 'hsTitle', label: '고교 정상', desc: '고교 대회에서 우승했다', test: (c) => has(c, /고교 .*우승/) },
  { id: 'college', label: '대학 정상', desc: '대학 대회에서 우승했다', test: (c) => has(c, /대학 .*우승/) },
  { id: 'pts30', label: '30점 경기', desc: '한 경기 30점 이상', test: (c) => best(c, (g) => g.line!.pts >= 30) },
  { id: 'pts40', label: '40점 폭발', desc: '한 경기 40점 이상', test: (c) => best(c, (g) => g.line!.pts >= 40) },
  { id: 'triple', label: '트리플 더블', desc: '세 부문 두 자릿수', test: (c) => best(c, (g) => doubles(g) >= 3) },
  { id: 'draft', label: '프로 입성', desc: '드래프트에서 지명됐다', test: (c) => !!c.pro },
  { id: 'pick1', label: '전체 1순위', desc: '드래프트 1순위로 뽑혔다', test: (c) => c.pro?.pickNo === 1 },
  { id: 'roy', label: '신인왕', desc: '신인왕을 받았다', test: (c) => has(c, /신인왕/) },
  { id: 'allstar', label: '올스타', desc: '올스타에 뽑혔다', test: (c) => has(c, /올스타$/) },
  { id: 'contest', label: '콘테스트 챔피언', desc: '덩크나 3점 콘테스트 우승', test: (c) => has(c, /콘테스트 우승/) },
  { id: 'scoring', label: '득점왕', desc: '시즌 득점 1위', test: (c) => has(c, /득점왕/) },
  { id: 'mvp', label: '시즌 MVP', desc: '정규시즌 MVP', test: (c) => has(c, /시즌 MVP/) },
  { id: 'champ', label: '챔피언', desc: '프로 리그 우승', test: (c) => has(c, /시즌 우승$/) },
  { id: 'national', label: '태극마크', desc: '국가대표로 뽑혔다', test: (c) => !!c.national },
  { id: 'asia', label: '아시아 정상', desc: '아시아컵 우승', test: (c) => has(c, /아시아컵 우승/) },
  { id: 'abroad', label: '해외 진출', desc: '해외 리그와 계약했다', test: (c) => c.overseas || !!c.abroadLeague },
  { id: 'ovr80', label: '에이스', desc: '종합 능력치 80', test: (c) => overall(c.me, c.prefPos) >= 80 || (c.peakOvr ?? 0) >= 80 },
  { id: 'ovr90', label: '슈퍼스타', desc: '종합 능력치 90', test: (c) => overall(c.me, c.prefPos) >= 90 || (c.peakOvr ?? 0) >= 90 },
  { id: 'rich', label: '10억 자산가', desc: '돈 10억 원 모으기', test: (c) => c.money >= 100000 },
  { id: 'house', label: '꿈의 집', desc: '집 꾸미기 전부 사기', test: (c) => ITEMS.filter((i) => i.kind === 'house').every((i) => c.items.includes(i.id)) },
  { id: 'popular', label: '국민 스타', desc: '인기 90 이상', test: (c) => (c.popularity ?? 0) >= 90 },
  { id: 'retire', label: '은퇴식', desc: '프로 선수로 은퇴했다', test: (c) => !!c.retired },
  { id: 'hof', label: '명예의 전당', desc: '명예의 전당에 올랐다', test: (c) => !!c.retired?.hof },
  { id: 'jersey', label: '영구결번', desc: '내 등번호가 영구결번됐다', test: (c) => !!c.retired?.retiredBy },
  { id: 'legacy', label: '대를 잇다', desc: '2세 선수로 새 커리어 시작', test: (c) => !!c.legacy },
];

export function unlockedAchievements(): Record<string, number> {
  return readJson<Record<string, number>>(ACH_KEY, {});
}

/** 새로 딴 업적을 저장하고 돌려준다 */
export function checkAchievements(c: Career): Achievement[] {
  const got = unlockedAchievements();
  const fresh = ACHIEVEMENTS.filter((a) => !got[a.id] && a.test(c));
  if (!fresh.length) return [];
  // 개발자 패널을 쓴 커리어는 음수로 남겨서 🔧를 붙인다
  for (const a of fresh) got[a.id] = c.dev ? -Date.now() : Date.now();
  writeJson(ACH_KEY, got);
  return fresh;
}
