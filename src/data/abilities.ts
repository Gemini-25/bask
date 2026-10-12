// 특수능력 (S8, S9): 좋은 능력은 ★1~3으로 진화하고, 나쁜 능력은 조건을 채우면 사라진다.
import type { Player } from './player';

export type AbilityId = 'clutch' | 'ankle' | 'lockdown' | 'rebound' | 'quickRelease' | 'noLook' | 'zone' | 'moodMaker' | 'glass' | 'chicken' | 'ftPhobia' | 'foulProne';

export interface AbilityDef {
  id: AbilityId;
  label: string;
  desc: string;
  bad?: boolean;
}

export const ABILITIES: AbilityDef[] = [
  { id: 'clutch', label: '클러치 슈터', desc: '4쿼터 막판 접전에서 슛 성공률이 오른다' },
  { id: 'ankle', label: '앵클 브레이커', desc: '돌파할 때 수비를 넘어뜨릴 확률이 오른다' },
  { id: 'lockdown', label: '철벽 수비', desc: '내가 막는 선수의 슛이 더 어려워진다' },
  { id: 'rebound', label: '리바운드 머신', desc: '리바운드 다툼에서 강해진다' },
  { id: 'quickRelease', label: '퀵 릴리즈', desc: '빠른 슛 동작. 수비 견제를 덜 받는다' },
  { id: 'noLook', label: '노룩 패스', desc: '패스를 가로채일 확률이 줄어든다' },
  { id: 'zone', label: '인 더 존', desc: '연속 3번 넣으면 손끝이 뜨거워진다' },
  { id: 'moodMaker', label: '분위기 메이커', desc: '내가 코트에 있으면 팀원 슛이 조금 좋아진다' },
  { id: 'glass', label: '유리몸', desc: '다치기 쉽다', bad: true },
  { id: 'chicken', label: '새가슴', desc: '막판 접전에서 슛과 자유투가 흔들린다', bad: true },
  { id: 'ftPhobia', label: '자유투 공포증', desc: '자유투 성공률이 크게 떨어진다', bad: true },
  { id: 'foulProne', label: '파울 트러블', desc: '파울을 자주 한다', bad: true },
];

export function abilityDef(id: AbilityId) {
  return ABILITIES.find((a) => a.id === id)!;
}

/** 선수의 능력 단계 (없으면 0) */
export function lv(p: Player, id: AbilityId): number {
  return p.abilities?.[id] ?? 0;
}

export function stars(n: number) {
  return '★'.repeat(n);
}

// 경기 엔진이 쓰는 효과 크기 (단계별, 0단계는 효과 없음)
export const FX = {
  clutch: [0, 0.03, 0.05, 0.08],
  ankle: [1, 1.4, 1.7, 2.0],
  lockdown: [0, 0.08, 0.14, 0.2],
  rebound: [0, 0.15, 0.3, 0.45],
  quickRelease: [0, 0.1, 0.18, 0.25],
  noLook: [0, 0.2, 0.35, 0.5],
  zone: [0, 0.04, 0.06, 0.08],
  moodMaker: [0, 0.01, 0.015, 0.02],
};
