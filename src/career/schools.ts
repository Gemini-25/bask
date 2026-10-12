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

// 가상 대학 10팀 (W2, M12). 고교보다 세고 프로보다 약하다
export const COLLEGES: SchoolInfo[] = [
  { id: 'U_HAN', city: '서울', name: '한강대', short: '한강', color: '#2a5fbf', color2: '#e6eeff', strength: -6, blurb: '대학 최강. 주전 경쟁이 치열하다', tactics: T({ pnr: 0.45, motion: 0.35 }) },
  { id: 'U_KOR', city: '서울', name: '고려산대', short: '고려산', color: '#b3263a', color2: '#ffe9ec', strength: -6.5, blurb: '전통의 명문, 거친 수비', tactics: T({ switch: 0.45, double: 0.35, press: 0.15 }) },
  { id: 'U_YON', city: '서울', name: '연희대', short: '연희', color: '#1d3a8a', color2: '#e6ecff', strength: -7, blurb: '빠른 트랜지션', tactics: T({ pace: 0.75, press: 0.2 }) },
  { id: 'U_JUN', city: '서울', name: '중앙숲대', short: '중앙숲', color: '#3d6fd6', color2: '#eef3ff', strength: -8, blurb: '프로 진출 선수가 많다', tactics: T({ iso: 0.35 }) },
  { id: 'U_KYU', city: '서울', name: '경희봄대', short: '경희봄', color: '#7a2a3a', color2: '#ffeef2', strength: -8.5, blurb: '골밑이 강하다', tactics: T({ post: 0.4 }) },
  { id: 'U_SUN', city: '수원', name: '성균나무대', short: '성균', color: '#2f8a5a', color2: '#eaffef', strength: -9, blurb: '3점슛으로 승부', tactics: T({ pindown: 0.25, dho: 0.2 }) },
  { id: 'U_DAN', city: '용인', name: '단풍대', short: '단풍', color: '#d0682a', color2: '#fff1e6', strength: -9.5, blurb: '조직 농구', tactics: T({ motion: 0.45 }) },
  { id: 'U_DON', city: '서울', name: '동국산대', short: '동국', color: '#e0a33d', color2: '#2a1d0a', strength: -10, blurb: '지역방어의 팀', tactics: T({ zone: 0.45 }) },
  { id: 'U_MYO', city: '서울', name: '명지바다대', short: '명지', color: '#3d8fb0', color2: '#e6f7ff', strength: -11, blurb: '바로 주전으로 뛸 수 있다', tactics: T({}) },
  { id: 'U_JOS', city: '광주', name: '조선별대', short: '조선별', color: '#5a3d8a', color2: '#f1eaff', strength: -11.5, blurb: '신흥 강호, 기회가 많다', tactics: T({ pace: 0.65 }) },
];

export function schoolById(id: string): SchoolInfo {
  return SCHOOLS.find((s) => s.id === id) ?? COLLEGES.find((s) => s.id === id) ?? SCHOOLS[0];
}

export function isCollege(id: string) {
  return COLLEGES.some((s) => s.id === id);
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

// 대학은 4학년까지 (4학년이 주축)
const ROSTER4: [Position, number][] = [
  ['PG', 4], ['SG', 4], ['SF', 3], ['PF', 4], ['C', 3],
  ['PG', 3], ['SG', 2], ['SF', 2], ['C', 4],
  ['PG', 1], ['SF', 1], ['PF', 2], ['SG', 1],
];

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
  const college = isCollege(info.id);
  const gradeQ = college ? [0, -4, -1.5, 0.5, 2] : [0, -5, -1.5, 1.5];
  const top = college ? 4 : 3;
  return (college ? ROSTER4 : ROSTER).map(([pos, grade]) => ({
    player: generatePlayer(rng, pos, info.strength + gradeQ[grade] + rng.normal(0, 2.5), num(), { heightAdj: hsHeightAdj(gender) + (college ? 2 : 0) + (grade - top) * (college ? 0.8 : 1.5), gender }),
    grade,
  }));
}
