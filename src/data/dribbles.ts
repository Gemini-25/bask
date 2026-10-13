// 드리블 기술 (M25): 엔진이 실제로 쓰는 기술. 수비를 기준으로 옆으로 꺾는 거리, 앞·뒤로 가는 거리,
// 먼저 반대쪽으로 속이는 거리, 끝나고 치고 나가는 폭발력, 수비를 흔드는 힘, 공을 뺏길 위험,
// 실력을 정하는 능력치, 이어서 쓸 수 있는 기술 (콤보)
import type { RatingKey } from './ratings';
import { ACT } from '../sim/types';

export interface DribbleDef {
  act: number;
  need: Partial<Record<RatingKey, number>>;
  keys: RatingKey[];
  /** 걸리는 시간 (초) */
  dur: number;
  /** 옆으로 꺾는 거리 (m) */
  lat: number;
  /** 앞으로 가는 거리 (m, 음수면 뒤로 빠진다) */
  fwd: number;
  /** 먼저 반대쪽으로 속이는 거리 (m) */
  fake: number;
  /** 끝나고 치고 나가는 가속 배율 */
  burst: number;
  /** 수비를 흔드는 힘 */
  power: number;
  /** 공을 뺏길 위험 */
  risk: number;
  /** 흔한 정도 */
  base: number;
  /** 화려한 정도 (센스·성격이 좋아하는) */
  flash: number;
  /** 이어서 쓸 수 있는 기술 */
  next: number[];
  /** 속도를 확 줄였다가 (헤지·스터터) */
  pause?: boolean;
}

export const DRIBBLES: DribbleDef[] = [
  { act: ACT.CROSSOVER, need: {}, keys: ['ballHandling', 'agility'], dur: 0.5, lat: 1.3, fwd: 0.5, fake: 0, burst: 1.35, power: 1.0, risk: 1.0, base: 3, flash: 1, next: [ACT.BEHIND, ACT.SPIN, ACT.HESI, ACT.INOUT, ACT.CROSSOVER] },
  { act: ACT.HESI, need: {}, keys: ['ballHandling', 'speed', 'accel'], dur: 0.5, lat: 0.2, fwd: 0.8, fake: 0, burst: 1.7, power: 0.95, risk: 0.7, base: 2.2, flash: 0.9, next: [ACT.CROSSOVER, ACT.BEHIND, ACT.INOUT], pause: true },
  { act: ACT.STUTTER, need: { accel: 56, ballHandling: 52 }, keys: ['accel', 'ballHandling', 'agility'], dur: 0.45, lat: 0.15, fwd: 0.4, fake: 0, burst: 1.8, power: 1.0, risk: 0.6, base: 1.3, flash: 1, next: [ACT.CROSSOVER, ACT.INOUT], pause: true },
  { act: ACT.INOUT, need: { ballHandling: 55 }, keys: ['ballHandling', 'sense'], dur: 0.45, lat: 0.1, fwd: 0.8, fake: 0.7, burst: 1.4, power: 1.0, risk: 0.8, base: 1.4, flash: 1, next: [ACT.CROSSOVER, ACT.HESI] },
  { act: ACT.BEHIND, need: { ballHandling: 58 }, keys: ['ballHandling', 'agility'], dur: 0.45, lat: 1.1, fwd: 0.6, fake: 0, burst: 1.3, power: 1.0, risk: 0.55, base: 1.6, flash: 1.2, next: [ACT.CROSSOVER, ACT.SPIN, ACT.HESI] },
  { act: ACT.LEGS, need: { ballHandling: 62 }, keys: ['ballHandling', 'agility'], dur: 0.45, lat: 0.7, fwd: 0, fake: 0, burst: 1.1, power: 0.8, risk: 0.6, base: 1.6, flash: 1.1, next: [ACT.CROSSOVER, ACT.BEHIND, ACT.KILLER, ACT.HESI, ACT.SNAP, ACT.DBLCROSS] },
  { act: ACT.SNAP, need: { ballHandling: 64 }, keys: ['ballHandling', 'agility', 'accel'], dur: 0.45, lat: 0.2, fwd: -1.1, fake: 0, burst: 1.0, power: 1.0, risk: 0.7, base: 1.0, flash: 1.2, next: [] },
  { act: ACT.DBLCROSS, need: { ballHandling: 66 }, keys: ['ballHandling', 'agility', 'sense'], dur: 0.55, lat: 1.2, fwd: 0.3, fake: 0.6, burst: 1.4, power: 1.2, risk: 1.2, base: 1.0, flash: 1.3, next: [ACT.SPIN, ACT.HESI, ACT.BEHIND] },
  { act: ACT.SPIN, need: { ballHandling: 68, agility: 60 }, keys: ['ballHandling', 'agility', 'strength'], dur: 0.55, lat: 1.1, fwd: 1.0, fake: 0, burst: 1.3, power: 1.25, risk: 1.3, base: 1.1, flash: 1.4, next: [] },
  { act: ACT.SHAKE, need: { ballHandling: 72, sense: 62 }, keys: ['ballHandling', 'sense', 'agility'], dur: 0.6, lat: 1.2, fwd: 0.4, fake: 0.9, burst: 1.5, power: 1.35, risk: 1.0, base: 0.7, flash: 1.7, next: [] },
  { act: ACT.KILLER, need: { ballHandling: 74, agility: 64 }, keys: ['ballHandling', 'agility', 'accel'], dur: 0.55, lat: 1.8, fwd: 0.3, fake: 0.3, burst: 1.5, power: 1.4, risk: 1.25, base: 0.8, flash: 1.6, next: [ACT.STUTTER] },
  { act: ACT.HALFSPIN, need: { ballHandling: 74, agility: 64, sense: 58 }, keys: ['ballHandling', 'agility', 'sense'], dur: 0.55, lat: 0.3, fwd: 0.8, fake: 0.9, burst: 1.4, power: 1.3, risk: 1.2, base: 0.6, flash: 1.6, next: [] },
];

export function dribbleDef(act: number): DribbleDef | undefined {
  return DRIBBLES.find((d) => d.act === act);
}
