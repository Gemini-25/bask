import type { Player } from '../data/player';
import type { Team } from '../data/teams';

export type Side = 0 | 1;

export type ShotKind = 'dunk' | 'layup' | 'floater' | 'hook' | 'mid' | 'three';
export type TurnoverKind =
  | 'badPass'
  | 'stolenPass'
  | 'stolenDribble'
  | 'travel'
  | 'doubleDribble'
  | 'offFoul'
  | 'shotClock'
  | 'eightSec'
  | 'outOfBounds';
export type FoulKind = 'shooting' | 'reach' | 'block' | 'charge' | 'loose' | 'screen' | 'holding' | 'technical' | 'intentional';
export type DefScheme = 'man' | 'zone23' | 'zone32' | 'press';

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
  /** 드리블 기술 (M25): 수비를 한 발 제쳤다 (stage 1). 휘청·주저앉으면 ankle */
  | 'dribble'
  /** 공이 림·백보드에 맞았다 (M26, 화면용: 림 흔들림·소리) */
  | 'bounce'
  | 'screen'
  | 'foul'
  | 'ft'
  | 'sub'
  | 'timeout'
  | 'defense'
  | 'ejected'
  /** 작전 시작 (M22): player = 공 가진 선수, other = 스크린·포스트·슈터 등 짝 */
  | 'play'
  /** 공을 쳐냈다 (player = 쳐낸 선수, other = 공 가졌던 선수), 루즈볼을 공격팀이 다시 잡았다 (offensive) */
  | 'loose';

export interface GameEvent {
  tick: number;
  type: EventType;
  team: Side;
  /** 선수 번호 (GameResult.players 기준), 없으면 -1 */
  player: number;
  /** 어시스트·블록·스틸한 선수, 파울 당한 선수, 교체로 나간 선수 */
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
  andOne?: boolean;
  alleyOop?: boolean;
  foul?: FoulKind;
  /** 파울로 얻은 자유투 개수 */
  fta?: number;
  /** 파울한 선수의 개인 파울 수 */
  pf?: number;
  /** 파울한 팀의 이번 쿼터 팀 파울 */
  teamFouls?: number;
  /** 자유투: 몇 번째 / 몇 개 중 */
  ftN?: number;
  ftOf?: number;
  made?: boolean;
  scheme?: DefScheme;
  switched?: boolean;
  /** 덩크 종류 */
  dunk?: DunkStyle;
  /** 슛·자유투 성공 확률 (0~1, 개발자 패널 확률 표시) */
  prob?: number;
  /** 슛 견제 정도 (0 노마크 ~ 1 꽉 막힘) */
  contest?: number;
  /** 콤비 플레이로 넣었다 */
  combo?: boolean;
  /** 슛 동작 (M16) */
  move?: ShotMove;
  /** 블록하러 뜬 수비 위로 찍었다 (인유어페이스) */
  poster?: boolean;
  /** 덩크 도약 (M24, 화면용): 림에서 떨어진 거리 (m), 수직 점프 (m), 체공 (초), 뛴 자리, 뛴 틱 */
  leap?: Leap;
  /** 드리블 기술 (M25): 기술 (ACT), 수비가 당한 정도 1 = 한 발 늦음, 2 = 휘청, 3 = 주저앉음, 콤보 몇 번째 */
  dmove?: number;
  stage?: number;
  combo2?: number;
  /** 공이 맞은 곳 (M26): 림·백보드, 세기 (m/s), 빗나간 슛의 종류 */
  hit?: 'rim' | 'board';
  power?: number;
  missKind?: string;
  /** 루즈볼 (M26): 패스를 놓쳤다 */
  fumble?: boolean;
  /** 체이스다운 블록 (M21) */
  chase?: boolean;
  /** 비하인드 백·노룩 패스를 받아 넣었다 (M21) */
  fancy?: boolean;
  /** 작전 (M22): 'play' 이벤트의 작전, 슛·실책·자유투는 그 공격에서 돌린 작전 */
  play?: PlayKind;
  /** 픽앤롤에서 스크리너가 굴러 들어가지 않고 밖으로 빠진다 (팝) */
  pop?: boolean;
  /** 분석 (M17): 슛 상황, 맡은 수비, 골밑을 지킨 수비, 패스해 준 선수 (안 들어간 슛도) */
  ctx?: ShotCtx;
  def?: number;
  rim?: number;
  passer?: number;
  quarter: number;
  clock: number;
  score: [number, number];
  text: string;
}

/** 공격 작전 (M22) */
export type PlayKind = 'pnr' | 'iso' | 'post' | 'motion' | 'pindown' | 'dho' | 'transition';
export const PLAY_LABEL: Record<PlayKind, string> = { pnr: '픽앤롤', iso: '아이솔레이션', post: '포스트업', motion: '모션 오펜스', pindown: '핀다운', dho: '핸드오프', transition: '속공' };

export interface Leap {
  d: number;
  h: number;
  air: number;
  x: number;
  y: number;
  t: number;
}

