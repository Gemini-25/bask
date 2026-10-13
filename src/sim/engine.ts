// 경기 엔진 (E1 자율 이동 방식)
// - 0.1초마다 코트 위 10명이 "어디로 갈지" 정하고 움직인다.
// - 공 가진 선수는 0.3~0.6초마다 슛 / 돌파 / 패스 / 유지 중 하나를 고른다.
// - 성공 여부는 능력치와 상황(거리, 수비 간격, 체력)으로 확률을 계산해 주사위를 굴린다.
// - 파울·자유투, 체력과 교체, 타임아웃, 수비 전술(대인·지역·프레스·스위치·더블팀)이 있다.
// 화면 없이 돌아가고, 결과(Recording + 이벤트)를 화면이 재생한다.

import { clamp, dist, lerp, segDist } from '../core/math';
import { Rng } from '../core/rng';
import { FX, lv } from '../data/abilities';
import { DUNKS, dunkUnlocked } from '../data/dunks';
import { overall, POS_GROUP, type Player } from '../data/player';
import type { Team } from '../data/teams';
import { COURT, hoopXY, MID_Y, toLocal, toWorld } from './court';
import { carryScore, creation as creationOf } from './roles';
import { leapOf } from './leap';
import { G, missBounce, pickMiss, predictCatch, stepBall, type BallBody, type Hits, type MissKind } from './ball';
import { DRIBBLES, type DribbleDef } from '../data/dribbles';
import { canDunk, contestFactor, DEEP_DIST, elite, legend, missCut, SHOT_KEY, SHOT_LABEL, shotInfo, type Range, type ShotInfo } from './shooting';
import {
  FLAG_CUT,
  FLAG_SCREEN,
  FLAG_SHOOT,
  FLAG_STUN,
  ACT,
  type Counters,
  type DefScheme,
  type FoulKind,
  type GameEvent,
  type GameResult,
  type Lineup,
  type Side,
  type TurnoverKind,
  DRIBBLE_MOVES,
  DUNK_ACT,
  DUNK_LABEL,
  MOVE_LABEL,
  type DunkStyle,
  type PlayKind,
  type ShotMove,
  type ShotCtx,
  type Leap,
} from './types';
import { DUNK_MOVES, moveShotLabel, SHOT_MOVES, shotMove, type MoveWhen, type ShotMoveDef } from '../data/moves';
import type { RatingKey } from '../data/ratings';

export const DT = 0.1;
/** 엘리트 능력치 (M16): 80을 넘는 만큼 더 세게 친다. 99는 99답게 (99 → 114) */
const ELITE = 0.8;
const ex = (v: number) => v + Math.max(0, v - 80) * ELITE;
/** 드리블 기술 (M25): 보통 핸들러 대 보통 수비가 반쯤 이기게 */
const MOVE_EDGE = 18;
/** 길목을 읽고 뛰어드는 비율 (M26): 뛰어들어도 손이 안 닿으면 못 끊으니 예전 가로채기 확률보다 크게 */
const READ_K = 1.35;
/** 슈퍼스타 보정 최대 (팀 슛 몫을 이만큼 더 가져가도 된다) */
const STAR_MAX = 0.15;
/** 슛 동작 없이 그냥 던지는 무게 (동작 무게 합과 비교) */
const NO_MOVE_W = 3.2;

/** 개발용 훅 (tools/에서 판단 과정을 찍어볼 때) */
export const DEBUG: {
  think?: (t: number, i: number, u: number, v: number, tLeft: number, opts: string[], chosen: string) => void;
  intercept?: (info: Record<string, number | string>) => void;
  shot?: (kind: string, contest: number, p: number, made: boolean, tLeft: number) => void;
  /** 패스 길목 (M26): 'read' 뛰어듦, 'readHit' 닿음, 'stray' 그냥 손에 걸림 */
  lane?: (kind: string) => void;
} = {};
const RIM_FRONT = 0.75;
/** 벤치는 아래쪽 사이드라인 밖 */
const BENCH_Y = -1.0;

export interface SimOptions {
  quarterMinutes?: number;
  overtimeMinutes?: number;
  /** 경기 시작 체력 (두 팀 선수 순서대로, 없으면 100). 누적 피로가 있으면 덜 찬 채로 시작한다 */
  energy?: number[];
  /** 감독이 더 기회를 주는 선수 (두 팀 선수 순서 번호 → 교체 판단 가산점). 연습경기에서 신입생 기용 */
  favor?: Record<number, number>;
  /** 최소 출전 시간 (분). 그만큼 못 뛰었으면 감독이 먼저 넣고 덜 뺀다 */
  minMinutes?: Record<number, number>;
  /** 몇 반칙에 퇴장 (기본 5, 해외 리그 6) */
  foulOut?: number;
  /** 콤비 (R6): 두 선수 번호와 종류. 같이 코트에 있으면 서로 더 찾고 더 잘 된다 */
  combos?: { a: number; b: number; kind: ComboKind }[];
  /** 동작 성향 (M16, 성격): 선수 번호 → 화려한 동작·힘 동작·기본기 무게 배율 */
  style?: Record<number, MoveStyle>;
  /** 슛 욕심 (M18, 성격): 선수 번호 → 팀 슛 몫을 이만큼 더 (이기적 +, 이타적 -) */
  usage?: Record<number, number>;
  /** 딥쓰리 사거리 더 (M21, 성격 배짱 슈터): 선수 번호 → m */
  deep?: Record<number, number>;
  /** 세리머니 성향 (M21, 성격): 선수 번호 → 좋아하는 세리머니 동작 */
  celeb?: Record<number, number[]>;
}

export type ComboKind = 'alley' | 'pnr' | 'kick' | 'giveGo';
export const COMBO_LABEL: Record<ComboKind, string> = { alley: '앨리웁 콤비', pnr: '픽앤롤 콤비', kick: '킥아웃 콤비', giveGo: '기브앤고 콤비' };

export interface MoveStyle {
  flash?: number;
  power?: number;
  basic?: number;
}

export function simulateGame(a: Team, b: Team, seed: number, opts: SimOptions = {}): GameResult {
  return new GameSim(a, b, seed, opts).run();
}

/** 코트 위 한 자리 (0~9). 교체되면 pid와 pl이 바뀐다. */
interface SP {
  i: number;
  team: Side;
  pid: number;
  pl: Player;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 반응 지연을 거친 목표 지점 */
  tx: number;
  ty: number;
  /** 이번 틱에 정한 목표 지점 */
  gx: number;
  gy: number;
  urg: number;
  maxSpd: number;
  acc: number;
  tau: number;
  /** 휘청이거나 스크린에 걸린 남은 시간 */
  stun: number;
  cut: number;
  cutU: number;
  cutV: number;
  nextCut: number;
  spot: number;
  /** 대인방어로 맡은 상대 자리 */
  man: number;
  /** 지역방어에서 맡은 구역 */
  zone: number;
  screenFlag: number;
  /** 화면용: 점프 시작 시각, 길이, 높이(m) */
  jt: number;
  jd: number;
  jh: number;
  /** 화면용 점프 모양: 0 = 포물선, 1 = 림에 매달렸다가 떨어진다 (M21) */
  jk: number;
  /** 화면용: 잠깐 보여줄 동작과 끝나는 시각 */
  fx: number;
  fxUntil: number;
  /** 스텝백·유로스텝: 준비 동작 동안 미끄러지는 속도와 끝나는 시각 (M16) */
  slideX: number;
  slideY: number;
  slideUntil: number;
  /** 연출 동작 시작 시각 */
  fxT: number;
  /** 다음에 할 화면용 동작 (세리머니): 동작, 시작 시각, 길이 (M21) */
  qAct: number;
  qAt: number;
  qDur: number;
  /** 화면용 위치 (M24): 다음 틱들에 실제 자리 대신 기록할 x, y (덩크 도약 비행) */
  vq: number[] | null;
  vqN: number;
  /** 제쳐졌다 (M25): 남은 시간 동안 반응이 늦고 느리다 */
  lag: number;
  /** 속아서 쏠린 쪽 (목표 지점에 더한다)과 끝나는 시각 */
  leanX: number;
  leanY: number;
  leanUntil: number;
  /** 기술 뒤 치고 나가기: 끝나는 시각, 가속 배율 */
  burstUntil: number;
  burstK: number;
}

/** 드리블 기술 진행 (M25) */
interface MoveRun {
  /** 공 가진 선수, 제치려는 수비 (자리) */
  h: number;
  d: number;
  seq: DribbleDef[];
  k: number;
  t0: number;
  x0: number;
  y0: number;
  /** 공격 방향 (옆): +1 / -1 */
  side: number;
  /** 앞 (골대 쪽), 옆 단위 벡터 */
  fx: number;
  fy: number;
  lx: number;
  ly: number;
  decided: boolean;
  /** 이번 기술에 수비가 당한 정도, 콤보 중 이긴 횟수, 콤보 최대 */
  stage: number;
  wins: number;
  max: number;
  /** 도움 수비를 제치는 기술 */
  help: boolean;
}

type Phase =
  | { k: 'tip'; t: number; jumped?: boolean }
  | { k: 'live' }
  | {
      k: 'gather';
      shooter: number;
      t: number;
      dur: number;
      post: boolean;
      alley: boolean;
      move?: ShotMove;
      /** 모으기 시작한 기록 칸 (M21: 손을 떠날 때 마무리가 정해지면 그동안의 화면용 동작을 다시 쓴다) */
      f0: number;
    }
  | {
      k: 'shot';
      shooter: number;
      t: number;
      dur: number;
      sx: number;
      sy: number;
      z0: number;
      peak: number;
      info: ShotInfo;
      made: boolean;
      assist: number;
      fast: boolean;
      fouler: number;
      alley: boolean;
      dunk?: DunkStyle;
      /** 성공 확률과 견제 (개발자 패널 확률 표시용) */
      prob: number;
      contest: number;
      /** 콤비 패스를 받아 쐈다 */
      combo?: boolean;
      move?: ShotMove;
      poster?: boolean;
      /** 뱅크슛: 백보드를 맞고 들어간다 (M21) */
      bank?: boolean;
      /** 덩크 도약 (M24, 화면용) */
      leap?: Leap;
      ctx?: ShotCtx;
      def?: number;
      rim?: number;
      passer?: number;
    }
  | {
      k: 'pass';
      from: number;
      to: number;
      t: number;
      dur: number;
      sx: number;
      sy: number;
      ex: number;
      ey: number;
      /** 길목을 읽고 뛰어드는 수비 (M26: 실제로 공에 손이 닿아야 끊는다), 뛰어들 자리 */
      intercept: number;
      ix: number;
      iy: number;
      oob: boolean;
      inbound: boolean;
      lob: boolean;
      bounce?: boolean;
      /** 길목 수비가 없는 안전한 패스 (핸드오프·득점 뒤 인바운드), 이미 손을 대 본 수비 (비트) */
      safe: boolean;
      touched: number;
    }
  /**
   * 공이 공중에 있거나 바닥을 구른다 (M26): 빗나간 슛·블록·쳐낸 공. 물리로 움직이고, 손이 닿는 선수가 잡으려고 다툰다.
   * shotTeam = 공격하던 팀, touch = 마지막으로 건드린 팀 (아웃 판정), lx·ly = 잡힐 만한 자리 (선수들이 간다)
   */
  | {
      k: 'air';
      t: number;
      shotTeam: Side;
      touch: Side;
      ft: boolean;
      noScore: boolean;
      lx: number;
      ly: number;
      noCatch: number;
      tips: number;
      lastBounce: number;
      steal?: { by: number; from: number; kind: TurnoverKind };
    }
  /** 블록한 공이 코트 밖으로 날아간다 (공격팀 공) */
  | { k: 'swat'; t: number; dur: number; sx: number; sy: number; ex: number; ey: number; team: Side }
  | { k: 'inbound'; inb: number; recv: number; sx: number; sy: number; t: number; ready: number; made: boolean }
  | { k: 'dead'; t: number; dur: number; sx: number; sy: number }
  | { k: 'timeout'; t: number; dur: number; team: Side; sx: number; sy: number }
  | {
      k: 'ft';
      shooter: number;
      team: Side;
      n: number;
      of: number;
      t: number;
      stage: 'setup' | 'flight' | 'after';
      made: boolean;
      tech: boolean;
      prob?: number;
    }
  | { k: 'break'; t: number; dur: number; sx: number; sy: number }
  | { k: 'outro'; t: number; winner: Side }
  | { k: 'end' };

type Play =
  | { k: 'pnr'; scr: number; side: number; stage: 'go' | 'set' | 'use' | 'roll'; t: number; pop: boolean; screened: boolean }
  | { k: 'iso'; star: number; t: number }
  | { k: 'post'; star: number; t: number }
  | { k: 'motion'; t: number }
  | { k: 'pindown'; shooter: number; scr: number; side: number; stage: 'go' | 'run'; t: number; screened: boolean }
  | { k: 'dho'; big: number; guard: number; side: number; stage: 'entry' | 'run'; t: number };

interface Act {
  k: 'advance' | 'probe' | 'drive' | 'post' | 'wait' | 'use' | 'hold' | 'move';
  u: number;
  v: number;
  t: number;
}

interface Spot {
  u: number;
  v: number;
  kind: 'top' | 'wing' | 'corner' | 'dunker' | 'elbow' | 'block';
}

const SPOTS: Spot[] = [
  { u: 8.9, v: 0, kind: 'top' },
  { u: 6.2, v: -5.4, kind: 'wing' },
  { u: 6.2, v: 5.4, kind: 'wing' },
  { u: 0.9, v: -6.95, kind: 'corner' },
  { u: 0.9, v: 6.95, kind: 'corner' },
  { u: 1.3, v: -3.0, kind: 'dunker' },
  { u: 1.3, v: 3.0, kind: 'dunker' },
  { u: 5.8, v: -2.4, kind: 'elbow' },
  { u: 5.8, v: 2.4, kind: 'elbow' },
  { u: 2.5, v: -2.6, kind: 'block' },
  { u: 2.5, v: 2.6, kind: 'block' },
];

/** 지역방어 기본 위치 (공격 방향 기준). 0~1은 앞선, 마지막은 골밑. */
const ZONES: Record<'zone23' | 'zone32', { u: number; v: number }[]> = {
  zone23: [
    { u: 6.6, v: -2.2 },
    { u: 6.6, v: 2.2 },
    { u: 2.6, v: -4.4 },
    { u: 2.6, v: 4.4 },
    { u: 1.8, v: 0 },
  ],
  zone32: [
    { u: 5.4, v: -4.6 },
    { u: 5.4, v: 4.6 },
    { u: 7.8, v: 0 },
    { u: 2.2, v: -2.4 },
    { u: 2.2, v: 2.4 },
  ],
};

/** 자유투 라인업 자리 (u, 좌우 대칭). 수비가 골대 쪽 첫 칸을 가져간다. */
const LANE_U = [1.95, 2.95, 3.95];
const LANE_V = 2.85;

const TOV_TEXT: Record<TurnoverKind, string> = {
  badPass: '패스 실책',
  stolenPass: '패스 실책',
  stolenDribble: '드리블 실책',
  travel: '트래블링',
  doubleDribble: '더블 드리블',
  offFoul: '공격자 파울',
  shotClock: '24초 바이얼레이션',
  eightSec: '8초 바이얼레이션',
  outOfBounds: '공을 밖으로 내보냈다',
};

const FOUL_TEXT: Record<FoulKind, string> = {
  shooting: '슈팅 파울',
  reach: '파울',
  block: '블로킹 파울',
  charge: '차징',
  loose: '루즈볼 파울',
  screen: '무빙 스크린',
  holding: '홀딩',
  technical: '테크니컬 파울',
  intentional: '작전상 파울',
};

export const SCHEME_LABEL: Record<DefScheme, string> = {
  man: '대인방어',
  zone23: '2-3 지역방어',
  zone32: '3-2 지역방어',
  press: '풀코트 프레스',
};

/** 로스터 순서(0이 주전 포인트가드)별 목표 출전 시간(분) */
const MINUTES_PLAN = [32, 30, 30, 30, 30, 22, 17, 12, 8, 4, 2, 2];

class GameSim {
  private rng: Rng;
  /** 화면 연출용 난수 (경기 결과에 쓰는 rng와 따로라서 연출을 바꿔도 결과는 그대로) */
  private fxr: Rng;
  private teams: [Team, Team];
  private players: Player[];
  private teamOf: Side[];
  private base: [number, number];
  private P: SP[];
  private ball = { x: 14, y: MID_Y, z: 1, holder: -1 };
  private ph: Phase = { k: 'tip', t: 0 };
  private off: Side = 0;
  private mode: 'advance' | 'set' = 'advance';
  private play: Play | null = null;
  private act: Act = { k: 'hold', u: 0, v: 0, t: 0 };
  private possStart = 0;
  private possLive = false;
  private lastPass: { from: number; to: number; t: number; fancy?: boolean } | null = null;
  /** 이번 공격에서 마지막으로 부른 작전 (M22: 슛·실책에 붙인다) */
  private lastPlay: { k: PlayKind; t: number } | null = null;
  /** 지금 날아가는 패스가 화려한 패스 (비하인드 백·노룩) */
  private fancyPass = false;
  private nextThink = 0;
  /** 공 속도 (M26, 공중일 때), 마지막 패스 위험 계산에서 길목 자리 */
  private bv = { x: 0, y: 0, z: 0 };
  private lastRiskS = 0.5;
  /** 지금 하고 있는 드리블 기술 (M25), 이번 돌파에 도움 수비를 제치려 했나 */
  private mv: MoveRun | null = null;
  private countered = false;
  /** 슛 동작 (M25): 인유어페이스 당할 수비, 펌프 페이크에 떴나, 블록 손을 피했나 */
  private posterBy = -1;
  private drewFake = false;
  private dodged = false;
  private nextSpots = 0;
  private helper = -1;
  private doubler = -1;
  private doubleFor = -1;
  private misc: { at: number; kind: TurnoverKind } | null = null;
  private quarter = 1;
  private foulOut = 5;
  private clock: number;
  private shotClock = 24;
  private clockRunning = false;
  private elapsed = 0;
  private favor: Record<number, number> = {};
  /** 콤비: "작은pid-큰pid" → 종류 */
  private comboOf = new Map<string, ComboKind>();
  private styleOf: Record<number, MoveStyle> = {};
  private deepOpt: Record<number, number> = {};
  private celebOpt: Record<number, number[]> = {};
  private rangeCache = new Map<number, Range>();
  private usage: Record<number, number> = {};
  /** 슈퍼스타 정도 (0~0.15): 종합이 같은 팀 다른 선수들보다 얼마나 높은가 */
  private star: number[] = [];
  /** 분석 (M17) */
  private adv: { drives: number[]; drivePass: number[]; driveTov: number[] } = { drives: [], drivePass: [], driveTov: [] };
  /** 연속 성공 (인 더 존) */
  private streak: number[] = [];
  private minMin: Record<number, number> = {};
  private score: [number, number] = [0, 0];
  private arrow: Side = 0;
  private t = 0;
  private tick = 0;
  private buzzer = false;
  private events: GameEvent[] = [];
  private qLen: number;
  private otLen: number;
  private cnt: Counters = {
    possessions: [0, 0],
    passes: 0,
    intercepts: 0,
    drives: 0,
    plays: {},
    schemes: {},
    shotTimeSum: 0,
    shotTimeN: 0,
    timeouts: 0,
    subs: 0,
    fouledOut: 0,
    techs: 0,
    switches: 0,
    doubles: 0,
    alleyOops: 0,
  };

  // 선수별 상태 (pid 기준)
  private energy: number[];
  private pf: number[];
  private tech: number[];
  private secOn: number[];
  private fga: number[];
  private hot: number[];
  private out: boolean[];
  /** 로스터 안 순서 (0 = 1번 선수) */
  private depth: number[];

  // 팀 상태
  private teamFouls: [number, number] = [0, 0];
  private timeouts: [number, number] = [2, 2];
  private scheme: [DefScheme, DefScheme] = ['man', 'man'];
  private pressUntil = 0;
  private scoreLog: { e: number; s: [number, number] }[] = [];
  private lastTimeoutAt = -999;
  /** 지금 슛이 돌파에서 나왔는가 (파울·차징 판정용) */
  private lastDrive = false;
  /** 데드볼이 끝나면 할 일 (인바운드, 자유투 등) */
  private resume: (() => void) | null = null;

  private lineups: Lineup[] = [];
  private rPos: number[] = [];
  private rBall: number[] = [];
  private rClock: number[] = [];
  private rShot: number[] = [];
  private rElapsed: number[] = [];
  private rQ: number[] = [];
  private rHolder: number[] = [];
  private rFlags: number[] = [];
  private rEnergy: number[] = [];
  private rAct: number[] = [];
  private rPz: number[] = [];
  private rCarry: number[] = [];

  constructor(
    a: Team,
    b: Team,
    private seed: number,
    opts: SimOptions,
  ) {
    this.rng = new Rng(seed);
    this.fxr = new Rng(seed ^ 0x5eed5);
    this.teams = [a, b];
    this.qLen = (opts.quarterMinutes ?? 10) * 60;
    this.foulOut = opts.foulOut ?? 5;
    this.otLen = (opts.overtimeMinutes ?? 5) * 60;
    this.clock = this.qLen;
    this.players = [...a.players, ...b.players];
    this.base = [0, a.players.length];
    this.teamOf = this.players.map((_, k) => (k < a.players.length ? 0 : 1));
    this.depth = this.players.map((_, k) => (k < a.players.length ? k : k - a.players.length));
    const n = this.players.length;
    this.energy = this.players.map((_, k) => opts.energy?.[k] ?? 100);
    this.favor = opts.favor ?? {};
    for (const cb of opts.combos ?? []) this.comboOf.set(`${Math.min(cb.a, cb.b)}-${Math.max(cb.a, cb.b)}`, cb.kind);
    this.styleOf = opts.style ?? {};
    this.deepOpt = opts.deep ?? {};
    this.celebOpt = opts.celeb ?? {};
    this.usage = opts.usage ?? {};
    this.adv = { drives: this.players.map(() => 0), drivePass: this.players.map(() => 0), driveTov: this.players.map(() => 0) };
    // 같은 팀 상위 8명 (자기 빼고) 평균보다 종합이 15 넘게 높으면 공을 더 잡는다
    this.star = this.players.map((pl, k) => {
      const mates = this.players
        .filter((_, j) => j !== k && this.teamOf[j] === this.teamOf[k])
        .map((x) => overall(x))
        .sort((x, y) => y - x)
        .slice(0, 8);
      const avg = mates.reduce((a, b) => a + b, 0) / Math.max(1, mates.length);
      return clamp((overall(pl) - avg - 12) * 0.006, 0, STAR_MAX);
    });
    this.streak = this.players.map(() => 0);
    this.minMin = opts.minMinutes ?? {};
    this.pf = new Array<number>(n).fill(0);
    this.tech = new Array<number>(n).fill(0);
    this.secOn = new Array<number>(n).fill(0);
    this.fga = new Array<number>(n).fill(0);
    this.out = new Array<boolean>(n).fill(false);
    // 경기마다 슛 감각이 조금씩 다르다. 일관성이 낮을수록 기복이 크다.
    this.hot = this.players.map((pl) => clamp(1 + this.rng.normal(0, ((100 - pl.r.consistency) / 100) * 0.1), 0.85, 1.15));
    this.P = [];
    for (let i = 0; i < 10; i++) {
      const team = (i < 5 ? 0 : 1) as Side;
      const pid = this.base[team] + (i % 5);
      this.P.push(this.makeSP(i, team, pid));
    }
    this.lineups.push({ tick: 0, pids: this.P.map((p) => p.pid) });
  }

  private makeSP(i: number, team: Side, pid: number): SP {
    const sp: SP = {
      i,
      team,
      pid,
      pl: this.players[pid],
      x: 14,
      y: MID_Y,
      vx: 0,
      vy: 0,
      tx: 14,
      ty: MID_Y,
      gx: 14,
      gy: MID_Y,
      urg: 0.5,
      maxSpd: 0,
      acc: 0,
      tau: 0,
      stun: 0,
      cut: 0,
      cutU: 0,
      cutV: 0,
      nextCut: 0,
      spot: -1,
      man: (team === 0 ? 5 : 0) + (i % 5),
      zone: i % 5,
      screenFlag: 0,
      jt: 0,
      jd: 0,
      jh: 0,
      jk: 0,
      fx: 0,
      fxUntil: 0,
      fxT: 0,
      slideX: 0,
      slideY: 0,
      slideUntil: 0,
      qAct: 0,
      qAt: 0,
      qDur: 0,
      vq: null,
      vqN: 0,
      lag: 0,
      leanX: 0,
      leanY: 0,
      leanUntil: 0,
      burstUntil: 0,
      burstK: 1,
    };
    this.applyPlayer(sp, pid);
    return sp;
  }

  private applyPlayer(sp: SP, pid: number) {
    const r = this.players[pid].r;
    sp.pid = pid;
    sp.pl = this.players[pid];
    sp.maxSpd = 5.6 + (r.speed - 50) * 0.035;
    sp.acc = 6 + (r.accel - 50) * 0.06;
    // 수비 반응 (M22: 농구 IQ 비중을 키움): 읽고 먼저 움직인다
    sp.tau = 0.07 + ((100 - (r.iq * 0.55 + r.agility * 0.25 + r.perimeterD * 0.2)) / 100) * 0.38;
  }

  run(): GameResult {
    this.setupTip();
    const limit = 60 * 60 * 10; // 안전장치: 시뮬 1시간
    while (this.ph.k !== 'end' && this.tick < limit) this.step();
    const n = this.rClock.length;
    return {
      seed: this.seed,
      dt: DT,
      teams: this.teams,
      players: this.players,
      teamOf: this.teamOf,
      lineups: this.lineups,
      rec: {
        n,
        pos: Float32Array.from(this.rPos),
        ball: Float32Array.from(this.rBall),
        clock: Float32Array.from(this.rClock),
        shotClock: Float32Array.from(this.rShot),
        elapsed: Float32Array.from(this.rElapsed),
        quarter: Uint8Array.from(this.rQ),
        holder: Int8Array.from(this.rHolder),
        flags: Uint8Array.from(this.rFlags),
        energy: Uint8Array.from(this.rEnergy),
        act: Uint8Array.from(this.rAct),
        pz: Uint8Array.from(this.rPz),
        carry: Int8Array.from(this.rCarry),
      },
      events: this.events,
      final: [this.score[0], this.score[1]],
      quarters: this.quarter,
      quarterSeconds: this.qLen,
      counters: this.cnt,
      adv: this.adv,
    };
  }

  // ---------------------------------------------------------------- 도우미

  /** 팀 0은 전반에 오른쪽 골대를 공격하고 후반에 바꾼다 */
  private atkRight(team: Side): boolean {
    const firstHalf = this.quarter <= 2;
    return team === 0 ? firstHalf : !firstHalf;
  }
  private hoop(team: Side) {
    return hoopXY(this.atkRight(team));
  }
  private loc(team: Side, x: number, y: number) {
    return toLocal(this.atkRight(team), x, y);
  }
  private wrl(team: Side, u: number, v: number) {
    return toWorld(this.atkRight(team), u, v);
  }
  private mates(team: Side): SP[] {
    return team === 0 ? this.P.slice(0, 5) : this.P.slice(5);
  }
  private holder(): SP | null {
    return this.ball.holder >= 0 ? this.P[this.ball.holder] : null;
  }
  private isBig(p: SP) {
    return POS_GROUP[p.pl.pos] === 'B';
  }
  /** 공을 주로 운반하는 선수 (볼핸들링 + 패스가 가장 좋은 선수) */
  private primary(team: Side): SP {
    let best = this.mates(team)[0];
    for (const p of this.mates(team)) if (carryScore(p.pl) > carryScore(best.pl)) best = p;
    return best;
  }
  private zoneOn(team: Side) {
    const s = this.scheme[team];
    return s === 'zone23' || s === 'zone32';
  }
  /** 이 공격수를 막고 있는 수비수. 지역방어면 가장 가까운 수비수. */
  private defenderOf(i: number): SP {
    const o = this.P[i];
    const def = (1 - o.team) as Side;
    if (this.zoneOn(def)) {
      let best = this.mates(def)[0];
      let bd = Infinity;
      for (const d of this.mates(def)) {
        const dd = dist(d.x, d.y, o.x, o.y);
        if (dd < bd) {
          bd = dd;
          best = d;
        }
      }
      return best;
    }
    return this.P.find((p) => p.man === i) ?? this.mates(def)[0];
  }
  private name(i: number): string {
    return this.P[i].pl.name;
  }
  /** 체력 계수 (1 = 쌩쌩, 0 = 녹초) */
  private fit(p: SP): number {
    return clamp((this.energy[p.pid] - 35) / 55, 0, 1);
  }
  private teamName(team: Side) {
    return this.teams[team].short;
  }

  /** 이벤트 기록. player/other는 코트 자리(0~9)로 받아서 선수 번호로 바꾼다. */
  private emit(e: Omit<GameEvent, 'tick' | 'quarter' | 'clock' | 'score'>) {
    const player = e.player >= 0 ? this.P[e.player].pid : -1;
    const other = e.other >= 0 ? this.P[e.other].pid : -1;
    this.emitPid({ ...e, player, other });
  }
  /** player/other가 이미 선수 번호일 때 */
  private emitPid(e: Omit<GameEvent, 'tick' | 'quarter' | 'clock' | 'score'>) {
    // 작전 (M22): 슛·실책·자유투엔 이번 공격에서 돌린 작전을 붙인다 (없으면 속공 또는 없음)
    let play = e.play;
    if (!play && (e.type === 'made' || e.type === 'miss' || e.type === 'turnover' || e.type === 'ft')) {
      if (this.lastPlay && this.lastPlay.t >= this.possStart) play = this.lastPlay.k;
      else if (e.fastBreak || (this.possLive && this.t - this.possStart < 7)) play = 'transition';
    }
    this.events.push({ ...e, play, tick: this.tick, quarter: this.quarter, clock: Math.max(0, this.clock), score: [this.score[0], this.score[1]] });
  }

