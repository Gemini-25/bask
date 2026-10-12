import type { Rng } from '../core/rng';
import { generatePlayer, POSITIONS, type Player, type Position } from './player';

/** 팀 전술 성향 (0~1). 하프코트 공격에서 어떤 플레이를 고를지 가중치. */
export interface Tactics {
  pace: number;
  pnr: number;
  iso: number;
  post: number;
  motion: number;
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
  { id: 'SEO', city: '서울', name: '스카이호크스', short: '서울', color: '#3d8fe0', color2: '#e8f2ff', tactics: { pace: 0.6, pnr: 0.4, iso: 0.2, post: 0.1, motion: 0.3 } },
  { id: 'BUS', city: '부산', name: '씨라이언즈', short: '부산', color: '#f08a2c', color2: '#1d2a4a', tactics: { pace: 0.7, pnr: 0.3, iso: 0.3, post: 0.1, motion: 0.3 } },
  { id: 'INC', city: '인천', name: '썬더볼츠', short: '인천', color: '#f2cc2e', color2: '#1b1b1b', tactics: { pace: 0.5, pnr: 0.5, iso: 0.1, post: 0.2, motion: 0.2 } },
  { id: 'DAE', city: '대구', name: '블레이즈', short: '대구', color: '#e0473d', color2: '#fff2ea', tactics: { pace: 0.6, pnr: 0.3, iso: 0.4, post: 0.1, motion: 0.2 } },
  { id: 'GWA', city: '광주', name: '팬서스', short: '광주', color: '#2b2b33', color2: '#d9b25a', tactics: { pace: 0.4, pnr: 0.3, iso: 0.2, post: 0.3, motion: 0.2 } },
  { id: 'DJN', city: '대전', name: '코메츠', short: '대전', color: '#8a5cd6', color2: '#f3ecff', tactics: { pace: 0.5, pnr: 0.3, iso: 0.2, post: 0.1, motion: 0.4 } },
  { id: 'ULS', city: '울산', name: '웨일즈', short: '울산', color: '#1fa5a0', color2: '#e6fffb', tactics: { pace: 0.4, pnr: 0.4, iso: 0.1, post: 0.3, motion: 0.2 } },
  { id: 'SUW', city: '수원', name: '그리핀스', short: '수원', color: '#3fa34d', color2: '#f0ffe8', tactics: { pace: 0.5, pnr: 0.4, iso: 0.2, post: 0.2, motion: 0.2 } },
  { id: 'CHW', city: '창원', name: '스톰', short: '창원', color: '#5fc4e8', color2: '#0f2733', tactics: { pace: 0.8, pnr: 0.3, iso: 0.2, post: 0.1, motion: 0.4 } },
  { id: 'JEJ', city: '제주', name: '오션스', short: '제주', color: '#e86aa0', color2: '#fff0f6', tactics: { pace: 0.6, pnr: 0.3, iso: 0.3, post: 0.1, motion: 0.3 } },
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
    const q = strength + (i === ace ? 9 : rng.normal(2, 4));
    players.push(generatePlayer(rng, pos, q, num()));
  });
  for (const pos of BENCH) players.push(generatePlayer(rng, pos, strength + rng.normal(-5, 4), num()));
  return { ...info, players };
}