/** 화면에서 그릴 선수 동작 (Recording.act) */
export const ACT = {
  IDLE: 0,
  DRIBBLE: 1,
  HOLD: 2,
  SHOOT: 3,
  LAYUP: 4,
  DUNK: 5,
  PASS: 6,
  REBOUND: 7,
  BLOCK: 8,
  CONTEST: 9,
  STANCE: 10,
  SCREEN: 11,
  STUN: 12,
  CELEBRATE: 13,
  FT: 14,
  POST: 15,
  HANG: 16,
  STEAL: 17,
  BOXOUT: 18,
  FALL: 19,
  HIGHFIVE: 20,
  DEJECT: 21,
  INJURED: 22,
  DUNK2: 23,
  TOMAHAWK: 24,
  REVERSE: 25,
  WINDMILL: 26,
  D360: 27,
  BOUNCE: 28,
  LOB: 29,
  // 드리블 기술 (M10)
  CROSSOVER: 30,
  BEHIND: 31,
  LEGS: 32,
  SPIN: 33,
  HESI: 34,
  // 덩크 (M10)
  DOUBLE: 35,
  ELBOW: 36,
  BETWEEN: 37,
  FTLINE: 38,
  // 슛·레이업·덩크 동작 (M16)
  STEPBACK: 39,
  SIDESTEP: 40,
  FADE: 41,
  TURNFADE: 42,
  ONELEG: 43,
  EURO: 44,
  SCOOP: 45,
  REVLAY: 46,
  FINGER: 47,
  POWERLAY: 48,
  CLUTCH: 49,
  POSTER: 50,
  CONTACT: 51,
  SKYHOOK: 52,
  // 드리블 기술 (M16)
  INOUT: 53,
  SHAKE: 54,
  SNAP: 55,
  KILLER: 56,
  CRADLE: 57,
  // 덩크 (M20)
  HAMMER: 58,
  SUPERMAN: 59,
  SCORPION: 60,
  SELFOOP: 61,
  // M21: 마무리 동작 따로 (플로터·훅슛·딥쓰리, 풋백·앨리웁·컨택트 덩크)
  FLOAT: 62,
  HOOK: 63,
  DEEP: 64,
  PUTBACK: 65,
  ALLEY: 66,
  CDUNK: 67,
  // M21: 세리머니
  GOGGLES: 68,
  FLEX: 69,
  SHIMMY: 70,
  SHH: 71,
  ROAR: 72,
  TURNAWAY: 73,
  // M21: 화려한 패스, 체이스다운 블록
  BEHINDPASS: 74,
  NOLOOK: 75,
  CHASE: 76,
  // M25: 새 드리블 기술, 당한 수비, 평소 드리블, 수비·오프볼 움직임
  DBLCROSS: 77,
  STUTTER: 78,
  HALFSPIN: 79,
  /** 제쳐졌다: 반대로 쏠려 한 발 늦는다 */
  BEATEN: 80,
  /** 앵클 브레이커: 주저앉는다 */
  ANKLE: 81,
  /** 앞으로 밀고 나가는 높은 드리블 */
  SPEEDDRIB: 82,
  /** 수비 앞에서 낮게 몸으로 가리는 드리블 */
  POCKET: 83,
  /** 제자리 리듬 드리블 (다리 사이로 왔다 갔다) */
  RHYTHM: 84,
  /** 수비 사이드 스텝 */
  SLIDE: 85,
  /** 슈터에게 달려들어 손을 든다 */
  CLOSEOUT: 86,
  /** 패스 길에 팔을 뻗어 막는다 */
  DENY: 87,
  /** 컷: 전력으로 뛰며 손을 든다 */
  CUT: 88,
  /** 컨택트 덩크·인유어페이스에 밀려난다 */
  SHOVED: 89,
  /** 펌프 페이크 후 슛 */
  PUMPFAKE: 90,
  /** 팁인 (M26): 공중에서 손끝으로 건드려 넣는다 */
  TIPIN: 91,
  /** 루즈볼에 몸을 던진다 (M26) */
  DIVE: 92,
} as const;

/** 드리블 기술 이름 */
export const MOVE_LABEL: Record<number, string> = { 30: '크로스오버', 31: '비하인드 백', 32: '레그 스루', 33: '스핀 무브', 34: '헤지테이션', 53: '인앤아웃', 54: '셰이크 앤 베이크', 55: '스냅백', 56: '킬러 크로스오버', 77: '더블 크로스오버', 78: '스터터 스텝', 79: '하프 스핀' };
export const DRIBBLE_MOVES = [ACT.CROSSOVER, ACT.BEHIND, ACT.LEGS, ACT.SPIN, ACT.HESI, ACT.INOUT, ACT.SHAKE, ACT.SNAP, ACT.KILLER, ACT.DBLCROSS, ACT.STUTTER, ACT.HALFSPIN] as number[];

/** 슛 동작 (M16): 고른 동작마다 견제·성공률·블록·파울이 조금씩 달라진다 */
export type ShotMove =
  | 'stepback'
  | 'sidestep'
  | 'pullup'
  | 'fadeaway'
  | 'turnFade'
  | 'oneLeg'
  | 'catchShoot'
  | 'pumpFake'
  | 'tipIn'
  | 'contactShot'
  | 'bank'
  | 'skyhook'
  | 'teardrop'
  | 'euro'
  | 'scoop'
  | 'reverseLay'
  | 'fingerRoll'
  | 'powerLay'
  | 'doubleClutch'
  | 'poster'
  | 'contactDunk'
  | 'putback';

