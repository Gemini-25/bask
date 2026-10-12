import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import type { AbilityId } from './abilities';
import { koreanName, type Gender } from './names';
import { RATING_KEYS, type Body, type RatingKey, type Ratings } from './ratings';

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
export const POSITION_LABEL: Record<Position, string> = { PG: '포인트가드', SG: '슈팅가드', SF: '스몰포워드', PF: '파워포워드', C: '센터' };

/** 겉모습 (도트 캐릭터용). 경기 결과에는 영향 없다. */
export interface Look {
  skin: number;
  hair: number;
  hairColor: number;
  shoe: number;
  headband: boolean;
  sleeve: boolean;
}

export interface Player {
  id: string;
  name: string;
  number: number;
  pos: Position;
  body: Body;
  r: Ratings;
  look: Look;
  /** 특수능력 단계 (S8). 없으면 일반 선수 */
  abilities?: Partial<Record<AbilityId, number>>;
}

/** 이름에서 겉모습을 정한다 (같은 선수는 항상 같은 모습) */
export function lookFor(seedText: string): Look {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  const r = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  return {
    skin: Math.floor(r() * r() * 5),
    hair: Math.floor(r() * 7),
    hairColor: r() < 0.8 ? 0 : Math.floor(r() * 5),
    shoe: Math.floor(r() * 6),
    headband: r() < 0.15,
    sleeve: r() < 0.2,
  };
}

// 포지션별 평균 능력치 (프로 평균 선수 = 50 전후). 적지 않은 항목은 50.
const TEMPLATE: Record<Position, Partial<Ratings>> = {
  PG: { speed: 64, accel: 64, agility: 64, jump: 48, strength: 38, layup: 56, dunk: 30, floater: 58, midRange: 54, three: 56, postUp: 25, ballHandling: 68, passing: 68, offBall: 50, screen: 30, perimeterD: 54, postD: 30, steal: 58, block: 25, defReb: 34, offReb: 24, helpD: 48, boxOut: 32, iq: 58, vision: 64 },
  SG: { speed: 60, accel: 60, agility: 60, jump: 54, strength: 44, layup: 56, dunk: 44, floater: 50, midRange: 58, three: 60, postUp: 30, ballHandling: 58, passing: 52, offBall: 60, screen: 34, perimeterD: 56, postD: 34, steal: 54, block: 30, defReb: 38, offReb: 30, helpD: 48, boxOut: 36, iq: 52, vision: 52 },
  SF: { speed: 56, accel: 56, agility: 54, jump: 58, strength: 54, layup: 56, dunk: 54, floater: 48, midRange: 54, three: 52, postUp: 42, ballHandling: 50, passing: 48, offBall: 58, screen: 44, perimeterD: 56, postD: 46, steal: 50, block: 40, defReb: 50, offReb: 42, helpD: 52, boxOut: 48, iq: 52, vision: 48 },
  PF: { speed: 48, accel: 48, agility: 46, jump: 58, strength: 64, layup: 54, dunk: 60, floater: 42, midRange: 48, three: 42, postUp: 56, ballHandling: 38, passing: 42, offBall: 54, screen: 60, perimeterD: 46, postD: 58, steal: 42, block: 54, defReb: 62, offReb: 56, helpD: 54, boxOut: 60, iq: 50, vision: 42 },
  C: { speed: 42, accel: 42, agility: 40, jump: 58, strength: 70, layup: 54, dunk: 64, floater: 38, midRange: 40, three: 30, postUp: 60, ballHandling: 30, passing: 40, offBall: 52, screen: 66, perimeterD: 38, postD: 64, steal: 36, block: 62, defReb: 68, offReb: 62, helpD: 56, boxOut: 66, iq: 50, vision: 40 },
};

export const HEIGHT: Record<Position, [number, number]> = { PG: [184, 4], SG: [190, 4], SF: [196, 3.5], PF: [201, 3.5], C: [207, 4] };

/** 포지션 평균 능력치에 quality를 더한 값 (난수 없음). 선수 만들기의 출발점 */
export function baseRatings(pos: Position, quality: number): Ratings {
  const t = TEMPLATE[pos];
  const r = {} as Ratings;
  for (const k of RATING_KEYS) r[k] = Math.round(clamp((t[k] ?? 50) + quality, 1, 99));
  return r;
}

export interface GenOptions {
  /** 키 보정 (고교생은 작고, 여자 리그는 더 작다) */
  heightAdj?: number;
  gender?: Gender;
}

/** 포지션과 실력(quality: 0이 평균, ±10이 큰 차이)으로 선수 하나를 만든다 */
export function generatePlayer(rng: Rng, pos: Position, quality: number, number: number, opts: GenOptions = {}): Player {
  const t = TEMPLATE[pos];
  const r = {} as Ratings;
  for (const k of RATING_KEYS) {
    const base = t[k as RatingKey] ?? 50;
    r[k] = Math.round(clamp(base + quality + rng.normal(0, 7), 15, 95));
  }
  const [hm, hs] = HEIGHT[pos];
  const heightCm = Math.round(rng.normal(hm + (opts.heightAdj ?? 0), hs));
  const wingspanCm = Math.round(heightCm + rng.normal(4, 4));
  const weightKg = Math.round(clamp((heightCm - 100) * 0.95 + rng.normal(0, 6), opts.heightAdj ? 50 : 70, 135));
  const id = `p${Math.floor(rng.next() * 1e9).toString(36)}`;
  const name = koreanName(rng, opts.gender);
  return { id, name, number, pos, body: { heightCm, wingspanCm, weightKg }, r, look: lookFor(id + name) };
}

// 포지션별 종합 능력치 (S12). 감독이 출전 선수를 고를 때도 쓴다.
const OVR_WEIGHTS: Record<Position, Partial<Record<RatingKey, number>>> = {
  PG: { ballHandling: 3, passing: 3, vision: 2, three: 2, midRange: 1.5, layup: 1.5, speed: 2, accel: 1.5, perimeterD: 1.5, steal: 1, iq: 2 },
  SG: { three: 3, midRange: 2, layup: 1.5, ballHandling: 1.5, offBall: 1.5, speed: 1.5, perimeterD: 2, steal: 1, iq: 1.5, freeThrow: 1 },
  SF: { three: 2, midRange: 1.5, layup: 2, dunk: 1, offBall: 1.5, perimeterD: 2, defReb: 1, jump: 1.5, strength: 1, iq: 1.5, speed: 1 },
  PF: { layup: 1.5, dunk: 1.5, postUp: 1.5, midRange: 1, defReb: 2, offReb: 1.5, postD: 2, block: 1.5, strength: 2, jump: 1, boxOut: 1.5, screen: 1 },
  C: { postUp: 2, dunk: 2, layup: 1, defReb: 2.5, offReb: 2, postD: 2.5, block: 2.5, strength: 2, boxOut: 2, screen: 1.5, helpD: 1 },
};

export function overall(p: Player, pos: Position = p.pos): number {
  const w = OVR_WEIGHTS[pos];
  let s = 0;
  let n = 0;
  for (const [k, wt] of Object.entries(w) as [RatingKey, number][]) {
    s += p.r[k] * wt;
    n += wt;
  }
  const size: Record<Position, number> = { PG: 184, SG: 190, SF: 196, PF: 201, C: 207 };
  return s / n + (p.body.heightCm - size[pos]) * 0.4;
}

export type PosGroup = 'G' | 'W' | 'B';
export const POS_GROUP: Record<Position, PosGroup> = { PG: 'G', SG: 'G', SF: 'W', PF: 'B', C: 'B' };
