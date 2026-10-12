// 연애 (R4, M13): 설정에서 끌 수 있는 가벼운 이벤트. 효과는 컨디션과 정신 포인트 조금
import type { Rng } from '../core/rng';
import { koreanName } from '../data/names';
import type { Career } from './career';

export type RomanceStatus = 'crush' | 'dating' | 'married';

export interface Romance {
  name: string;
  /** 호감도 0~100 */
  affection: number;
  status: RomanceStatus;
  /** 만난 주 */
  met: number;
}

export const ROMANCE_LABEL: Record<RomanceStatus, string> = { crush: '썸', dating: '연애 중', married: '결혼' };

export function romanceOn(c: Career) {
  return c.settings?.romance !== false;
}

export function meet(c: Career, rng: Rng) {
  c.romance = { name: koreanName(rng, c.gender === 'M' ? 'F' : 'M'), affection: 20, status: 'crush', met: c.week };
}

/** 호감도를 바꾸고, 바닥나면 헤어진다 */
export function addAffection(c: Career, d: number): string | null {
  const r = c.romance;
  if (!r) return null;
  r.affection = Math.max(0, Math.min(100, r.affection + d));
  if (r.affection <= 0 && r.status !== 'married') {
    c.romance = null;
    return `${r.name}와(과) 멀어졌다...`;
  }
  return null;
}

export function setStatus(c: Career, s: RomanceStatus): string | null {
  const r = c.romance;
  if (!r) return null;
  r.status = s;
  if (s === 'dating') return `${r.name}와(과) 사귀게 됐다!`;
  if (s === 'married') return `${r.name}와(과) 결혼했다! 💍`;
  return null;
}

/** 연애 중이면 큰 경기 전에 컨디션이 잘 안 떨어진다 */
export function romanceMood(c: Career): number {
  if (!romanceOn(c) || !c.romance) return 0;
  return c.romance.status === 'crush' ? 0.05 : 0.12;
}