/** 슛 상황 (M17 분석): 받자마자 / 드리블하다 / 돌파 끝 / 포스트 / 풋백 / 속공 / 그 밖 */
export type ShotCtx = 'catch' | 'pullup' | 'drive' | 'post' | 'putback' | 'fast' | 'other';

export type DunkStyle = 'one' | 'two' | 'tomahawk' | 'reverse' | 'windmill' | 'd360' | 'double' | 'elbow' | 'between' | 'ftline' | 'cradle' | 'putback' | 'hammer' | 'superman' | 'scorpion' | 'selfOop';
export const DUNK_LABEL: Record<DunkStyle, string> = {
  one: '원핸드 덩크',
  two: '투핸드 덩크',
  tomahawk: '토마호크 덩크',
  reverse: '리버스 덩크',
  windmill: '윈드밀 덩크',
  d360: '360 덩크',
  double: '더블 클러치 덩크',
  elbow: '엘보우 행 덩크',
  between: '비트윈 더 레그 덩크',
  ftline: '자유투 라인 덩크',
  cradle: '크레들 덩크',
  putback: '풋백 덩크',
  hammer: '해머 덩크',
  superman: '슈퍼맨 덩크',
  scorpion: '스콜피온 덩크',
  selfOop: '셀프 앨리웁 덩크',
};
export const DUNK_ACT: Record<DunkStyle, number> = {
  one: ACT.DUNK,
  two: ACT.DUNK2,
  tomahawk: ACT.TOMAHAWK,
  reverse: ACT.REVERSE,
  windmill: ACT.WINDMILL,
  d360: ACT.D360,
  double: ACT.DOUBLE,
  elbow: ACT.ELBOW,
  between: ACT.BETWEEN,
  ftline: ACT.FTLINE,
  cradle: ACT.CRADLE,
  putback: ACT.PUTBACK,
  hammer: ACT.HAMMER,
  superman: ACT.SUPERMAN,
  scorpion: ACT.SCORPION,
  selfOop: ACT.SELFOOP,
};

export const FLAG_STUN = 1;
export const FLAG_SHOOT = 2;
export const FLAG_CUT = 4;
export const FLAG_SCREEN = 8;

/** 0.1초마다 찍은 경기 기록. 화면은 이걸 재생만 한다 (E2). */
export interface Recording {
  n: number;
  /** n × 20: 코트 자리 10개의 x, y */
  pos: Float32Array;
  /** n × 3: 공 x, y, 높이 */
  ball: Float32Array;
  clock: Float32Array;
  shotClock: Float32Array;
  /** 경기 시계가 흐른 누적 시간 (출전 시간 계산용) */
  elapsed: Float32Array;
  quarter: Uint8Array;
  /** 공 가진 코트 자리 (0~9), 없으면 -1 */
  holder: Int8Array;
  /** n × 10: FLAG_* */
  flags: Uint8Array;
  /** n × 10: 체력 0~100 */
  energy: Uint8Array;
  /** n × 10: ACT 동작 코드 */
  act: Uint8Array;
  /** n × 10: 점프 높이 (cm ÷ 2) */
  pz: Uint8Array;
  /** 공이 손에 붙어 있는 코트 자리 (들고 있거나, 슛 준비 중이거나, 덩크로 꽂는 중), 없으면 -1 (M21) */
  carry: Int8Array;
}

/** 코트 자리 0~4는 팀0, 5~9는 팀1. 교체되면 그 자리에 들어간 선수가 바뀐다. */
export interface Lineup {
  tick: number;
  pids: number[];
}

export interface GameResult {
  seed: number;
  dt: number;
  teams: [Team, Team];
  /** 두 팀 전체 선수 (팀0 → 팀1 순서) */
  players: Player[];
  teamOf: Side[];
  lineups: Lineup[];
  rec: Recording;
  events: GameEvent[];
  final: [number, number];
  quarters: number;
  quarterSeconds: number;
  /** 밸런스 확인용 카운터 */
  counters: Counters;
  /** 분석 (M17): 선수별 돌파와 돌파 결과 (패스, 실책) */
  adv?: { drives: number[]; drivePass: number[]; driveTov: number[] };
}

export interface Counters {
  possessions: [number, number];
  passes: number;
  intercepts: number;
  drives: number;
  plays: Record<string, number>;
  schemes: Record<string, number>;
  /** 공격권 시작부터 슛까지 걸린 시간 합계와 횟수 */
  shotTimeSum: number;
  shotTimeN: number;
  timeouts: number;
  subs: number;
  fouledOut: number;
  techs: number;
  switches: number;
  doubles: number;
  alleyOops: number;
  /** 드리블 기술 (M25): 쓴 횟수, 수비를 제친 횟수 */
  moves?: number;
  beats?: number;
}