  /** 작전 시작을 알린다 (M22) */
  private callPlay(k: PlayKind, h: SP, other: SP | null, pop = false) {
    this.lastPlay = { k, t: this.t };
    const nm = (p: SP | null) => p?.pl.name ?? '';
    const text =
      k === 'pnr'
        ? `작전: 픽앤롤 · ${nm(other)} 스크린 → ${pop ? '팝 (밖으로)' : '롤 (골밑으로)'}`
        : k === 'iso'
          ? `작전: 아이솔레이션 · ${nm(h)} 1대1, 나머지는 반대쪽으로 빠진다`
          : k === 'post'
            ? `작전: 포스트업 · ${nm(other ?? h)} 골밑에서 등지고`
            : k === 'pindown'
              ? `작전: 핀다운 · ${nm(other)} 스크린 → ${nm(h)} 3점`
              : k === 'dho'
                ? `작전: 핸드오프 · ${nm(other)} → ${nm(h)}`
                : '작전: 모션 오펜스 · 컷과 패스로 빈 곳을 찾는다';
    this.emit({ type: 'play', team: h.team, player: h.i, other: other?.i ?? -1, pts: 0, play: k, pop: pop || undefined, text });
  }

  private addScore(team: Side, pts: number) {
    this.score[team] += pts;
    this.scoreLog.push({ e: this.elapsed, s: [this.score[0], this.score[1]] });
  }

  // ---------------------------------------------------------------- 메인 루프

  private step() {
    this.updatePhase();
    if (this.ph.k === 'end') {
      this.record();
      return;
    }
    this.updateTargets();
    this.moveAll();
    this.updateBall();
    this.updateClocks();
    this.updateEnergy();
    this.record();
    this.t += DT;
    this.tick++;
  }

  private record() {
    for (const p of this.P) {
      if (p.qAct && this.t >= p.qAt) {
        this.poseFx(p, p.qAct, p.qDur);
        p.qAct = 0;
      }
      if (p.vq?.length) {
        // 도약 비행 (M24): 화면에서만 미리 정한 길로, 끝으로 갈수록 실제 자리에 섞는다
        const k = (p.vqN - p.vq.length / 2 + 1) / (p.vqN + 1);
        const w = k * k;
        this.rPos.push(p.vq[0] + (p.x - p.vq[0]) * w, p.vq[1] + (p.y - p.vq[1]) * w);
        p.vq.splice(0, 2);
      } else this.rPos.push(p.x, p.y);
      let f = 0;
      if (p.stun > 0) f |= FLAG_STUN;
      if (this.ph.k === 'gather' && this.ph.shooter === p.i) f |= FLAG_SHOOT;
      if (p.cut > 0) f |= FLAG_CUT;
      if (p.screenFlag > 0) f |= FLAG_SCREEN;
      this.rFlags.push(f);
      this.rEnergy.push(Math.round(this.energy[p.pid]));
      this.rPz.push(Math.round(clamp(this.zOf(p), 0, 5) * 50));
      this.rAct.push(this.actOf(p));
    }
    this.rBall.push(this.ball.x, this.ball.y, this.ball.z);
    this.rClock.push(Math.max(0, this.clock));
    this.rShot.push(Math.max(0, this.shotClock));
    this.rElapsed.push(this.elapsed);
    this.rQ.push(this.quarter);
    this.rHolder.push(this.ball.holder);
    // 공이 손에 붙어 있는 선수: 들고 있거나, 슛을 모으는 중이거나, 덩크로 꽂는 중
    const ph = this.ph;
    let carry = this.ball.holder;
    if (carry < 0 && ph.k === 'gather') carry = ph.shooter;
    else if (carry < 0 && ph.k === 'shot') {
      // 덩크는 꽂을 때까지, 레이업은 림 가까이 올라갈 때까지 공이 손에 있다
      const s = (this.t - ph.t) / ph.dur;
      const k = ph.info.kind;
      if (ph.dunk || (k === 'layup' && s < 0.4) || ((k === 'floater' || k === 'hook') && s < 0.12)) carry = ph.shooter;
    }
    this.rCarry.push(carry);
  }

  /** 화면에 보여줄 동작 */
  private actOf(p: SP): number {
    const ph = this.ph;
    if (this.t < p.fxUntil) return p.fx;
    if (p.stun > 0) return ACT.STUN;
    if (this.ball.holder === p.i) {
      if (ph.k === 'ft') return ACT.FT;
      if (ph.k === 'live') {
        if (this.act.k === 'post') return ACT.POST;
        // 평소 드리블 (M25): 달릴 땐 앞으로 밀고, 수비가 붙으면 낮게 몸으로 가리고, 서서 간을 볼 땐 리듬 드리블
        const sp = Math.hypot(p.vx, p.vy);
        const d = this.defenderOf(p.i);
        const dd = dist(d.x, d.y, p.x, p.y);
        if (sp < 0.4 && (this.act.k === 'hold' || this.act.k === 'wait')) return ACT.HOLD;
        if (sp > 4.5) return ACT.SPEEDDRIB;
        if (dd < 1.6 && sp > 0.4) return ACT.POCKET;
        if (sp < 0.8 && dd < 3 && p.pl.r.ballHandling >= 55) return ACT.RHYTHM;
        return ACT.DRIBBLE;
      }
      return ACT.HOLD;
    }
    // 슛이 날아가는 동안 골밑 수비는 박스아웃
    if (ph.k === 'shot' && p.team !== this.off) {
      const H = this.hoop(this.off);
      if (dist(p.x, p.y, H.x, H.y) < 5 && this.P.some((o) => o.team === this.off && dist(o.x, o.y, p.x, p.y) < 1.6)) return ACT.BOXOUT;
    }
    if (ph.k === 'live' || ph.k === 'pass') {
      const play = this.play;
      if (play?.k === 'pnr' && play.scr === p.i && (play.stage === 'set' || play.stage === 'use')) return ACT.SCREEN;
      if (play?.k === 'pindown' && play.scr === p.i && play.stage === 'run') return ACT.SCREEN;
      if (play?.k === 'dho' && play.big === p.i && play.stage === 'run') return ACT.HOLD;
      const h = this.holder();
      const sp = Math.hypot(p.vx, p.vy);
      if (h && p.team !== h.team) {
        const dh = dist(p.x, p.y, h.x, h.y);
        // 공 가진 선수 수비: 붙어서 자세, 옆으로 따라가면 사이드 스텝, 막 받은 슈터에겐 달려들어 손을 든다
        if (dh < 2.2) return sp > 1.0 ? ACT.SLIDE : ACT.STANCE;
        const lp = this.lastPass;
        if (this.defenderOf(h.i) === p && dh < 6 && sp > 2.5 && lp && lp.to === h.i && this.t - lp.t < 1.2) return ACT.CLOSEOUT;
        // 공과 가까운 쪽 수비는 패스 길에 팔을 뻗는다
        if (!this.zoneOn(p.team) && p.man >= 0 && p.man !== h.i) {
          const m = this.P[p.man];
          if (dist(m.x, m.y, h.x, h.y) < 7.5 && dist(p.x, p.y, m.x, m.y) < 2.2 && this.loc(this.off, m.x, m.y).u > 2.5) return ACT.DENY;
        }
      }
      // 공 없이 컷하는 선수는 손을 들고 뛴다
      if (p.team === this.off && p.cut > 0 && sp > 2.5) return ACT.CUT;
    }
    return ACT.IDLE;
  }

  /** 화면용 점프 (delay초 뒤에 뛴다) */
  private jumpFx(p: SP, h: number, dur: number, act: number, delay = 0) {
    p.jt = this.t + delay;
    p.jd = dur;
    p.jh = h;
    p.jk = 0;
    p.fx = act;
    p.fxT = this.t;
    p.fxUntil = this.t + delay + dur;
  }

  /** 지금 점프 높이 (m, 화면용) */
  private zOf(p: SP) {
    if (p.jd <= 0 || this.t < p.jt || this.t >= p.jt + p.jd) return 0;
    const s = (this.t - p.jt) / p.jd;
    if (p.jk === 1) return s < 0.62 ? p.jh : p.jh * (1 - ((s - 0.62) / 0.38) ** 2);
    return p.jh * Math.sin(Math.PI * s);
  }

  /** 딥쓰리 사거리 (M21): 3점이 좋을수록 (75부터), 근력 조금, 딥쓰리 특수능력·성격 */
  private rangeOf(p: SP): Range {
    const c = this.rangeCache.get(p.pid);
    if (c) return c;
    const r = p.pl.r;
    const k = lv(p.pl, 'deepRange');
    const rg = { extra: Math.max(0, r.three - 75) * 0.03 + Math.max(0, r.strength - 60) * 0.004 + FX.deepExtra[k] + (this.deepOpt[p.pid] ?? 0), slope: FX.deepSlope[k] };
    this.rangeCache.set(p.pid, rg);
    return rg;
  }

  /** 세리머니 고르기 (화면용 난수): 성격이 정한 게 있으면 그중에서, 없으면 능력치로 */
  private celebFor(h: SP, si: ShotInfo, big: boolean): number {
    const own = this.celebOpt[h.pid];
    if (own?.length && this.fxr.chance(0.7)) return own[Math.floor(this.fxr.next() * own.length)];
    const r = h.pl.r;
    // 원정에서 막판에 넣으면 홈 관중을 조용히 시킨다
    if (h.team === 1 && this.quarter >= 4 && this.clock < 150 && r.competitive >= 60 && this.fxr.chance(0.35)) return ACT.SHH;
    if (si.kind === 'dunk') return r.competitive >= 62 && this.fxr.chance(0.4) ? ACT.ROAR : r.strength >= 62 && this.fxr.chance(0.4) ? ACT.FLEX : ACT.CELEBRATE;
    if (si.pts === 3 && r.three >= 62 && this.fxr.chance(0.3)) return ACT.GOGGLES;
    if (big && r.sense >= 60 && this.fxr.chance(0.22)) return ACT.SHIMMY;
    if (big && r.competitive >= 70 && this.fxr.chance(0.15)) return ACT.ROAR;
    return ACT.CELEBRATE;
  }

  /** 덩크 뒤 림에 매달린다: 지금 높이 그대로 있다가 떨어진다 (M21) */
  private hangFx(p: SP, dur: number) {
    const z = Math.max(0.6, this.zOf(p));
    this.jumpFx(p, z, dur, ACT.HANG);
    p.jk = 1;
  }

  private poseFx(p: SP, act: number, dur: number) {
    p.fx = act;
    p.fxT = this.t;
    p.fxUntil = this.t + dur;
  }

  private updatePhase() {
    const ph = this.ph;
    const t = this.t;
    switch (ph.k) {
      case 'tip':
        if (!ph.jumped && t - ph.t >= 0.75) {
          ph.jumped = true;
          for (const c of [this.P[4], this.P[9]]) this.jumpFx(c, 0.6 + c.pl.r.jump / 300, 0.6, ACT.REBOUND);
        }
        if (t - ph.t >= 1.2) this.resolveTip();
        break;
      case 'live':
        this.live();
        break;
      case 'gather':
        if (t - ph.t >= ph.dur) this.release(ph);
        break;
      case 'shot':
        if (t - ph.t >= ph.dur) this.shotArrive(ph);
        break;
      case 'pass':
        if (t - ph.t >= ph.dur) this.passArrive(ph);
        else this.passFlight(ph);
        break;
      case 'air':
        this.airUpdate(ph);
        break;
      case 'inbound':
        this.inboundUpdate(ph);
        break;
      case 'dead':
      case 'timeout':
        if (t - ph.t >= ph.dur) this.runResume();
        break;
      case 'swat':
        if (t - ph.t >= ph.dur) {
          this.ball.x = ph.ex;
          this.ball.y = ph.ey;
          this.off = ph.team;
          this.startDead(ph.team);
        }
        break;
      case 'ft':
        this.ftUpdate(ph);
        break;
      case 'break':
        if (t - ph.t >= ph.dur) this.startQuarter();
        break;
      case 'outro':
        if (t - ph.t >= 4) this.ph = { k: 'end' };
        break;
      case 'end':
        break;
    }
  }

  private runResume() {
    const r = this.resume;
    this.resume = null;
    if (r) r();
    else this.startInbound(this.off, 14, -0.5, false);
  }

  private updateClocks() {
    const k = this.ph.k;
    const stopped = k === 'dead' || k === 'swat' || k === 'break' || k === 'end' || k === 'timeout' || k === 'ft' || k === 'outro';
    if (this.clockRunning && !stopped) {
      this.clock -= DT;
      this.elapsed += DT;
      for (const p of this.P) this.secOn[p.pid] += DT;
    }
    const shotRuns = k === 'live' || k === 'gather' || (k === 'pass' && !this.ph.inbound);
    if (shotRuns) this.shotClock -= DT;

    if (this.clockRunning && this.clock <= 0) {
      this.clock = 0;
      this.clockRunning = false;
      if (k === 'shot') this.buzzer = true; // 이미 손을 떠난 슛은 인정 (버저비터)
      else this.endQuarter();
      return;
    }
    if (shotRuns && this.shotClock <= 0) {
      this.shotClock = 0;
      const h = this.holder();
      this.turnover(h ? h.i : -1, 'shotClock');
    }
  }

  /** 뛰면 체력이 줄고, 벤치와 경기가 멈춘 동안 회복한다 */
  private updateEnergy() {
    const k = this.ph.k;
    const live = this.clockRunning && k !== 'dead' && k !== 'timeout' && k !== 'ft' && k !== 'break';
    const onCourt = new Set(this.P.map((p) => p.pid));
    for (const p of this.P) {
      const r = p.pl.r;
      if (live) {
        const v2 = p.vx * p.vx + p.vy * p.vy;
        const drain = (0.02 + 0.004 * v2) * (1.5 - r.stamina / 100) * (1 - FX.workhorse[lv(p.pl, 'workhorse')]);
        this.energy[p.pid] = Math.max(0, this.energy[p.pid] - drain * DT);
      } else {
        this.energy[p.pid] = Math.min(100, this.energy[p.pid] + 0.04 * DT);
      }
    }
    for (let pid = 0; pid < this.players.length; pid++) {
      if (onCourt.has(pid)) continue;
      const r = this.players[pid].r;
      this.energy[pid] = Math.min(100, this.energy[pid] + 0.12 * (0.6 + r.recovery / 100) * DT);
    }
  }

  // ---------------------------------------------------------------- 점프볼, 쿼터

  private setupTip() {
    const spots: [number, number][] = [
      [11.6, 5.2],
      [11.6, 9.8],
      [10.4, 7.5],
      [12.2, 3.2],
      [13.3, 7.5],
    ];
    for (const p of this.P) {
      const [x, y] = spots[p.i % 5];
      p.x = p.team === 0 ? x : COURT.length - x;
      p.y = p.team === 0 ? y : COURT.width - y;
      p.tx = p.gx = p.x;
      p.ty = p.gy = p.y;
    }
    this.ball = { x: 14, y: MID_Y, z: 1.6, holder: -1 };
    this.ph = { k: 'tip', t: this.t };
    this.emit({ type: 'quarterStart', team: 0, player: -1, other: -1, pts: 0, text: '1쿼터 시작' });
  }

  private resolveTip() {
    const c0 = this.P[4];
    const c1 = this.P[9];
    const s = (p: SP) => p.pl.r.jump + (p.pl.body.heightCm - 200) * 1.2 + this.rng.normal(0, 12);
    const w: Side = s(c0) >= s(c1) ? 0 : 1;
    const jumper = w === 0 ? c0 : c1;
    this.arrow = (1 - w) as Side;
    this.emit({ type: 'tip', team: w, player: jumper.i, other: -1, pts: 0, text: `${jumper.pl.name} 점프볼 승리` });
    this.changePossession(w, true);
    this.clockRunning = true;
    this.startPass(jumper, this.primary(w), true, { x: 14, y: MID_Y });
  }

  private endQuarter() {
    this.clockRunning = false;
    this.buzzer = false;
    const q = this.quarter;
    const qName = q <= 4 ? `${q}쿼터` : `연장 ${q - 4}차`;
    this.emit({ type: 'quarterEnd', team: 0, player: -1, other: -1, pts: 0, text: `${qName} 종료 ${this.score[0]} : ${this.score[1]}` });
    if (q >= 4 && this.score[0] !== this.score[1]) {
      const winner: Side = this.score[0] > this.score[1] ? 0 : 1;
      this.emit({ type: 'gameEnd', team: winner, player: -1, other: -1, pts: 0, text: '경기 종료' });
      // 끝나고 4초: 이긴 팀은 모여서 환호, 진 팀은 고개를 숙인다
      this.ph = { k: 'outro', t: this.t, winner };
      for (const p of this.P) this.poseFx(p, p.team === winner ? ACT.CELEBRATE : ACT.DEJECT, 5);
      return;
    }
    this.quarter++;
    this.clock = this.quarter <= 4 ? this.qLen : this.otLen;
    this.shotClock = 24;
    this.play = null;
    this.helper = -1;
    this.doubler = -1;
    // 팀 파울은 쿼터마다 초기화, 연장은 4쿼터에 이어서 센다 (FIBA)
    if (this.quarter <= 4) this.teamFouls = [0, 0];
    if (this.quarter === 3) this.timeouts = [3, 3];
    if (this.quarter >= 5) this.timeouts = [1, 1];
    for (const p of this.P) p.stun = p.cut = 0;
    // 쿼터 사이 휴식: 하프타임은 길다
    const rest = q === 2 ? 18 : 6;
    for (let pid = 0; pid < this.players.length; pid++) this.energy[pid] = Math.min(100, this.energy[pid] + rest);
    this.ball.holder = -1;
    this.ph = { k: 'break', t: this.t, dur: q === 2 ? 6 : 3, sx: 14, sy: -0.5 };
    this.coachSubs(0, true);
    this.coachSubs(1, true);
  }

  private startQuarter() {
    const team = this.arrow;
    this.arrow = (1 - team) as Side;
    const q = this.quarter;
    this.emit({ type: 'quarterStart', team, player: -1, other: -1, pts: 0, text: q <= 4 ? `${q}쿼터 시작` : `연장 ${q - 4}차 시작` });
    this.startInbound(team, 14, -0.5, false);
  }

  // ---------------------------------------------------------------- 공격권

  private changePossession(team: Side, live: boolean, fromMade = false) {
    if (this.off !== team || this.events.length < 3) this.cnt.possessions[team]++;
    this.off = team;
    this.mode = 'advance';
    this.play = null;
    this.possStart = this.t;
    this.possLive = live;
    this.lastPass = null;
    this.shotClock = 24;
    this.helper = -1;
    this.doubler = -1;
    this.doubleFor = -1;
    this.act = { k: 'advance', u: 0, v: 0, t: this.t };
    this.nextThink = this.t + 0.3;
    this.nextSpots = 0;
    for (const p of this.P) {
      p.cut = 0;
      p.spot = -1;
    }
    const focus = this.mates(team).reduce((s, p) => s + p.pl.r.focus, 0) / 5;
    const pMisc = 0.018 + ((100 - focus) / 100) * 0.012;
    this.misc = this.rng.chance(pMisc)
      ? { at: this.t + this.rng.range(3, 15), kind: this.rng.pick(['travel', 'travel', 'doubleDribble'] as const) }
      : null;
    this.chooseDefense((1 - team) as Side, fromMade);
  }

  /** 수비 전술 고르기: 대인 / 지역 / 득점 후 프레스 */
  private chooseDefense(def: Side, fromMade: boolean) {
    const tac = this.teams[def].tactics;
    const lead = this.score[def] - this.score[(1 - def) as Side];
    let s: DefScheme = 'man';
    // 뒤지고 있으면 프레스를 더 자주 건다
    const pressP = tac.press * (lead < -8 && this.quarter >= 4 ? 2.2 : 1);
    if (fromMade && this.rng.chance(pressP)) s = 'press';
    else if (this.rng.chance(tac.zone)) s = tac.zoneType === '23' ? 'zone23' : 'zone32';
    if (s === 'press') this.pressUntil = this.t + 9;
    const prev = this.scheme[def];
    this.scheme[def] = s;
    this.cnt.schemes[s] = (this.cnt.schemes[s] ?? 0) + 1;
    this.assignDefense(def);
    if (s !== prev && (s !== 'man' || prev !== 'press')) {
      this.emit({ type: 'defense', team: def, player: -1, other: -1, pts: 0, scheme: s, text: `${this.teamName(def)} ${SCHEME_LABEL[s]}` });
    }
  }

  /** 누가 누구를 막을지. 수비 잘하는 선수가 상대 에이스를 맡는다. */
  private assignDefense(def: Side) {
    const off = (1 - def) as Side;
    const ds = this.mates(def);
    const os = this.mates(off);
    const threat = (p: SP) => p.pl.r.ballHandling + p.pl.r.three + p.pl.r.midRange + p.pl.r.layup + this.fga[p.pid] * 3;
    const order = [...os].sort((a, b) => threat(b) - threat(a));
    const used = new Set<number>();
    for (const o of order) {
      let best: SP | null = null;
      let bc = -Infinity;
      for (const d of ds) {
        if (used.has(d.i)) continue;
        const sameGroup = POS_GROUP[d.pl.pos] === POS_GROUP[o.pl.pos] ? 12 : POS_GROUP[d.pl.pos] === 'W' || POS_GROUP[o.pl.pos] === 'W' ? 4 : -10;
        const skill = this.isBig(o) ? d.pl.r.postD : d.pl.r.perimeterD;
        const size = -Math.abs(d.pl.body.heightCm - o.pl.body.heightCm) * 0.3;
        const c = sameGroup + skill * 0.15 + size;
        if (c > bc) {
          bc = c;
          best = d;
        }
      }
      if (best) {
        best.man = o.i;
        used.add(best.i);
      }
    }
    // 지역방어 구역: 가드는 앞선, 빅맨은 뒷선
    const sorted = [...ds].sort((a, b) => a.pl.body.heightCm - b.pl.body.heightCm);
    const s = this.scheme[def];
    const order23 = [0, 1, 2, 3, 4];
    const order32 = [2, 0, 1, 3, 4];
    sorted.forEach((d, k) => (d.zone = (s === 'zone32' ? order32 : order23)[k]));
  }

  private startInbound(team: Side, sx: number, sy: number, made: boolean, shot: 'reset' | 'keep14' = 'reset') {
    const keep = this.shotClock;
    this.changePossession(team, false, made);
    if (shot === 'keep14') this.shotClock = Math.max(14, keep);
    const mates = this.mates(team);
    const pg = this.primary(team);
    let inb: SP;
    if (made) {
      const sorted = [...mates].sort((a, b) => dist(a.x, a.y, this.ball.x, this.ball.y) - dist(b.x, b.y, this.ball.x, this.ball.y));
      inb = sorted[0] === pg && sorted.length > 1 ? sorted[1] : sorted[0];
    } else {
      const sorted = [...mates].filter((p) => p !== pg).sort((a, b) => dist(a.x, a.y, sx, sy) - dist(b.x, b.y, sx, sy));
      inb = sorted[0];
      this.ball.x = sx;
      this.ball.y = sy;
    }
    const recv = inb === pg ? mates.find((p) => p !== pg)! : pg;
    this.ball.holder = -1;
    this.ph = { k: 'inbound', inb: inb.i, recv: recv.i, sx, sy, t: this.t, ready: -1, made };
    // 득점 후에는 시계가 계속 돈다 (4쿼터·연장 마지막 2분 제외). 그 외에는 공을 잡을 때 다시 돈다.
    this.clockRunning = made && !(this.quarter >= 4 && this.clock <= 120);
  }

  /** 득점 뒤 엔드라인 인바운드 */
  private startMadeInbound(scoredOn: Side, afterFT = false) {
    const H = this.hoop((1 - scoredOn) as Side);
    this.ball.x = H.x;
    this.ball.y = H.y;
    this.startInbound(scoredOn, 0, 0, true);
    if (afterFT) this.clockRunning = false;
    const ib = this.ph as Extract<Phase, { k: 'inbound' }>;
    const side = this.loc(scoredOn, H.x, H.y).v >= 0 ? 1 : -1;
    const s = this.wrl(scoredOn, COURT.length + 0.6, side * 1.8);
    ib.sx = s.x;
    ib.sy = s.y;
  }

  private inboundUpdate(ph: Extract<Phase, { k: 'inbound' }>) {
    const inb = this.P[ph.inb];
    if (this.ball.holder !== inb.i) {
      if (dist(inb.x, inb.y, this.ball.x, this.ball.y) < 0.7 && this.ball.z < 1.3) this.ball.holder = inb.i;
      else if (this.t - ph.t > 6) this.ball.holder = inb.i;
      return;
    }
    const atSpot = dist(inb.x, inb.y, ph.sx, ph.sy) < 0.45 || this.t - ph.t > 7;
    if (!atSpot) return;
    if (ph.ready < 0) ph.ready = this.t;
    else if (this.t - ph.ready > (ph.made ? 0.4 : 0.8)) this.startPass(inb, this.P[ph.recv], true);
  }

  /** 경기가 멈춘다. 감독이 교체·타임아웃을 하고, then으로 이어간다. */
  private stopPlay(then: () => void, sx = this.ball.x, sy = this.ball.y, dur = 1.2, next: Side = this.off) {
    this.ball.holder = -1;
    this.clockRunning = false;
    this.play = null;
    this.helper = -1;
    this.doubler = -1;
    this.resume = then;
    this.ph = { k: 'dead', t: this.t, dur, sx, sy };
    // 공을 가질 팀 먼저, 다음 상대 팀이 타임아웃을 부를 수 있다
    if (!this.maybeTimeout(next, sx, sy)) this.maybeTimeout((1 - next) as Side, sx, sy);
    this.coachSubs(0, false);
    this.coachSubs(1, false);
  }

  private sideSpot(x: number, y: number) {
    return { sx: clamp(x, 1.5, COURT.length - 1.5), sy: y < MID_Y ? -0.5 : COURT.width + 0.5 };
  }

  private startDead(next: Side) {
    const { sx, sy } = this.sideSpot(this.ball.x, this.ball.y);
    this.stopPlay(() => this.startInbound(next, sx, sy, false), sx, sy, 1.2, next);
  }

  private turnover(player: number, kind: TurnoverKind, stealer = -1) {
    const team = this.off;
    if (player >= 0 && this.act.k === 'drive') this.adv.driveTov[this.P[player].pid]++;
    let text = player >= 0 ? `${this.name(player)} ${TOV_TEXT[kind]}` : `${this.teamName(team)} ${TOV_TEXT[kind]}`;
    if (kind === 'shotClock' || kind === 'eightSec') text = `${this.teamName(team)} ${TOV_TEXT[kind]}`;
    if (stealer >= 0) text = `${this.name(stealer)} 스틸! (${text})`;
    this.emit({ type: 'turnover', team, player, other: stealer, pts: 0, tov: kind, text });
    if (player >= 0 && kind !== 'shotClock' && kind !== 'eightSec') this.poseFx(this.P[player], ACT.DEJECT, 0.6);
    if (stealer >= 0) this.poseFx(this.P[stealer], ACT.STEAL, 0.45);
    if (stealer >= 0) {
      const s = this.P[stealer];
      this.ball.holder = s.i;
      this.changePossession(s.team, true);
      this.ph = { k: 'live' };
      this.nextThink = this.t + 0.25;
    } else {
      this.startDead((1 - team) as Side);
    }
  }

  // ---------------------------------------------------------------- 파울, 자유투

  /** 반칙이 쌓이면 조심해서 수비한다 */
  private foulCare(pid: number) {
    const pf = this.pf[pid];
    const d = pf - (this.foulOut - 5);
    return d >= 4 ? 0.3 : d === 3 ? 0.75 : 1;
  }

  private inBonus(team: Side) {
    return this.teamFouls[team] >= 4;
  }

  /**
   * 파울 판정. fouler는 파울한 자리, fouled는 당한 자리.
   * fta: 슈팅 파울이면 자유투 개수 (0이면 보너스 규칙을 따른다)
   */
  private callFoul(fouler: number, fouled: number, kind: FoulKind, fta = 0) {
    const f = this.P[fouler];
    const ftTeam = (1 - f.team) as Side;
    const offensive = kind === 'charge' || kind === 'screen' || (kind === 'loose' && f.team === this.off && this.ball.holder >= 0);
    const bonusBefore = this.inBonus(f.team);
    this.pf[f.pid]++;
    this.teamFouls[f.team]++;
    let shots = fta;
    if (!offensive && shots === 0 && bonusBefore) shots = 2;
    const spot = { x: this.P[fouled].x, y: this.P[fouled].y };
    const tag = shots > 0 && fta === 0 ? ' (팀파울 자유투)' : '';
    this.emit({
      type: 'foul',
      team: f.team,
      player: fouler,
      other: fouled,
      pts: 0,
      foul: kind,
      fta: shots,
      pf: this.pf[f.pid],
      teamFouls: this.teamFouls[f.team],
      text: `${f.pl.name} ${FOUL_TEXT[kind]} (${this.pf[f.pid]}반칙)${tag}`,
    });
    if (offensive) this.emit({ type: 'turnover', team: f.team, player: fouler, other: -1, pts: 0, tov: 'offFoul', text: `${f.pl.name} 공격자 파울` });
    if (this.pf[f.pid] >= this.foulOut) this.disqualify(f, `${this.foulOut}반칙 퇴장`);

    // 흥분해서 항의하다 테크니컬
    const r = f.pl.r;
    const pTech = 0.008 * ((110 - r.composure) / 60) * (0.5 + r.competitive / 100);
    const tech = this.rng.chance(pTech) && !this.out[f.pid];

    let next: () => void;
    if (shots > 0) {
      next = () => this.startFT(this.P[fouled], shots, false);
    } else if (offensive) {
      const { sx, sy } = this.sideSpot(spot.x, spot.y);
      next = () => this.startInbound(ftTeam, sx, sy, false);
    } else {
      const { sx, sy } = this.sideSpot(spot.x, spot.y);
      const front = this.loc(ftTeam, spot.x, spot.y).u < 14;
      next = () => this.startInbound(ftTeam, sx, sy, false, front ? 'keep14' : 'reset');
    }
    if (tech) {
      this.tech[f.pid]++;
      this.pf[f.pid]++;
      this.cnt.techs++;
      this.teamFouls[f.team]++;
      this.emit({ type: 'foul', team: f.team, player: fouler, other: -1, pts: 0, foul: 'technical', fta: 1, pf: this.pf[f.pid], teamFouls: this.teamFouls[f.team], text: `${f.pl.name} 테크니컬 파울! 심판에게 항의` });
      if ((this.tech[f.pid] >= 2 || this.pf[f.pid] >= this.foulOut) && !this.out[f.pid]) this.disqualify(f, this.tech[f.pid] >= 2 ? '테크니컬 2개 퇴장' : `${this.foulOut}반칙 퇴장`);
      const after = next;
      next = () => this.startTechFT(ftTeam, after);
    }
    const ballX = this.ball.x;
    const ballY = this.ball.y;
    this.stopPlay(next, ballX, ballY, shots > 0 ? 0.8 : 1.2, ftTeam);
  }

