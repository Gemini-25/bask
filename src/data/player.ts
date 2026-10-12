import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { koreanName } from './names';
import { RATING_KEYS, type Body, type RatingKey, type Ratings } from './ratings';

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
export const POSITION_LABEL: Record<Position, string> = { PG: '포인트가드', SG: '슈팅가드', SF: '스몰포워드', PF: '파워포워드', C: '센터' };

export interface Player {
  id: string;
  name: string;
  number: number;
  pos: Position;
  body: Body;
  r: Ratings;
}

// 포지션별 평균 능력치 (프로 평균 선수 = 50 전후). 적지 않은 항목은 50.
const TEMPLATE: Record<Position, Partial<Ratings>> = {
  PG: { speed: 64, accel: 64, agility: 64, jump: 48, strength: 38, layup: 56, dunk: 30, floater: 58, midRange: 54, three: 56, postUp: 25, ballHandling: 68, passing: 68, offBall: 50, screen: 30, perimeterD: 54, postD: 30, steal: 58, block: 25, defReb: 34, offReb: 24, helpD: 48, boxOut: 32, iq: 58, vision: 64 },
  SG: { speed: 60, accel: 60, agility: 60, jump: 54, strength: 44, layup: 56, dunk: 44, floater: 50, midRange: 58, three: 60, postUp: 30, ballHandling: 58, passing: 52, offBall: 60, screen: 34, perimeterD: 56, postD: 34, steal: 54, block: 30, defReb: 38, offReb: 30, helpD: 48, boxOut: 36, iq: 52, vision: 52 },
  SF: { speed: 56, accel: 56, agility: 54, jump: 58, strength: 54, layup: 56, dunk: 54, floater: 48, midRange: 54, three: 52, postUp: 42, ballHandling: 50, passing: 48, offBall: 58, screen: 44, perimeterD: 56, postD: 46, steal: 50, block: 40, defReb: 50, offReb: 42, helpD: 52, boxOut: 48, iq: 52, vision: 48 },
  PF: { speed: 48, accel: 48, agility: 46, jump: 58, strength: 64, layup: 54, dunk: 60, floater: 42, midRange: 48, three: 42, postUp: 56, ballHandling: 38, passing: 42, offBall: 54, screen: 60, perimeterD: 46, postD: 58, steal: 42, block: 54, defReb: 62, offReb: 56, helpD: 54, boxOut: 60, iq: 50, vision: 42 },
  C: { speed: 42, accel: 42, agility: 40, jump: 58, strength: 70, layup: 54, dunk: 64, floater: 38, midRange: 40, three: 30, postUp: 60, ballHandling: 30, passing: 40, offBall: 52, screen: 66, perimeterD: 38, postD: 64, steal: 36, block: 62, defReb: 68, offReb: 62, helpD: 56, boxOut: 66, iq: 50, vision: 40 },
};

const HEIGHT: Record<Position, [number, number]> = { PG: [184, 4], SG: [190, 4], SF: [196, 3.5], PF: [201, 3.5], C: [207, 4] };

/** 포지션과 실력(quality: 0이 평균, ±10이 큰 차이)으로 선수 하나를 만든다 */
export function generatePlayer(rng: Rng, pos: Position, quality: number, number: number): Player {
  const t = TEMPLATE[pos];
  const r = {} as Ratings;
  for (const k of RATING_KEYS) {
    const base = t[k as RatingKey] ?? 50;
    r[k] = Math.round(clamp(base + quality + rng.normal(0, 7), 15, 95));
  }
  const [hm, hs] = HEIGHT[pos];
  const heightCm = Math.round(rng.normal(hm, hs));
  const wingspanCm = Math.round(heightCm + rng.normal(4, 4));
  const weightKg = Math.round(clamp((heightCm - 100) * 0.95 + rng.normal(0, 6), 70, 135));
  return {
    id: `p${Math.floor(rng.next() * 1e9).toString(36)}`,
    name: koreanName(rng),
    number,
    pos,
    body: { heightCm, wingspanCm, weightKg },
    r,
  };
}
