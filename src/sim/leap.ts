// 도약 (M24): 피지컬로 정하는 점프 높이, 손이 닿는 높이, 덩크 도약 거리.
// 점프력·가속·근력 (몸이 무거우면 덜 뜬다)으로 수직 점프, 키·윙스팬으로 서서 닿는 높이.
// 림 위로 손이 얼마나 올라가는지 (clear)가 클수록 멀리서 뛰어도 닿는다
import { clamp } from '../core/math';
import type { Player } from '../data/player';
import { COURT } from './court';

export interface Leap {
  /** 수직 점프 (m) */
  vert: number;
  /** 서서 손이 닿는 높이 (m) */
  reach: number;
  /** 뛰어서 손이 림 위로 올라가는 정도 (m, 0이면 겨우 닿는다) */
  clear: number;
  /** 덩크로 뛸 수 있는 도약 거리 (m, 속공·덩크 종류 빼고) */
  range: number;
}

export function leapOf(p: Player): Leap {
  const r = p.r;
  const b = p.body;
  const vert = clamp(0.4 + r.jump * 0.0068 + Math.max(0, r.accel - 50) * 0.0012 + Math.max(0, r.strength - 60) * 0.0008 - Math.max(0, b.weightKg - 105) * 0.004, 0.45, 1.15);
  const reach = (b.heightCm * 0.875 + b.wingspanCm * 0.46) / 100;
  const clear = Math.max(0, reach + vert - COURT.rimHeight);
  const range = 0.9 + clear * 1.7 + Math.max(0, r.speed - 45) * 0.013 + Math.max(0, r.accel - 50) * 0.006;
  return { vert, reach, clear, range };
}

/** 경기에서 덩크를 고를 수 있는 거리 (림에서, m): 기본 1.5m, 림 위로 손이 많이 올라가는 선수는 2m 넘게 */
export function dunkReach(p: Player): number {
  return 1.5 + clamp((leapOf(p).clear - 0.3) * 1.2, 0, 0.7);
}
