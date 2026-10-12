// 리그 기록과 시상 (L6): 남의 경기는 팀 점수를 선수들에게 나눠서 기록을 만들고, 시즌이 끝나면 상을 준다.
import { Rng } from '../core/rng';
import { overall, POS_GROUP, type Player } from '../data/player';
import type { GameResult } from '../sim/types';
import { boxScore } from '../sim/stats';
import type { Career } from './career';
import type { League } from './league';

export interface SeasonLine {
  name: string;
  team: string;
  pos: string;
  g: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
}

export interface Award {
  key: string;
  label: string;
  id: string;
  name: string;
  team: string;
  value: string;
}

export interface SeasonAwards {
  season: number;
  league: string;
  awards: Award[];
}

const MIN_PLAN = [32, 30, 30, 30, 30, 22, 17, 12, 8, 4, 2, 2];

function add(L: League, p: Player, team: string, line: Omit<SeasonLine, 'name' | 'team' | 'pos' | 'g'>) {
  const s = (L.stats ??= {});
  const cur = (s[p.id] ??= { name: p.name, team, pos: p.pos, g: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 });
  cur.team = team;
  cur.g++;
  cur.min += line.min;
  cur.pts += line.pts;
  cur.reb += line.reb;
  cur.ast += line.ast;
  cur.stl += line.stl;
  cur.blk += line.blk;
}

const SYNTH_STAR = 3.4;

/** 엔진을 안 돌린 경기: 출전 시간과 능력치 비중으로 팀 기록을 나눈다 */
export function synthLines(L: League, players: Player[], team: string, pts: number, rng: Rng) {
  const order = [...players].sort((a, b) => overall(b) - overall(a)).slice(0, 12);
  const mins = order.map((_, i) => MIN_PLAN[i] * (0.85 + rng.next() * 0.3));
  const split = (w: number[], total: number) => {
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    // 정수로 나누되 합이 맞게
    const raw = w.map((x) => (x / sum) * total);
    const out = raw.map(Math.floor);
    let left = total - out.reduce((a, b) => a + b, 0);
    const order2 = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
    for (const [, i] of order2) if (left-- > 0) out[i]++;
    return out;
  };
  const off = (p: Player) => (p.r.layup + p.r.midRange + p.r.three + p.r.dunk * 0.5) / 3.5;
  // 에이스가 더 많이 넣는다 (리그 득점 1위가 25~28점)
  const ptsL = split(order.map((p, i) => mins[i] * off(p) ** SYNTH_STAR * (0.8 + rng.next() * 0.4)), pts);
  const rebL = split(order.map((p, i) => mins[i] * ((p.r.defReb + p.r.offReb) / 2) ** 2 * (p.body.heightCm / 195) ** 3), Math.round(36 + rng.normal(0, 4)));
  const astL = split(order.map((p, i) => mins[i] * ((p.r.passing + p.r.vision) / 2) ** 2.4), Math.round(17 + rng.normal(0, 3)));
  const stlL = split(order.map((p, i) => mins[i] * p.r.steal ** 2), Math.max(0, Math.round(7 + rng.normal(0, 2))));
  const blkL = split(order.map((p, i) => mins[i] * p.r.block ** 2.5), Math.max(0, Math.round(3 + rng.normal(0, 1.5))));
  order.forEach((p, i) => add(L, p, team, { min: mins[i], pts: ptsL[i], reb: rebL[i], ast: astL[i], stl: stlL[i], blk: blkL[i] }));
}

/** 엔진으로 치른 내 경기: 실제 박스스코어 */
export function recordEngineGame(L: League, g: GameResult) {
  const box = boxScore(g);
  g.players.forEach((p, pid) => {
    const l = box.players[pid];
    if (!l.played) return;
    add(L, p, g.teams[g.teamOf[pid]].id, { min: l.sec / 60, pts: l.pts, reb: l.oreb + l.dreb, ast: l.ast, stl: l.stl, blk: l.blk });
  });
}

const per = (s: SeasonLine, k: 'pts' | 'reb' | 'ast' | 'stl' | 'blk') => s[k] / Math.max(1, s.g);
/** MVP 투표에서 팀 승리 하나, 평판(종합) 1점의 무게 */
export const MVP_WIN = 0.6;
export const MVP_REP = 1.3;

/** 시즌이 끝나면 상 */
/** 평판 = 종합 능력치. 내 선수는 커리어 쪽 값을 넘겨준다 */
function leagueOvr(L: League, id: string): number | undefined {
  for (const t of L.teams) {
    const p = t.players.find((x) => x.id === id);
    if (p) return overall(p);
  }
  return undefined;
}