  private disqualify(f: SP, why: string) {
    this.out[f.pid] = true;
    this.cnt.fouledOut++;
    this.emit({ type: 'ejected', team: f.team, player: f.i, other: -1, pts: 0, text: `${f.pl.name} ${why}` });
  }

  private startFT(shooter: SP, of: number, tech: boolean) {
    this.ball.holder = shooter.i;
    this.clockRunning = false;
    this.ph = { k: 'ft', shooter: shooter.i, team: shooter.team, n: 1, of, t: this.t, stage: 'setup', made: false, tech };
  }

  /** 테크니컬 자유투: 상대 팀에서 자유투 제일 잘 쏘는 선수가 1개 */
  private startTechFT(team: Side, after: () => void) {
    const shooter = [...this.mates(team)].sort((a, b) => b.pl.r.freeThrow - a.pl.r.freeThrow)[0];
    this.resume = after;
    this.startFT(shooter, 1, true);
  }

  private ftUpdate(ph: Extract<Phase, { k: 'ft' }>) {
    const s = this.P[ph.shooter];
    const age = this.t - ph.t;
    if (ph.stage === 'setup') {
      this.ball.holder = s.i;
      if (age >= (ph.n === 1 ? 2.4 : 1.4)) {
        // 자유투 성공률: 자유투 능력 + 접전 막판엔 침착성 + 체력
        const r = s.pl.r;
        let p = 0.765 + (r.freeThrow - 50) * 0.0055;
        const clutch = this.quarter >= 4 && this.clock < 120 && Math.abs(this.score[0] - this.score[1]) <= 6;
        if (clutch) p += (r.composure - 50) * 0.002 + lv(s.pl, 'clutch') * 0.01 - (lv(s.pl, 'chicken') ? 0.05 : 0);
        if (lv(s.pl, 'ftPhobia')) p -= 0.12;
        p *= 0.94 + 0.06 * this.fit(s);
        ph.prob = clamp(p, 0.3, 0.97 + 0.02 * elite(r.freeThrow));
        ph.made = this.rng.chance(ph.prob);
        this.jumpFx(s, 0.08, 0.5, ACT.SHOOT);
        ph.stage = 'flight';
        ph.t = this.t;
        this.ball.holder = -1;
      }
      return;
    }
    if (ph.stage === 'flight') {
      if (age < 0.9) return;
      if (ph.made) this.addScore(s.team, 1);
      this.emit({
        type: 'ft',
        team: s.team,
        player: s.i,
        other: -1,
        pts: ph.made ? 1 : 0,
        made: ph.made,
        prob: ph.prob,
        ftN: ph.n,
        ftOf: ph.of,
        text: `${s.pl.name} 자유투 ${ph.of > 1 ? `${ph.n}/${ph.of} ` : ''}${ph.made ? '성공' : '실패'}`,
      });
      ph.stage = 'after';
      ph.t = this.t;
      return;
    }
    // after
    if (ph.n < ph.of) {
      if (age >= 0.5) {
        ph.n++;
        ph.stage = 'setup';
        ph.t = this.t;
      }
      return;
    }
    if (ph.tech) {
      if (age >= 0.5) this.runResume();
      return;
    }
    if (ph.made) {
      if (age >= 0.3) {
        // 마지막 자유투 성공 뒤: 상대 엔드라인 인바운드. 그 전에 교체·타임아웃 기회
        const scoredOn = (1 - s.team) as Side;
        if (!this.maybeTimeout(scoredOn, this.ball.x, this.ball.y)) this.startMadeInbound(scoredOn, true);
        else this.resume = () => this.startMadeInbound(scoredOn, true);
      }
      return;
    }
    // 마지막 자유투 실패: 림에 맞고 튄다 (짧게)
    this.clockRunning = true;
    // 자유투는 부드럽게 쏘니 림 근처로 짧게 떨어진다
    this.missFlight(s.team, s.x, s.y, this.rng.chance(0.45) ? 'front' : this.rng.chance(0.55) ? 'back' : 'side', 0.6, true);
  }

  // ---------------------------------------------------------------- 감독: 교체, 타임아웃

  /** 출전 시간이 계획보다 얼마나 많은지 (분, +면 많이 뜀) */
  private overMinutes(pid: number) {
    const total = this.qLen * 4;
    const frac = clamp(this.elapsed / total, 0, 1);
    // 슈퍼스타는 감독이 더 오래 쓴다 (최대 +8분)
    const plan = (MINUTES_PLAN[Math.min(this.depth[pid], MINUTES_PLAN.length - 1)] + (this.star[pid] ?? 0) * 55) * (this.qLen / 600);
    return this.secOn[pid] / 60 - plan * frac;
  }

  /** 약속한 최소 출전 시간보다 얼마나 덜 뛰었나 (분, +면 부족) */
  private underMinutes(pid: number) {
    const want = this.minMin[pid];
    if (!want) return 0;
    const frac = clamp(this.elapsed / (this.qLen * 4), 0, 1);
    // 4쿼터 중반까지 채우도록
    return want * Math.min(1, frac * 1.25) - this.secOn[pid] / 60;
  }

  private foulTrouble(pid: number): boolean {
    const pf = this.pf[pid];
    const q = this.quarter;
    if (q >= 4 && this.clock < 300) return false;
    const x = this.foulOut - 5;
    return (q === 1 && pf >= 2 + x) || (q === 2 && pf >= 3 + x) || (q >= 3 && pf >= 4 + x);
  }

  /** 감독 교체 판단. 데드볼, 타임아웃, 쿼터 사이에 부른다. */
  private coachSubs(team: Side, freely: boolean) {
    const late = this.quarter >= 4 && this.clock < 240 && Math.abs(this.score[0] - this.score[1]) <= 8;
    const margin = Math.abs(this.score[0] - this.score[1]);
    const garbage = this.quarter >= 4 && this.clock < 300 && margin >= 20;
    const roster: number[] = [];
    for (let k = 0; k < this.teams[team].players.length; k++) roster.push(this.base[team] + k);
    let changes = 0;
    const maxChanges = freely ? 5 : 3;
    for (let pass = 0; pass < 5 && changes < maxChanges; pass++) {
      const onCourt = this.mates(team);
      const onSet = new Set(onCourt.map((p) => p.pid));
      const bench = roster.filter((pid) => !onSet.has(pid) && !this.out[pid]);
      if (bench.length === 0) break;
      // 가장 쉬어야 할 선수
      let worst: SP | null = null;
      let worstNeed = 0;
      for (const p of onCourt) {
        const e = this.energy[p.pid];
        let need = Math.max(0, 66 - e) * 1.6 + Math.max(0, this.overMinutes(p.pid)) * 1.2;
        if (this.foulTrouble(p.pid)) need += 18;
        if (this.underMinutes(p.pid) > 0) need *= 0.3;
        if (late) need *= 0.35;
        if (garbage && this.depth[p.pid] < 7) need += 40;
        if (this.out[p.pid]) need = 999;
        if (need > worstNeed) {
          worstNeed = need;
          worst = p;
        }
      }
      // 쉬고 온 주전을 다시 넣는 경우
      let back: { p: SP; pid: number; gain: number } | null = null;
      if (!garbage) {
        for (const pid of bench) {
          const e = this.energy[pid];
          if (e < 86 || this.foulTrouble(pid)) continue;
          for (const p of onCourt) {
            const group = POS_GROUP[this.players[pid].pos] === POS_GROUP[p.pl.pos];
            if (!group) continue;
            const gain = overall(this.players[pid], p.pl.pos) * (0.7 + 0.3 * (e / 100)) - overall(p.pl, p.pl.pos) * (0.7 + 0.3 * (this.energy[p.pid] / 100)) - Math.max(0, this.overMinutes(pid)) * 0.8 + (this.favor[pid] ?? 0) - (this.favor[p.pid] ?? 0);
            const g2 = gain + Math.max(0, this.underMinutes(pid)) * 6 - Math.max(0, this.underMinutes(p.pid)) * 6;
            if (g2 > 3 && (!back || g2 > back.gain)) back = { p, pid, gain: g2 };
          }
        }
      }
      if (worst && worstNeed > 12) {
        const pid = this.bestSub(worst, bench, garbage);
        if (pid >= 0) {
          this.substitute(worst, pid);
          changes++;
          continue;
        }
      }
      if (back) {
        this.substitute(back.p, back.pid);
        changes++;
        continue;
      }
      break;
    }
  }

  private bestSub(outP: SP, bench: number[], garbage: boolean): number {
    let best = -1;
    let bc = -Infinity;
    for (const pid of bench) {
      const pl = this.players[pid];
      const e = this.energy[pid];
      if (e < 72 && !this.out[outP.pid]) continue;
      if (this.foulTrouble(pid) && !this.out[outP.pid]) continue;
      const g1 = POS_GROUP[pl.pos];
      const g2 = POS_GROUP[outP.pl.pos];
      const fitPos = g1 === g2 ? 10 : g1 === 'W' || g2 === 'W' ? 2 : -12;
      let c = overall(pl, outP.pl.pos) * (0.6 + 0.4 * (e / 100)) + fitPos - Math.max(0, this.overMinutes(pid)) * 1.5 + (this.favor[pid] ?? 0) + Math.max(0, this.underMinutes(pid)) * 6;
      if (garbage) c += this.depth[pid] * 3;
      if (c > bc) {
        bc = c;
        best = pid;
      }
    }
    return best;
  }

  private substitute(p: SP, pid: number) {
    const outPid = p.pid;
    this.applyPlayer(p, pid);
    p.stun = 0;
    p.cut = 0;
    this.cnt.subs++;
    this.lineups.push({ tick: this.tick, pids: this.P.map((q) => q.pid) });
    this.emitPid({ type: 'sub', team: p.team, player: pid, other: outPid, pts: 0, text: `${this.teamName(p.team)} 교체: ${this.players[pid].name} ↔ ${this.players[outPid].name}` });
    this.assignDefense(p.team);
    this.assignDefense((1 - p.team) as Side);
  }

  /** 상대 연속 득점, 체력 바닥, 막판 접전이면 타임아웃 */
  private maybeTimeout(team: Side, sx: number, sy: number): boolean {
    if (this.timeouts[team] <= 0 || this.t - this.lastTimeoutAt < 30) return false;
    if (this.ph.k !== 'dead' && this.ph.k !== 'ft' && this.ph.k !== 'inbound') return false;
    const opp = (1 - team) as Side;
    // 최근 2분 30초 득점 차이
    let run = 0;
    const from = this.scoreLog.find((s) => s.e >= this.elapsed - 150);
    if (from) {
      const prevIdx = this.scoreLog.indexOf(from) - 1;
      const prev = prevIdx >= 0 ? this.scoreLog[prevIdx].s : [0, 0];
      run = this.score[opp] - prev[opp] - (this.score[team] - prev[team]);
    }
    const tired = this.mates(team).reduce((s, p) => s + this.energy[p.pid], 0) / 5 < 55;
    const lateClose = this.quarter >= 4 && this.clock < 90 && Math.abs(this.score[0] - this.score[1]) <= 5 && this.off === team;
    // 하프 막판엔 남은 타임아웃을 아끼지 않는다
    const halfEnd = (this.quarter === 2 || this.quarter >= 4) && this.clock < 150 && this.timeouts[team] >= 2;
    const want = run >= 7 || (tired && this.rng.chance(0.35)) || (lateClose && this.rng.chance(0.6)) || (halfEnd && this.rng.chance(0.25));
    if (!want) return false;
    this.timeouts[team]--;
    this.lastTimeoutAt = this.t;
    this.cnt.timeouts++;
    const why = run >= 7 ? `상대 흐름 끊기 (최근 ${run}점 차)` : lateClose ? '막판 작전' : tired ? '선수들 숨 돌리기' : '작전 지시';
    this.emit({ type: 'timeout', team, player: -1, other: -1, pts: 0, text: `${this.teamName(team)} 타임아웃 (${why})` });
    for (const p of this.P) this.energy[p.pid] = Math.min(100, this.energy[p.pid] + 4);
    const resume = this.resume;
    this.ball.holder = -1;
    this.clockRunning = false;
    this.ph = { k: 'timeout', t: this.t, dur: 7, team, sx, sy };
    this.resume = resume;
    // 4쿼터·연장 마지막 2분 타임아웃 뒤 공격팀은 프런트코트에서 시작 (FIBA)
    if (this.quarter >= 4 && this.clock <= 120 && this.off === team && resume) {
      const side = sy < MID_Y ? -1 : 1;
      const w = this.wrl(team, 8.3, side * (MID_Y + 0.5));
      this.resume = () => this.startInbound(team, w.x, w.y, false, 'keep14');
    }
    this.coachSubs(0, true);
    this.coachSubs(1, true);
    return true;
  }

  // ---------------------------------------------------------------- 라이브 볼

  private live() {
    const h = this.holder();
    if (!h) {
      this.startAir({ x: this.ball.x, y: this.ball.y, z: Math.max(0.5, this.ball.z), vx: 0, vy: 0, vz: 0 }, this.off, this.off);
      return;
    }
    const off = this.off;
    const def = (1 - off) as Side;
    const H = this.hoop(off);
    const L = this.loc(off, h.x, h.y);

    if (this.mode === 'advance') {
      const back = this.mates(def).filter((d) => this.loc(off, d.x, d.y).u < L.u + 0.5).length;
      const since = this.t - this.possStart;
      if (L.u < 10.5 && since > 1.2 && (back >= 4 || since > 6)) {
        this.mode = 'set';
        if (this.scheme[def] === 'press') this.chooseDefense(def, false);
        this.choosePlay(h);
        this.nextSpots = 0;
        if (this.act.k === 'advance') this.newProbe(h);
      }
      // 8초 안에 하프라인을 넘어야 한다
      if (L.u > 14 && this.shotClock < 16) {
        this.turnover(h.i, 'eightSec');
        return;
      }
    }
    if (this.scheme[def] === 'press' && (L.u < 14 || this.t > this.pressUntil)) {
      this.scheme[def] = this.zoneOn(def) ? this.scheme[def] : 'man';
    }
    if (this.mode === 'set' && this.t >= this.nextSpots) {
      this.assignSpots();
      this.nextSpots = this.t + 1.0;
    }
    this.updatePlay(h);
    this.updateCuts();
    this.updateDouble(h);

    // 집중력이 낮으면 가끔 트래블링·더블드리블
    if (this.misc && this.t >= this.misc.at) {
      const kind = this.misc.kind;
      this.misc = null;
      this.turnover(h.i, kind);
      return;
    }

    // 막판에 지고 있으면 시계를 멈추려고 일부러 파울
    if (this.quarter >= 4 && this.clock <= 45 && this.clockRunning) {
      const lead = this.score[off] - this.score[def];
      if (lead >= 1 && lead <= 8 && this.t - this.possStart > 0.8) {
        // 반칙이 제일 적은 선수가 가서 파울한다
        let f: SP | null = null;
        for (const d of this.mates(def)) {
          if (dist(d.x, d.y, h.x, h.y) > 1.6) continue;
          if (!f || this.pf[d.pid] < this.pf[f.pid]) f = d;
        }
        if (f && (this.pf[f.pid] < 4 || this.clock < 5)) {
          this.callFoul(f.i, h.i, 'intentional');
          return;
        }
      }
    }

    const d = this.defenderOf(h.i);
    const dd = dist(d.x, d.y, h.x, h.y);
    const trapped = this.scheme[def] === 'press' && L.u > 13 && this.t < this.possStart + 6;
    if (dd < 1.1 && d.stun <= 0) {
      const ahead = ((d.x - h.x) * (H.x - h.x) + (d.y - h.y) * (H.y - h.y)) / Math.max(0.01, dist(h.x, h.y, H.x, H.y));
      // 드리블 중 스틸
      if (ahead > -0.2) {
        let lam = clamp(0.004 + ((ex(d.pl.r.steal) - ex(h.pl.r.ballHandling)) / 100) * 0.008, 0.0006, 0.016) * (1 + FX.pickpocket[lv(d.pl, 'pickpocket')]);
        if (this.act.k === 'drive') lam *= 1.8;
        if (trapped || this.doubleFor === h.i) lam *= 2.5;
        if (this.rng.chance(lam * DT)) {
          // 절반쯤은 손끝으로 쳐내서 루즈볼이 된다
          if (this.rng.chance(0.45)) this.deflect(h, d, 'stolenDribble', h.x, h.y, Math.atan2(h.y - d.y, h.x - d.x));
          else this.turnover(h.i, 'stolenDribble', d.i);
          return;
        }
      }
      // 손을 뻗다가 파울 (반칙이 많으면 조심한다)
      let lamF = 0.012 + ((60 - d.pl.r.iq) / 100) * 0.012 + (this.act.k === 'drive' || this.act.k === 'move' ? 0.03 : 0) + (trapped ? 0.04 : 0);
      lamF *= 1.3 - (d.pl.r.focus / 100) * 0.5;
      lamF *= this.foulCare(d.pid) * (lv(d.pl, 'foulProne') ? 1.4 : 1);
      if (this.rng.chance(Math.max(0, lamF) * DT)) {
        this.callFoul(d.i, h.i, 'reach');
        return;
      }
    }
    // 공 없는 곳에서 잡아채는 홀딩
    if (this.rng.chance(0.004 * DT)) {
      const ds = this.mates(def);
      const fouler = ds[this.rng.weighted(ds.map((d) => this.foulCare(d.pid) ** 2))];
      const victim = this.P[fouler.man];
      if (victim.i !== h.i) {
        this.callFoul(fouler.i, victim.i, 'holding');
        return;
      }
    }

    // 돌파 중 도움 수비
    if (this.act.k === 'drive' && dist(h.x, h.y, H.x, H.y) < 6.5) {
      if (this.helper < 0) {
        const fx = (H.x - h.x) / Math.max(0.01, dist(h.x, h.y, H.x, H.y));
        const fy = (H.y - h.y) / Math.max(0.01, dist(h.x, h.y, H.x, H.y));
        const ahead = (d.x - h.x) * fx + (d.y - h.y) * fy;
        if (d.stun > 0 || ahead < 0.25) {
          const ix = h.x + fx * 1.5;
          const iy = h.y + fy * 1.5;
          let best = -1;
          let bc = Infinity;
          for (const o of this.mates(d.team)) {
            if (o.i === d.i || o.stun > 0) continue;
            const c = dist(o.x, o.y, ix, iy) - o.pl.r.helpD / 30;
            const dd2 = dist(o.x, o.y, ix, iy);
            if (dd2 < 5.5 && c < bc) {
              bc = c;
              best = o.i;
            }
          }
          this.helper = best;
        }
      }
      if (dist(h.x, h.y, H.x, H.y) < RIM_FRONT + 1.0) this.nextThink = Math.min(this.nextThink, this.t);
    } else if (this.act.k !== 'drive' && this.act.k !== 'move') {
      this.helper = -1;
    }

    // 드리블 기술 중 (M25): 기술이 끝날 때까지 다른 판단은 하지 않는다
    if (this.act.k === 'move') {
      if (this.updateMove(h)) return;
      if (this.act.k === 'move') return;
    }
    // 돌파하다 도움 수비가 앞을 막으면 한 번 더 기술로 제친다 (스핀·크로스오버)
    if (this.act.k === 'drive' && this.helper >= 0 && !this.countered) {
      const hp = this.P[this.helper];
      if (this.inFront(h, hp, 2.0)) {
        this.countered = true;
        if (this.rng.chance(this.moveUseP(h) * 0.55)) {
          this.startMoves(h, hp, true);
          return;
        }
      }
    }
    if (this.t >= this.nextThink) this.think(h);
  }

  /** 포스트업, 에이스 아이솔레이션에 더블팀 */
  private updateDouble(h: SP) {
    const def = (1 - h.team) as Side;
    if (this.doubler >= 0) {
      if (this.ball.holder !== this.doubleFor) {
        this.doubler = -1;
        this.doubleFor = -1;
      }
      return;
    }
    if (this.zoneOn(def) || this.mode !== 'set') return;
    const tac = this.teams[def].tactics;
    const post = this.act.k === 'post';
    const star = (this.play?.k === 'iso' && this.play.star === h.i && this.share(h.pid) > 0.27) || this.star[h.pid] > 0.06;
    if (!post && !star) return;
    if (this.doubleFor === -2) return; // 이번 공격엔 안 가기로 했다
    if (!this.rng.chance(Math.min(0.8, tac.double * (post ? 1 : 0.6) + (this.star[h.pid] / STAR_MAX) * 0.35))) {
      this.doubleFor = -2;
      return;
    }
    // 슛이 제일 약한 상대를 맡은 수비수가 간다
    const mine = this.defenderOf(h.i);
    let best: SP | null = null;
    let bc = Infinity;
    for (const d of this.mates(def)) {
      if (d === mine) continue;
      const m = this.P[d.man];
      const c = m.pl.r.three + dist(d.x, d.y, h.x, h.y) * 3;
      if (c < bc) {
        bc = c;
        best = d;
      }
    }
    if (best) {
      this.doubler = best.i;
      this.doubleFor = h.i;
      this.cnt.doubles++;
    }
  }

  /** 공을 가진 선수의 판단 */
  private think(h: SP) {
    const off = this.off;
    const H = this.hoop(off);
    const L = this.loc(off, h.x, h.y);
    const r = h.pl.r;
    const tLeft = Math.min(this.shotClock, this.clockRunning ? this.clock : 99);
    const vCont = this.vCont(tLeft);
    const opts: { v: number; go: () => void; label: string }[] = [];
    const play = this.play;
    const dH = dist(h.x, h.y, H.x, H.y);
    const doubled = this.doubleFor === h.i && this.doubler >= 0;

    // 1) 슛 (딥쓰리 사거리가 길면 더 멀리서도 쏜다)
    const rg = this.rangeOf(h);
    const reach = rg.extra * 1.3;
    if (L.u < 10.2 + reach || tLeft < 2.5) {
      const post = this.act.k === 'post';
      const c0 = this.contest(h, 0.3).c;
      const si = shotInfo(h.pl, L.u, L.v, post, c0, rg);
      const c = this.contest(h, si.kind === 'three' ? 0.32 : 0.25).c;
      // 농구 IQ (M22): 낮으면 견제를 얕보고 제 슛을 과신한다, 높으면 좋은 슛을 기다린다
      // (기준은 리그 평균 IQ 52)
      const cSeen = c * clamp(1 + (r.iq - 52) / 160, 0.7, 1);
      let ev = si.pOpen * contestFactor(si.kind, cSeen) * si.pts * this.form(h, si);
      ev += (Math.max(0, 52 - r.iq) / 100) * 0.14;
      // 시간 감각: IQ가 높으면 샷클락이 줄 때 공격을 버리지 않고, 낮으면 시간을 흘려보낸다
      if (tLeft < 7) ev += ((r.iq - 52) / 100) * clamp((7 - tLeft) / 7, 0, 1) * 0.25;
      // 골밑 슛은 파울을 얻어 자유투가 생기기도 한다
      if (si.kind === 'layup' || si.kind === 'dunk' || si.kind === 'hook') ev += c * 0.18;
      ev += (55 - r.teamwork) * 0.0015;
      if (si.kind === 'three') {
        // 수비가 붙은 3점은 꺼린다. 리그 성향상 3점을 아끼는 편 (슈터는 덜 아낀다)
        ev -= c * 0.15 + clamp(0.1 - (r.three - 50) * 0.004, 0, 0.18);
      }
      if (play?.k === 'iso' && play.star === h.i) ev += 0.04;
      if (L.u > 9.6 + reach && tLeft > 3) ev -= 0.1; // 너무 먼 슛은 꺼린다
      // 배짱 슈터 (성격)는 딥쓰리를 겁내지 않고, 난사 (나쁜 버릇)는 두세 개 들어가면 무리하게 쏜다
      if (si.three && si.dist >= DEEP_DIST) ev += (this.deepOpt[h.pid] ? 0.03 : 0) + [0, 0.03, 0.06, 0.1][lv(h.pl, 'deepRange')];
      if (lv(h.pl, 'heatChecker') && this.streak[h.pid] >= 2 && (si.kind === 'three' || si.kind === 'mid')) ev += 0.09;
      // 많이 쐈으면 동료를 찾는다. 팀 슛의 3분의 1을 넘기면 훨씬 강하게
      ev -= this.hogPenalty(h.pid);
      if (doubled) ev -= 0.1;
      opts.push({ v: ev, go: () => this.startGather(h, post), label: 'shot-' + si.kind + '@' + c.toFixed(2) });
    }

    // 2) 돌파
    const d = this.defenderOf(h.i);
    const mismatch = ((r.speed + r.accel) / 2 - (d.pl.r.speed + d.pl.r.agility) / 2) * 0.003;
    if (this.act.k === 'drive') {
      const lane = this.laneOpen(h);
      opts.push({ v: lerp(0.62, 1.16, lane), go: () => {}, label: 'keepdrive' });
    } else if (this.act.k !== 'post' && dH > 2.8 && (L.u < 12.5 || (this.possLive && this.t - this.possStart < 6))) {
      const lane = this.laneOpen(h);
      const skill = (r.ballHandling + r.speed + r.accel) / 3;
      let ev = lerp(0.68, 1.26, lane) + (skill - 50) * 0.004 + mismatch;
      if (play?.k === 'iso' && play.star === h.i) ev += 0.05;
      if (this.mode === 'advance' && lane > 0.7) ev += 0.08;
      ev -= this.hogPenalty(h.pid) * 0.75;
      if (doubled) ev -= 0.15;
      opts.push({ v: ev, go: () => this.startDrive(h), label: 'drive@' + lane.toFixed(2) });
    }

    // 3) 패스: 동료 중 가장 좋아 보이는 한 명만 후보로 (IQ가 낮으면 잘못 볼 수 있다)
    {
      const noise = 0.006 + ((100 - r.iq) / 100) * 0.11;
      let best: SP | null = null;
      let bestV = -Infinity;
      let bestSeen = -Infinity;
      for (const m of this.mates(off)) {
        if (m.i === h.i) continue;
        const v = this.passValue(h, m, tLeft);
        if (v === null) continue;
        const seen = v + this.rng.normal(0, noise);
        if (seen > bestSeen) {
          bestSeen = seen;
          bestV = v;
          best = m;
        }
      }
      if (best) {
        const m = best;
        opts.push({ v: bestV, go: () => this.startPass(h, m, false), label: 'pass' + m.i });
      }
    }

    // 4) 유지
    {
      let v = vCont + 0.05;
      if (this.act.k === 'drive') v -= 0.12;
      if (play?.k === 'pnr' && (play.stage === 'go' || play.stage === 'set')) v += 0.06;
      if (play?.k === 'pindown' && play.stage === 'go') v += 0.05;
      if (this.mode === 'advance') v += 0.05;
      if (doubled) v -= 0.2;
      // 막판에 이기고 있으면 시간을 끈다
      if (this.quarter >= 4 && this.clock < 60 && this.score[off] > this.score[(1 - off) as Side] && this.shotClock > 5) v += 0.2;
      opts.push({ v, go: () => this.holdAction(h), label: 'hold' });
    }

    const T = 0.006 + ((100 - r.iq) / 100) * 0.13;
    let max = -Infinity;
    for (const o of opts) max = Math.max(max, o.v);
    const k = this.rng.weighted(opts.map((o) => Math.exp((o.v - max) / T)));
    if (DEBUG.think) DEBUG.think(this.t, h.i, L.u, L.v, tLeft, opts.map((o) => o.label + ':' + o.v.toFixed(2)), opts[k].label);
    opts[k].go();
    if (this.ph.k === 'live' && this.ball.holder === h.i) {
      this.nextThink = this.t + 0.35 + ((100 - r.iq) / 100) * 0.3 + this.rng.range(0, 0.2);
      // 샷클락이 얼마 안 남으면 서두른다
      if (tLeft < 4) this.nextThink = Math.min(this.nextThink, this.t + 0.2);
    }
  }

  /** 공격을 계속했을 때 기대 득점. 샷클락이 줄어들수록 떨어진다. */
  private vCont(tLeft: number): number {
    const base = 1.02 * Math.pow(clamp((tLeft - 1.2) / 10, 0, 1), 0.6);
    // 템포가 느린 팀일수록 공격 초반에 서두르지 않는다
    const patience = 0.14 - this.teams[this.off].tactics.pace * 0.1;
    return base + patience * clamp((tLeft - 13) / 10, 0, 1);
  }

