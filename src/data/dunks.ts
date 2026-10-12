// 덩크 레퍼토리 (AN2): 능력치가 되면 화려한 덩크가 열린다. 경기 엔진과 육성 화면이 같이 쓴다.
import type { DunkStyle } from '../sim/types';
import type { Player } from './player';
import type { RatingKey } from './ratings';

export interface DunkDef {
  id: DunkStyle;
  need: Partial<Record<RatingKey, number>>;
  /** 노마크일 때 고르는 무게 (화려할수록 크다) */
  flash: number;
  /** 덩크 콘테스트에서만 (경기 중엔 안 한다) */
  contestOnly?: boolean;
  /** 그 상황에서만 (풋백은 공격 리바운드 바로 뒤) */
  situational?: boolean;
}

export const DUNKS: DunkDef[] = [
  { id: 'one', need: {}, flash: 1 },
  { id: 'two', need: { dunk: 45, strength: 40 }, flash: 1 },
  { id: 'tomahawk', need: { dunk: 55, jump: 55 }, flash: 1.5 },
  { id: 'reverse', need: { dunk: 62, agility: 55 }, flash: 1.8 },
  { id: 'windmill', need: { dunk: 70, jump: 68 }, flash: 2.4 },
  { id: 'double', need: { dunk: 66, jump: 62, agility: 60 }, flash: 2.1 },
  { id: 'elbow', need: { dunk: 76, jump: 78 }, flash: 2.7 },
  { id: 'd360', need: { dunk: 80, jump: 75, agility: 68 }, flash: 3 },
  { id: 'cradle', need: { dunk: 72, jump: 70, agility: 60 }, flash: 2.3 },
  { id: 'putback', need: { dunk: 55, jump: 58 }, flash: 0, situational: true },
  { id: 'between', need: { dunk: 86, jump: 82, agility: 74 }, flash: 3.4, contestOnly: true },
  { id: 'ftline', need: { dunk: 88, jump: 90 }, flash: 3.8, contestOnly: true },
];

export function dunkUnlocked(p: Player, d: DunkDef) {
  return Object.entries(d.need).every(([k, v]) => p.r[k as RatingKey] >= v!);
}

export function dunkList(p: Player): DunkStyle[] {
  return DUNKS.filter((d) => dunkUnlocked(p, d)).map((d) => d.id);
}
