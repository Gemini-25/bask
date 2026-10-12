// 자신감과 별명 (M19, 질문지 S10·M7)
// 자신감 0~100 (기본 50): 잘한 경기·승리·수상으로 오르고, 못한 경기·패배로 떨어진다. 매주 50 쪽으로 조금씩.
// 경기 중 침착성·일관성·집중력·승부욕에 ±5까지. 별명은 커리어 기록과 특수능력으로 저절로 붙는다.
import type { RatingKey } from '../data/ratings';
import type { Career } from './career';

export function confidenceOf(c: Career) {
  return c.confidence ?? 50;
}

export function addConfidence(c: Career, d: number) {
  c.confidence = Math.max(0, Math.min(100, confidenceOf(c) + d));
}

/** 경기 뒤: 평점과 승패 */
export function confidenceAfterGame(c: Career, grade: string, won: boolean, played: boolean) {
  const d = played ? ({ S: 8, A: 5, B: 2, C: -1, D: -4 }[grade] ?? 0) + (won ? 2 : -2) : -1;
  addConfidence(c, d);
}

/** 매주 50 쪽으로 */
export function confidenceDrift(c: Career) {
  const v = confidenceOf(c);
  if (v > 50) addConfidence(c, -Math.min(1, v - 50));
  else if (v < 50) addConfidence(c, Math.min(1, 50 - v));
}

/** 경기 중 정신 능력치 보정 (±5) */
export function confidenceBoost(c: Career): Partial<Record<RatingKey, number>> {
  const d = Math.round((confidenceOf(c) - 50) / 10);
  if (!d) return {};
  return { composure: d, consistency: d, focus: d, competitive: d };
}

export const CONFIDENCE_LABEL = (v: number) => (v >= 85 ? '하늘을 찌름' : v >= 65 ? '자신만만' : v >= 40 ? '보통' : v >= 20 ? '주눅' : '바닥');

/** 붙을 수 있는 별명 (앞에 있을수록 먼저) */
const NICKS: { name: string; test: (c: Career) => boolean }[] = [
  { name: '살아있는 전설', test: (c) => c.trophies.filter((t) => /시즌 MVP$/.test(t)).length >= 3 },
  { name: '포스터 장인', test: (c) => (c.stats.posters ?? 0) >= 12 },
  { name: '판타지스타', test: (c) => (c.stats.moves ?? 0) >= 80 },
  { name: '골밑의 수호신', test: (c) => (c.me.abilities?.rimProtector ?? 0) >= 2 && (c.stats.blocks ?? 0) >= 80 },
  { name: '클러치 킹', test: (c) => c.stats.clutchMade >= 20 },
  { name: '3점 기계', test: (c) => c.stats.threesMade >= 200 && c.me.r.three >= 85 },
  { name: '야전사령관', test: (c) => c.stats.ast >= 400 && c.me.r.passing >= 75 },
  { name: '소매치기', test: (c) => (c.stats.steals ?? 0) >= 120 },
  { name: '리바운드 머신', test: (c) => c.stats.reb >= 1200 },
  { name: '득점 기계', test: (c) => c.stats.big >= 25 },
  { name: '앵클 브레이커', test: (c) => c.stats.ankles >= 30 },
  { name: '천재', test: (c) => c.background === 'genius' },
  { name: '덩크 머신', test: (c) => (c.dunks ?? []).length >= 8 },
  { name: '슈터', test: (c) => c.stats.threesMade >= 60 },
  { name: '루키', test: (c) => !!c.pro && (c.pro.season ?? 0) === 0 && c.stats.games >= 10 },
];

export function nicknameFor(c: Career): string | null {
  return NICKS.find((n) => n.test(c))?.name ?? null;
}

/** 별명이 바뀌었으면 알림 */
export function checkNickname(c: Career): string[] {
  const n = nicknameFor(c);
  if (!n || n === c.nickname) return [];
  const before = c.nickname;
  c.nickname = n;
  return [before ? `별명이 바뀌었다: '${before}' → '${n}'` : `별명이 생겼다: '${n}'`];
}

/** 화면에 쓰는 이름 ('3점 기계' 자동선수) */
export function displayName(c: Career) {
  return c.nickname ? `'${c.nickname}' ${c.me.name}` : c.me.name;
}
