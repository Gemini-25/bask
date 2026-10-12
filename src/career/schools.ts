// 가상 고교 10팀 (W3). 강호일수록 strength가 높다 (0 = 프로 평균, 고교는 -15 안팎).
import type { Rng } from '../core/rng';
import type { Gender } from '../data/names';
import { generatePlayer, type Player, type Position } from '../data/player';
import type { Tactics, TeamInfo } from '../data/teams';

export interface SchoolInfo extends TeamInfo {
  strength: number;
  /** 한 줄 소개 */
  blurb: string;
}

const T = (t: Partial<Tactics>): Tactics => ({ pace: 0.5, pnr: 0.3, iso: 0.2, post: 0.15, motion: 0.3, pindown: 0.1, dho: 0.1, zone: 0.15, zoneType: '23', press: 0.1, switch: 0.25, double: 0.2, ...t });

export const SCHOOLS: SchoolInfo[] = [
  { id: 'HANB', city: '서울', name: '한빛고', short: '한빛', color: '#3d6fd6', color2: '#eaf0ff', strength: -12, blurb: '전국대회 단골. 선배들이 강하다', tactics: T({ pnr: 0.4, motion: 0.3 }) },
  { id: 'HAES', city: '부산', name: '해성고', short: '해성', color: '#e0703d', color2: '#1d2a4a', strength: -12.5, blurb: '빠른 농구, 풀코트 프레스', tactics: T({ pace: 0.75, press: 0.35, zone: 0.05 }) },
  { id: 'SONG', city: '인천', name: '송도고', short: '송도', color: '#f2c12e', color2: '#1b1b1b', strength: -14, blurb: '조직력의 팀', tactics: T({ motion: 0.45, pindown: 0.2 }) },
  { id: 'DALG', city: '대구', name: '달구벌고', short: '달구벌', color: '#d6413a', color2: '#fff2ea', strength: -14.5, blurb: '에이스 중심 아이솔레이션', tactics: T({ iso: 0.4 }) },
  { id: 'MUDE', city: '광주', name: '무등고', short: '무등', color: '#2f8a5a', color2: '#f0ffe8', strength: -13, blurb: '끈질긴 지역방어', tactics: T({ zone: 0.45, zoneType: '23' }) },
  { id: 'HANBT', city: '대전', name: '한밭고', short: '한밭', color: '#8a5cd6', color2: '#f3ecff', strength: -15, blurb: '키 큰 선수가 많다', tactics: T({ post: 0.35 }) },
  { id: 'TAEH', city: '울산', name: '태화고', short: '태화', color: '#1fa5a0', color2: '#e6fffb', strength: -16, blurb: '신생 농구부, 성장 중', tactics: T({}) },
  { id: 'HWAS', city: '수원', name: '화성고', short: '화성', color: '#b3473d', color2: '#ffe9e0', strength: -13.5, blurb: '3점슛 군단', tactics: T({ pindown: 0.25, dho: 0.2 }) },
  { id: 'JINH', city: '창원', name: '진해고', short: '진해', color: '#5fb4e8', color2: '#0f2733', strength: -14.5, blurb: '수비부터 하는 팀', tactics: T({ switch: 0.45, double: 0.3 }) },
  { id: 'TAML', city: '제주', name: '탐라고', short: '탐라', color: '#e86aa0', color2: '#fff0f6', strength: -16, blurb: '작지만 빠르다', tactics: T({ pace: 0.7, zone: 0.25, zoneType: '32' }) },
];

export function schoolById(id: string): SchoolInfo {
  return SCHOOLS.find((s) => s.id === id) ?? SCHOOLS[0];
}

/** 고교 선수 키: 프로보다 4cm 작고, 여자 리그는 13cm 더 작다 */
export function hsHeightAdj(gender: Gender) {
  return gender === 'F' ? -17 : -4;
}

export interface RosterEntry {
  player: Player;
  /** 1~3학년 */
  grade: number;
}

const ROSTER: [Position, number][] = [
  ['PG', 3], ['SG', 3], ['SF', 3], ['PF', 3], ['C', 3],
  ['PG', 2], ['SG', 2], ['SF', 2], ['C', 2],
  ['PG', 1], ['SF', 1], ['PF', 1], ['SG', 1],
];

/** 학교 선수단 13명 (3학년이 주축). 내 선수는 따로 더한다 */
export function generateSchoolRoster(rng: Rng, info: SchoolInfo, gender: Gender, taken: number[] = []): RosterEntry[] {
  const used = new Set<number>(taken);
  const num = () => {
    let n = rng.int(0, 99);
    while (used.has(n)) n = rng.int(0, 99);
    used.add(n);
    return n;
  };
  const gradeQ = [0, -5, -1.5, 1.5];
  return ROSTER.map(([pos, grade]) => ({
    player: generatePlayer(rng, pos, info.strength + gradeQ[grade] + rng.normal(0, 2.5), num(), { heightAdj: hsHeightAdj(gender) + (grade - 3) * 1.5, gender }),
    grade,
  }));
}