  /** 팀 슛 중 이 선수 비중 (경기 초반엔 0에 가깝게) */
  /** 두 선수가 콤비인가 (선수 번호) */
  private combo(a: number, b: number): ComboKind | undefined {
    if (!this.comboOf.size) return undefined;
    return this.comboOf.get(`${Math.min(a, b)}-${Math.max(a, b)}`);
  }

  /** 혼자 너무 많이 쐈으면 동료를 찾는다 (M11: 리그 득점이 한 명에게 덜 몰리게) */
  private hogPenalty(pid: number): number {
    // 슈퍼스타 (동료보다 압도적으로 잘하는 선수)는 더 많이 쏴도 된다
    const sh = this.share(pid) - this.star[pid] - (this.usage[pid] ?? 0);
    return clamp((sh - 0.21) * 1.6, 0, 0.35) + clamp((sh - 0.29) * 4, 0, 0.8);
  }

  private share(pid: number): number {
    const team = this.teamOf[pid];
    let sum = 0;
    for (let k = 0; k < this.teams[team].players.length; k++) sum += this.fga[this.base[team] + k];
    return this.fga[pid] / (sum + 8);
  }

  private form(p: SP, si: ShotInfo): number {
    const tired = 0.9 + 0.1 * this.fit(p);
    return (si.kind === 'dunk' || si.kind === 'layup' ? 1 : this.hot[p.pid]) * tired;
  }

  /** 4쿼터·연장 마지막 2분, 5점 차 이내 */
  private clutchTime() {
    return this.quarter >= 4 && this.clock < 120 && Math.abs(this.score[0] - this.score[1]) <= 5;
  }

  /** 특수능력이 슛 성공률에 주는 배율 */
  private abilityShot(h: SP): number {
    let m = 1;
    if (this.clutchTime()) {
      m *= 1 + FX.clutch[lv(h.pl, 'clutch')];
      if (lv(h.pl, 'chicken')) m *= 0.94;
    }
    if (this.streak[h.pid] >= 3) m *= 1 + FX.zone[lv(h.pl, 'zone')];
    let mood = 0;
    for (const t of this.mates(h.team)) if (t !== h) mood = Math.max(mood, FX.moodMaker[lv(t.pl, 'moodMaker')]);
    return m * (1 + mood);
  }

  /** 슛 견제 정도 (0 = 완전 노마크, 1 = 손이 얼굴 앞) */
  private contest(s: SP, look = 0): { c: number; blocker: number; c1: number } {
    const H = this.hoop(s.team);
    const fx = H.x - s.x;
    const fy = H.y - s.y;
    const fl = Math.max(0.01, Math.hypot(fx, fy));
    let c1 = 0;
    let c2 = 0;
    let bi = -1;
    for (const d of this.mates((1 - s.team) as Side)) {
      // look초 동안 수비가 다가오는 거리까지 감안한다 (슛하기 전 판단용)
      const dd = Math.max(0.3, dist(d.x, d.y, s.x, s.y) - Math.min(2.2, look * d.maxSpd * 0.45));
      const reach = ((d.pl.body.heightCm + d.pl.body.wingspanCm) / 2 - 197) / 100;
      // 외곽 수비가 좋을수록 같은 거리에서도 더 꽉 막는다
      let cd = clamp((2.0 + reach - dd) / 1.5, 0, 1) * (1 + (ex(d.pl.r.perimeterD) - 55) / 200) * (lv(d.pl, 'lazyD') ? 0.85 : 1);
      if (dd > 0.01) {
        const dot = ((d.x - s.x) * fx + (d.y - s.y) * fy) / (dd * fl);
        if (dot < -0.3) cd *= 0.4;
      }
      if (d.stun > 0) cd *= 0.35;
      if (cd > c1) {
        c2 = c1;
        c1 = cd;
        bi = d.i;
      } else if (cd > c2) c2 = cd;
    }
    // 골밑 근처 슛은 골대를 지키는 수비(림 프로텍터)도 견제한다
    const dh = fl;
    if (dh < 4.2) {
      for (const d of this.mates((1 - s.team) as Side)) {
        const rimD = dist(d.x, d.y, H.x, H.y);
        if (rimD > 2.2 || d.stun > 0) continue;
        const ahead = ((d.x - s.x) * fx + (d.y - s.y) * fy) / fl;
        if (ahead < -0.2) continue;
        // 도움 수비 (M22): 자리를 잘 잡는 수비가 골밑을 더 잘 지킨다
        const cr = clamp((2.2 - rimD) / 1.4, 0, 1) * (0.25 + ex(d.pl.r.block) / 300 + (d.pl.body.heightCm - 195) / 150) * (1 - dh / 5) * (1 + FX.rimProtector[lv(d.pl, 'rimProtector')]) * (1 + (d.pl.r.helpD + d.pl.r.iq - 102) / 300);
        if (cr > c1) {
          c2 = c1;
          c1 = cr;
          bi = d.i;
        } else if (cr > c2) c2 = cr;
      }
    }
    // 슛을 많이 쏘는 선수는 수비가 집중해서 막는다
    const sh = this.share(s.pid) - this.star[s.pid] * 0.5;
    const focus = clamp((sh - 0.22) * 1.6, 0, 0.35) + clamp((sh - 0.28) * 1.5, 0, 0.3);
    return { c: clamp(c1 + 0.3 * c2 + focus, 0, 1), blocker: bi, c1 };
  }

  /** 골대까지 돌파 길이 얼마나 열려 있나 (0~1) */
  private laneOpen(h: SP): number {
    const H = this.hoop(h.team);
    const dh = Math.max(0.01, dist(h.x, h.y, H.x, H.y));
    const fx = (H.x - h.x) / dh;
    const fy = (H.y - h.y) / dh;
    const rx = H.x - fx * RIM_FRONT;
    const ry = H.y - fy * RIM_FRONT;
    let ob = 0;
    for (const d of this.mates((1 - h.team) as Side)) {
      const ahead = (d.x - h.x) * fx + (d.y - h.y) * fy;
      if (ahead < -0.2) continue;
      const { d: sd, s } = segDist(d.x, d.y, h.x, h.y, rx, ry);
      if (sd < 1.5) ob += ((1.5 - sd) / 1.5) * (d.stun > 0 ? 0.25 : 1) * (s < 0.4 ? 1 : 0.7);
    }
    return clamp(1 - ob * 0.55, 0, 1);
  }

  private passSpeed(h: SP): number {
    return 9 + (h.pl.r.passing / 100) * 4;
  }

  /** 패스 길목을 지키는 수비수 때문에 끊길 확률 */
  private passRisk(h: SP, m: SP, perceived: boolean, tx = m.x, ty = m.y, lob = false): { risk: number; by: number; s: number } {
    const len = dist(h.x, h.y, tx, ty);
    const ft = len / this.passSpeed(h);
    let surv = 1;
    let best = -1;
    let bestP = 0;
    let bestS = 0;
    for (const d of this.mates((1 - h.team) as Side)) {
      const { d: sd, s } = segDist(d.x, d.y, h.x, h.y, tx, ty);
      if (s < 0.1) continue;
      // 공이 지나가는 동안 수비가 손을 뻗을 수 있는 거리
      const move = d.maxSpd * Math.max(0, Math.min(0.35, s * ft) - 0.12) * 0.45;
      const eff = Math.max(0, sd - 0.25 - move);
      if (eff > 1.2) continue;
      let pr = 0.12 * Math.exp(-eff / 0.2) * (0.6 + (ex(d.pl.r.steal) / 100) * 0.5 + (d.pl.r.iq / 100) * 0.2) * (perceived ? 1 : 1 + FX.pickpocket[lv(d.pl, 'pickpocket')] * 0.6);
      if (d.stun > 0) pr *= 0.3;
      // 패스하는 선수 바로 앞 수비는 피해서 던진다 (바운드 패스, 머리 위로)
      if (s < 0.3) pr *= 0.25;
      // 긴 패스는 가운데 수비 머리 위로 띄운다
      if (len > 6 && s > 0.3 && s < 0.7) pr *= 0.35;
      // 앨리웁 패스는 받는 쪽 근처의 키 큰 수비만 건드릴 수 있다
      if (lob) pr *= s > 0.8 ? clamp((d.pl.body.heightCm - 195) / 25, 0.2, 1.2) : 0.15;
      surv *= 1 - pr;
      if (pr > bestP) {
        bestP = pr;
        best = d.i;
        bestS = s;
      }
    }
    let risk = (1 - surv) * Math.max(0.35, 1.25 - (ex(h.pl.r.passing) / 100) * 0.5);
    if (this.doubleFor === h.i && this.doubler >= 0) risk *= 1.4;
    if (perceived) risk *= Math.max(0.3, 1.35 - (ex(h.pl.r.vision) / 100) * 0.7);
    return { risk: clamp(risk, 0, 0.95), by: best, s: bestS };
  }

  /** 골밑으로 뛰어드는 동료에게 띄워주는 앨리웁이 되는가 */
  private lobChance(h: SP, m: SP): boolean {
    // 픽앤롤로 굴러 들어가거나 컷인하며 골대로 달려드는 선수에게만
    const play = this.play;
    const rolling = play?.k === 'pnr' && play.stage === 'roll' && play.scr === m.i && !play.pop;
    if (!rolling && m.cut <= 0) return false;
    const H = this.hoop(m.team);
    const dm = dist(m.x, m.y, H.x, H.y);
    if (dm > 3.2 || dm < 0.8 || dist(h.x, h.y, m.x, m.y) < 4) return false;
    const toward = (m.vx * (H.x - m.x) + m.vy * (H.y - m.y)) / Math.max(0.01, dm);
    if (toward < 2.2) return false;
    if (!canDunk(m.pl, 1.0) || m.pl.r.jump < 55) return false;
    const alley = this.combo(h.pid, m.pid) === 'alley';
    if (h.pl.r.passing + h.pl.r.vision < (alley ? 90 : 110)) return false;
    for (const d of this.mates((1 - m.team) as Side)) {
      const near = Math.min(dist(d.x, d.y, m.x, m.y), dist(d.x, d.y, H.x, H.y));
      if (near < 1.6 && d.stun <= 0) return false;
    }
    return true;
  }

  private passValue(h: SP, m: SP, tLeft: number): number | null {
    const off = this.off;
    const Lm = this.loc(off, m.x, m.y);
    if (this.mode === 'set' && Lm.u > 14) return null; // 하프라인 뒤로는 안 돌린다
    const d = dist(h.x, h.y, m.x, m.y);
    if (d < 1.6 || d > 17) return null;
    const ft = d / this.passSpeed(h);
    if (tLeft < ft + 1.3) return null; // 받고 쏠 시간이 없다
    let ev: number;
    const create = (m.pl.r.ballHandling + m.pl.r.midRange + m.pl.r.three + m.pl.r.layup) / 4;
    const evCreate = this.vCont(tLeft - ft - 0.4) * (0.95 + (create - 50) * 0.002);
    const lob = this.lobChance(h, m);
    if (lob) {
      ev = 0.8 * 2;
    } else if (Lm.u < 10.2 + this.rangeOf(m).extra * 1.3) {
      const cm = this.contest(m, ft + 0.3).c;
      const si = shotInfo(m.pl, Lm.u, Lm.v, false, cm, this.rangeOf(m));
      const evShot = si.pOpen * contestFactor(si.kind, cm) * si.pts * this.form(m, si);
      ev = Math.max(evShot, evCreate);
    } else ev = evCreate * 0.97;
    const { risk } = this.passRisk(h, m, true, m.x, m.y, lob);
    let v = (1 - risk) * ev - risk * 1.0 - 0.015;
    const play = this.play;
    if (play?.k === 'iso' && play.star === m.i && play.star !== h.i) v += 0.18;
    if (play?.k === 'post' && play.star === m.i && Lm.u < 4) v += 0.12;
    if (play?.k === 'dho' && play.stage === 'entry' && play.big === m.i) v += 0.14;
    if (play?.k === 'pindown' && play.shooter === m.i && play.stage === 'run') v += 0.06;
    // 더블팀 당하면 비어 있는 동료를 찾는다
    if (this.doubleFor === h.i && this.doubler >= 0 && this.P[this.doubler].man === m.i) v += 0.12;
    if (this.lastPass && this.lastPass.from === m.i && this.t - this.lastPass.t < 2) v -= 0.06;
    v += (h.pl.r.teamwork - 50) * 0.0008;
    if (lv(h.pl, 'tunnel')) v -= 0.06;
    // 콤비는 서로를 먼저 본다 (기브앤고는 돌려받는 패스도)
    const cb = this.combo(h.pid, m.pid);
    if (cb) {
      v += 0.12;
      if (cb === 'giveGo' && this.lastPass && this.lastPass.from === m.i && this.t - this.lastPass.t < 2) v += 0.14;
      if (cb === 'kick' && Lm.u > 6.5) v += 0.08;
      if (cb === 'alley' && lob) v += 0.1;
    }
    v -= clamp((this.share(m.pid) - this.star[m.pid] - 0.25) * 0.9, 0, 0.2);
    // 슈퍼스타에게는 더 공을 준다
    v += this.star[m.pid] * 0.5;
    return v;
  }

  private holdAction(h: SP) {
    if (this.mode === 'advance') {
      this.act = { k: 'advance', u: 0, v: 0, t: this.t };
      return;
    }
    const play = this.play;
    if (play?.k === 'pnr' && (play.stage === 'go' || play.stage === 'set')) {
      if (this.act.k !== 'wait') {
        const L = this.loc(this.off, h.x, h.y);
        this.act = { k: 'wait', u: L.u, v: L.v, t: this.t };
      }
      return;
    }
    if (play?.k === 'post' && play.star === h.i && this.loc(this.off, h.x, h.y).u < 4.5) {
      this.act = { k: 'post', u: 0, v: 0, t: this.t };
      return;
    }
    if (this.act.k !== 'probe' || this.t > this.act.t) this.newProbe(h);
  }