/** 기록 점수 (득점만이 아니라 리바운드·어시스트·수비까지) */
const statScore = (s: SeasonLine) => per(s, 'pts') + 1.2 * per(s, 'reb') + 1.5 * per(s, 'ast') + 2 * (per(s, 'stl') + per(s, 'blk'));

/** 시즌이 끝나면 상. MVP·베스트 5는 기자단 투표처럼 기록 + 팀 성적 + 평판(종합 능력치) (M15) */
export function seasonAwards(L: League, league: string, rookies: string[], wins: Record<string, number>, ovrOf: (id: string) => number | undefined = () => undefined): SeasonAwards {
  const all = Object.entries(L.stats ?? {}).map(([id, s]) => ({ id, s }));
  const enough = all.filter((x) => x.s.g >= 14);
  const pick = (key: string, label: string, list: typeof all, score: (x: { id: string; s: SeasonLine }) => number, fmt: (s: SeasonLine) => string): Award | null => {
    if (!list.length) return null;
    const best = list.reduce((a, b) => (score(b) > score(a) ? b : a));
    return { key, label, id: best.id, name: best.s.name, team: best.s.team, value: fmt(best.s) };
  };
  const rep = (id: string) => (ovrOf(id) ?? leagueOvr(L, id) ?? 60) - 65;
  const mvpScore = (x: { id: string; s: SeasonLine }) => statScore(x.s) + (wins[x.s.team] ?? 0) * MVP_WIN + rep(x.id) * MVP_REP;
  const best5Score = (x: { id: string; s: SeasonLine }) => statScore(x.s) + (wins[x.s.team] ?? 0) * 0.3 + rep(x.id) * 0.8;
  const royScore = (x: { id: string; s: SeasonLine }) => statScore(x.s) + (wins[x.s.team] ?? 0) * 0.2 + rep(x.id) * 0.4;
  const line = (s: SeasonLine) => `${per(s, 'pts').toFixed(1)}점 ${per(s, 'reb').toFixed(1)}리바 ${per(s, 'ast').toFixed(1)}어시`;
  const awards = [
    pick('mvp', 'MVP', enough.filter((x) => x.s.g >= 18), mvpScore, line),
    // 신인왕은 경기당 6점은 넣어야 준다
    pick('roy', '신인왕', enough.filter((x) => rookies.includes(x.id) && per(x.s, 'pts') >= 6), royScore, line),
    pick('pts', '득점왕', enough, (x) => per(x.s, 'pts'), (s) => `경기당 ${per(s, 'pts').toFixed(1)}점`),
    pick('reb', '리바운드왕', enough, (x) => per(x.s, 'reb'), (s) => `경기당 ${per(s, 'reb').toFixed(1)}개`),
    pick('ast', '어시스트왕', enough, (x) => per(x.s, 'ast'), (s) => `경기당 ${per(s, 'ast').toFixed(1)}개`),
    pick('dpoy', '수비상', enough, (x) => per(x.s, 'stl') * 1.2 + per(x.s, 'blk') * 1.4 + per(x.s, 'reb') * 0.1, (s) => `스틸 ${per(s, 'stl').toFixed(1)} · 블록 ${per(s, 'blk').toFixed(1)}`),
  ].filter((a): a is Award => !!a);
  // 베스트 5: 가드 2, 포워드 2, 센터 1
  const ranked = [...enough].sort((a, b) => best5Score(b) - best5Score(a));
  const need: Record<string, number> = { G: 2, W: 1, B: 2 };
  for (const x of ranked) {
    const g = POS_GROUP[x.s.pos as keyof typeof POS_GROUP] ?? 'W';
    if ((need[g] ?? 0) <= 0) continue;
    need[g]--;
    awards.push({ key: 'best5', label: '베스트 5', id: x.id, name: x.s.name, team: x.s.team, value: line(x.s) });
    if (Object.values(need).every((n) => n <= 0)) break;
  }
  return { season: L.season, league, awards };
}

/** 내 커리어 트로피 목록에 더한다 */
export function grantTrophies(c: Career, a: SeasonAwards, prefix: string): string[] {
  const mine = a.awards.filter((x) => x.id === 'me');
  const out = mine.map((x) => `${prefix} ${x.label}`);
  c.trophies = [...(c.trophies ?? []), ...out];
  return out;
}
