// 돈과 물건 (L1, T8): 연봉, 장비, 집 꾸미기. 금액 단위는 만원.
import type { RatingKey } from '../data/ratings';
import type { Career } from './career';

export type ItemKind = 'gear' | 'house' | 'cheer';

export interface ItemDef {
  id: string;
  kind: ItemKind;
  label: string;
  desc: string;
  price: number;
  /** 경기 중 능력치 보너스 (장비) */
  boost?: Partial<Record<RatingKey, number>>;
}

export const ITEMS: ItemDef[] = [
  { id: 'shoeLight', kind: 'gear', label: '가벼운 농구화', desc: '경기 중 스피드 +2, 가속 +2', price: 300, boost: { speed: 2, accel: 2 } },
  { id: 'shoePro', kind: 'gear', label: '프로 시그니처 농구화', desc: '경기 중 스피드 +3, 가속 +3, 점프력 +2', price: 1200, boost: { speed: 3, accel: 3, jump: 2 } },
  { id: 'sleeve', kind: 'gear', label: '슈팅 슬리브', desc: '경기 중 3점슛 +1, 미드레인지 +1, 자유투 +1', price: 150, boost: { three: 1, midRange: 1, freeThrow: 1 } },
  { id: 'knee', kind: 'gear', label: '무릎 보호대', desc: '부상 확률 20% 줄어든다', price: 400 },
  { id: 'compression', kind: 'gear', label: '컴프레션 웨어', desc: '경기 중 지구력 +3, 회복력 +2', price: 500, boost: { stamina: 3, recovery: 2 } },
  { id: 'goggles', kind: 'gear', label: '스포츠 고글', desc: '경기 중 시야 +2, 집중력 +2', price: 600, boost: { vision: 2, focus: 2 } },
  { id: 'bed', kind: 'house', label: '좋은 침대', desc: '매주 피로가 3 더 풀린다', price: 500 },
  { id: 'homeGym', kind: 'house', label: '홈짐', desc: '웨이트 포인트 +30%', price: 2000 },
  { id: 'theater', kind: 'house', label: '영상실', desc: '영상 분석 포인트 +30%', price: 1500 },
  { id: 'yardHoop', kind: 'house', label: '마당 농구 골대', desc: '개인 훈련 포인트 +20%', price: 1000 },
  { id: 'aqua', kind: 'house', label: '아쿠아 테라피 욕조', desc: '재활이 더 빠르고 매주 피로가 2 더 풀린다', price: 3000 },
  // 응원단 (M10): 홈 경기 관중석이 바뀌고, 홈 경기 인기가 조금 더 오른다
  { id: 'cheerBanner', kind: 'cheer', label: '등번호 현수막', desc: '홈 관중석에 내 등번호 현수막이 걸린다', price: 800 },
  { id: 'cheerFlags', kind: 'cheer', label: '응원 깃발', desc: '홈 팬들이 팀 색 깃발을 흔든다', price: 600 },
  { id: 'cheerChant', kind: 'cheer', label: '이름 응원 구호', desc: '내가 코트에 있으면 관중이 내 이름을 외친다', price: 1200 },
  { id: 'cheerMascot', kind: 'cheer', label: '마스코트 인형탈', desc: '코트 앞에서 마스코트가 분위기를 띄운다', price: 1800 },
  { id: 'cheerLeaders', kind: 'cheer', label: '치어리더 후원', desc: '골대 옆에서 치어리더가 춤춘다', price: 2500 },
  { id: 'cheerJumbo', kind: 'cheer', label: '전광판 내 얼굴', desc: '내가 넣으면 전광판에 내 등번호가 뜬다', price: 3000 },
];

/** 홈 경기 인기 상승 배율 (응원 아이템 하나에 5%) */
export function cheerBoost(c: Career): number {
  return 1 + 0.05 * (c.items ?? []).filter((id) => itemDef(id)?.kind === 'cheer').length;
}

export function itemDef(id: string) {
  return ITEMS.find((i) => i.id === id);
}

export function has(c: Career, id: string) {
  return (c.items ?? []).includes(id);
}

export function buy(c: Career, id: string): boolean {
  const it = itemDef(id);
  if (!it || has(c, id) || c.money < it.price) return false;
  c.money -= it.price;
  (c.items ??= []).push(id);
  return true;
}

/** 경기 중 장비 보너스 합 */
export function gearBoost(c: Career): Partial<Record<RatingKey, number>> {
  const out: Partial<Record<RatingKey, number>> = {};
  for (const id of c.items ?? []) {
    const b = itemDef(id)?.boost;
    if (!b) continue;
    for (const [k, v] of Object.entries(b)) out[k as RatingKey] = (out[k as RatingKey] ?? 0) + v!;
  }
  return out;
}

/** 행동 포인트 배율 (집 꾸미기) */
export function houseMult(c: Career, action: string): number {
  if (action === 'weight' && has(c, 'homeGym')) return 1.3;
  if (action === 'video' && has(c, 'theater')) return 1.3;
  if (action === 'solo' && has(c, 'yardHoop')) return 1.2;
  return 1;
}

/** 매주 더 풀리는 피로 */
export function houseRest(c: Career): number {
  return (has(c, 'bed') ? 3 : 0) + (has(c, 'aqua') ? 2 : 0);
}

/** 신인 계약: 1순위 9천만에서 순번마다 줄어든다 (2년) */
export function rookieSalary(pickNo: number): number {
  return Math.round(pickNo <= 10 ? 9000 - (pickNo - 1) * 450 : 3500 - (pickNo - 11) * 150);
}

/** 재계약 제시액: 종합 능력치와 인기 */
export function offerFor(ovr: number, popularity: number): number {
  const base = 3000 + Math.max(0, ovr - 45) ** 2 * 25;
  return Math.round((base * (1 + popularity / 200)) / 100) * 100;
}

export function moneyText(v: number): string {
  const eok = Math.floor(v / 10000);
  const man = Math.round(v % 10000);
  if (eok && man) return `${eok}억 ${man.toLocaleString()}만`;
  if (eok) return `${eok}억`;
  return `${man.toLocaleString()}만`;
}
