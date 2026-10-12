// 특수능력 얻기·진화·잃기 (S8). 경기 기록과 능력치가 조건을 채우면 자동으로.
import { abilityDef, stars, type AbilityId } from '../data/abilities';
import { dunkList } from '../data/dunks';
import { DUNK_LABEL } from '../sim/types';
import type { RatingKey } from '../data/ratings';
import type { BackgroundId } from './backgrounds';
import type { Career } from './career';
import { avgFriendship } from './people';

export interface CareerStats {
  games: number;
  clutchMade: number;
  clutchMiss: number;
  ankles: number;
  threesMade: number;
  ast: number;
  reb: number;
  stlblk: number;
  ftm: number;
  fta: number;
  foulOuts: number;
  /** 25점 넘긴 경기 */
  big: number;
  injuries: number;
  lastInjury: number;
  /** 최근 경기 파울 수 */
  recentPf: number[];
  /** 자유투 공포증이 생긴 뒤 자유투 */
  ftAfter: { m: number; a: number };
}

export function emptyStats(): CareerStats {
  return { games: 0, clutchMade: 0, clutchMiss: 0, ankles: 0, threesMade: 0, ast: 0, reb: 0, stlblk: 0, ftm: 0, fta: 0, foulOuts: 0, big: 0, injuries: 0, lastInjury: -99, recentPf: [], ftAfter: { m: 0, a: 0 } };
}

/** 단계별 조건: [기록 하한, 능력치 하한] × 3단계 */
const GOOD: { id: AbilityId; stat: (c: Career) => number; key: RatingKey; need: [number, number][]; how: string }[] = [
  { id: 'clutch', stat: (c) => c.stats.clutchMade, key: 'composure', need: [[3, 45], [10, 58], [25, 70]], how: '막판 접전 득점 + 침착성' },
  { id: 'ankle', stat: (c) => c.stats.ankles, key: 'ballHandling', need: [[4, 55], [15, 65], [40, 75]], how: '앵클 브레이크 + 볼핸들링' },
  { id: 'lockdown', stat: (c) => c.stats.stlblk, key: 'perimeterD', need: [[15, 50], [45, 62], [100, 74]], how: '스틸·블록 + 외곽 수비' },
  { id: 'rebound', stat: (c) => c.stats.reb, key: 'defReb', need: [[80, 50], [250, 62], [600, 74]], how: '리바운드 + 수비 리바운드' },
  { id: 'quickRelease', stat: (c) => c.stats.threesMade, key: 'three', need: [[25, 55], [80, 65], [200, 75]], how: '3점 성공 + 3점슛' },
  { id: 'noLook', stat: (c) => c.stats.ast, key: 'vision', need: [[40, 50], [130, 62], [320, 74]], how: '어시스트 + 시야' },
  { id: 'zone', stat: (c) => c.stats.big, key: 'focus', need: [[2, 45], [6, 58], [15, 70]], how: '25점 넘긴 경기 + 집중력' },
  { id: 'moodMaker', stat: (c) => Math.round(avgFriendship(c)), key: 'leadership', need: [[50, 40], [62, 52], [75, 64]], how: '팀원 친밀도 평균 + 리더십' },
];

/** 다음 단계까지 남은 조건 (화면 안내용) */
export function abilityProgress(c: Career) {
  return GOOD.map((g) => {
    const cur = c.me.abilities?.[g.id] ?? 0;
    const next = g.need[cur];
    return { id: g.id, level: cur, how: g.how, stat: g.stat(c), rating: c.me.r[g.key], need: next ?? null };
  });
}

export const START_ABILITY: Partial<Record<BackgroundId, AbilityId>> = {
  street: 'ankle',
  abroad: 'quickRelease',
  elite: 'noLook',
  lateTall: 'rebound',
  convert: 'lockdown',
};

export function startAbilities(bg: BackgroundId): Partial<Record<AbilityId, number>> {
  if (bg === 'genius') return Object.fromEntries(GOOD.map((g) => [g.id, 3]));
  const a = START_ABILITY[bg];
  return a ? { [a]: 1 } : {};
}

/** 조건을 확인해서 능력을 얻거나 올리거나 잃는다. 바뀐 내용을 글로 돌려준다 */
export function checkAbilities(c: Career): string[] {
  const out: string[] = [];
  const ab = (c.me.abilities ??= {});
  const s = c.stats;
  for (const g of GOOD) {
    let cur = ab[g.id] ?? 0;
    while (cur < 3) {
      const [st, rt] = g.need[cur];
      if (g.stat(c) < st || c.me.r[g.key] < rt) break;
      cur++;
    }
    if (cur > (ab[g.id] ?? 0)) {
      out.push(`${(ab[g.id] ?? 0) ? '특수능력 진화' : '특수능력 획득'}: ${abilityDef(g.id).label} ${stars(cur)}`);
      ab[g.id] = cur;
    }
  }
  const bad = (id: AbilityId, get: boolean, lose: boolean) => {
    if (!ab[id] && get) {
      ab[id] = 1;
      out.push(`나쁜 버릇이 생겼다: ${abilityDef(id).label}`);
      if (id === 'ftPhobia') s.ftAfter = { m: 0, a: 0 };
    } else if (ab[id] && lose) {
      delete ab[id];
      out.push(`극복했다: ${abilityDef(id).label} 사라짐`);
    }
  };
  bad('glass', s.injuries >= 3 && c.me.r.recovery < 50, c.me.r.recovery >= 60 && c.week - s.lastInjury >= 24);
  bad('chicken', s.clutchMiss >= 4 && s.clutchMade * 4 <= s.clutchMiss && c.me.r.composure < 40, c.me.r.composure >= 50);
  bad('ftPhobia', s.fta >= 20 && s.ftm / s.fta < 0.5 && !ab.ftPhobia && s.ftAfter.a === 0, c.me.r.freeThrow >= 55 && s.ftAfter.a >= 10 && s.ftAfter.m / s.ftAfter.a >= 0.6);
  // 덩크 해금
  const now = dunkList(c.me);
  for (const d of now) if (!(c.dunks ??= []).includes(d)) out.push(`덩크 해금: ${DUNK_LABEL[d]}!`);
  c.dunks = now;
  bad('foulProne', s.foulOuts >= 2 && s.recentPf.length >= 3 && s.recentPf.slice(-3).some((p) => p >= 5), s.recentPf.length >= 5 && s.recentPf.slice(-5).every((p) => p <= 2));
  return out;
}
