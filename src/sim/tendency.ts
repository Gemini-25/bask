// 선수별 성향 (M28): 같은 실력이라도 무엇을 좋아하는지. 능력치끼리 비교해서 (이 선수 안에서) 잘하는 쪽을 더 고른다.
// 3점·미드레인지·림 어택 (돌파)·포스트·패스. 다 비슷하면 성향 없이 고르게
import type { Player } from '../data/player';

export type TendKey = 'three' | 'mid' | 'rim' | 'post' | 'pass';
export interface Tendency {
  three: number;
  mid: number;
  rim: number;
  post: number;
  pass: number;
  /** 두드러진 성향 (화면용, 강한 순) */
  labels: string[];
}

export const TEND_LABEL: Record<TendKey, string> = { three: '3점 슈터', mid: '미드레인지', rim: '림 어택', post: '포스트', pass: '패스 우선' };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const BASE: Record<TendKey, number> = { three: 47.5, mid: 49.3, rim: 50.8, post: 42.2, pass: 48.6 };

/** -1 ~ 1: 이 선수 안에서 그 쪽을 얼마나 더 좋아하나 */
export function tendencyOf(p: Player): Tendency {
  const r = p.r;
  const big = p.pos === 'PF' || p.pos === 'C';
  const s: Record<TendKey, number> = {
    three: r.three,
    mid: r.midRange,
    rim: (r.layup + r.dunk) / 2 * 0.5 + ((r.speed + r.accel + r.ballHandling) / 3) * 0.5,
    post: ((r.postUp + r.strength) / 2) * (big ? 1 : 0.88),
    pass: (r.passing + r.vision + r.teamwork) / 3,
  };
  const keys = Object.keys(s) as TendKey[];
  // 리그 평균 선수 기준으로 (평균 선수는 성향 0): 리그 평균 3점 47.5, 미드 49.3, 림 어택 50.8, 포스트 42.2, 패스 48.6
  for (const k of keys) s[k] -= BASE[k];
  const mean = keys.reduce((a, k) => a + s[k], 0) / keys.length;
  const out = { labels: [] as string[] } as Tendency;
  for (const k of keys) out[k] = clamp((s[k] - mean) / 18, -1, 1);
  out.labels = keys
    .filter((k) => out[k] >= 0.35)
    .sort((a, b) => out[b] - out[a])
    .slice(0, 2)
    .map((k) => TEND_LABEL[k]);
  return out;
}