  private newProbe(h: SP) {
    const off = this.off;
    let best = { u: 8, v: 0 };
    let bestScore = -Infinity;
    for (let k = 0; k < 6; k++) {
      const u = this.rng.range(5.6, 9.3);
      const v = this.rng.range(-5.2, 5.2);
      const w = this.wrl(off, u, v);
      let near = Infinity;
      for (const m of this.mates(off)) if (m.i !== h.i) near = Math.min(near, dist(m.x, m.y, w.x, w.y));
      const score = Math.min(near, 4) - dist(h.x, h.y, w.x, w.y) * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = { u, v };
      }
    }
    this.act = { k: 'probe', u: best.u, v: best.v, t: this.t + this.rng.range(1.2, 2.2) };
  }

  private startDrive(h: SP) {
    this.countered = false;
    this.cnt.drives++;
    this.adv.drives[h.pid]++;
    this.act = { k: 'drive', u: 0, v: 0, t: this.t };
    // 드리블 기술 (M25): 앞을 막은 수비를 기술로 제치고 들어간다. 볼핸들링이 좋을수록 자주, 길게 (콤보)
    const d = this.defenderOf(h.i);
    if (this.inFront(h, d, 2.6) && this.rng.chance(this.moveUseP(h))) this.startMoves(h, d, false);
  }

  /** 수비가 공 가진 선수와 골대 사이에 가까이 있나 */
  private inFront(h: SP, d: SP, range: number) {
    const H = this.hoop(h.team);
    const dh = Math.max(0.01, dist(h.x, h.y, H.x, H.y));
    const ahead = ((d.x - h.x) * (H.x - h.x) + (d.y - h.y) * (H.y - h.y)) / dh;
    return dist(d.x, d.y, h.x, h.y) < range && ahead > -0.1 && d.stun <= 0;
  }

  /** 드리블 기술을 쓸 확률: 볼핸들링 40 아래는 거의 안 쓰고 85 넘으면 거의 늘 (빅맨은 덜) */
  private moveUseP(h: SP): number {
    const r = h.pl.r;
    const f = (0.8 + r.sense / 250) * (this.styleOf[h.pid]?.flash ?? 1) ** 0.5 * (lv(h.pl, 'ankle') ? 1.15 : 1);
    // 샷클락이 얼마 안 남으면 기술로 시간을 쓰지 않는다
    const hurry = this.shotClock < 6 ? 0.4 : 1;
    return clamp(clamp((r.ballHandling - 40) / 45, 0, 1) ** 1.4 * 0.95 * f * (this.isBig(h) ? 0.45 : 1) * hurry, 0, 0.97);
  }

  /** 기술 고르기 (경기 난수): 흔한 정도 × 능력치 × 화려함 (센스·천재·성격) */
  private pickDribble(h: SP, from?: number[]): DribbleDef | null {
    const r = h.pl.r;
    const flash = (0.55 + r.sense / 100) * FX.geniusFlash[lv(h.pl, 'genius')] * (this.styleOf[h.pid]?.flash ?? 1);
    const list = DRIBBLES.filter((m) => (!from || from.includes(m.act)) && Object.entries(m.need).every(([k, v]) => r[k as RatingKey] >= v!));
    if (!list.length) return null;
    const w = list.map((m) => {
      const q = m.keys.reduce((a, k) => a + r[k], 0) / m.keys.length;
      return m.base * clamp(1 + (q - 60) / 30, 0.3, 2) * (m.flash > 1.1 ? flash ** (m.flash - 1) : 1);
    });
    return list[this.rng.weighted(w)];
  }

  /** 드리블 기술 시작: 첫 기술을 고르고, 볼핸들링에 따라 콤보 길이를 정한다 */
  private startMoves(h: SP, d: SP, help: boolean) {
    const first = this.pickDribble(h, help ? [ACT.SPIN, ACT.CROSSOVER, ACT.BEHIND, ACT.HALFSPIN, ACT.HESI] : undefined);
    if (!first) return;
    const H = this.hoop(h.team);
    const dh = Math.max(0.01, dist(h.x, h.y, H.x, H.y));
    const fx = (H.x - h.x) / dh;
    const fy = (H.y - h.y) / dh;
    // 공간이 넓은 쪽으로 공격한다 (다른 수비·사이드라인에서 먼 쪽)
    const room = (sg: number) => {
      const px = h.x - fy * sg * 1.6 + fx * 1.0;
      const py = h.y + fx * sg * 1.6 + fy * 1.0;
      let m = Math.min(px + 1, COURT.length + 1 - px, py + 0.5, COURT.width + 0.5 - py, 4);
      for (const o of this.mates(d.team)) if (o !== d) m = Math.min(m, dist(o.x, o.y, px, py));
      return m;
    };
    const side = room(1) >= room(-1) ? 1 : -1;
    const bh = h.pl.r.ballHandling;
    this.mv = { h: h.i, d: d.i, seq: [first], k: 0, t0: this.t, x0: h.x, y0: h.y, side, fx, fy, lx: -fy, ly: fx, decided: false, stage: 0, wins: 0, max: help ? 1 : bh >= 82 ? 3 : bh >= 68 ? 2 : 1, help };
    this.act = { k: 'move', u: 0, v: 0, t: this.t };
    this.beginMove(h);
  }

  private beginMove(h: SP) {
    const mv = this.mv!;
    const m = mv.seq[mv.k];
    // 방향을 바꾸는 순간은 누구나 첫 발을 세게 딛는다 (제쳤으면 더 오래)
    h.burstUntil = this.t + m.dur;
    h.burstK = 1 + (m.burst - 1) * 0.6;
    mv.t0 = this.t;
    mv.x0 = h.x;
    mv.y0 = h.y;
    mv.decided = false;
    mv.stage = 0;
    // 크게 꺾는 기술은 반대쪽으로 방향을 바꾼다 (첫 기술은 이미 고른 쪽으로)
    if (mv.k > 0 && m.lat >= 0.6) mv.side = -mv.side;
    this.nextThink = this.t + m.dur + 0.05;
    this.poseFx(h, m.act, m.dur + 0.05);
  }

  /** 기술 동안 공 가진 선수가 향하는 곳 (속이는 쪽 → 진짜 쪽) */
  private moveGoal(h: SP) {
    const mv = this.mv;
    if (!mv || mv.h !== h.i) return this.setGoal(h, h.x, h.y, 0.3);
    const m = mv.seq[mv.k];
    const s = mv.side;
    if (!mv.decided) {
      if (m.pause) return this.setGoal(h, mv.x0 + mv.fx * 0.25, mv.y0 + mv.fy * 0.25, 0.22);
      const fake = m.fake > 0 ? m.fake : m.lat * 0.25;
      return this.setGoal(h, mv.x0 - mv.lx * s * fake + mv.fx * m.fwd * 0.25, mv.y0 - mv.ly * s * fake + mv.fy * m.fwd * 0.25, 1);
    }
    if (m.fwd < 0) return this.setGoal(h, mv.x0 + mv.fx * m.fwd * 1.3, mv.y0 + mv.fy * m.fwd * 1.3, 1);
    // 진짜 방향: 옆으로 크게 꺾어 치고 나간다
    const fw = m.fwd + 0.6;
    this.setGoal(h, mv.x0 + mv.lx * s * m.lat * 2 + mv.fx * fw, mv.y0 + mv.ly * s * m.lat * 2 + mv.fy * fw, 1);
  }

  /** 기술 진행 (live에서 매 틱): 속이는 순간 수비가 반응하고, 끝나면 콤보를 잇거나 돌파로 */
  private updateMove(h: SP): boolean {
    const mv = this.mv;
    if (!mv || mv.h !== h.i || this.act.k !== 'move') {
      this.mv = null;
      if (this.act.k === 'move') this.act = { k: 'hold', u: 0, v: 0, t: this.t };
      return false;
    }
    const m = mv.seq[mv.k];
    const age = this.t - mv.t0;
    if (!mv.decided && age >= m.dur * (m.fake > 0 || m.pause ? 0.4 : 0.25)) {
      mv.decided = true;
      if (this.resolveMove(h, this.P[mv.d], m)) return true;
    }
    if (age < m.dur) return false;
    // 콤보: 아직 수비가 앞에 있으면 다음 기술을 잇는다
    const d = this.P[mv.d];
    const r = h.pl.r;
    if (mv.k + 1 < mv.max && mv.stage <= 1 && m.next.length && this.shotClock > 6 && this.inFront(h, d, 2.4) && this.rng.chance(clamp((r.ballHandling - 56) / 40, 0, 0.8))) {
      const nx = this.pickDribble(h, m.next);
      if (nx) {
        mv.seq.push(nx);
        mv.k++;
        this.beginMove(h);
        return false;
      }
    }
    this.mv = null;
    // 스냅백은 뒤로 빠져 슛 공간을 만든다, 나머지는 돌파를 이어 간다
    this.act = m.fwd < 0 ? { k: 'hold', u: 0, v: 0, t: this.t } : { k: 'drive', u: 0, v: 0, t: this.t };
    // 제쳤으면 일단 골밑으로 치고 들어간다 (골대 가까이 가면 drive가 알아서 판단을 부른다)
    this.nextThink = m.fwd >= 0 && mv.wins > 0 ? this.t + 0.4 : this.t;
    return false;
  }

  /**
   * 수비가 기술에 반응한다 (경기 난수): 공 다루는 실력·센스·기술의 힘 vs 외곽 수비·민첩·IQ·집중.
   * 1 = 반대로 쏠려 한 발 늦음, 2 = 휘청, 3 = 주저앉음 (앵클 브레이커). 크게 지면 공을 뺏긴다. 뺏겼으면 true
   */
  private resolveMove(h: SP, d: SP, m: DribbleDef): boolean {
    const mv = this.mv!;
    const r = h.pl.r;
    const dr = d.pl.r;
    const keyQ = m.keys.reduce((a, k) => a + ex(r[k]), 0) / m.keys.length;
    // 농구 IQ: 수비가 쏠린 틈을 골라 쓴다 (낮으면 아무 때나 써서 읽히고 뺏긴다)
    const q = keyQ + (r.sense - 50) * 0.15 + (r.iq - 52) * 0.15 + m.power * 12 + mv.wins * 6 + [0, 4, 8, 12][lv(h.pl, 'ankle')] + (lv(h.pl, 'genius') ? 5 : 0);
    const dq = mv.help
      ? ex(dr.perimeterD) * 0.25 + dr.agility * 0.25 + dr.helpD * 0.3 + dr.iq * 0.2 + lv(d.pl, 'rimProtector') * 5
      : ex(dr.perimeterD) * 0.45 + dr.agility * 0.3 + dr.iq * 0.15 + dr.focus * 0.1 + [0, 3, 6, 9][lv(d.pl, 'lockdown')];
    const edge = q - dq - MOVE_EDGE + this.rng.normal(0, 11);
    let stage = edge >= 32 && this.rng.chance(0.4 + lv(h.pl, 'ankle') * 0.15) ? 3 : edge >= 16 ? 2 : edge >= 3 ? 1 : 0;
    if (d.stun > 0) stage = Math.max(stage, 1);
    mv.stage = stage;
    this.cnt.moves = (this.cnt.moves ?? 0) + 1;
    if (stage === 0) {
      // 읽혔다: 크게 지면 수비가 공을 쳐낸다
      if (edge < -16 && this.rng.chance(0.14 * m.risk * (0.6 + (ex(dr.steal) / 100) * 0.6) * (1.3 - r.iq / 170))) {
        if (this.rng.chance(0.45)) this.deflect(h, d, 'stolenDribble', h.x, h.y, Math.atan2(h.y - d.y, h.x - d.x));
        else this.turnover(h.i, 'stolenDribble', d.i);
        this.mv = null;
        return true;
      }
      return false;
    }
    mv.wins++;
    this.cnt.beats = (this.cnt.beats ?? 0) + 1;
    // 속은 쪽으로 쏠리고 반응이 늦는다
    d.lag = Math.max(d.lag, 0.4 + 0.15 * stage);
    d.leanX = -mv.lx * mv.side * 0.9;
    d.leanY = -mv.ly * mv.side * 0.9;
    d.leanUntil = this.t + 0.35;
    if (stage === 2) d.stun = Math.max(d.stun, 0.55);
    if (stage === 3) d.stun = Math.max(d.stun, 1.25);
    this.poseFx(d, stage === 3 ? ACT.ANKLE : stage === 2 ? ACT.STUN : ACT.BEATEN, stage === 3 ? 1.4 : stage === 2 ? 0.65 : 0.5);
    h.burstUntil = mv.t0 + m.dur + 0.45;
    h.burstK = m.burst * (0.85 + r.accel / 300);
    const label = MOVE_LABEL[m.act];
    const text = stage === 3 ? `${h.pl.name}의 ${label}! ${d.pl.name} 주저앉았다 (앵클 브레이커)` : stage === 2 ? `${h.pl.name}의 ${label}! ${d.pl.name} 휘청` : `${h.pl.name}의 ${label}, ${d.pl.name}을(를) 제쳤다`;
    this.emit({ type: stage >= 3 ? 'ankle' : 'dribble', team: h.team, player: h.i, other: d.i, pts: 0, dmove: m.act, stage, combo2: mv.k + 1, text });
    return false;
  }

  private startGather(h: SP, post: boolean, alley = false, forced?: ShotMove) {
    this.lastDrive = this.act.k === 'drive' || this.act.k === 'move';
    this.mv = null;
    const L = this.loc(this.off, h.x, h.y);
    const ct = this.contest(h);
    let si = shotInfo(h.pl, L.u, L.v, post, ct.c, this.rangeOf(h));
    if (forced === 'putback') si = { ...si, kind: 'dunk' };
    if (forced === 'tipIn') si = { ...si, kind: 'layup' };
    // 슛 동작 (M16): 상황과 능력치로 고른다 (결과에 영향이 있어서 경기 난수)
    const move = forced ?? (alley ? undefined : this.pickShotMove(h, si, ct, post));
    const def = move ? shotMove(move) : undefined;
    let dur = forced === 'tipIn' ? 0.06 : alley || forced === 'putback' ? 0.12 : si.kind === 'three' ? 0.32 : si.kind === 'dunk' || si.kind === 'layup' ? 0.18 : 0.28;
    dur += def?.extra ?? 0;
    // 화면용 동작은 일단 예상으로. 손을 떠날 때 마무리가 정해지면 그 동작으로 다시 쓴다 (retroFinish)
    const j = h.pl.r.jump;
    const dunkish = alley || si.kind === 'dunk' || move === 'poster' || move === 'contactDunk';
    const act = this.finishAct(dunkish ? 'dunk' : si.kind, move, alley, undefined, si.dist);
    if (dunkish) this.jumpFx(h, this.dunkHeight(h, move), (dur + 0.6) * 2, act);
    else if (forced === 'tipIn') this.jumpFx(h, Math.max(this.zOf(h), leapOf(h.pl).vert * 0.9), dur + 0.35, act);
    else if (si.kind === 'layup') this.jumpFx(h, 0.5 + j / 300, dur + 0.4, act);
    else if (si.kind === 'hook' || si.kind === 'floater') this.jumpFx(h, 0.3 + j / 400, dur + 0.35, act);
    else this.jumpFx(h, 0.3 + j / 400, dur + 0.32, act, def?.slide ? Math.min(0.14, dur * 0.4) : 0);
    // 스텝백은 수비에게서 한 발 뒤로, 유로스텝·사이드스텝은 옆으로
    let slideDir: { x: number; y: number } | null = null;
    if (def?.slide) {
      const d = ct.blocker >= 0 ? this.P[ct.blocker] : this.defenderOf(h.i);
      let ax = h.x - d.x;
      let ay = h.y - d.y;
      const al = Math.hypot(ax, ay) || 1;
      ax /= al;
      ay /= al;
      if (def.slide.dir === 'side') {
        const sg = this.rng.chance(0.5) ? 1 : -1;
        [ax, ay] = [-ay * sg, ax * sg];
      }
      const T = Math.max(0.12, dur);
      h.slideX = (ax * def.slide.m) / T;
      h.slideY = (ay * def.slide.m) / T;
      h.slideUntil = this.t + T;
      slideDir = { x: ax, y: ay };
    }
    // 슛 동작이 실제로 수비를 제친다 (M25)
    this.posterBy = -1;
    this.drewFake = false;
    this.dodged = false;
    if (def?.beat) this.shotBeat(h, def, ct, slideDir, dur);
    this.act = { k: 'hold', u: L.u, v: L.v, t: this.t };
    this.ph = { k: 'gather', shooter: h.i, t: this.t, dur, post, alley, move, f0: this.tick };
  }

  /**
   * 슛 동작이 수비를 제친다 (M25, 경기 난수): 동작마다 맞서는 능력치가 다르다.
   * 이기면 수비가 한 발 늦거나 (반응·속도), 속아 쏠리거나, 밀려나거나, 펌프 페이크에 떠서 견제를 못 한다
   */
  private shotBeat(h: SP, m: ShotMoveDef, ct: { c: number; blocker: number; c1: number }, slideDir: { x: number; y: number } | null, dur: number) {
    const kind = m.beat!;
    const onBlocker = kind === 'bite' || kind === 'dodge' || kind === 'shove' || kind === 'over';
    const d = onBlocker && ct.blocker >= 0 ? this.P[ct.blocker] : this.defenderOf(h.i);
    if (dist(d.x, d.y, h.x, h.y) > 2.6 || d.stun > 0) return;
    const r = h.pl.r;
    const dr = d.pl.r;
    const keyQ = m.keys.reduce((a, k) => a + ex(r[k]), 0) / m.keys.length;
    let q = keyQ + (r.sense - 50) * 0.1 + (m.ability ? lv(h.pl, m.ability) * 5 : 0);
    let dq: number;
    switch (kind) {
      case 'shove':
        q = r.strength * 0.6 + Math.max(r.dunk, r.layup) * 0.4 + (h.pl.body.weightKg - 95) * 0.3;
        dq = dr.strength * 0.6 + dr.postD * 0.3 + (d.pl.body.weightKg - 95) * 0.3 + dr.boxOut * 0.1;
        break;
      case 'over':
        q = ex(r.dunk) * 0.4 + ex(r.jump) * 0.4 + r.strength * 0.2 + (h.pl.body.heightCm - 200) * 0.4;
        dq = ex(dr.block) * 0.4 + ex(dr.jump) * 0.3 + dr.strength * 0.2 + (d.pl.body.heightCm - 200) * 0.5;
        break;
      case 'jumpfake':
        dq = dr.iq * 0.5 + dr.focus * 0.3 + dr.composure * 0.2;
        break;
      case 'bite':
      case 'dodge':
        dq = dr.iq * 0.35 + dr.agility * 0.3 + dr.helpD * 0.2 + ex(dr.block) * 0.15;
        break;
      default:
        dq = ex(dr.perimeterD) * 0.5 + dr.agility * 0.3 + dr.iq * 0.2;
    }
    const edge = q - dq - 4 + this.rng.normal(0, 10);
    if (edge < 0) return;
    const big = edge > 14;
    const away = Math.max(0.01, dist(d.x, d.y, h.x, h.y));
    const ux = (d.x - h.x) / away;
    const uy = (d.y - h.y) / away;
    switch (kind) {
      case 'lunge':
        // 스텝백·사이드스텝: 달려든 수비가 한 발 늦는다 (크게 지면 미끄러진다)
        d.lag = Math.max(d.lag, big ? 0.65 : 0.45);
        d.leanX = -ux * 0.7;
        d.leanY = -uy * 0.7;
        d.leanUntil = this.t + 0.3;
        if (big) d.stun = Math.max(d.stun, 0.4);
        this.poseFx(d, big ? ACT.STUN : ACT.BEATEN, 0.5);
        break;
      case 'space':
        d.lag = Math.max(d.lag, 0.3);
        break;
      case 'bite':
        // 유로스텝: 첫 스텝 쪽으로 속아서 쏠린다
        d.lag = Math.max(d.lag, 0.5);
        if (slideDir) {
          d.leanX = -slideDir.x * 0.9;
          d.leanY = -slideDir.y * 0.9;
          d.leanUntil = this.t + 0.4;
        }
        if (big) d.stun = Math.max(d.stun, 0.35);
        this.poseFx(d, ACT.BEATEN, 0.55);
        break;
      case 'dodge':
        // 리버스·스쿱·더블 클러치: 블록하러 뻗은 손을 피한다
        d.lag = Math.max(d.lag, 0.3);
        this.dodged = true;
        this.poseFx(d, ACT.BEATEN, 0.45);
        break;
      case 'shove':
        // 컨택트: 몸으로 밀어낸다
        d.x += ux * (big ? 0.8 : 0.5);
        d.y += uy * (big ? 0.8 : 0.5);
        d.stun = Math.max(d.stun, big ? 0.6 : 0.4);
        this.poseFx(d, ACT.SHOVED, 0.6);
        break;
      case 'over':
        // 인유어페이스: 블록하러 뜬 수비 위로 찍고, 들어가면 수비가 넘어진다
        this.posterBy = d.i;
        break;
      case 'jumpfake':
        // 펌프 페이크: 수비가 떠 버려서 쏠 때 견제를 못 한다 (내려오며 부딪히면 파울)
        this.jumpFx(d, 0.35 + dr.jump / 400, 0.6, ACT.CONTEST, 0.05);
        d.stun = Math.max(d.stun, dur * 0.9);
        d.leanX = -ux * 0.5;
        d.leanY = -uy * 0.5;
        d.leanUntil = this.t + dur;
        this.drewFake = true;
        break;
    }
  }

  /** 마무리 동작 (M21): 덩크는 덩크 종류마다, 레이업·훅·플로터·점프슛은 각자, 슛 동작이 있으면 그 동작 */
  private finishAct(kind: ShotInfo['kind'], move: ShotMove | undefined, alley: boolean, dunk: DunkStyle | undefined, dist = 0): number {
    if (kind === 'dunk') {
      if (move === 'poster') return ACT.POSTER;
      if (move === 'contactDunk') return ACT.CDUNK;
      if (move === 'putback') return ACT.PUTBACK;
      if (alley) return ACT.ALLEY;
      return dunk ? DUNK_ACT[dunk] : ACT.DUNK;
    }
    const def = move ? shotMove(move) : undefined;
    if (def && def.act !== ACT.SHOOT && def.kinds.includes(kind) && !DUNK_MOVES.includes(def.id)) return def.act;
    if (kind === 'three' && dist >= DEEP_DIST) return ACT.DEEP;
    return kind === 'layup' ? ACT.LAYUP : kind === 'hook' ? ACT.HOOK : kind === 'floater' ? ACT.FLOAT : ACT.SHOOT;
  }

  /** 덩크 점프 높이 (화면용): 림에 손이 닿게. 큰 선수는 덜 뛰어도 닿는다 */
  private dunkHeight(h: SP, move?: ShotMove) {
    // 수직 점프 그대로 (M24). 림까지 손이 닿게 맞추는 건 화면이 한다
    return leapOf(h.pl).vert + (move === 'poster' ? 0.05 : 0);
  }

  /**
   * 손을 떠날 때 (M21): 마무리가 정해졌으니 모으는 동안 찍어 둔 화면용 동작·점프를 그 마무리로 다시 쓴다.
   * 경기 결과에는 영향이 없다 (화면 기록만)
   */
  private retroFinish(h: SP, ph: Extract<Phase, { k: 'gather' }>, kind: ShotInfo['kind'], act: number, flight: number) {
    const j = h.pl.r.jump;
    const t0 = ph.t;
    if (kind === 'dunk') {
      // 모으기부터 꽂을 때까지 한 번 뛰고, 꼭대기에서 꽂는다
      h.jt = t0;
      h.jd = (ph.dur + flight) * 2;
      h.jh = this.dunkHeight(h, ph.move);
      h.jk = 0;
    } else if (kind === 'layup') {
      h.jt = t0;
      h.jd = ph.dur + flight * 0.5 + 0.35;
      h.jh = 0.55 + j / 300;
      h.jk = 0;
    } else if (kind === 'hook' || kind === 'floater') {
      h.jt = t0;
      h.jd = ph.dur + 0.42;
      h.jh = 0.32 + j / 400;
      h.jk = 0;
    }
    h.fx = act;
    h.fxT = t0;
    h.fxUntil = this.t + (kind === 'dunk' ? flight + 0.05 : kind === 'layup' ? flight * 0.6 + 0.2 : 0.34);
    for (let f = ph.f0; f < this.tick; f++) {
      this.rAct[f * 10 + h.i] = act;
      const t = f * DT;
      let z = 0;
      if (h.jd > 0 && t >= h.jt && t < h.jt + h.jd) z = h.jh * Math.sin((Math.PI * (t - h.jt)) / h.jd);
      this.rPz[f * 10 + h.i] = Math.round(clamp(z, 0, 5) * 50);
    }
  }

  /** 덩크 도약 거리 (M24, 화면용 m): 점프·스피드가 좋을수록, 속공일수록, 화려한 덩크일수록 멀리서 뛴다 */
  private takeoffDist(h: SP, act: number, fast: boolean): number {
    const L = leapOf(h.pl);
    if (act === ACT.FTLINE) return 4.3 + L.clear * 0.2;
    // 피지컬 (점프·가속·스피드·키·윙스팬·몸무게)이 정하는 거리에 속공, 덩크 종류
    let d = L.range + (fast ? 0.4 : 0);
    if (act === ACT.SUPERMAN) d += 0.9;
    else if (act === ACT.WINDMILL || act === ACT.D360 || act === ACT.TOMAHAWK || act === ACT.CRADLE || act === ACT.BETWEEN || act === ACT.DOUBLE) d += 0.3;
    else if (act === ACT.POSTER || act === ACT.HAMMER) d += 0.25;
    else if (act === ACT.REVERSE) d -= 0.25;
    else if (act === ACT.CDUNK) d -= 0.35;
    return clamp(d, 1.2, 4.2);
  }

  /** 덩크 (M24, 화면용): 멀리서 뛰어 림까지 날아가 꽂는다 */
  private glideDunk(h: SP, ph: Extract<Phase, { k: 'gather' }>, act: number, flight: number, w: { x: number; y: number }, fast: boolean) {
    const D = this.takeoffDist(h, act, fast);
    const vert = this.dunkHeight(h, ph.move);
    return this.glide(h, ph, act, {
      tS: this.t + flight,
      end: w,
      D,
      // 체공 시간: 멀리서 뛸수록, 높이 뛸수록 길다
      air: (d) => clamp(0.5 + vert * 0.32 + (d - 1.5) * 0.09, 0.62, 1.08),
      // 동작의 앞 2할은 두 발을 모으는 시간 (도약은 동작 0.2, 꽂기는 0.9)
      ground: 0.286,
      jh: vert,
      peak: 1,
    });
  }

  /** 레이업 (M24, 화면용): 한두 걸음 앞에서 떠서 림 앞까지 날아가 올려놓는다 */
  private glideLayup(h: SP, ph: Extract<Phase, { k: 'gather' }>, act: number, flight: number, fast: boolean) {
    const H = this.hoop(h.team);
    const tS = this.t + flight * 0.4;
    // 손을 떠날 때 있을 자리 (지금 움직임대로)
    let ex = h.x + h.vx * flight * 0.4;
    let ey = h.y + h.vy * flight * 0.4;
    const de = dist(ex, ey, H.x, H.y);
    if (de < 0.45) {
      ex = H.x + ((ex - H.x) / Math.max(0.01, de)) * 0.45;
      ey = H.y + ((ey - H.y) / Math.max(0.01, de)) * 0.45;
    }
    const L = leapOf(h.pl);
    const D = clamp(0.75 + L.range * 0.35 + (fast ? 0.3 : 0) + (act === ACT.FINGER ? 0.25 : 0), 1.1, 2.6);
    this.glide(h, ph, act, {
      tS,
      end: { x: ex, y: ey },
      D,
      air: (d) => clamp(0.3 + L.vert * 0.2 + (d - 1.2) * 0.08, 0.34, 0.6),
      // 레이업 동작: 도약 0.3, 손을 떠나는 때 0.55
      ground: 1.2,
      jh: L.vert * 0.85,
      peak: 1.15,
    });
  }

  /**
   * 도약 (M24, 화면용): 도약 자리에서 떠서 날아간다.
   * 달려온 길은 그대로, 시간만 다시 나눈다: 도약 전엔 두 발을 모으며 속도를 줄이고, 도약부터 끝날 때까지 고르게 날아간다.
   * 기록된 위치·높이·동작만 고친다 (경기 결과에는 영향이 없다)
   */
  private glide(
    h: SP,
    ph: Extract<Phase, { k: 'gather' }>,
    act: number,
    o: { tS: number; end: { x: number; y: number }; D: number; air: (d: number) => number; ground: number; jh: number; peak: number },
  ): Leap | undefined {
    const i = h.i;
    const tS = o.tS;
    const H = this.hoop(h.team);
    // 공을 쥐고 달려온 구간 (1.4초까지)
    let fMin = this.tick - 1;
    while (fMin - 1 >= Math.max(0, this.tick - 14) && this.rCarry[fMin - 1] === i) fMin--;
    if (fMin >= this.tick - 1) return;
    // 길: 기록된 자리들 → 지금 자리 → 끝 자리 (시간과 함께)
    const px: number[] = [];
    const py: number[] = [];
    const pt: number[] = [];
    for (let f = fMin; f < this.tick; f++) {
      px.push(this.rPos[f * 20 + i * 2]);
      py.push(this.rPos[f * 20 + i * 2 + 1]);
      pt.push(f * DT);
    }
    px.push(h.x, o.end.x);
    py.push(h.y, o.end.y);
    pt.push(this.t, tS);
    const n = px.length;
    const cs = [0];
    for (let k = 1; k < n; k++) cs.push(cs[k - 1] + Math.hypot(px[k] - px[k - 1], py[k] - py[k - 1]));
    const sAtT = (t: number) => {
      if (t <= pt[0]) return 0;
      for (let k = 1; k < n; k++) if (t <= pt[k]) return cs[k - 1] + ((cs[k] - cs[k - 1]) * (t - pt[k - 1])) / Math.max(1e-6, pt[k] - pt[k - 1]);
      return cs[n - 1];
    };
    const at = (sv: number): [number, number] => {
      for (let k = 1; k < n; k++)
        if (sv <= cs[k]) {
          const u = (sv - cs[k - 1]) / Math.max(1e-6, cs[k] - cs[k - 1]);
          return [px[k - 1] + (px[k] - px[k - 1]) * u, py[k - 1] + (py[k] - py[k - 1]) * u];
        }
      return [px[n - 1], py[n - 1]];
    };
    const sEnd = cs[n - 1];
    // 도약 자리: 길 위에서 림까지 D가 되는 마지막 곳
    let sD = 0;
    for (let k = n - 2; k >= 0; k--) {
      const d0 = dist(px[k], py[k], H.x, H.y);
      if (d0 >= o.D) {
        const d1 = dist(px[k + 1], py[k + 1], H.x, H.y);
        const u = d0 === d1 ? 0 : clamp((d0 - o.D) / (d0 - d1), 0, 1);
        sD = cs[k] + (cs[k + 1] - cs[k]) * u;
        break;
      }
    }
    let A = o.air(dist(...at(sD), H.x, H.y));
    const G = o.ground;
    if (tS - A * (1 + G) < pt[0]) A = (tS - pt[0]) / (1 + G);
    if (A < 0.3) return;
    const tT = tS - A;
    // 실제가 도약 자리에 아직 못 왔으면 그때 있던 곳에서 뛴다
    sD = Math.min(sD, sAtT(tT));
    const vG = (sEnd - sD) / A;
    // 도약 전: 실제와 같은 곳에서 출발해 도약 자리까지 속도를 줄여 간다 (가장 자연스러운 출발 틱)
    let fa = fMin;
    let best = Infinity;
    for (let f = fMin; f * DT < tT - 0.15; f++) {
      const sa = sAtT(f * DT);
      if (sa > sD) break;
      const va = (sAtT((f + 1) * DT) - sa) / DT;
      const need = (sD - sa) / (tT - f * DT);
      const cost = Math.abs(need - (va + vG * 1.15) / 2);
      if (cost < best) {
        best = cost;
        fa = f;
      }
    }
    const ta = fa * DT;
    const sa = sAtT(ta);
    const span = Math.max(DT, tT - ta);
    const ds = Math.max(0, sD - sa);
    const va = (sAtT(ta + DT) - sa) / DT;
    const m0 = Math.min(va * span, 3 * ds);
    const m1 = Math.min(vG * 1.15 * span, 3 * ds);
    const sv = (t: number) => {
      if (t <= ta) return sAtT(t);
      if (t < tT) {
        const u = (t - ta) / span;
        const u2 = u * u;
        const u3 = u2 * u;
        return (2 * u3 - 3 * u2 + 1) * sa + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * sD + (u3 - u2) * m1;
      }
      const u = Math.min(1, (t - tT) / A);
      return sD + (sEnd - sD) * (1.15 * u - 0.15 * u * u);
    };
    // 높이: 도약부터 올라가 끝날 때 (peak배) 꼭대기
    h.jt = tT;
    h.jd = 2 * A * o.peak;
    h.jh = o.jh;
    h.jk = 0;
    const fG = Math.ceil((tT - A * G) / DT - 1e-6);
    for (let f = fa + 1; f < this.tick; f++) {
      const [x, y] = at(sv(f * DT));
      this.rPos[f * 20 + i * 2] = x;
      this.rPos[f * 20 + i * 2 + 1] = y;
    }
    for (let f = Math.max(fMin, Math.min(fG, ph.f0)); f < this.tick; f++) {
      const t = f * DT;
      const z = t > tT ? h.jh * Math.sin((Math.PI * (t - tT)) / h.jd) : 0;
      this.rPz[f * 10 + i] = Math.round(clamp(z, 0, 5) * 50);
      // 모으기 전까진 달려오는 모습 (슛을 모으는 동안 찍어 둔 마무리 동작은 지운다)
      this.rAct[f * 10 + i] = f >= fG ? act : ACT.DRIBBLE;
    }
    // 앞으로 날아갈 자리: 끝으로 갈수록 실제 자리에 섞어 이어 붙인다
    const q: number[] = [];
    for (let f = this.tick; (f + 1) * DT < tS; f++) q.push(...at(sv(f * DT)));
    h.vq = q;
    h.vqN = q.length / 2;
    const [lx, ly] = at(sD);
    return { d: Math.round(dist(lx, ly, H.x, H.y) * 10) / 10, h: Math.round(o.jh * 100) / 100, air: Math.round(A * 100) / 100, x: lx, y: ly, t: Math.ceil(tT / DT - 1e-6) };
  }

  /** 동작 성향: 성격(옵션) × 센스 × 천재 */
  private flair(h: SP, d: ShotMoveDef): number {
    const st = this.styleOf[h.pid] ?? {};
    let w = 1;
    if (d.flashy) w *= (0.55 + h.pl.r.sense / 100) * FX.geniusFlash[lv(h.pl, 'genius')] * (st.flash ?? 1);
    if (d.style === 'power') w *= st.power ?? 1;
    if (d.style === 'basic') w *= st.basic ?? 1;
    return w;
  }

  /** 슛 동작 고르기 (M16). 아무 동작 없이 던지는 것도 후보 */
  private pickShotMove(h: SP, si: ShotInfo, ct: { c: number; blocker: number; c1: number }, post: boolean): ShotMove | undefined {
    const r = h.pl.r;
    const d = this.defenderOf(h.i);
    const tight = ct.c >= 0.35 && dist(d.x, d.y, h.x, h.y) < 1.9;
    const near = si.kind === 'dunk' || si.kind === 'layup' || si.kind === 'floater' || si.kind === 'hook';
    const caught = !!this.lastPass && this.lastPass.to === h.i && this.t - this.lastPass.t < 1.1;
    const ok = (w: MoveWhen) => {
      switch (w) {
        case 'tight':
          return tight;
        case 'open':
          return ct.c < 0.22;
        case 'drive':
          return this.act.k === 'drive' || this.lastDrive;
        case 'post':
          return post;
        case 'catch':
          return caught;
        case 'traffic':
          return near ? ct.c >= 0.35 : tight;
        case 'rimContest':
          return ct.blocker >= 0 && ct.c1 >= 0.3;
        default:
          return true;
      }
    };
    const list: ShotMove[] = [];
    const w: number[] = [];
    for (const m of SHOT_MOVES) {
      if (m.base <= 0 || !m.kinds.includes(si.kind) || !ok(m.when)) continue;
      if (m.minHeight && h.pl.body.heightCm < m.minHeight) continue;
      if (DUNK_MOVES.includes(m.id) && !canDunk(h.pl, si.dist)) continue;
      if (!Object.entries(m.need).every(([k, v]) => r[k as RatingKey] >= v!)) continue;
      const avg = m.keys.reduce((s, k) => s + r[k], 0) / m.keys.length;
      let wt = m.base * clamp(1 + (avg - 60) / 25, 0.3, 2.2) * this.flair(h, m);
      if (m.ability) wt *= FX.moveBoost[lv(h.pl, m.ability)];
      list.push(m.id);
      w.push(wt);
    }
    if (!list.length) return undefined;
    // 그냥 던지기
    list.push('' as ShotMove);
    w.push(NO_MOVE_W);
    const pick = list[this.rng.weighted(w)];
    return pick || undefined;
  }

  private release(ph: Extract<Phase, { k: 'gather' }>) {
    const h = this.P[ph.shooter];
    const L = this.loc(this.off, h.x, h.y);
    const { c, blocker, c1 } = this.contest(h);
    let si = shotInfo(h.pl, L.u, L.v, ph.post, c, this.rangeOf(h));
    if (ph.alley && si.dist < 2.6) si = { ...si, kind: 'dunk', pOpen: 0.86 + (h.pl.r.dunk - 50) * 0.003 };
    if (ph.move === 'putback' && si.dist < 2.8) si = { ...si, kind: 'dunk', pOpen: 0.8 + (h.pl.r.dunk - 50) * 0.003 };
    // 팁인 (M26): 공중에서 손끝으로 밀어 넣는다
    if (ph.move === 'tipIn') {
      const r = h.pl.r;
      si = { ...si, kind: 'layup', pts: 2, three: false, pOpen: clamp(0.46 + (r.offReb + r.layup + r.jump - 165) / 320 + (h.pl.body.heightCm - 200) / 250, 0.22, 0.78) };
    }
    // 인유어페이스·컨택트 덩크: 수비가 버텨도 레이업 대신 찍는다
    if ((ph.move === 'poster' || ph.move === 'contactDunk') && si.kind === 'layup' && si.dist < 1.9) si = { ...si, kind: 'dunk', pOpen: 0.8 + (h.pl.r.dunk - 50) * 0.0015 };
    // 동작이 슛 종류와 안 맞게 됐으면 (스텝백으로 3점 라인 밖 등은 그대로) 효과만 뺀다
    const mv = ph.move && (ph.move === 'putback' || shotMove(ph.move)?.kinds.includes(si.kind)) ? ph.move : ph.move === 'stepback' ? ph.move : undefined;
    const mfx = mv ? (shotMove(mv)?.fx ?? {}) : {};
    // 특수능력: 퀵 릴리즈는 견제를 덜 받고, 철벽 수비는 더 준다
    const dd0 = blocker >= 0 ? this.P[blocker] : this.defenderOf(h.i);
    let cAdj = c;
    if (si.kind !== 'dunk' && si.kind !== 'layup') cAdj *= 1 - FX.quickRelease[lv(h.pl, 'quickRelease')];
    cAdj = Math.min(1, cAdj * (1 + FX.lockdown[lv(dd0.pl, 'lockdown')]));
    cAdj *= mfx.c ?? 1;
    // 받을 준비 (M22): 오프볼이 좋으면 받자마자 쏘는 슛에 수비가 덜 붙어 있다
    const caughtNow = !!this.lastPass && this.lastPass.to === h.i && this.t - this.lastPass.t < 1.1;
    if (caughtNow && (si.kind === 'three' || si.kind === 'mid')) cAdj *= 1 - clamp((h.pl.r.offBall - 56) / 180, -0.15, 0.18);
    // 엘리트 슈터·피니셔는 견제를 덜 탄다 (그 슛 능력치 85부터, M24: 99는 점프슛 3할, 골밑 5할 덜 탄다)
    const near0 = si.kind === 'dunk' || si.kind === 'layup' || si.kind === 'hook' || si.kind === 'floater';
    const sk = h.pl.r[SHOT_KEY[si.kind]];
    cAdj *= 1 - Math.max(clamp((sk - 85) / 100, 0, 0.14), elite(sk) * (near0 ? 0.5 : 0.3) + legend(sk) * 0.2);
    if (si.kind === 'mid' || si.kind === 'three') cAdj *= 1 - FX.deadeye[lv(h.pl, 'deadeye')];
    let p = si.pOpen * contestFactor(si.kind, cAdj) * this.form(h, si) * this.abilityShot(h) * (mfx.p ?? 1);
    // 99는 99답게 (M24): 엘리트·레전드는 남은 실패 확률을 줄인다 (99: 덩크 85%, 레이업 77%, 훅·플로터 55%, 미드 30%, 3점 20%)
    p += (1 - Math.min(1, p)) * missCut(si.kind, sk);
    const assist = this.lastPass && this.lastPass.to === h.i && this.t - this.lastPass.t < 3.2 ? this.lastPass.from : -1;
    // 콤비 패스를 받아 쏘면 조금 더 들어간다
    const comboShot = assist >= 0 && !!this.combo(this.P[assist].pid, h.pid);
    if (comboShot) p = Math.min(0.97, p * 1.08);
    // M18 특수능력: 야전사령관의 패스, 속공 머신
    if (assist >= 0) p *= 1 + FX.floorGeneral[lv(this.P[assist].pl, 'floorGeneral')];
    const fast = this.possLive && this.t - this.possStart < 7;
    if (fast) p *= 1 + FX.transition[lv(h.pl, 'transition')];
    const wasDrive = this.lastDrive;
    this.lastDrive = false;
    this.cnt.shotTimeSum += this.t - this.possStart;
    this.cnt.shotTimeN++;
    this.fga[h.pid]++;
    this.ball.holder = -1;
    this.misc = null;
    const near = si.kind === 'dunk' || si.kind === 'layup' || si.kind === 'hook' || si.kind === 'floater';
    const d = dd0;
    // 분석 (M17): 어떤 상황에서 쏜 슛인지, 누가 막았는지, 골밑은 누가 지켰는지
    const caught = assist >= 0 && this.t - this.lastPass!.t < 1.1;
    const ctx: ShotCtx = mv === 'putback' || mv === 'tipIn' ? 'putback' : ph.post ? 'post' : fast ? 'fast' : wasDrive && near ? 'drive' : caught && !wasDrive ? 'catch' : !near ? 'pullup' : 'other';
    const Hh = this.hoop(h.team);
    let rimP = -1;
    let rimD = 2.0;
    if (near) {
      for (const q of this.mates((1 - h.team) as Side)) {
        const rd = dist(q.x, q.y, Hh.x, Hh.y);
        if (rd < rimD) {
          rimD = rd;
          rimP = q.pid;
        }
      }
    }
    const meta = { ctx, def: d.pid, rim: rimP >= 0 ? rimP : undefined, passer: assist >= 0 ? this.P[assist].pid : undefined };
    // 림 프로텍터 (M18)가 골밑을 지키면 골밑 슛이 덜 들어간다
    if (rimP >= 0) p *= 1 - FX.rimDeny[lv(this.players[rimP], 'rimProtector')];
    if (c1 > 0.3 && dist(d.x, d.y, h.x, h.y) < 2.5) this.jumpFx(d, 0.25 + d.pl.r.jump / 400, 0.45, ACT.CONTEST);

    // 차징: 돌파하다 자리 잡은 도움 수비와 부딪힌다
    if (wasDrive && near && blocker >= 0 && blocker === this.helper && c1 > 0.5) {
      const speed = Math.hypot(d.vx, d.vy);
      if (speed < 1.5 && this.rng.chance(0.09 * (0.6 + d.pl.r.iq / 100))) {
        this.fga[h.pid]--;
        this.poseFx(d, ACT.FALL, 1.1);
        this.callFoul(h.i, d.i, 'charge');
        return;
      }
    }

    // 슈팅 파울: 골밑 몸싸움에서 자주, 점프슛에선 드물게
    let pFoul = near ? c1 * (0.23 + ((h.pl.r.strength + h.pl.r.layup) / 200) * 0.15) : c1 * 0.028;
    if (wasDrive) pFoul *= 1.25;
    pFoul *= 1.25 - ((d.pl.r.iq + d.pl.r.focus) / 400) * 1.0;
    pFoul *= this.foulCare(d.pid) * (lv(d.pl, 'foulProne') ? 1.4 : 1);
    pFoul *= mfx.foul ?? 1;
    // 펌프 페이크에 뜬 수비가 내려오며 부딪힌다 (M25)
    if (this.drewFake) pFoul = pFoul * 1.6 + 0.05;
    const fouled = this.rng.chance(clamp(pFoul, 0, 0.45));
    // 파울을 당하면 잘 안 들어간다 (컨택트 동작·컨택트 피니셔는 더 넣는다)
    if (fouled) p *= Math.min(0.92, (near ? 0.55 : 0.35) * (mfx.andOne ?? 1) * FX.contactAndOne[lv(h.pl, 'contact')]);
    // 블록하러 뜬 수비가 파울까지 하면 앤드원 인유어페이스
    let poster = fouled && mv === 'poster' && blocker >= 0 && c1 >= 0.3;
    if (poster) this.jumpFx(this.P[blocker], 0.5 + this.P[blocker].pl.r.jump / 260, 0.55, ACT.BLOCK);

    // 체이스다운 (M21): 속공 골밑 슛을 뒤에서 쫓아온 수비가 백보드에 찍어 누른다
    if (!fouled && fast && near && si.kind !== 'dunk') {
      const Hc = this.hoop(h.team);
      const dh = dist(h.x, h.y, Hc.x, Hc.y);
      let cb: SP | null = null;
      for (const q of this.mates((1 - h.team) as Side)) {
        if (!lv(q.pl, 'chaseDown') || q.i === blocker) continue;
        const dq = dist(q.x, q.y, h.x, h.y);
        if (dq < 3.4 && dist(q.x, q.y, Hc.x, Hc.y) > dh - 0.4 && (!cb || dq < dist(cb.x, cb.y, h.x, h.y))) cb = q;
      }
      if (cb && this.rng.chance(FX.chaseDown[lv(cb.pl, 'chaseDown')] * (0.6 + cb.pl.r.jump / 200 + cb.pl.r.speed / 400))) {
        this.jumpFx(cb, 0.7 + cb.pl.r.jump / 250, 0.6, ACT.CHASE);
        this.emit({
          type: 'miss',
          team: h.team,
          player: h.i,
          other: cb.i,
          pts: si.pts,
          shot: si.kind,
          dist: si.dist,
          x: h.x,
          y: h.y,
          blocked: true,
          chase: true,
          fastBreak: fast,
          prob: p,
          contest: c,
          move: mv,
          ...meta,
          text: `${cb.pl.name} 체이스다운 블록! 뒤에서 쫓아와 백보드에 찍었다 (${h.pl.name}의 ${SHOT_LABEL[si.kind]})`,
        });
        this.startRebound(Hc.x, Hc.y, COURT.rimHeight + 0.4, cb.x, cb.y, h.team);
        return;
      }
    }

    if (!fouled && blocker >= 0) {
      const b = this.P[blocker];
      let pb = c1 * (0.04 + (ex(b.pl.r.block) / 100) * 0.2 + ((b.pl.body.heightCm - h.pl.body.heightCm) / 100) * 0.25 + ((ex(b.pl.r.jump) - 50) / 100) * 0.05 + Math.max(0, b.pl.r.block - 80) * 0.004) * (1 + Math.max(0, b.pl.r.block - 75) / 40);
      if (!near) pb *= 0.25;
      if (si.kind === 'dunk') pb *= 0.6;
      // 엘리트 피니셔 (M24)는 블록을 피해 올린다
      pb *= 1 - elite(h.pl.r[SHOT_KEY[si.kind]]) * 0.6 - legend(h.pl.r[SHOT_KEY[si.kind]]) * 0.3;
      pb *= (mfx.block ?? 1) * (1 + FX.rimProtector[lv(b.pl, 'rimProtector')] * 1.5);
      if (this.dodged) pb *= 0.5;
      // 인유어페이스: 블록하러 뜬 수비 위로 찍는다
      if (mv === 'poster') {
        poster = true;
        this.jumpFx(b, 0.5 + b.pl.r.jump / 260, 0.55, ACT.BLOCK);
      }
      if (this.rng.chance(clamp(pb, 0, 0.38))) {
        poster = false;
        this.jumpFx(b, 0.55 + b.pl.r.jump / 250, 0.5, ACT.BLOCK);
        this.emit({
          type: 'miss',
          team: h.team,
          player: h.i,
          other: b.i,
          pts: si.pts,
          shot: si.kind,
          dist: si.dist,
          x: h.x,
          y: h.y,
          blocked: true,
          fastBreak: fast,
          prob: p,
          contest: cAdj,
          move: mv,
          ...meta,
          text: `${b.pl.name} 블록! (${h.pl.name}의 ${mv ? moveShotLabel(mv, SHOT_LABEL[si.kind]) : SHOT_LABEL[si.kind]})`,
        });
        const H = this.hoop(h.team);
        const a = Math.atan2(h.y - H.y, h.x - H.x) + this.rng.normal(0, 0.8);
        const kind = this.rng.next();
        if (kind < 0.22) {
          // 관중석까지 날려 버린다 (공격팀 공으로 다시)
          for (const len of [11, 16, 22]) {
            const ex = h.x + Math.cos(a) * len;
            const ey = h.y + Math.sin(a) * len;
            if (!this.inCourt(ex, ey)) {
              const fx = clamp(ex, -1.8, COURT.length + 1.8);
              const fy = clamp(ey, -1.8, COURT.width + 1.8);
              this.ball.holder = -1;
              this.ph = { k: 'swat', t: this.t, dur: 0.75, sx: h.x, sy: h.y, ex: fx, ey: fy, team: h.team };
              return;
            }
          }
        }
        if (kind > 0.85) {
          // 쳐낸 공을 블록한 선수가 바로 잡는다
          this.startRebound(h.x, h.y, 2.4, b.x, b.y, h.team);
          return;
        }
        const rr = this.rng.range(1.5, 4);
        this.startRebound(h.x, h.y, 2.4, h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr, h.team);
        return;
      }
    }
    const made = this.rng.chance(p);
    if (DEBUG.shot) DEBUG.shot(si.kind, c, p, made, this.shotClock);
    let dunk: DunkStyle | undefined;
    if (si.kind === 'dunk') dunk = mv === 'putback' ? 'putback' : ph.alley ? (h.pl.r.strength >= 62 && this.fxr.chance(0.5) ? 'two' : 'one') : this.pickDunk(h, c, fast || ph.alley);
    const flight = 0.55 + si.dist * 0.07;
    // 화면 (M21): 모으는 동안의 동작을 실제 마무리로 다시 쓰고, 덩크는 공을 쥔 채 림 앞까지 날아가 꽂는다
    this.retroFinish(h, ph, si.kind, this.finishAct(si.kind, mv, ph.alley, dunk, si.dist), flight);
    // 들어갈 걸 아는 슈터는 공이 날아가는 동안 돌아선다 (냉철·배짱 슈터, 딥쓰리)
    if (made && (si.kind === 'three' || si.kind === 'mid')) {
      const own = this.celebOpt[h.pid] ?? [];
      const cool = own.includes(ACT.TURNAWAY) || (si.dist >= DEEP_DIST && h.pl.r.composure >= 62) || (si.kind === 'three' && h.pl.r.three >= 80);
      if (cool && this.fxr.chance(own.includes(ACT.TURNAWAY) ? 0.55 : 0.3)) {
        h.qAct = ACT.TURNAWAY;
        h.qAt = this.t + 0.3;
        h.qDur = flight + 0.6;
      }
    }
    let leap: Leap | undefined;
    if (si.kind === 'dunk') {
      const w = this.wrl(h.team, COURT.hoopFromBaseline + 0.45, clamp(L.v * 0.35, -0.45, 0.45));
      h.vx = 0;
      h.vy = 0;
      h.slideX = (w.x - h.x) / flight;
      h.slideY = (w.y - h.y) / flight;
      h.slideUntil = this.t + flight;
      if (!ph.alley && mv !== 'putback') leap = this.glideDunk(h, ph, this.finishAct(si.kind, mv, ph.alley, dunk, si.dist), flight, w, fast);
    } else if (si.kind === 'layup' && !ph.post && mv !== 'tipIn') this.glideLayup(h, ph, this.finishAct(si.kind, mv, ph.alley, dunk, si.dist), flight, fast);
    this.ph = {
      k: 'shot',
      dunk,
      shooter: h.i,
      t: this.t,
      dur: flight,
      sx: h.x,
      sy: h.y,
      z0: si.kind === 'dunk' ? 3.0 : 2.3,
      peak: si.kind === 'dunk' ? 0.1 : si.kind === 'layup' ? 0.5 : si.kind === 'floater' ? 1.5 + si.dist * 0.1 : 1.2 + si.dist * 0.13,
      info: si,
      made,
      assist,
      fast,
      fouler: fouled ? d.i : -1,
      alley: ph.alley,
      prob: p,
      contest: cAdj,
      combo: comboShot,
      move: mv,
      bank: mv === 'bank' || undefined,
      poster: poster && si.kind === 'dunk',
      leap,
      ...meta,
    };
  }

  /** 덩크 종류: 노마크·속공일수록 화려하게 (열린 것 중에서) */
  private pickDunk(h: SP, contest: number, open: boolean): DunkStyle {
    const list = DUNKS.filter((d) => !d.contestOnly && !d.situational && dunkUnlocked(h.pl, d));
    const w = list.map((d) => (contest > 0.35 && d.flash > 1 ? 0.05 : open ? d.flash ** 2 : d.flash));
    return list[this.fxr.weighted(w)].id;
  }

  private shotArrive(ph: Extract<Phase, { k: 'shot' }>) {
    const h = this.P[ph.shooter];
    const si = ph.info;
    const base = ph.dunk && ph.dunk !== 'one' ? DUNK_LABEL[ph.dunk] : SHOT_LABEL[si.kind];
    const label = ph.move && ph.move !== 'putback' ? moveShotLabel(ph.move, base) : base;
    const fouled = ph.fouler >= 0;
    this.streak[h.pid] = ph.made ? this.streak[h.pid] + 1 : 0;
    if (ph.made) {
      this.addScore(h.team, si.pts);
      const ast = ph.assist >= 0 ? ` (어시스트 ${this.name(ph.assist)})` : '';
      const fb = ph.fast ? '속공 ' : '';
      const ao = ph.alley ? '앨리웁 ' : '';
      if (ph.alley) this.cnt.alleyOops++;
      // 세리머니 (M21): 덩크는 림에 매달렸다가, 큰 슛은 성격·능력치대로
      const bigShot = si.pts === 3 || si.kind === 'dunk' || fouled || (this.quarter >= 4 && this.clock < 120);
      const cel = this.celebFor(h, si, bigShot);
      if (si.kind === 'dunk') {
        this.hangFx(h, 0.6);
        if (bigShot) {
          h.qAct = cel;
          h.qAt = this.t + 0.62;
          h.qDur = 1.1;
        }
      } else if (h.qAct !== ACT.TURNAWAY && !(this.t < h.fxUntil && h.fx === ACT.TURNAWAY)) this.poseFx(h, bigShot ? cel : ACT.CELEBRATE, si.pts === 3 ? 1.4 : 0.8);
      // 가까운 팀원과 하이파이브
      const mate = this.mates(h.team).filter((m) => m !== h && dist(m.x, m.y, h.x, h.y) < 4.5).sort((a, b) => dist(a.x, a.y, h.x, h.y) - dist(b.x, b.y, h.x, h.y))[0];
      if (mate && this.fxr.chance(0.6)) this.poseFx(mate, ACT.HIGHFIVE, 0.7);
      if (fouled && (si.kind === 'layup' || si.kind === 'dunk') && this.fxr.chance(0.3)) this.poseFx(this.P[ph.fouler], ACT.FALL, 0.9);
      // 인유어페이스 (M25): 위로 찍힌 수비가 넘어진다
      if (ph.poster && this.posterBy >= 0) {
        const v = this.P[this.posterBy];
        this.poseFx(v, ACT.FALL, 1.1);
        v.stun = Math.max(v.stun, 0.8);
      }
      this.emit({
        type: 'made',
        team: h.team,
        player: h.i,
        other: ph.assist,
        pts: si.pts,
        shot: si.kind,
        dist: si.dist,
        x: ph.sx,
        y: ph.sy,
        fastBreak: ph.fast,
        andOne: fouled,
        alleyOop: ph.alley,
        dunk: ph.dunk,
        prob: ph.prob,
        contest: ph.contest,
        combo: ph.combo || undefined,
        move: ph.move,
        poster: ph.poster || undefined,
        leap: ph.leap,
        fancy: (ph.assist >= 0 && this.lastPass?.fancy) || undefined,
        ctx: ph.ctx,
        def: ph.def,
        rim: ph.rim,
        text: `${h.pl.name} ${fb}${ao}${label} 성공${ph.poster ? '!! 수비 머리 위로' : ''}${ph.leap && ph.leap.d >= 2.5 ? ` (${ph.leap.d.toFixed(1)}m 밖에서 도약)` : ''}${ast}${fouled ? ' + 앤드원!' : ''}${ph.combo ? ' · 콤비 플레이!' : ''}`,
      });
      const H = this.hoop(h.team);
      this.ball.x = H.x;
      this.ball.y = H.y;
      this.ball.z = COURT.rimHeight;
      if (fouled) {
        this.callFoul(ph.fouler, h.i, 'shooting', 1);
        return;
      }
      if (this.buzzer) {
        this.endQuarter();
        return;
      }
      const scoredOn = (1 - h.team) as Side;
      this.startMadeInbound(scoredOn);
      // 득점 당한 팀은 타임아웃을 부를 수 있다
      if (this.maybeTimeout(scoredOn, this.ball.x, this.ball.y)) this.resume = () => this.startMadeInbound(scoredOn);
      return;
    }
    if (fouled) {
      // 슛 실패 + 파울: 야투 시도로 안 치고 자유투 2개(3점이면 3개). 시간이 다 됐어도 자유투는 쏜다.
      if ((si.kind === 'layup' || si.kind === 'dunk') && this.fxr.chance(0.4)) this.poseFx(h, ACT.FALL, 1.0);
      this.fga[h.pid]--;
      this.buzzer = false;
      this.callFoul(ph.fouler, h.i, 'shooting', si.pts);
      return;
    }
    const mk = this.missKindOf(h.team, ph.sx, ph.sy, si.kind, si.dist, ph.contest);
    this.emit({
      type: 'miss',
      team: h.team,
      player: h.i,
      other: -1,
      pts: si.pts,
      shot: si.kind,
      dist: si.dist,
      missKind: mk,
      x: ph.sx,
      y: ph.sy,
      fastBreak: ph.fast,
      prob: ph.prob,
      contest: ph.contest,
      move: ph.move,
      leap: ph.leap,
      ctx: ph.ctx,
      def: ph.def,
      rim: ph.rim,
      passer: ph.passer,
      text: `${h.pl.name} ${label} 실패`,
    });
    if (this.buzzer) {
      this.poseFx(h, ACT.DEJECT, 1.6);
      this.endQuarter();
      return;
    }
    this.missFlight(h.team, ph.sx, ph.sy, mk, si.dist, false);
  }

  /**
   * 정해 둔 자리로 공을 띄운다 (블록·자유투 등 옛 방식 호출): 그 자리 근처에 1.6m 높이로 내려오게 던진 다음 물리로
   */
  private startRebound(sx: number, sy: number, z0: number, ex: number, ey: number, shotTeam: Side, ft = false) {
    // 공이 베이스라인 밖으로 나가지 않게
    const L = this.loc(shotTeam, ex, ey);
    const w = this.wrl(shotTeam, Math.max(0.5, L.u), clamp(L.v, -7.0, 7.0));
    const rr = dist(sx, sy, w.x, w.y);
    const T = 0.5 + rr * 0.12;
    const vz = (1.6 - z0 + 0.5 * G * T * T) / T;
    this.startAir({ x: sx, y: sy, z: z0, vx: (w.x - sx) / T, vy: (w.y - sy) / T, vz }, shotTeam, shotTeam, { ft, noScore: true });
  }

  /** 공을 공중에 띄운다 (M26) */
  private startAir(b: BallBody, shotTeam: Side, touch: Side, o: { ft?: boolean; noScore?: boolean; steal?: { by: number; from: number; kind: TurnoverKind }; noCatch?: number } = {}) {
    this.ball.holder = -1;
    this.ball.x = b.x;
    this.ball.y = b.y;
    this.ball.z = b.z;
    this.bv = { x: b.vx, y: b.vy, z: b.vz };
    const c = predictCatch(b, o.noScore ?? true);
    this.ph = { k: 'air', t: this.t, shotTeam, touch, ft: !!o.ft, noScore: o.noScore ?? true, lx: c.x, ly: c.y, noCatch: this.t + (o.noCatch ?? 0.15), tips: 0, lastBounce: -1, steal: o.steal };
  }

  /** 빗나간 슛이 어디에 맞았나 (M26): 먼 슛은 앞뒤 림, 골밑은 백보드·옆 림, 옆 (베이스라인 쪽)에서 쏠수록 백보드 */
  private missKindOf(team: Side, sx: number, sy: number, kind: ShotInfo['kind'], d: number, contest: number): MissKind {
    const H = this.hoop(team);
    const L = this.loc(team, sx, sy);
    const Lh = this.loc(team, H.x, H.y);
    const angle = clamp(Math.abs(L.v - Lh.v) / Math.max(0.5, Math.hypot(L.u - Lh.u, L.v - Lh.v)), 0, 1);
    return pickMiss(kind, d, contest, angle, () => this.rng.next());
  }

  /** 빗나간 슛 (M26): 맞은 자리에서 그대로 튀게 한다 */
  private missFlight(team: Side, sx: number, sy: number, mk: MissKind, d: number, ft: boolean) {
    const H = this.hoop(team);
    const dl = Math.max(0.01, dist(sx, sy, H.x, H.y));
    const f = { x: (H.x - sx) / dl, y: (H.y - sy) / dl };
    const b = missBounce(mk, H, f, d, () => this.rng.next());
    this.startAir(b, team, team, { ft, noScore: true, noCatch: 0.1 });
    if (mk !== 'air') this.emitBounce(team, mk === 'board' ? 'board' : 'rim', mk === 'hard' ? 6 : 2 + d / 4);
  }

  private emitBounce(team: Side, hit: 'rim' | 'board', power: number) {
    this.emit({ type: 'bounce', team, player: -1, other: -1, pts: 0, hit, power: Math.round(power * 10) / 10, text: '' });
  }

  /**
   * 공중의 공 (M26): 물리로 움직이고, 림·백보드에 맞으면 다시 튄다. 손이 닿는 선수들이 뛰어서 잡으려고 다툰다
   * (자리·리바운드·점프·키·허슬·박스아웃). 비슷하게 다투면 쳐내고, 골밑 공격수는 팁인, 바닥에 떨어지면 몸을 던져 다툰다
   */
  private airUpdate(ph: Extract<Phase, { k: 'air' }>) {
    const b = this.ball;
    const body: BallBody = { x: b.x, y: b.y, z: b.z, vx: this.bv.x, vy: this.bv.y, vz: this.bv.z };
    const hits: Hits = { rim: 0, board: 0, floor: 0, hard: 0 };
    stepBall(body, DT, ph.noScore, hits);
    b.x = body.x;
    b.y = body.y;
    b.z = body.z;
    this.bv = { x: body.vx, y: body.vy, z: body.vz };
    if (hits.rim || hits.board) {
      if (this.t - ph.lastBounce > 0.25) this.emitBounce(ph.shotTeam, hits.rim ? 'rim' : 'board', hits.hard);
      ph.lastBounce = this.t;
      const c = predictCatch(body, ph.noScore);
      ph.lx = c.x;
      ph.ly = c.y;
    }
    // 바닥에 닿았다가 코트 밖이면 아웃: 마지막으로 건드린 팀이 공을 잃는다
    if (!this.inCourt(b.x, b.y) && (b.z < 0.6 || Math.abs(b.x - COURT.length / 2) > COURT.length / 2 + 1.2 || Math.abs(b.y - MID_Y) > MID_Y + 1.2)) {
      const next = (1 - ph.touch) as Side;
      this.off = ph.shotTeam;
      // 쳐낸 공을 공격팀이 마지막으로 건드려 나가면 실책, 리바운드 다툼 공이면 상대 공
      if (ph.steal && next !== ph.shotTeam) this.turnover(ph.steal.from, 'outOfBounds');
      else this.startDead(next);
      return;
    }
    // 낮게 굴러가면 잡힐 자리는 공 자리
    if (b.z < 1.4) {
      ph.lx = b.x + this.bv.x * 0.3;
      ph.ly = b.y + this.bv.y * 0.3;
    }
    if (this.t < ph.noCatch) return;
    // 뛰어오를 때: 공이 손 닿을 높이 위로 내려오고 있으면
    for (const p of this.P) {
      const hd = dist(p.x, p.y, b.x, b.y);
      if (hd > 1.8 || p.stun > 0) continue;
      const L = leapOf(p.pl);
      if (this.zOf(p) <= 0 && this.t >= p.jt + p.jd && this.bv.z < 0.5 && b.z > L.reach + 0.05 && b.z < L.reach + L.vert + 0.35) this.jumpFx(p, L.vert * (0.85 + this.fit(p) * 0.15), 0.6, ACT.REBOUND);
    }
    // 손이 닿는 선수
    const H = this.hoop(ph.shotTeam);
    const cands: { p: SP; w: number; sure: number }[] = [];
    for (const p of this.P) {
      const hd = dist(p.x, p.y, b.x, b.y);
      const L = leapOf(p.pl);
      const low = b.z < 1.3;
      // 손이 닿는 거리: 팔이 길수록, 낮은 공은 몸을 숙여 더 멀리
      const reachR = 0.58 + (p.pl.body.wingspanCm - 195) / 250 + (low ? 0.2 : 0);
      if (hd > reachR) continue;
      const top = L.reach + Math.max(0.15, this.zOf(p));
      if (b.z > top) continue;
      // 림 위 원통 안의 공은 건드리면 안 된다
      if (dist(b.x, b.y, H.x, H.y) < 0.45 && b.z > COURT.rimHeight - 0.05) continue;
      const offTeam = p.team === ph.shotTeam;
      const r = p.pl.r;
      const skill = low ? (r.hustle + r.speed) / 2 : offTeam ? r.offReb : r.defReb;
      const w =
        Math.exp(-hd / 0.35) *
        (0.4 + ex(skill) / 100 + ex(r.jump) / 250 + r.hustle / 400 + (offTeam || low ? 0 : ex(r.boxOut) / 300)) *
        (1 + (p.pl.body.heightCm - 196) / (low ? 120 : 45)) *
        (offTeam && !low ? (ph.ft ? 0.4 : 0.6) : 1) *
        (0.85 + 0.15 * this.fit(p)) *
        (p.stun > 0 ? 0.4 : 1) *
        (1 + FX.rebound[lv(p.pl, 'rebound')]);
      // 손끝에 겨우 닿는 공은 잘 안 잡힌다 (튕기거나 놓친다): 내려와서 손 안에 들어올수록 확실히
      const sure = low ? 0.85 : clamp(0.22 + (top - b.z) * 2.2, 0.22, 0.95);
      cands.push({ p, w: w * sure, sure });
    }
    if (!cands.length) {
      if (this.t - ph.t > 6) {
        // 안전장치: 가장 가까운 선수
        let best = this.P[0];
        for (const p of this.P) if (dist(p.x, p.y, b.x, b.y) < dist(best.x, best.y, b.x, b.y)) best = p;
        this.secure(best, ph);
      }
      return;
    }
    cands.sort((a, c) => c.w - a.w);
    const k = this.rng.weighted(cands.map((c) => c.w));
    const win = cands[k];
    const rival = cands.find((c) => c.p.team !== win.p.team);
    // 리바운드 다툼 중 파울
    if (rival && b.z > 1.3 && this.rng.chance(0.05)) {
      const offs = cands.filter((c) => c.p.team === ph.shotTeam);
      const defs = cands.filter((c) => c.p.team !== ph.shotTeam);
      if (offs.length && defs.length) {
        const offFoul = this.rng.chance(0.55);
        const pool = offFoul ? offs : defs;
        const f = pool[this.rng.weighted(pool.map((c) => this.foulCare(c.p.pid) ** 2))].p;
        if (!(this.pf[f.pid] >= this.foulOut - 1 && this.rng.chance(0.7))) {
          const v = offFoul ? this.rng.pick(defs).p : this.rng.pick(offs).p;
          this.off = v.team;
          this.callFoul(f.i, v.i, 'loose');
          return;
        }
      }
    }
    // 비슷하게 다투면 쳐낸다 (탭아웃): 공은 다시 공중으로
    if (rival && ph.tips < 3 && rival.w > win.w * 0.55 && this.rng.chance(b.z > 1.3 ? 0.32 : 0.22)) {
      ph.tips++;
      const a = this.rng.range(0, Math.PI * 2);
      const v = this.rng.range(1.2, 3.2);
      this.bv = { x: Math.cos(a) * v, y: Math.sin(a) * v, z: b.z > 1.3 ? this.rng.range(0.4, 1.8) : this.rng.range(0.6, 1.4) };
      ph.touch = win.p.team;
      ph.noCatch = this.t + 0.2;
      const c = predictCatch({ x: b.x, y: b.y, z: b.z, vx: this.bv.x, vy: this.bv.y, vz: this.bv.z }, ph.noScore);
      ph.lx = c.x;
      ph.ly = c.y;
      this.poseFx(win.p, b.z > 1.3 ? ACT.BLOCK : ACT.DIVE, 0.45);
      if (b.z < 1.3) this.poseFx(rival.p, ACT.DIVE, 0.6);
      return;
    }
    // 아무도 확실히 못 잡으면: 손끝에 맞고 튀거나 그냥 지나간다
    if (!this.rng.chance(1 - cands.reduce((a, c) => a * (1 - c.sure), 1))) {
      if (ph.tips < 4 && this.rng.chance(0.3)) {
        ph.tips++;
        const a = Math.atan2(this.bv.y, this.bv.x) + this.rng.normal(0, 1.0);
        const v = Math.hypot(this.bv.x, this.bv.y) * 0.6 + this.rng.range(0.3, 1.2);
        this.bv = { x: Math.cos(a) * v, y: Math.sin(a) * v, z: Math.abs(this.bv.z) * 0.3 + this.rng.range(0.3, 1.2) };
        ph.touch = win.p.team;
        ph.noCatch = this.t + 0.15;
        const c = predictCatch({ x: b.x, y: b.y, z: b.z, vx: this.bv.x, vy: this.bv.y, vz: this.bv.z }, ph.noScore);
        ph.lx = c.x;
        ph.ly = c.y;
      }
      return;
    }
    // 바닥 공을 둘이 다퉜으면 몸을 던진다
    if (rival && b.z < 1.3) this.poseFx(this.fxr.chance(0.5) ? win.p : rival.p, ACT.DIVE, 0.6);
    // 팁인: 골밑 공격수가 림 높이에서 건드려 넣는다
    if (!ph.steal && win.p.team === ph.shotTeam && b.z > 2.7 && dist(win.p.x, win.p.y, H.x, H.y) < 1.4) {
      const r = win.p.pl.r;
      if (this.rng.chance(clamp(0.12 + (r.offReb + r.jump + r.layup - 180) / 300 + (win.p.pl.body.heightCm - 200) / 200, 0.04, 0.5))) {
        this.secure(win.p, ph, true);
        return;
      }
    }
    this.secure(win.p, ph);
  }

  /** 공을 잡았다: 쳐낸 공이면 스틸 판정, 아니면 리바운드 (tip이면 바로 팁인) */
  private secure(p: SP, ph: Extract<Phase, { k: 'air' }>, tip = false) {
    if (ph.steal) {
      this.looseRecover(p, ph);
      return;
    }
    this.rebound(p, ph.shotTeam, tip);
  }

  private inCourt(x: number, y: number) {
    return x > 0 && x < COURT.length && y > 0 && y < COURT.width;
  }

  /** 공을 쳐냈다: 공이 튀어 나가 루즈볼. 누가 잡느냐에 따라 스틸이 되거나 공격이 이어진다 */
  private deflect(from: SP, by: SP, kind: TurnoverKind, bx: number, by_: number, dir: number, z = 1.0) {
    const a = dir + this.rng.normal(0, 0.9);
    const v = this.rng.range(2.5, 4.2);
    this.ball.holder = -1;
    this.ball.x = bx;
    this.ball.y = by_;
    this.poseFx(by, ACT.STEAL, 0.4);
    this.emit({ type: 'loose', team: by.team, player: by.i, other: from.i, pts: 0, text: `${by.pl.name} 공을 쳐냈다!` });
    this.act = { k: 'hold', u: 0, v: 0, t: this.t };
    this.startAir({ x: bx, y: by_, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: this.rng.range(0.5, 2.0) }, this.off, by.team, { steal: { by: by.i, from: from.i, kind }, noCatch: 0.2 });
  }

  /** 쳐낸 루즈볼을 누가 잡았나 */
  private looseRecover(p: SP, ph: Extract<Phase, { k: 'air' }>) {
    const st = ph.steal!;
    // 몸을 던져서 잡기도 한다
    const rival = this.P.some((q) => q.team !== p.team && dist(q.x, q.y, p.x, p.y) < 1.6);
    if (rival && this.fxr.chance(0.45)) this.poseFx(p, ACT.FALL, 0.7);
    if (p.team !== ph.shotTeam) {
      // 수비가 잡으면 쳐낸 선수의 스틸 (놓친 패스는 잡은 선수의 스틸)
      this.turnover(st.from, st.kind, st.by >= 0 ? st.by : p.i);
      this.ball.holder = p.i;
      return;
    }
    this.emit({ type: 'loose', team: p.team, player: p.i, other: -1, pts: 0, offensive: true, text: `${p.pl.name} 루즈볼을 다시 잡았다` });
    this.ball.holder = p.i;
    this.act = { k: 'hold', u: 0, v: 0, t: this.t };
    this.nextThink = this.t + 0.2;
    this.ph = { k: 'live' };
  }

  private rebound(p: SP, shotTeam: Side, tip = false) {
    const offensive = p.team === shotTeam;
    this.emit({
      type: 'rebound',
      team: p.team,
      player: p.i,
      other: -1,
      pts: 0,
      offensive,
      text: `${p.pl.name} ${offensive ? '공격' : '수비'} 리바운드`,
    });
    this.ball.holder = p.i;
    if (offensive) {
      this.off = p.team;
      this.mode = 'set';
      this.play = null;
      this.lastPass = null;
      this.shotClock = 14;
      this.act = { k: 'hold', u: 0, v: 0, t: this.t };
      this.nextThink = this.t + 0.2;
      this.nextSpots = 0;
      // 팁인 (M26): 잡지 않고 공중에서 바로 건드려 넣는다
      if (tip) {
        this.startGather(p, false, false, 'tipIn');
        return;
      }
      // 풋백 덩크 (M16): 골밑에서 잡자마자 다시 찍는다
      const H = this.hoop(p.team);
      const r = p.pl.r;
      if (dist(p.x, p.y, H.x, H.y) < 1.8 && r.dunk >= 55 && r.jump >= 58 && canDunk(p.pl, 1.0) && this.rng.chance(clamp(0.1 + (r.dunk + r.jump - 120) / 250, 0.03, 0.32))) {
        this.startGather(p, false, false, 'putback');
        return;
      }
    } else {
      this.changePossession(p.team, true);
    }
    this.ph = { k: 'live' };
  }

  // ---------------------------------------------------------------- 패스

  private startPass(h: SP, m: SP, inbound: boolean, from?: { x: number; y: number }, handoff = false) {
    if (this.act.k === 'drive' && this.ball.holder === h.i) this.adv.drivePass[h.pid]++;
    const sx = from?.x ?? h.x;
    const sy = from?.y ?? h.y;
    const lob = !inbound && !handoff && this.lobChance(h, m);
    const spd = this.passSpeed(h) * (lob ? 0.75 : 1);
    const ft0 = dist(sx, sy, m.x, m.y) / spd;
    // 받는 선수가 움직이는 방향으로 조금 앞에 준다
    let ex = clamp(m.x + m.vx * ft0 * 0.6, 0.3, COURT.length - 0.3);
    let ey = clamp(m.y + m.vy * ft0 * 0.6, 0.3, COURT.width - 0.3);
    let dur = handoff ? 0.15 : Math.max(0.15, dist(sx, sy, ex, ey) / spd + 0.05);
    let intercept = -1;
    let oob = false;
    const madeInbound = inbound && this.ph.k === 'inbound' && this.ph.made;
    if (!from && !madeInbound && !handoff) {
      const pr = this.passRisk(h, m, false, ex, ey, lob);
      // 쇼타임 (M21): 속공 패스가 덜 끊긴다
      const showFast = this.possLive && this.t - this.possStart < 7 ? 1 - FX.showtime[lv(h.pl, 'showtime')] * 0.6 : 1;
      if (pr.by >= 0 && this.rng.chance(Math.min(0.95, pr.risk * READ_K) * (1 - FX.noLook[lv(h.pl, 'noLook')]) * showFast)) {
        intercept = pr.by;
        this.lastRiskS = pr.s;
        DEBUG.lane?.('read');
        if (DEBUG.intercept) {
          const d = this.P[pr.by];
          const sd = segDist(d.x, d.y, sx, sy, ex, ey);
          DEBUG.intercept({ risk: pr.risk.toFixed(2), s: pr.s.toFixed(2), sd: sd.d.toFixed(2), len: dist(sx, sy, ex, ey).toFixed(1), who: d.man === h.i ? 'passerD' : d.man === m.i ? 'recvD' : 'other', mode: this.mode });
        }
      } else if (!inbound) {
        const pOob = 0.004 + ((100 - h.pl.r.passing) / 100) * 0.01 + ((100 - h.pl.r.focus) / 100) * 0.004 + ((52 - h.pl.r.iq) / 100) * 0.006;
        if (this.rng.chance(pOob)) {
          oob = true;
          const ang = Math.atan2(ey - sy, ex - sx) + this.rng.normal(0, 0.5);
          ex = sx + Math.cos(ang) * 14;
          ey = sy + Math.sin(ang) * 14;
          ex = clamp(ex, -1.5, COURT.length + 1.5);
          ey = clamp(ey, -1.5, COURT.width + 1.5);
          dur = dist(sx, sy, ex, ey) / spd;
        }
      }
    }
    if (!inbound) this.cnt.passes++;
    const ix = intercept >= 0 ? lerp(sx, ex, this.lastRiskS) : ex;
    const iy = intercept >= 0 ? lerp(sy, ey, this.lastRiskS) : ey;
    // 짧은 패스는 가끔 바운드로, 롭은 머리 위로
    const bounce = !lob && !inbound && !handoff && dist(sx, sy, ex, ey) < 6.5 && this.fxr.chance(0.3);
    // 화려한 패스 (M21, 화면용 난수): 쇼타임·노룩 패스·센스가 좋으면 비하인드 백·노룩
    const r = h.pl.r;
    const fancyP = FX.showtimeFancy[lv(h.pl, 'showtime')] + (lv(h.pl, 'noLook') ? 0.02 : 0) + Math.max(0, r.sense - 75) / 900 + Math.max(0, r.passing - 82) / 1200;
    this.fancyPass = !from && !lob && !inbound && !handoff && fancyP > 0 && this.fxr.chance(fancyP);
    if (!from) this.poseFx(h, this.fancyPass ? (Math.hypot(h.vx, h.vy) > 2 ? ACT.BEHINDPASS : ACT.NOLOOK) : lob ? ACT.LOB : bounce ? ACT.BOUNCE : ACT.PASS, this.fancyPass ? 0.4 : 0.3);
    this.ball.holder = -1;
    this.act = { k: 'hold', u: 0, v: 0, t: this.t };
    this.ph = { k: 'pass', from: h.i, to: m.i, t: this.t, dur, sx, sy, ex, ey, intercept, ix, iy, oob, inbound, lob, bounce, safe: !!from || madeInbound || handoff, touched: 0 };
  }

  /** 패스 높이 (M26): 체스트 패스는 가슴 높이로 곧게, 바운드는 바닥을 찍고, 롭은 머리 위로 */
  private passZ(ph: Extract<Phase, { k: 'pass' }>, s: number) {
    if (ph.bounce) return s < 0.55 ? lerp(1.0, 0.05, s / 0.55) : lerp(0.05, 1.0, (s - 0.55) / 0.45);
    return (ph.lob ? 1.8 : 1.2) + Math.sin(Math.PI * s) * (ph.lob ? 1.6 : ph.inbound ? 0.7 : 0.35);
  }

  /**
   * 날아가는 패스 (M26): 이번 틱에 공이 지나가는 길에 수비 손이 닿는지 본다. 길목을 읽고 뛰어든 수비는 몸을 날려 더 멀리 닿고,
   * 그냥 근처에 있던 수비도 가끔 손에 걸린다. 닿으면 잡거나 (스틸) 쳐낸다 (루즈볼). 길목 수비가 못 닿으면 패스는 그대로 간다
   */
  private passFlight(ph: Extract<Phase, { k: 'pass' }>): boolean {
    if (ph.oob) return false;
    const s0 = clamp((this.t - ph.t) / ph.dur, 0, 1);
    const s1 = clamp((this.t + DT - ph.t) / ph.dur, 0, 1);
    if (s1 < 0.1 || s0 > 0.94) return false;
    const x0 = lerp(ph.sx, ph.ex, s0);
    const y0 = lerp(ph.sy, ph.ey, s0);
    const x1 = lerp(ph.sx, ph.ex, s1);
    const y1 = lerp(ph.sy, ph.ey, s1);
    const from = this.P[ph.from];
    for (const d of this.mates((1 - from.team) as Side)) {
      if (d.stun > 0) continue;
      const jumper = d.i === ph.intercept;
      const bit = 1 << d.i;
      if (!jumper && (ph.safe || ph.touched & bit)) continue;
      const seg = segDist(d.x, d.y, x0, y0, x1, y1);
      const sk = lerp(s0, s1, seg.s);
      if (sk < 0.1) continue;
      const L = leapOf(d.pl);
      const R = 0.45 + (d.pl.body.wingspanCm - 195) / 250 + (jumper ? 0.2 : 0);
      if (seg.d > R) continue;
      const bz = this.passZ(ph, sk);
      // 머리 위로 지나가거나 (뛰어든 수비는 손을 뻗어 뛴다), 바닥 가까이 튀는 바운드 패스는 손이 안 간다
      if (bz > L.reach + (jumper ? L.vert * 0.7 : 0.08) || (bz < 0.55 && !jumper)) continue;
      if (!jumper) {
        ph.touched |= bit;
        const r = d.pl.r;
        const pr = 0.028 * (0.6 + (ex(r.steal) / 100) * 0.5 + (r.iq / 100) * 0.2) * clamp(1.3 - (ex(from.pl.r.passing) / 100) * 0.6, 0.5, 1.2) * (1 + FX.pickpocket[lv(d.pl, 'pickpocket')] * 0.4);
        if (!this.rng.chance(pr)) continue;
      }
      // 손에 닿았다: 잡으면 스틸, 아니면 쳐낸다
      const bx = lerp(ph.sx, ph.ex, sk);
      const by = lerp(ph.sy, ph.ey, sk);
      this.cnt.intercepts++;
      DEBUG.lane?.(jumper ? 'readHit' : 'stray');
      this.ball.x = bx;
      this.ball.y = by;
      this.ball.z = bz;
      const clean = clamp(0.48 + (d.pl.r.steal - 60) / 120 + (jumper ? 0.22 : -0.22), 0.12, 0.88);
      if (this.rng.chance(clean)) this.turnover(ph.from, 'stolenPass', d.i);
      else this.deflect(from, d, 'stolenPass', bx, by, Math.atan2(ph.ey - ph.sy, ph.ex - ph.sx), bz);
      return true;
    }
    return false;
  }

  private passArrive(ph: Extract<Phase, { k: 'pass' }>) {
    if (ph.oob) {
      this.ball.x = ph.ex;
      this.ball.y = ph.ey;
      this.turnover(ph.from, 'badPass');
      return;
    }
    const m = this.P[ph.to];
    // 패스를 놓친다 (M26): 받기 어려운 패스 (롭·빠른 패스·서툰 패스)에 손이 서툴면 공이 튄다 → 루즈볼
    if (!ph.safe && !ph.inbound) {
      const f = this.P[ph.from].pl.r;
      const pf = 0.001 + ((100 - f.passing) / 100) * 0.0025 + ((100 - m.pl.r.ballHandling) / 100) * 0.003 + (ph.lob ? 0.006 : 0) + (m.stun > 0 ? 0.02 : 0);
      if (this.rng.chance(pf)) {
        const a = Math.atan2(ph.ey - ph.sy, ph.ex - ph.sx) + this.rng.normal(0, 0.8);
        const v = this.rng.range(1.2, 3.0);
        this.emit({ type: 'loose', team: m.team, player: m.i, other: -1, pts: 0, fumble: true, text: `${m.pl.name} 패스를 놓쳤다!` });
        this.poseFx(m, ACT.STUN, 0.35);
        this.act = { k: 'hold', u: 0, v: 0, t: this.t };
        this.startAir({ x: m.x, y: m.y, z: 1.1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: this.rng.range(0.4, 1.6) }, this.off, m.team, { steal: { by: -1, from: m.i, kind: 'badPass' }, noCatch: 0.25 });
        return;
      }
    }
    this.ball.holder = m.i;
    if (ph.inbound) this.clockRunning = true;
    else this.lastPass = { from: ph.from, to: ph.to, t: this.t, fancy: this.fancyPass || undefined };
    this.ph = { k: 'live' };
    if (this.play && this.play.k === 'pnr' && this.play.stage !== 'roll') this.play = null;
    this.act = { k: this.mode === 'advance' ? 'advance' : 'hold', u: 0, v: 0, t: this.t };
    this.nextThink = this.t + 0.05 + ((100 - m.pl.r.iq) / 100) * 0.15;
    if (this.mode === 'set') this.nextSpots = 0;
    // 공중에서 받아 바로 덩크
    if (ph.lob) {
      const H = this.hoop(m.team);
      if (dist(m.x, m.y, H.x, H.y) < 2.6) this.startGather(m, false, true);
    }
  }

  // ---------------------------------------------------------------- 전술

  private choosePlay(h: SP) {
    const off = this.off;
    const mates = this.mates(off);
    const tac = this.teams[off].tactics;
    // 역할 (roles.ts)과 같은 기준
    const creation = (p: SP) => creationOf(p.pl);
    const star = [...mates].sort((a, b) => creation(b) - creation(a))[0];
    const bigs = mates.filter((p) => this.isBig(p));
    const big = [...(bigs.length ? bigs : mates)].sort((a, b) => b.pl.r.postUp - a.pl.r.postUp)[0];
    const screener = [...mates].filter((p) => p.i !== h.i && POS_GROUP[p.pl.pos] !== 'G').sort((a, b) => b.pl.r.screen - a.pl.r.screen)[0];
    const shooter = [...mates].filter((p) => p.i !== h.i && !this.isBig(p)).sort((a, b) => b.pl.r.three - a.pl.r.three)[0];
    const avg = mates.reduce((s, p) => s + creation(p), 0) / 5;
    // 픽앤롤 콤비 (R6): 짝이 스크린을 걸어 주고, 더 자주 한다
    const pnrMate = mates.find((p) => p.i !== h.i && this.combo(h.pid, p.pid) === 'pnr');
    // 지역방어에는 아이솔·픽앤롤이 덜 통한다
    const vsZone = this.zoneOn((1 - off) as Side);
    const w = [
      tac.pnr * (vsZone ? 0.6 : 1) * (pnrMate ? 2.5 : 1),
      tac.iso * clamp(1 + (creation(star) - avg) / 12, 0.4, 2) * (vsZone ? 0.4 : 1),
      tac.post * (big.pl.r.postUp >= 55 ? 1.2 : 0.2),
      tac.motion * (vsZone ? 1.5 : 1),
      tac.pindown * (shooter && shooter.pl.r.three >= 55 && screener ? 1 : 0),
      tac.dho * (screener ? 1 : 0),
    ];
    const k = this.rng.weighted(w);
    const nm = ['pnr', 'iso', 'post', 'motion', 'pindown', 'dho'][k];
    this.cnt.plays[nm] = (this.cnt.plays[nm] ?? 0) + 1;
    const L = this.loc(off, h.x, h.y);
    const side = Math.abs(L.v) > 1.5 ? -Math.sign(L.v) : this.rng.chance(0.5) ? 1 : -1;
    const scr = pnrMate ?? screener;
    if (k === 0 && scr) {
      const pop = scr.pl.r.three >= 60 && this.rng.chance(0.5);
      this.play = { k: 'pnr', scr: scr.i, side, stage: 'go', t: this.t, pop, screened: false };
      this.callPlay('pnr', h, scr, pop);
    } else if (k === 1) {
      this.play = { k: 'iso', star: star.i, t: this.t };
      this.callPlay('iso', star, null);
    } else if (k === 2) {
      this.play = { k: 'post', star: big.i, t: this.t };
      this.callPlay('post', h, big);
    } else if (k === 4 && shooter && screener) {
      const sv = Math.sign(this.loc(off, shooter.x, shooter.y).v) || 1;
      this.play = { k: 'pindown', shooter: shooter.i, scr: screener.i, side: sv, stage: 'go', t: this.t, screened: false };
      this.callPlay('pindown', shooter, screener);
    } else if (k === 5 && screener) {
      this.play = { k: 'dho', big: screener.i, guard: h.i, side, stage: 'entry', t: this.t };
      this.callPlay('dho', h, screener);
    } else {
      this.play = { k: 'motion', t: this.t };
      this.callPlay('motion', h, null);
    }
  }

  private updatePlay(h: SP) {
    const play = this.play;
    if (!play) return;
    const age = this.t - play.t;
    if (play.k === 'iso' || play.k === 'post' || play.k === 'motion') {
      if (age > 8) this.play = null;
      return;
    }
    if (play.k === 'pindown') return this.updatePindown(play, age);
    if (play.k === 'dho') return this.updateDho(play, h, age);
    const s = this.P[play.scr];
    if (s.i === h.i) {
      this.play = null;
      return;
    }
    const d = this.defenderOf(h.i);
    const H = this.hoop(this.off);
    const dh = Math.max(0.01, dist(h.x, h.y, H.x, H.y));
    const fx = (H.x - h.x) / dh;
    const fy = (H.y - h.y) / dh;
    const px = -fy * play.side;
    const py = fx * play.side;
    if (play.stage === 'go') {
      const spx = d.x + px * 0.75 - fx * 0.15;
      const spy = d.y + py * 0.75 - fy * 0.15;
      if (dist(s.x, s.y, spx, spy) < 0.6) {
        play.stage = 'set';
        play.t = this.t;
      } else if (age > 6) this.play = null;
    } else if (play.stage === 'set') {
      if (age > 0.45) {
        play.stage = 'use';
        play.t = this.t;
        const w = { x: s.x + px * 1.3 + fx * 0.9, y: s.y + py * 1.3 + fy * 0.9 };
        const L = this.loc(this.off, w.x, w.y);
        this.act = { k: 'use', u: L.u, v: L.v, t: this.t };
      }
    } else if (play.stage === 'use') {
      if (!play.screened && dist(d.x, d.y, s.x, s.y) < 1.3 && dist(h.x, h.y, s.x, s.y) < 2.3) {
        play.screened = true;
        this.screenContact(s, d, h);
      }
      if (age > 0.6) {
        play.stage = 'roll';
        play.t = this.t;
      }
    } else if (play.stage === 'roll') {
      if (age > 3.5) this.play = null;
    }
  }

  /** 스크린이 걸리는 순간: 무빙 스크린 / 스위치 / 걸려서 휘청 */
  private screenContact(s: SP, d: SP, h: SP) {
    if (this.rng.chance(0.08 * (1.4 - s.pl.r.iq / 100))) {
      this.callFoul(s.i, d.i, 'screen');
      return;
    }
    const def = d.team;
    const sd = this.zoneOn(def) ? null : this.P.find((p) => p.man === s.i && p.team === def) ?? null;
    const tac = this.teams[def].tactics;
    const similar = sd ? Math.abs(sd.pl.body.heightCm - d.pl.body.heightCm) < 9 : false;
    if (sd && this.rng.chance(tac.switch * (similar ? 1.6 : 0.8))) {
      // 스위치: 서로 막던 선수를 바꾼다. 미스매치가 생길 수 있다.
      d.man = s.i;
      sd.man = h.i;
      this.cnt.switches++;
      this.emit({ type: 'screen', team: s.team, player: s.i, other: d.i, pts: 0, switched: true, text: `${s.pl.name}의 스크린, 수비 스위치` });
      // 키 작은 수비가 빅맨을 맡게 되면 포스트로 공을 넣는다
      if (s.pl.body.heightCm - d.pl.body.heightCm >= 10 && s.pl.r.postUp >= 50) {
        this.play = { k: 'post', star: s.i, t: this.t };
        this.callPlay('post', s, s);
      }
      return;
    }
    d.stun = clamp(0.35 + (s.pl.r.screen + s.pl.r.strength - d.pl.r.agility - d.pl.r.iq) / 250, 0.2, 0.9);
    s.screenFlag = 0.5;
    this.nextThink = Math.min(this.nextThink, this.t + 0.1);
    this.emit({ type: 'screen', team: s.team, player: s.i, other: d.i, pts: 0, text: `${s.pl.name}의 스크린` });
  }

  /** 오프스크린: 슈터가 코너에서 다운스크린을 받고 윙으로 나온다 */
  private updatePindown(play: Extract<Play, { k: 'pindown' }>, age: number) {
    const off = this.off;
    const sh = this.P[play.shooter];
    const s = this.P[play.scr];
    if (this.ball.holder === sh.i || this.ball.holder === s.i || age > 7) {
      this.play = null;
      return;
    }
    if (play.stage === 'go') {
      const want = this.wrl(off, 0.9, play.side * 6.9);
      const scr = this.wrl(off, 3.0, play.side * 5.0);
      if ((dist(sh.x, sh.y, want.x, want.y) < 1.2 && dist(s.x, s.y, scr.x, scr.y) < 0.8) || age > 3.5) {
        play.stage = 'run';
        play.t = this.t;
      }
      return;
    }
    const d = this.defenderOf(sh.i);
    if (!play.screened && dist(d.x, d.y, s.x, s.y) < 1.2 && age > 0.3) {
      play.screened = true;
      if (this.rng.chance(0.75)) {
        d.stun = clamp(0.3 + (s.pl.r.screen - d.pl.r.agility) / 200, 0.2, 0.7);
        s.screenFlag = 0.5;
        this.emit({ type: 'screen', team: s.team, player: s.i, other: d.i, pts: 0, text: `${s.pl.name}의 다운스크린` });
        this.nextThink = Math.min(this.nextThink, this.t + 0.2);
      }
    }
  }

  /** 드리블 핸드오프: 빅맨에게 공을 넘기고, 가드가 스치듯 받아 간다 */
  private updateDho(play: Extract<Play, { k: 'dho' }>, h: SP, age: number) {
    const big = this.P[play.big];
    const g = this.P[play.guard];
    if (age > 8) {
      this.play = null;
      return;
    }
    if (play.stage === 'entry') {
      if (h.i === big.i) {
        play.stage = 'run';
        play.t = this.t;
        this.act = { k: 'hold', u: 0, v: 0, t: this.t };
        this.nextThink = this.t + 3; // 빅맨은 기다렸다가 넘겨준다
      } else if (h.i !== g.i) this.play = null;
      return;
    }
    if (h.i !== big.i) {
      this.play = null;
      return;
    }
    if (dist(g.x, g.y, big.x, big.y) < 1.1) {
      const d = this.defenderOf(g.i);
      this.play = null;
      this.startPass(big, g, false, undefined, true);
      if (dist(d.x, d.y, big.x, big.y) < 1.5 && this.rng.chance(0.6)) {
        d.stun = clamp(0.3 + (big.pl.r.screen + big.pl.r.strength - d.pl.r.agility * 2) / 250, 0.2, 0.7);
        big.screenFlag = 0.5;
        this.emit({ type: 'screen', team: big.team, player: big.i, other: d.i, pts: 0, text: `${big.pl.name}의 핸드오프` });
      }
    } else if (age > 3) {
      this.play = null;
      this.nextThink = this.t;
    }
  }

  private updateCuts() {
    if (this.mode !== 'set') return;
    const off = this.off;
    for (const p of this.mates(off)) {
      if (p.i === this.ball.holder) continue;
      if (p.cut > 0) {
        p.cut -= DT;
        const w = this.wrl(off, p.cutU, p.cutV);
        if (p.cut <= 0 || dist(p.x, p.y, w.x, w.y) < 0.5) {
          p.cut = 0;
          p.spot = -1;
          this.nextSpots = 0;
        }
        continue;
      }
      if (this.t < p.nextCut || this.isRole(p)) continue;
      p.nextCut = this.t + 1;
      const sp = p.spot >= 0 ? SPOTS[p.spot] : null;
      if (!sp || sp.kind === 'dunker' || sp.kind === 'block') continue;
      const d = this.defenderOf(p.i);
      const watching = dist(d.x, d.y, p.x, p.y) > 2.4;
      const pc = 0.007 + (p.pl.r.offBall / 100) ** 2 * 0.06 + (watching ? 0.04 : 0) + (this.play?.k === 'motion' ? 0.015 : 0);
      if (this.rng.chance(pc)) {
        const L = this.loc(off, p.x, p.y);
        p.cut = 1.8;
        p.cutU = 1.1;
        p.cutV = (L.v >= 0 ? 1 : -1) * 0.9;
      }
    }
  }

  private isRole(p: SP): boolean {
    const play = this.play;
    if (!play) return false;
    if (play.k === 'pnr') return play.scr === p.i;
    if (play.k === 'post') return play.star === p.i;
    if (play.k === 'pindown') return play.scr === p.i || play.shooter === p.i;
    if (play.k === 'dho') return play.big === p.i || play.guard === p.i;
    return false;
  }

  private spotPref(p: SP, kind: Spot['kind']): number {
    const big = this.isBig(p);
    if (!big) return kind === 'top' || kind === 'wing' || kind === 'corner' ? 0 : kind === 'elbow' ? 3 : 6;
    if (p.pl.r.three >= 58) return kind === 'corner' || kind === 'wing' ? 0.5 : kind === 'top' ? 1.5 : 1;
    return kind === 'dunker' || kind === 'block' ? 0 : kind === 'elbow' ? 1 : kind === 'corner' ? 4.5 : 6;
  }

  private assignSpots() {
    const off = this.off;
    const b = this.ball;
    const Lb = this.loc(off, b.x, b.y);
    const taken = new Set<number>();
    const play = this.play;
    const isoSide = play?.k === 'iso' ? Math.sign(this.loc(off, this.P[play.star].x, this.P[play.star].y).v) || 1 : 0;
    for (const p of this.mates(off)) {
      if (p.i === b.holder || p.cut > 0 || this.isRole(p)) continue;
      const L = this.loc(off, p.x, p.y);
      let best = -1;
      let bc = Infinity;
      SPOTS.forEach((s, k) => {
        if (taken.has(k)) return;
        if (Math.hypot(s.u - Lb.u, s.v - Lb.v) < 3.0) return;
        let c = Math.hypot(L.u - s.u, L.v - s.v) * 0.35 + this.spotPref(p, s.kind) + (k === p.spot ? -1.5 : 0);
        // 위치선정 (M22): 오프볼이 좋으면 수비가 비운 자리를 찾아가고, 나쁘면 수비 옆에 선다
        const w = this.wrl(off, s.u, s.v);
        let open = 9;
        for (const d of this.mates((1 - off) as Side)) open = Math.min(open, dist(d.x, d.y, w.x, w.y));
        c -= clamp((p.pl.r.offBall - 56) / 45, -0.6, 1) * clamp(open - 1.5, 0, 3.5) * 0.9;
        if (isoSide && play?.k === 'iso' && p.i !== play.star && Math.sign(s.v) === isoSide && s.kind !== 'corner') c += 5;
        if (c < bc) {
          bc = c;
          best = k;
        }
      });
      p.spot = best;
      if (best >= 0) taken.add(best);
    }
  }

  // ---------------------------------------------------------------- 목표 지점

  private setGoal(p: SP, x: number, y: number, urg: number) {
    p.gx = x;
    p.gy = y;
    p.urg = urg;
  }

  private setGoalLocal(p: SP, team: Side, u: number, v: number, urg: number) {
    const w = this.wrl(team, u, v);
    this.setGoal(p, w.x, w.y, urg);
  }

  private benchGoal(p: SP) {
    const x = p.team === 0 ? 8.5 + (p.i % 5) * 0.9 : 19.5 - (p.i % 5) * 0.9;
    this.setGoal(p, x, BENCH_Y + 1.6, 0.45);
  }

  private updateTargets() {
    const ph = this.ph;
    if (ph.k === 'tip' || ph.k === 'end') {
      for (const p of this.P) this.setGoal(p, p.x, p.y, 0.3);
      return;
    }
    if (ph.k === 'outro') {
      for (const p of this.P) {
        if (p.team === ph.winner) {
          const a = (p.i % 5) * ((Math.PI * 2) / 5);
          this.setGoal(p, 14 + Math.cos(a) * 1.1, MID_Y + Math.sin(a) * 0.9, 0.5);
        } else this.setGoal(p, p.x + (p.team === 0 ? -0.8 : 0.8), p.y - 1.2, 0.25);
      }
      return;
    }
    if (ph.k === 'break' || ph.k === 'timeout') {
      for (const p of this.P) this.benchGoal(p);
      return;
    }
    if (ph.k === 'dead') {
      for (const p of this.P) this.setGoal(p, p.x + (14 - p.x) * 0.05, p.y + (MID_Y - p.y) * 0.05, 0.3);
      return;
    }
    if (ph.k === 'swat') {
      // 날아가는 공을 눈으로 따라간다
      for (const p of this.P) this.setGoal(p, p.x + (this.ball.x - p.x) * 0.08, p.y + (this.ball.y - p.y) * 0.08, 0.4);
      return;
    }
    if (ph.k === 'ft') {
      this.ftGoals(ph);
      return;
    }
    const off = this.off;
    for (const p of this.mates(off)) this.offTarget(p);
    for (const p of this.mates((1 - off) as Side)) this.defTarget(p);
  }

  /** 자유투 라인업: 수비가 골대 쪽 첫 칸, 공격이 둘째 칸, 수비가 셋째 칸 */
  private ftGoals(ph: Extract<Phase, { k: 'ft' }>) {
    const team = ph.team;
    const shooter = this.P[ph.shooter];
    this.setGoalLocal(shooter, team, COURT.ftLineFromBaseline + 0.35, 0, 0.5);
    if (ph.tech) {
      for (const p of this.P) if (p !== shooter) this.setGoalLocal(p, team, 9.5, (p.i % 5) * 1.5 - 3 + (p.team === team ? 0 : 0.7), 0.4);
      return;
    }
    const offs = this.mates(team).filter((p) => p !== shooter);
    const defs = this.mates((1 - team) as Side);
    const defLane = [
      [0, 1],
      [0, -1],
      [2, 1],
      [2, -1],
    ];
    const offLane = [
      [1, 1],
      [1, -1],
    ];
    // 빅맨이 골대 가까운 칸
    const byHeight = (a: SP, b: SP) => b.pl.body.heightCm - a.pl.body.heightCm;
    // 마지막 자유투가 손을 떠나면 (M26) 칸에 선 선수들이 골밑으로 들어간다: 첫 칸 수비가 안쪽 자리를 잡는다
    const stepIn = ph.stage === 'flight' && ph.n >= ph.of && this.t - ph.t > 0.25;
    const hu = COURT.hoopFromBaseline;
    [...defs].sort(byHeight).forEach((p, k) => {
      if (k < 4 && stepIn) this.setGoalLocal(p, team, defLane[k][0] === 0 ? hu + 0.5 : hu + 2.4, defLane[k][1] * (defLane[k][0] === 0 ? 1.0 : 1.4), 0.9);
      else if (k < 4) this.setGoalLocal(p, team, LANE_U[defLane[k][0]], defLane[k][1] * LANE_V, 0.5);
      else this.setGoalLocal(p, team, 8.6, 0.8, 0.5);
    });
    [...offs].sort(byHeight).forEach((p, k) => {
      if (k < 2 && stepIn) this.setGoalLocal(p, team, hu + 1.5, offLane[k][1] * 1.5, 0.9);
      else if (k < 2) this.setGoalLocal(p, team, LANE_U[offLane[k][0]], offLane[k][1] * LANE_V, 0.5);
      else this.setGoalLocal(p, team, 8.9, (k === 2 ? -1 : 1) * 3.2, 0.5);
    });
  }

  private spotGoal(p: SP, urg: number) {
    const off = this.off;
    if (p.spot < 0) {
      // 아직 자리가 없으면 포지션별 기본 자리
      const g = POS_GROUP[p.pl.pos];
      p.spot = g === 'G' ? (p.i % 5 === 0 ? 0 : 1) : g === 'W' ? 2 : p.i % 2 === 0 ? 5 : 6;
    }
    const s = SPOTS[p.spot];
    // 딥쓰리 슈터는 3점 라인보다 한참 뒤에 서서 공간을 넓힌다 (수비가 따라 나온다)
    const ext = this.rangeOf(p).extra;
    if (ext >= 0.5 && (s.kind === 'top' || s.kind === 'wing')) {
      const hu = COURT.hoopFromBaseline;
      const d = Math.hypot(s.u - hu, s.v);
      const k = (d + Math.min(0.6, ext * 0.3)) / d;
      this.setGoalLocal(p, off, hu + (s.u - hu) * k, s.v * k, urg);
      return;
    }
    this.setGoalLocal(p, off, s.u, s.v, urg);
  }

  private offTarget(p: SP) {
    const ph = this.ph;
    const off = this.off;
    const t = this.t;

    if (ph.k === 'inbound') {
      if (p.i === ph.inb) {
        if (this.ball.holder !== p.i) this.setGoal(p, this.ball.x, this.ball.y, 0.8);
        else this.setGoal(p, ph.sx, ph.sy, 0.7);
        return;
      }
      if (p.i === ph.recv) {
        const Ls = this.loc(off, ph.sx, ph.sy);
        if (ph.made) this.setGoalLocal(p, off, 24, (Ls.v >= 0 ? 1 : -1) * 3.5, 0.7);
        else this.setGoalLocal(p, off, clamp(Ls.u - 2, 2, 26), Ls.v - Math.sign(Ls.v) * 3.5, 0.7);
        return;
      }
      this.spotGoal(p, ph.made ? 0.55 : 0.45);
      return;
    }

    if (ph.k === 'shot' || ph.k === 'gather' || ph.k === 'air') {
      this.reboundGoal(p, true);
      return;
    }

    if (ph.k === 'pass' && p.i === ph.to && !ph.oob) {
      this.setGoal(p, ph.ex, ph.ey, 1);
      return;
    }

    // 공 가진 선수
    if (p.i === this.ball.holder) {
      this.handlerGoal(p);
      return;
    }

    const fast = this.possLive && t - this.possStart < 4;
    if (this.mode === 'advance') {
      // 속공: 빅맨이 아닌 선수는 코너 쪽 라인으로 달린다
      if (fast && !this.isBig(p) && p !== this.primary(off)) {
        this.setGoalLocal(p, off, 2.2, (p.i % 2 === 0 ? -1 : 1) * 5.6, 1);
        return;
      }
      this.spotGoal(p, fast ? 0.95 : 0.7);
      return;
    }

    if (p.cut > 0) {
      this.setGoalLocal(p, off, p.cutU, p.cutV, 1);
      return;
    }
    const play = this.play;
    if (play?.k === 'pnr' && play.scr === p.i) {
      const h = this.holder();
      if (!h) {
        this.spotGoal(p, 0.6);
        return;
      }
      if (play.stage === 'go' || play.stage === 'set' || play.stage === 'use') {
        if (play.stage === 'go') {
          const d = this.defenderOf(h.i);
          const H = this.hoop(off);
          const dh = Math.max(0.01, dist(h.x, h.y, H.x, H.y));
          const fx = (H.x - h.x) / dh;
          const fy = (H.y - h.y) / dh;
          this.setGoal(p, d.x - fy * play.side * 0.75 - fx * 0.15, d.y + fx * play.side * 0.75 - fy * 0.15, 0.8);
        } else this.setGoal(p, p.x, p.y, 0.2);
        return;
      }
      if (play.pop) this.setGoalLocal(p, off, 8.3, -play.side * 2.2, 0.8);
      else this.setGoalLocal(p, off, 1.4, play.side * 0.7, 1);
      return;
    }
    if (play?.k === 'post' && play.star === p.i) {
      const Lb = this.loc(off, this.ball.x, this.ball.y);
      this.setGoalLocal(p, off, 2.6, (Lb.v >= 0 ? 1 : -1) * 2.6, 0.7);
      return;
    }
    if (play?.k === 'pindown') {
      if (play.scr === p.i) {
        this.setGoalLocal(p, off, 3.0, play.side * 5.0, play.stage === 'go' ? 0.8 : 0.2);
        return;
      }
      if (play.shooter === p.i) {
        if (play.stage === 'go') this.setGoalLocal(p, off, 0.9, play.side * 6.9, 0.7);
        else this.setGoalLocal(p, off, 7.0, play.side * 4.6, 1);
        return;
      }
    }
    if (play?.k === 'dho') {
      if (play.big === p.i) {
        this.setGoalLocal(p, off, 7.4, play.side * 1.5, 0.7);
        return;
      }
      if (play.guard === p.i && play.stage === 'run') {
        const b = this.P[play.big];
        this.setGoal(p, b.x, b.y, 0.9);
        return;
      }
    }
    this.spotGoal(p, 0.55);
  }

  private handlerGoal(h: SP) {
    const off = this.off;
    const L = this.loc(off, h.x, h.y);
    const a = this.act;
    switch (a.k) {
      case 'advance': {
        const fast = this.possLive && this.t - this.possStart < 5;
        const walk = 0.55 + this.teams[off].tactics.pace * 0.25;
        this.setGoalLocal(h, off, 9.2, clamp(L.v, -3.5, 3.5), fast ? 1 : walk);
        break;
      }
      case 'probe':
        this.setGoalLocal(h, off, a.u, a.v, 0.45);
        break;
      case 'wait':
        this.setGoalLocal(h, off, a.u, a.v, 0.3);
        break;
      case 'use': {
        const w = this.wrl(off, a.u, a.v);
        if (dist(h.x, h.y, w.x, w.y) < 0.7) {
          const side = this.play?.k === 'pnr' ? this.play.side : 1;
          this.act = { k: 'probe', u: 5.0, v: side * 1.8, t: this.t + 1.5 };
        }
        this.setGoal(h, w.x, w.y, 0.9);
        break;
      }
      case 'drive':
        this.setGoalLocal(h, off, RIM_FRONT + 0.25, clamp(L.v * 0.25, -1.2, 1.2), 1);
        break;
      case 'move':
        this.moveGoal(h);
        break;
      case 'post':
        this.setGoalLocal(h, off, 1.6, L.v * 0.6, 0.22);
        break;
      case 'hold':
        this.setGoal(h, h.x, h.y, 0.25);
        break;
    }
  }

  /** 슛이 올라갔을 때: 공격은 리바운드 가담 or 백코트, 수비는 박스아웃 */
  private reboundGoal(p: SP, offense: boolean) {
    const ph = this.ph;
    const off = this.off;
    const H = this.hoop(off);
    const shooter = ph.k === 'gather' || ph.k === 'shot' ? ph.shooter : -1;
    if (p.i === shooter) {
      this.setGoal(p, p.x, p.y, 0.2);
      return;
    }
    let lx = H.x;
    let ly = H.y;
    let near = false;
    if (ph.k === 'air') {
      // 공이 떨어질 자리로 (낮게 구르면 공을 쫓는다)
      lx = ph.lx;
      ly = ph.ly;
      near = this.ball.z < 1.4 ? dist(p.x, p.y, lx, ly) < 8 : dist(p.x, p.y, lx, ly) < 4.5 && this.t - ph.t > 0.15;
    }
    if (near) {
      // 박스아웃에 걸린 공격수 (M26): 공 쪽을 막고 선 수비를 돌아가느라 늦다 (힘·공격 리바운드 vs 박스아웃·힘)
      if (offense && ph.k === 'air' && this.ball.z >= 1.4) {
        const dl = dist(p.x, p.y, lx, ly);
        for (const q of this.mates((1 - p.team) as Side)) {
          const dq = dist(q.x, q.y, p.x, p.y);
          if (dq > 1.1 || dist(q.x, q.y, lx, ly) > dl - 0.3) continue;
          const seal = clamp(0.55 + (ex(q.pl.r.boxOut) + q.pl.r.strength - ex(p.pl.r.offReb) - p.pl.r.strength) / 160, 0.2, 0.8);
          this.setGoal(p, lx, ly, 1 - seal * (q.stun > 0 ? 0.3 : 1));
          return;
        }
      }
      this.setGoal(p, lx, ly, 1);
      return;
    }
    const dH = dist(p.x, p.y, H.x, H.y);
    if (offense) {
      const big = this.isBig(p);
      const crash = big ? dH < 8 : dH < 3.5 || (p.pl.r.offReb > 62 && dH < 6);
      if (crash) {
        const L = this.loc(off, p.x, p.y);
        this.setGoalLocal(p, off, 2.4, (L.v >= 0 ? 1 : -1) * 1.5, 0.9);
        return;
      }
      const pg = this.primary(off);
      if (p === pg || (!big && dH > 7)) {
        this.setGoalLocal(p, off, p === pg ? 16 : 13, p === pg ? 0 : 3, 0.7);
        return;
      }
      this.setGoal(p, p.x, p.y, 0.3);
      return;
    }
    // 박스아웃: 가장 가까운 공격수를 골대 반대편으로 밀어낸다
    let m = this.P[p.man];
    if (this.zoneOn(p.team)) {
      let bd = Infinity;
      for (const o of this.mates(off)) {
        const dd = dist(o.x, o.y, p.x, p.y);
        if (dd < bd) {
          bd = dd;
          m = o;
        }
      }
    }
    const mh = Math.max(0.01, dist(m.x, m.y, H.x, H.y));
    const bx = m.x + ((H.x - m.x) / mh) * 0.8;
    const by = m.y + ((H.y - m.y) / mh) * 0.8;
    if (mh > 7) this.setGoal(p, lerp(bx, H.x, 0.3), lerp(by, H.y, 0.3), 0.8);
    else this.setGoal(p, bx, by, 0.85);
  }

  private defTarget(p: SP) {
    const ph = this.ph;
    const off = this.off;
    const def = p.team;
    const H = this.hoop(off);
    if (ph.k === 'shot' || ph.k === 'gather' || ph.k === 'air') {
      if (ph.k === 'gather') {
        // 슛 쏘는 선수 수비는 손을 뻗으러 붙는다
        const s = this.P[ph.shooter];
        if (this.defenderOf(s.i) === p) {
          const sh = Math.max(0.01, dist(s.x, s.y, H.x, H.y));
          this.setGoal(p, s.x + ((H.x - s.x) / sh) * 0.7, s.y + ((H.y - s.y) / sh) * 0.7, 1);
          return;
        }
      }
      this.reboundGoal(p, false);
      return;
    }

    const Lp = this.loc(off, p.x, p.y);
    const Lball = this.loc(off, this.ball.x, this.ball.y);
    const press = this.scheme[def] === 'press';

    // 속공 수비: 공보다 뒤에 있으면 일단 골밑으로 전력 질주
    if (!press && this.mode === 'advance' && ph.k !== 'inbound' && Lp.u > Lball.u + 0.5 && Lball.u < 22) {
      this.setGoalLocal(p, off, 2.5 + (p.i % 5) * 0.5, ((p.i % 5) - 2) * 1.5, 1);
      return;
    }

    if (this.helper === p.i || this.doubler === p.i) {
      const h = this.holder();
      if (h) {
        const dh = Math.max(0.01, dist(h.x, h.y, H.x, H.y));
        if (this.helper === p.i) this.setGoal(p, h.x + ((H.x - h.x) / dh) * 1.3, h.y + ((H.y - h.y) / dh) * 1.3, 1);
        else {
          // 더블팀: 공 가진 선수 옆으로 붙어 패스 길을 좁힌다
          const sx = -(H.y - h.y) / dh;
          const sy = (H.x - h.x) / dh;
          const side = (p.x - h.x) * sx + (p.y - h.y) * sy >= 0 ? 1 : -1;
          this.setGoal(p, h.x + ((H.x - h.x) / dh) * 0.6 + sx * side * 0.9, h.y + ((H.y - h.y) / dh) * 0.6 + sy * side * 0.9, 1);
        }
        return;
      }
    }

    // 프레스: 인바운드 받는 선수와 공 가진 선수를 압박, 한 명은 함정 수비
    if (press && Lball.u > 12) {
      const h = this.holder();
      const target = ph.k === 'inbound' ? this.P[ph.recv] : h;
      if (target && this.P[p.man] === target) {
        this.setGoal(p, target.x + (H.x - target.x) * 0.06, target.y + (H.y - target.y) * 0.06, 1);
        return;
      }
      const ib = ph.k === 'inbound' ? this.P[ph.inb] : null;
      if (h && ib === null && this.P[p.man].i !== h.i && this.loc(off, this.P[p.man].x, this.P[p.man].y).u > Lball.u + 1 && p === this.trapper(def, h)) {
        this.setGoal(p, h.x + 0.7, h.y + (h.y < MID_Y ? 0.7 : -0.7), 1);
        return;
      }
    }

    if (this.zoneOn(def)) {
      this.zoneTarget(p);
      return;
    }

    const m = this.P[p.man];
    let mx = m.x;
    let my = m.y;
    if (ph.k === 'pass' && ph.to === m.i && !ph.oob) {
      mx = ph.ex;
      my = ph.ey;
    }
    // 길목으로 몸을 날린다 (반응이 빠를수록 일찍: 스틸·센스)
    if (ph.k === 'pass' && ph.intercept === p.i && this.t - ph.t >= clamp(0.24 - (p.pl.r.steal - 50) / 500 - (p.pl.r.iq - 50) / 800, 0.08, 0.32)) {
      this.setGoal(p, ph.ix, ph.iy, 1.15);
      return;
    }
    const mh = Math.max(0.01, dist(mx, my, H.x, H.y));
    const ux = (H.x - mx) / mh;
    const uy = (H.y - my) / mh;
    let gx: number;
    let gy: number;
    let urg = 0.85;
    const hasBall = this.ball.holder === m.i || (ph.k === 'pass' && ph.to === m.i);

    const play = this.play;
    if (play?.k === 'pnr' && play.scr === m.i && (play.stage === 'use' || play.stage === 'roll')) {
      // 스크린 수비: 골대 앞으로 내려서서 돌파를 막는다 (드롭)
      const h = this.holder();
      if (h) {
        const hh = Math.max(0.01, dist(h.x, h.y, H.x, H.y));
        const dropX = H.x + ((h.x - H.x) / hh) * Math.min(3, hh * 0.6);
        const dropY = H.y + ((h.y - H.y) / hh) * Math.min(3, hh * 0.6);
        const manX = mx + ux * 1;
        const manY = my + uy * 1;
        const w = play.stage === 'roll' ? 0.45 : 0.15;
        this.setGoal(p, lerp(dropX, manX, w), lerp(dropY, manY, w), 1);
        return;
      }
    }

    if (hasBall) {
      let gap = clamp(1.15 - (p.pl.r.perimeterD - 50) * 0.004, 0.8, 1.4);
      const Lm = this.loc(off, mx, my);
      // 멀리 있으면 떨어져 막는다. 딥쓰리 사거리가 긴 선수는 더 멀리서부터 붙는다
      const far = 9.8 + this.rangeOf(m).extra * 1.3;
      if (Lm.u > far && !press) gap += Math.min(2.5, (Lm.u - far) * 0.6);
      if (this.act.k === 'post' && this.ball.holder === m.i) gap = 0.55;
      gx = mx + ux * gap;
      gy = my + uy * gap;
      urg = 1;
      // 속았다 (M25): 쏠린 쪽으로 간다
      if (this.t < p.leanUntil) {
        gx += p.leanX;
        gy += p.leanY;
      }
    } else {
      const db = dist(mx, my, this.ball.x, this.ball.y);
      const sag = clamp(1.0 + db * 0.1, 1.0, 2.4);
      const tight = (1 - (this.star[m.pid] / STAR_MAX) * 0.55) * (1 - Math.min(0.3, this.rangeOf(m).extra * 0.15));
      const bx = mx + ux * sag * tight;
      const by = my + uy * sag * tight;
      const helpX = lerp(this.ball.x, H.x, 0.55);
      const helpY = lerp(this.ball.y, H.y, 0.55);
      let w = clamp((db - 5) / 9, 0, 0.45) * (0.4 + p.pl.r.helpD / 100);
      // 코너 슈터와 좋은 슈터한테서는 멀리 떨어지지 않는다
      const Lman = this.loc(off, mx, my);
      if (Lman.u < 3.2 && Math.abs(Lman.v) > 5.5) w *= 0.55;
      if (m.pl.r.three >= 60) w *= 0.7;
      else if (m.pl.r.three < 42) w = Math.min(0.6, w * 1.3 + 0.1);
      // 위치선정 (M22): 오프볼이 좋으면 함부로 떠나지 못하고, 나쁘면 버려 두고 도움 수비를 간다
      w *= clamp(1 - (m.pl.r.offBall - 56) / 80, 0.55, 1.5);
      // 그래비티 (M17): 슈퍼스타는 공이 없어도 딱 붙고, 공 가진 슈퍼스타 쪽으로는 도움 수비가 몰린다
      const threat = this.star[m.pid] / STAR_MAX;
      w *= 1 - threat * 0.7;
      const h = this.holder();
      if (h && h.team !== def) w = Math.min(0.75, w + (this.star[h.pid] / STAR_MAX) * 0.5);
      gx = lerp(bx, helpX, w);
      gy = lerp(by, helpY, w);
    }

    // 수비는 자기 진영에서 기다린다 (프레스일 때만 앞에서 압박)
    const Lg = this.loc(off, gx, gy);
    const limit = press ? 27 : hasBall ? 15.5 : 13.5;
    if (Lg.u > limit) {
      const w = this.wrl(off, limit, Lg.v);
      gx = w.x;
      gy = w.y;
      urg = Math.min(urg, 0.7);
    }
    this.setGoal(p, gx, gy, urg);
  }

  /** 프레스 함정 수비에 가장 가까운 수비수 */
  private trapper(def: Side, h: SP): SP | null {
    let best: SP | null = null;
    let bd = Infinity;
    for (const d of this.mates(def)) {
      if (this.P[d.man] === h) continue;
      const dd = dist(d.x, d.y, h.x, h.y);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    return best;
  }

  /** 지역방어: 공 쪽으로 쏠린 구역을 지키고, 공이 내 구역에 오면 붙는다 */
  private zoneTarget(p: SP) {
    const off = this.off;
    const def = p.team;
    const H = this.hoop(off);
    const ph = this.ph;
    const zones = ZONES[this.scheme[def] as 'zone23' | 'zone32'];
    const Lb = this.loc(off, this.ball.x, this.ball.y);
    const shiftU = clamp((Lb.u - 6) * 0.25, -1.2, 1.2);
    const shiftV = clamp(Lb.v * 0.38, -2.6, 2.6);
    const anchor = (z: number) => this.wrl(off, Math.max(1.2, zones[z].u + shiftU), clamp(zones[z].v + shiftV, -6.8, 6.8));
    // 공 가진 선수(또는 패스 받을 선수)에 가장 가까운 구역 수비가 붙는다
    const target = ph.k === 'pass' && !ph.oob ? { x: ph.ex, y: ph.ey } : this.holder() ?? this.ball;
    let onBall: SP | null = null;
    let bd = Infinity;
    for (const d of this.mates(def)) {
      const a = anchor(d.zone);
      const dd = dist(a.x, a.y, target.x, target.y);
      if (dd < bd) {
        bd = dd;
        onBall = d;
      }
    }
    if (onBall === p && bd < 5.5) {
      const th = Math.max(0.01, dist(target.x, target.y, H.x, H.y));
      this.setGoal(p, target.x + ((H.x - target.x) / th) * 1.2, target.y + ((H.y - target.y) / th) * 1.2, 1);
      return;
    }
    const a = anchor(p.zone);
    this.setGoal(p, a.x, a.y, 0.8);
  }

  // ---------------------------------------------------------------- 움직임

  private moveAll() {
    const off = this.off;
    for (const p of this.P) {
      const onDef = p.team !== off;
      const f = this.fit(p);
      let tau = (onDef ? p.tau : 0.07) * (1.3 - 0.3 * f) * (p.lag > 0 ? 3.2 : 1);
      // 위치선정 (M22): 오프볼이 좋은 선수를 막으면 따라붙는 반응이 늦다 (공 없는 선수만)
      if (onDef && p.man >= 0 && this.ball.holder !== p.man) tau *= clamp(1 + (this.P[p.man].pl.r.offBall - 56) / 110, 0.75, 1.4);
      const k = Math.min(1, DT / tau);
      p.tx += (p.gx - p.tx) * k;
      p.ty += (p.gy - p.ty) * k;
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      let cap = p.maxSpd * p.urg * (0.86 + 0.14 * f);
      if (this.ball.holder === p.i) cap *= 0.8 + (p.pl.r.ballHandling / 100) * 0.17;
      // 돌파를 막는 수비는 뒷걸음질·옆걸음이라 앞으로 달리는 공격수보다 느리다
      if (onDef && (this.act.k === 'drive' || this.act.k === 'move') && this.ball.holder >= 0 && this.defenderOf(this.ball.holder) === p) cap *= 0.72 + (p.pl.r.agility / 100) * 0.2;
      if (p.stun > 0) cap *= 0.25;
      // 제쳐졌다 (M25): 반응이 늦고 느리다
      if (p.lag > 0) {
        cap *= 0.55;
        p.lag = Math.max(0, p.lag - DT);
      }
      // 기술 뒤 첫 발 폭발
      const burst = this.t < p.burstUntil ? p.burstK : 1;
      if (burst > 1) cap *= 1.06;
      const want = Math.min(cap, d / 0.3);
      const wx = d > 0.001 ? (dx / d) * want : 0;
      const wy = d > 0.001 ? (dy / d) * want : 0;
      let ax = wx - p.vx;
      let ay = wy - p.vy;
      const al = Math.hypot(ax, ay);
      const maxDv = p.acc * DT * (0.85 + 0.15 * f) * burst;
      if (al > maxDv) {
        ax = (ax / al) * maxDv;
        ay = (ay / al) * maxDv;
      }
      p.vx += ax;
      p.vy += ay;
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      if (this.t < p.slideUntil) {
        p.x += p.slideX * DT;
        p.y += p.slideY * DT;
      }
      if (p.stun > 0) p.stun = Math.max(0, p.stun - DT);
      if (p.screenFlag > 0) p.screenFlag = Math.max(0, p.screenFlag - DT);
    }
    // 서로 겹치지 않게 밀어낸다
    const R = 0.62;
    for (let a = 0; a < 10; a++) {
      for (let b = a + 1; b < 10; b++) {
        const pa = this.P[a];
        const pb = this.P[b];
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const d = Math.hypot(dx, dy);
        if (d < R && d > 0.0001) {
          const push = (R - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          pa.x -= nx * push;
          pa.y -= ny * push;
          pb.x += nx * push;
          pb.y += ny * push;
        }
      }
    }
    for (const p of this.P) {
      p.x = clamp(p.x, -1.2, COURT.length + 1.2);
      p.y = clamp(p.y, -1.4, COURT.width + 1.2);
    }
  }

  private updateBall() {
    const ph = this.ph;
    const b = this.ball;
    const t = this.t;
    if (b.holder >= 0) {
      const h = this.P[b.holder];
      const sp = Math.hypot(h.vx, h.vy);
      let fx: number;
      let fy: number;
      if (sp > 0.3) {
        fx = h.vx / sp;
        fy = h.vy / sp;
      } else {
        const H = this.hoop(h.team);
        const dh = Math.max(0.01, dist(h.x, h.y, H.x, H.y));
        fx = (H.x - h.x) / dh;
        fy = (H.y - h.y) / dh;
      }
      b.x = h.x + fx * 0.3;
      b.y = h.y + fy * 0.3;
      // 드리블 기술 중엔 공이 몸 주위를 오간다
      if (ph.k === 'live' && t < h.fxUntil && DRIBBLE_MOVES.includes(h.fx)) {
        const s = clamp((t - h.fxT) / Math.max(0.05, h.fxUntil - h.fxT), 0, 1);
        const px = -fy;
        const py = fx;
        let lat = 0;
        let fwd = 0.3;
        let z = 0.15 + 0.6 * Math.abs(Math.sin(t * Math.PI * 2.4));
        if (h.fx === ACT.CROSSOVER) {
          lat = 0.38 * Math.cos(Math.PI * s);
          fwd = 0.28;
          z = 0.1 + 0.45 * Math.abs(Math.sin(Math.PI * 3 * s));
        } else if (h.fx === ACT.BEHIND) {
          lat = 0.36 * Math.cos(Math.PI * s);
          fwd = 0.3 - 0.55 * Math.sin(Math.PI * s);
          z = 0.35;
        } else if (h.fx === ACT.LEGS) {
          lat = 0.32 * Math.cos(Math.PI * s);
          fwd = 0.08;
          z = 0.12 + 0.25 * Math.abs(Math.sin(Math.PI * 2 * s));
        } else if (h.fx === ACT.SPIN) {
          const a = Math.PI * 2 * s;
          lat = 0.36 * Math.sin(a);
          fwd = 0.36 * Math.cos(a);
          z = 0.6;
        } else if (h.fx === ACT.HESI) {
          fwd = 0.22;
          z = 0.85;
        }
        b.x = h.x + fx * fwd + px * lat;
        b.y = h.y + fy * fwd + py * lat;
        b.z = z;
        return;
      }
      if (ph.k === 'gather') b.z = lerp(1.1, 2.3, clamp((t - ph.t) / ph.dur, 0, 1));
      else if (ph.k === 'live') b.z = 0.15 + 0.85 * Math.abs(Math.sin(t * Math.PI * 1.7));
      else if (ph.k === 'ft') b.z = 0.3 + 0.7 * Math.abs(Math.sin(t * Math.PI * 1.2)); // 자유투 전 공 튕기기
      else b.z = 1.1;
      return;
    }
    switch (ph.k) {
      case 'pass': {
        const s = clamp((t - ph.t) / ph.dur, 0, 1);
        b.x = lerp(ph.sx, ph.ex, s);
        b.y = lerp(ph.sy, ph.ey, s);
        b.z = this.passZ(ph, s);
        break;
      }
      case 'shot': {
        const s = clamp((t - ph.t) / ph.dur, 0, 1);
        const team = this.P[ph.shooter].team;
        const H = this.hoop(team);
        if (ph.bank) {
          // 뱅크슛: 백보드 (림 뒤 0.37m, 림보다 0.5m 위)를 맞고 떨어진다
          const back = this.wrl(team, COURT.backboardFromBaseline + 0.05, (ph.sy - H.y) * 0.18);
          const bz = COURT.rimHeight + 0.5;
          if (s < 0.78) {
            const q = s / 0.78;
            b.x = lerp(ph.sx, back.x, q);
            b.y = lerp(ph.sy, back.y, q);
            b.z = ph.z0 + (bz - ph.z0) * q + ph.peak * 0.8 * Math.sin(Math.PI * q);
          } else {
            const q = (s - 0.78) / 0.22;
            b.x = lerp(back.x, H.x, q);
            b.y = lerp(back.y, H.y, q);
            b.z = lerp(bz, COURT.rimHeight, q);
          }
          break;
        }
        b.x = lerp(ph.sx, H.x, s);
        b.y = lerp(ph.sy, H.y, s);
        b.z = ph.z0 + (COURT.rimHeight - ph.z0) * s + ph.peak * Math.sin(Math.PI * s);
        break;
      }
      case 'ft': {
        const s = this.P[ph.shooter];
        const H = this.hoop(ph.team);
        if (ph.stage === 'flight') {
          const k = clamp((t - ph.t) / 0.9, 0, 1);
          b.x = lerp(s.x, H.x, k);
          b.y = lerp(s.y, H.y, k);
          b.z = 2.2 + (COURT.rimHeight - 2.2) * k + 1.6 * Math.sin(Math.PI * k);
        } else if (ph.stage === 'after') {
          b.x = H.x;
          b.y = H.y;
          b.z = Math.max(0.2, COURT.rimHeight - (t - ph.t) * 6);
        }
        break;
      }
      case 'air':
        // 물리는 airUpdate가 (M26)
        break;
      case 'inbound':
        if (ph.made) b.z = Math.max(0.1, b.z - 6 * DT);
        break;
      case 'swat': {
        const s = clamp((t - ph.t) / ph.dur, 0, 1);
        b.x = lerp(ph.sx, ph.ex, s);
        b.y = lerp(ph.sy, ph.ey, s);
        b.z = lerp(2.4, 0.6, s) + 2.2 * Math.sin(Math.PI * s);
        break;
      }
      case 'dead':
      case 'break':
      case 'timeout':
        b.x = lerp(b.x, ph.sx, 0.12);
        b.y = lerp(b.y, ph.sy, 0.12);
        b.z = lerp(b.z, 1.0, 0.2);
        break;
      case 'tip': {
        const s = clamp((t - ph.t) / 1.2, 0, 1);
        b.z = 1.6 + Math.sin(Math.PI * s) * 2.6;
        break;
      }
      default:
        break;
    }
  }
}
