// 성격 (M6 결정: 1~2개, M12): 만들 때 하나, 커리어 중 이벤트로 하나 더. 효과는 작게.
import type { RatingKey } from '../data/ratings';
import type { ActionId, Career } from './career';

export type TraitId = 'diligent' | 'competitor' | 'optimist' | 'leader' | 'showman' | 'cool' | 'hothead' | 'timid';

export interface TraitDef {
  id: TraitId;
  label: string;
  desc: string;
}

export const TRAITS: TraitDef[] = [
  { id: 'diligent', label: '성실', desc: '훈련 포인트 +8%' },
  { id: 'competitor', label: '승부욕', desc: '공식전에서 승부욕·침착성이 오른다' },
  { id: 'optimist', label: '낙천', desc: '컨디션이 잘 안 떨어진다' },
  { id: 'leader', label: '리더', desc: '팀 친밀도가 30%, 감독 신뢰가 15% 더 빨리 오른다' },
  { id: 'showman', label: '쇼맨', desc: '인기가 25% 더 오르고 덩크가 화려하다' },
  { id: 'cool', label: '냉철', desc: '경기 중 침착성·자유투·집중력이 오른다' },
  { id: 'hothead', label: '다혈질', desc: '경기 중 승부욕·허슬이 크게 오르지만 침착성·농구 IQ가 떨어진다' },
  { id: 'timid', label: '소심', desc: '큰 경기에선 긴장하지만, 혼자 하는 훈련 효율이 10% 좋다' },
];

export function traitDef(id: TraitId) {
  return TRAITS.find((t) => t.id === id)!;
}

export function hasTrait(c: Career, id: TraitId) {
  return (c.traits ?? []).includes(id);
}

/** 성격을 하나 더 (두 개까지) */
export function addTrait(c: Career, id: TraitId): boolean {
  c.traits ??= [];
  if (c.traits.includes(id) || c.traits.length >= 2) return false;
  c.traits.push(id);
  return true;
}

const TRAINING: ActionId[] = ['team', 'solo', 'mentor', 'trainer', 'weight', 'video'];
const ALONE: ActionId[] = ['solo', 'trainer', 'weight', 'video'];

/** 주간 행동 포인트 배율 */
export function traitPointMult(c: Career, id: ActionId): number {
  let m = 1;
  if (hasTrait(c, 'diligent') && TRAINING.includes(id)) m *= 1.08;
  if (hasTrait(c, 'timid') && ALONE.includes(id)) m *= 1.1;
  return m;
}

/** 경기 중 능력치 보정 */
export function traitGameBoost(c: Career, official: boolean): Partial<Record<RatingKey, number>> {
  const out: Partial<Record<RatingKey, number>> = {};
  const add = (k: RatingKey, v: number) => (out[k] = (out[k] ?? 0) + v);
  if (hasTrait(c, 'competitor') && official) {
    add('competitive', 5);
    add('composure', 2);
  }
  if (hasTrait(c, 'cool')) {
    add('composure', 4);
    add('freeThrow', 3);
    add('focus', 2);
  }
  if (hasTrait(c, 'hothead')) {
    add('competitive', 5);
    add('hustle', 5);
    add('composure', -4);
    add('iq', -2);
  }
  if (hasTrait(c, 'timid') && official) {
    add('composure', -5);
    add('three', -1);
    add('midRange', -1);
  }
  if (hasTrait(c, 'showman')) add('dunk', 2);
  return out;
}

/** 친밀도·감독 신뢰 상승 배율 */
export function traitSocial(c: Career): { friends: number; trust: number } {
  return hasTrait(c, 'leader') ? { friends: 1.3, trust: 1.15 } : { friends: 1, trust: 1 };
}

/** 인기 상승 배율 */
export function traitPop(c: Career): number {
  return hasTrait(c, 'showman') ? 1.25 : 1;
}

/** 컨디션 변화 쪽으로 미는 정도 */
export function traitMood(c: Career): number {
  return hasTrait(c, 'optimist') ? 0.25 : 0;
}

/** 경기 동작 성향 (M16): 화려한 동작·힘 동작·기본기 무게 */
export function traitStyle(c: Career): { flash: number; power: number; basic: number } {
  const st = { flash: 1, power: 1, basic: 1 };
  if (hasTrait(c, 'showman')) st.flash *= 1.5;
  if (hasTrait(c, 'cool')) {
    st.basic *= 1.5;
    st.flash *= 0.85;
  }
  if (hasTrait(c, 'hothead')) st.power *= 1.5;
  if (hasTrait(c, 'competitor')) st.power *= 1.15;
  return st;
}
