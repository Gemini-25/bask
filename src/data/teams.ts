import type { Rng } from '../core/rng';
import { generatePlayer, POSITIONS, type Player, type Position } from './player';

/** 팀 전술 성향 (0~1). 공격은 하프코트 플레이 가중치, 수비는 쓰는 빈도. */
export interface Tactics {
  pace: number;
  pnr: number;
  iso: number;
  post: number;
  motion: number;
  /** 오프스크린 슈팅 (다운스크린 받고 3점) */
  pindown: number;
  /** 드리블 핸드오프 */
  dho: number;
  /** 지역방어를 쓰는 공격권 비율 */
  zone: number;
  zoneType: '23' | '32';
  /** 득점 후 풀코트 프레스 비율 */
  press: number;
  /** 픽앤롤에서 스위치하는 비율 */
  switch: number;
  /** 포스트업·에이스에게 더블팀 가는 비율 */
  double: number;
}

export interface TeamInfo {
  id: string;
  city: string;
  name: string;
  short: string;
  color: string;
  color2: string;
  tactics: Tactics;
}

export interface Team extends TeamInfo {
  players: Player[]; // 0~4 주전 (PG, SG, SF, PF, C 순서), 5~ 벤치
}

// 가상 리그 10팀 (W3, W6)
export const TEAM_INFOS: TeamInfo[] = [
  { id: 'SEO', city: '서울', name: '스카이호크스', short: '서울', color: '#3d8fe0', color2: '#e8f2ff', tactics: { pace: 0.6, pnr: 0.4, iso: 0.2, post: 0.1, motion: 0.3, pindown: 0.15, dho: 0.15, zone: 0.05, zoneType: '23', press: 0.05, switch: 0.4, double: 0.2 } },
  { id: 'BUS', city: '부산', name: '씨라이언즈', short: '부산', color: '#f08a2c', color2: '#1d2a4a', tactics: { pace: 0.7, pnr: 0.3, iso: 0.3, post: 0.1, motion: 0.3, pindown: 0.1, dho: 0.1, zone: 0.1, zoneType: '32', press: 0.25, switch: 0.3, double: 0.3 } },
  { id: 'INC', city: '인천', name: '썬더볼츠', short: '인천', color: '#f2cc2e', color2: '#1b1b1b', tactics: { pace: 0.5, pnr: 0.5, iso: 0.1, post: 0.2, motion: 0.2, pindown: 0.1, dho: 0.2, zone: 0.05, zoneType: '23', press: 0.05, switch: 0.2, double: 0.2 } },
  { id: 'DAE', city: '대구', name: '블레이즈', short: '대구', color: '#e0473d', color2: '#fff2ea', tactics: { pace: 0.6, pnr: 0.3, iso: 0.4, post: 0.1, motion: 0.2, pindown: 0.1, dho: 0.1, zone: 0.05, zoneType: '23', press: 0.15, switch: 0.5, double: 0.15 } },
  { id: 'GWA', city: '광주', name: '팬서스', short: '광주', color: '#2b2b33', color2: '#d9b25a', tactics: { pace: 0.4, pnr: 0.3, iso: 0.2, post: 0.3, motion: 0.2, pindown: 0.1, dho: 0.1, zone: 0.35, zoneType: '23', press: 0.05, switch: 0.1, double: 0.35 } },
  { id: 'DJN', city: '대전', name: '코메츠', short: '대전', color: '#8a5cd6', color2: '#f3ecff', tactics: { pace: 0.5, pnr: 0.3, iso: 0.2, post: 0.1, motion: 0.4, pindown: 0.25, dho: 0.2, zone: 0.1, zoneType: '32', press: 0.1, switch: 0.3, double: 0.2 } },
  { id: 'ULS', city: '울산', name: '웨일즈', short: '울산', color: '#1fa5a0', color2: '#e6fffb', tactics: { pace: 0.4, pnr: 0.4, iso: 0.1, post: 0.3, motion: 0.2, pindown: 0.1, dho: 0.15, zone: 0.2, zoneType: '23', press: 0.05, switch: 0.15, double: 0.3 } },
  { id: 'SUW', city: '수원', name: '그리핀스', short: '수원', color: '#3fa34d', color2: '#f0ffe8', tactics: { pace: 0.5, pnr: 0.4, iso: 0.2, post: 0.2, motion: 0.2, pindown: 0.15, dho: 0.1, zone: 0.1, zoneType: '23', press: 0.1, switch: 0.35, double: 0.2 } },
  { id: 'CHW', city: '창원', name: '스톰', short: '창원', color: '#5fc4e8', color2: '#0f2733', tactics: { pace: 0.8, pnr: 0.3, iso: 0.2, post: 0.1, motion: 0.4, pindown: 0.2, dho: 0.1, zone: 0.05, zoneType: '32', press: 0.35, switch: 0.4, double: 0.15 } },
  { id: 'JEJ', city: '제주', name: '오션스', short: '제주', color: '#e86aa0', color2: '#fff0f6', tactics: { pace: 0.6, pnr: 0.3, iso: 0.3, post: 0.1, motion: 0.3, pindown: 0.15, dho: 0.15, zone: 0.15, zoneType: '32', press: 0.1, switch: 0.25, double: 0.25 } },
];

const BENCH: Position[] = ['PG', 'SG', 'SF', 'PF', 'C', 'SF', 'PG'];

export function generateTeam(rng: Rng, info: TeamInfo, strength = 0): Team {
  const used = new Set<number>();
  const num = () => {
    let n = rng.int(0, 99);
    while (used.has(n)) n = rng.int(0, 99);
    used.add(n);
    return n;
  };
  const players: Player[] = [];
  // 주전: 한 명은 에이스, 나머지는 평균 근처
  const ace = rng.int(0, 4);
  POSITIONS.forEach((pos, i) => {
    const q = strength + (i === ace ? 8 : rng.normal(2, 3));
    players.push(generatePlayer(rng, pos, q, num()));
  });
  // 벤치: 식스맨부터 점점 약해진다
  BENCH.forEach((pos, k) => players.push(generatePlayer(rng, pos, strength - 2 - k * 1.2 + rng.normal(0, 2.5), num())));
  return { ...info, players };
}
