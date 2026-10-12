import { clamp } from '../core/math';
import type { Player } from '../data/player';
import { COURT, isThreeLocal } from './court';
import type { ShotKind } from './types';

export interface ShotInfo {
  kind: ShotKind;
  dist: number;
  three: boolean;
  pts: number;
  /** 수비가 없을 때 성공률 */
  pOpen: number;
}

/** 딥쓰리 (M21): 림에서 8m 넘게 (3점 라인보다 1.25m 이상 뒤), 로고 샷: 9.5m 넘게 */
export const DEEP_DIST = 8.0;
export const LOGO_DIST = 9.5;

/** 사거리: 3점이 멀어질수록 떨어지는 성공률이 시작되는 거리 (+m)와 떨어지는 기울기 배율 */
export interface Range {
  extra: number;
  slope: number;
}
export const NO_RANGE: Range = { extra: 0, slope: 1 };

export function canDunk(p: Player, dist: number): boolean {
  const lift = p.r.jump + (p.body.heightCm - 190) * 1.6;
  return dist < 1.5 && p.r.dunk >= 45 && lift >= 52;
}

/** 공격 방향 기준 좌표 (u, v)에서 이 선수가 던지는 슛 */
/** 아주 높은 능력치는 효과가 조금 줄어든다 (75를 넘으면 0.75씩, M16에서 0.5 → 0.75: 99는 99답게) */
const soft = (v: number) => (v <= 75 ? v : 75 + (v - 75) * 0.75);

export function shotInfo(p: Player, u: number, v: number, post = false, contest = 0, range: Range = NO_RANGE): ShotInfo {
  const dist = Math.hypot(u - COURT.hoopFromBaseline, v);
  const three = isThreeLocal(u, v);
  const raw = p.r;
  const r = { dunk: soft(raw.dunk), layup: soft(raw.layup), postUp: soft(raw.postUp), floater: soft(raw.floater), midRange: soft(raw.midRange), three: soft(raw.three) };
  let kind: ShotKind;
  let pOpen: number;
  if (dist < 1.7) {
    // 골밑에 수비가 버티고 있으면 덩크 대신 레이업을 올린다
    if (canDunk(p, dist) && contest < 0.45) {
      kind = 'dunk';
      pOpen = 0.93 + (r.dunk - 50) * 0.0012;
    } else {
      kind = 'layup';
      pOpen = 0.72 + (r.layup - 50) * 0.005 - Math.max(0, dist - 0.8) * 0.05;
    }
  } else if (dist < 4.2) {
    if (post) {
      kind = 'hook';
      pOpen = 0.5 + (r.postUp - 50) * 0.005 - (dist - 1.7) * 0.025;
    } else {
      kind = 'floater';
      pOpen = 0.47 + (r.floater - 50) * 0.0045 - (dist - 1.7) * 0.025;
    }
  } else if (!three) {
    kind = 'mid';
    pOpen = 0.48 + (r.midRange - 50) * 0.005 - (dist - 4.2) * 0.012;
  } else {
    kind = 'three';
    pOpen = 0.385 + (r.three - 50) * 0.005 - Math.max(0, dist - 7.0 - range.extra) * 0.07 * range.slope;
  }
  return { kind, dist, three, pts: three ? 3 : 2, pOpen: clamp(pOpen, 0.01, 0.97) };
}

/** 수비 견제(0~1)가 성공률을 얼마나 깎는지 */
export function contestFactor(kind: ShotKind, contest: number): number {
  // NBA 슛 추적 기준: 밀착 수비 시 성공률이 노마크의 70% 안팎
  const k = kind === 'dunk' ? 0.3 : kind === 'layup' ? 0.38 : kind === 'hook' ? 0.25 : kind === 'floater' ? 0.3 : kind === 'mid' ? 0.28 : 0.3;
  return 1 - k * contest;
}

export const SHOT_LABEL: Record<ShotKind, string> = {
  dunk: '덩크',
  layup: '레이업',
  floater: '플로터',
  hook: '훅슛',
  mid: '미드레인지 점프슛',
  three: '3점슛',
};
