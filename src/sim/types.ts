import type { Player } from '../data/player';
import type { Team } from '../data/teams';

export type Side = 0 | 1;

export type ShotKind = 'dunk' | 'layup' | 'floater' | 'hook' | 'mid' | 'three';
export type TurnoverKind = 'badPass' | 'stolenPass' | 'stolenDribble' | 'travel' | 'doubleDribble' | 'offFoul' | 'shotClock';

export type EventType =
  | 'tip'
  | 'quarterStart'
  | 'quarterEnd'
  | 'gameEnd'
  | 'made'
  | 'miss'
  | 'rebound'
  | 'turnover'
  | 'ankle'
  | 'screen';

export interface GameEvent {
  tick: number;
  type: EventType;
  team: Side;
  /** 0~9 (팀*5 + 코트 위 자리), 없으면 -1 */
  player: number;
  /** 어시스트한 선수, 블록한 선수, 스틸한 선수 등 */
  other: number;
  pts: number;
  shot?: ShotKind;
  dist?: number;
  x?: number;
  y?: number;
  offensive?: boolean;
  tov?: TurnoverKind;
  fastBreak?: boolean;
  blocked?: boolean;
  quarter: number;
  clock: number;
  score: [number, number];
  text: string;
}

export const FLAG_STUN = 1;
export const FLAG_SHOOT = 2;
export const FLAG_CUT = 4;
export const FLAG_SCREEN = 8;

/** 0.1초마다 찍은 경기 기록. 화면은 이걸 재생만 한다 (E2). */
export interface Recording {
  n: number;
  /** n × 20: 선수 10명의 x, y */
  pos: Float32Array;
  /** n × 3: 공 x, y, 높이 */
  ball: Float32Array;
  clock: Float32Array;
  shotClock: Float32Array;
  quarter: Uint8Array;
  holder: Int8Array;
  /** n × 10: FLAG_* */
  flags: Uint8Array;
}

export interface GameResult {
  seed: number;
  dt: number;
  teams: [Team, Team];
  /** 코트 위 선수 (0~4 = 팀0, 5~9 = 팀1) */
  onCourt: Player[];
  rec: Recording;
  events: GameEvent[];
  final: [number, number];
  quarters: number;
  quarterSeconds: number;
  /** 밸런스 확인용 카운터 */
  counters: Counters;
}

export interface Counters {
  possessions: [number, number];
  passes: number;
  intercepts: number;
  drives: number;
  plays: Record<string, number>;
  /** 공격권 시작부터 슛까지 걸린 시간 합계와 횟수 */
  shotTimeSum: number;
  shotTimeN: number;
}
