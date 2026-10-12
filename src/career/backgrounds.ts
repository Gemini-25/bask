// 출신 배경 (M2). 고르면 시작 능력치·키·잠재력·자유 포인트가 정해진다. 랜덤 요소 없음 (M1).
import type { RatingKey } from '../data/ratings';

export type BackgroundId = 'elite' | 'street' | 'lateTall' | 'convert' | 'abroad' | 'ordinary' | 'genius';

export interface Background {
  id: BackgroundId;
  label: string;
  desc: string;
  /** 모든 능력치에 더하는 값 */
  all: number;
  /** 항목별로 더하는 값 */
  mods: Partial<Record<RatingKey | 'physical' | 'offense' | 'defense' | 'mental', number>>;
  /** 시작 키 보정 (cm) */
  height: number;
  /** 고교 동안 더 클 키 (평균, cm) */
  growth: number;
  potential: number;
  freePoints: number;
}

export const BACKGROUNDS: Background[] = [
  {
    id: 'ordinary',
    label: '평범한 동네 아이',
    desc: '특별한 건 없지만 그만큼 자유롭게 키울 수 있다. 자유 포인트가 가장 많고 잠재력도 높다.',
    all: 0,
    mods: {},
    height: 0,
    growth: 4,
    potential: 88,
    freePoints: 100,
  },
  {
    id: 'elite',
    label: '농구 명문가 2세',
    desc: '아버지가 프로 출신. 기본기가 탄탄하고 농구를 보는 눈이 있다.',
    all: 3,
    mods: { iq: 8, vision: 5, teamwork: 5, freeThrow: 6, leadership: 4 },
    height: 2,
    growth: 4,
    potential: 84,
    freePoints: 60,
  },
  {
    id: 'street',
    label: '길거리 농구 출신',
    desc: '공원 코트에서 큰 승부사. 드리블과 마무리는 화려하지만 팀플레이는 서툴다.',
    all: 0,
    mods: { ballHandling: 12, layup: 8, floater: 6, competitive: 10, hustle: 6, three: -4, teamwork: -8, freeThrow: -4 },
    height: 0,
    growth: 4,
    potential: 82,
    freePoints: 60,
  },
  {
    id: 'lateTall',
    label: '늦게 시작한 장신',
    desc: '중학교 때 농구를 시작했다. 기술은 서툴지만 키가 크고 아직도 자라는 중.',
    all: 0,
    mods: { offense: -8, defense: -3, block: 10, defReb: 6, jump: 4, speed: -4, agility: -4 },
    height: 8,
    growth: 7,
    potential: 92,
    freePoints: 50,
  },
  {
    id: 'convert',
    label: '타 종목 전향',
    desc: '육상부 출신. 몸은 이미 완성형이지만 농구 기술과 감각은 처음부터.',
    all: 0,
    mods: { physical: 12, offense: -8, iq: -6, vision: -4 },
    height: 0,
    growth: 3,
    potential: 85,
    freePoints: 60,
  },
  {
    id: 'abroad',
    label: '해외 유학파',
    desc: '미국 중학교에서 농구를 배웠다. 슛과 농구 IQ가 좋고 몸싸움은 약하다.',
    all: 0,
    mods: { three: 10, midRange: 6, iq: 6, passing: 4, offBall: 4, strength: -4, postD: -3 },
    height: 0,
    growth: 4,
    potential: 84,
    freePoints: 60,
  },
  {
    id: 'genius',
    label: '천재',
    desc: '모든 능력치 최대로 시작하는 무쌍 모드. 키울 게 없으니 경기 보는 맛으로.',
    all: 0,
    mods: {},
    height: 6,
    growth: 3,
    potential: 99,
    freePoints: 0,
  },
];

export function backgroundById(id: BackgroundId): Background {
  return BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];
}

export type GrowthType = 'early' | 'normal' | 'late';

/** 성장 타입 (S11): 고교 1~3학년, 그 뒤 프로 시절 포인트 배율 */
export const GROWTH_TYPES: { id: GrowthType; label: string; desc: string; mult: number[] }[] = [
  { id: 'early', label: '조숙형', desc: '고교 때 빨리 크고 프로에선 일찍 꺾인다', mult: [1.25, 1.2, 1.1, 0.9] },
  { id: 'normal', label: '보통', desc: '꾸준히 큰다', mult: [1, 1, 1, 1] },
  { id: 'late', label: '만성형', desc: '고교 땐 느리지만 프로에서 오래 큰다', mult: [0.85, 0.9, 1, 1.2] },
];
