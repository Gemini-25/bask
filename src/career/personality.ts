// 성격 (M6 결정: 1~2개, M12, M18에 12개 더): 만들 때 하나, 커리어 중 이벤트로 하나 더. 효과는 작게.
import type { RatingKey } from '../data/ratings';
import type { ActionId, Career } from './career';

export type TraitId =
  | 'diligent'
  | 'competitor'
  | 'optimist'
  | 'leader'
  | 'showman'
  | 'cool'
  | 'hothead'
  | 'timid'
  // M18
  | 'workaholic'
  | 'ironman'
  | 'streaky'
  | 'steady'
  | 'selfish'
  | 'unselfish'
  | 'defender'
  | 'sniper'
  | 'socialite'
  | 'mediaStar'
  | 'natural'
  | 'perfectionist';

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
  // M18
  { id: 'workaholic', label: '연습벌레', desc: '훈련 포인트 +15%, 대신 훈련으로 더 지친다' },
  { id: 'ironman', label: '강철 체력', desc: '잘 안 다치고 덜 지친다. 경기 중 지구력·회복력' },
  { id: 'streaky', label: '기복파', desc: '터지는 날은 크게 터지고 아닌 날은 조용하다 (경기 중 일관성 크게 낮음, 집중력 조금)' },
  { id: 'steady', label: '꾸준함', desc: '경기 중 일관성이 오르고 컨디션이 잘 안 흔들린다' },
  { id: 'selfish', label: '이기적', desc: '더 많이 쏜다. 팀워크가 떨어지고 친밀도가 천천히 오른다' },
  { id: 'unselfish', label: '이타적', desc: '공을 더 돌린다. 경기 중 패스·시야·팀워크, 친밀도가 잘 오른다' },
  { id: 'defender', label: '수비광', desc: '경기 중 수비 능력치가 오른다' },
  { id: 'sniper', label: '저격수', desc: '경기 중 3점·미드레인지·자유투가 오르고 기본기 슛을 더 자주' },
  { id: 'socialite', label: '인싸', desc: '친밀도가 50% 더 빨리 오르고 인기도 조금. 경기 중 집중력은 조금 떨어진다' },
  { id: 'mediaStar', label: '방송 체질', desc: '광고 촬영비 +35%, 인기 +25%' },
  { id: 'natural', label: '감각파', desc: '경기 중 센스가 오르고 화려한 동작이 늘지만 훈련 포인트 -5%' },
  { id: 'perfectionist', label: '완벽주의', desc: '개인 훈련 +6%, 경기 중 자유투·집중력. 기분은 쉽게 가라앉는다' },
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
const PERSONAL: ActionId[] = ['solo', 'mentor', 'trainer'];

/** 주간 행동 포인트 배율 */
export function traitPointMult(c: Career, id: ActionId): number {
  let m = 1;
  if (hasTrait(c, 'diligent') && TRAINING.includes(id)) m *= 1.08;
  if (hasTrait(c, 'timid') && ALONE.includes(id)) m *= 1.1;
  if (hasTrait(c, 'workaholic') && TRAINING.includes(id)) m *= 1.15;
  if (hasTrait(c, 'natural') && TRAINING.includes(id)) m *= 0.95;
  if (hasTrait(c, 'perfectionist') && PERSONAL.includes(id)) m *= 1.06;
  return m;
}

/** 훈련 피로 배율 (M18) */
export function traitFatigue(c: Career, id: ActionId): number {
  let m = 1;
  if (hasTrait(c, 'workaholic') && TRAINING.includes(id)) m *= 1.2;
  if (hasTrait(c, 'ironman')) m *= 0.9;
  return m;
}

/** 부상 확률 배율 (M18) */
export function traitInjury(c: Career): number {
  let m = 1;
  if (hasTrait(c, 'ironman')) m *= 0.6;
  if (hasTrait(c, 'workaholic')) m *= 1.1;
  return m;
}

/** 광고 촬영비 배율 (M18) */
export function traitPay(c: Career): number {
  return hasTrait(c, 'mediaStar') ? 1.35 : 1;
}

/** 경기 엔진: 팀 슛 몫을 이만큼 더 (이기적 +, 이타적 -) */
export function traitUsage(c: Career): number {
  return (hasTrait(c, 'selfish') ? 0.05 : 0) - (hasTrait(c, 'unselfish') ? 0.04 : 0);
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
  // M18
  if (hasTrait(c, 'ironman')) {
    add('stamina', 3);
    add('recovery', 3);
  }
  if (hasTrait(c, 'streaky')) {
    add('consistency', -12);
    add('focus', 2);
  }
  if (hasTrait(c, 'steady')) add('consistency', 8);
  if (hasTrait(c, 'selfish')) add('teamwork', -6);
  if (hasTrait(c, 'unselfish')) {
    add('passing', 3);
    add('vision', 3);
    add('teamwork', 6);
  }
  if (hasTrait(c, 'defender')) for (const k of ['perimeterD', 'postD', 'helpD', 'steal', 'block'] as RatingKey[]) add(k, 3);
  if (hasTrait(c, 'sniper')) for (const k of ['three', 'midRange', 'freeThrow'] as RatingKey[]) add(k, 2);
  if (hasTrait(c, 'socialite')) add('focus', -3);
  if (hasTrait(c, 'natural')) add('sense', 5);
  if (hasTrait(c, 'perfectionist')) {
    add('freeThrow', 4);
    add('focus', 2);
  }
  return out;
}

/** 친밀도·감독 신뢰 상승 배율 */
export function traitSocial(c: Career): { friends: number; trust: number } {
  const st = { friends: 1, trust: 1 };
  if (hasTrait(c, 'leader')) {
    st.friends *= 1.3;
    st.trust *= 1.15;
  }
  if (hasTrait(c, 'socialite')) st.friends *= 1.5;
  if (hasTrait(c, 'unselfish')) st.friends *= 1.2;
  if (hasTrait(c, 'selfish')) {
    st.friends *= 0.7;
    st.trust *= 0.9;
  }
  if (hasTrait(c, 'perfectionist')) st.friends *= 0.9;
  if (hasTrait(c, 'workaholic')) st.trust *= 1.1;
  return st;
}

/** 인기 상승 배율 */
export function traitPop(c: Career): number {
  let m = 1;
  if (hasTrait(c, 'showman')) m *= 1.25;
  if (hasTrait(c, 'mediaStar')) m *= 1.25;
  if (hasTrait(c, 'socialite')) m *= 1.1;
  return m;
}

/** 컨디션 변화 쪽으로 미는 정도 */
export function traitMood(c: Career): number {
  let m = 0;
  if (hasTrait(c, 'optimist')) m += 0.25;
  if (hasTrait(c, 'socialite')) m += 0.1;
  if (hasTrait(c, 'perfectionist')) m -= 0.05;
  return m;
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
  if (hasTrait(c, 'sniper')) st.basic *= 1.2;
  if (hasTrait(c, 'natural')) st.flash *= 1.3;
  return st;
}
