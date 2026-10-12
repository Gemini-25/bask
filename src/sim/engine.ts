// 경기 엔진 (E1 자율 이동 방식)
// - 0.1초마다 10명 전원이 "어디로 갈지" 정하고 움직인다.
// - 공 가진 선수는 0.3~0.6초마다 슛 / 돌파 / 패스 / 유지 중 하나를 고른다.
// - 성공 여부는 능력치와 상황(거리, 수비 간격)으로 확률을 계산해 주사위를 굴린다.
// 화면 없이 돌아가고, 결과(Recording + 이벤트)를 화면이 재생한다.

import { clamp, dist, lerp, segDist, sigmoid } from '../core/math';
import { Rng } from '../core/rng';
import type { Player } from '../data/player';
import type { Team } from '../data/teams';
import { COURT, hoopXY, MID_Y, toLocal, toWorld } from './court';
import { contestFactor, SHOT_LABEL, shotInfo, type ShotInfo } from './shooting';
import {
  FLAG_CUT,
  FLAG_SCREEN,
  FLAG_SHOOT,
  FLAG_STUN,
  type GameEvent,
  type Counters,
  type GameResult,
  type Side,
  type TurnoverKind,
} from './types';

export const DT = 0.1;

/** 개발용 훅 (tools/에서 판단 과정을 찍어볼 때) */
export const DEBUG: {
  think?: (t: number, i: number, u: number, v: number, tLeft: number, opts: string[], chosen: string) => void;
  intercept?: (info: Record<string, number | string>) => void;
  shot?: (kind: string, contest: number, p: number, made: boolean, tLeft: number) => void;
} = {};
const RIM_FRONT = 0.75;

export interface SimOptions {
  quarterMinutes?: number;
  overtimeMinutes?: number;
}

export function simulateGame(a: Team, b: Team, seed: number, opts: SimOptions = {}): GameResult {
  return new GameSim(a, b, seed, opts).run();
}

interface SP {
  i: number;
  team: Side;
  slot: number;
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
  man: number;
  screenFlag: number;
}

type Phase =
  | { k: 'tip'; t: number }
  | { k: 'live' }
  | { k: 'gather'; shooter: number; t: number; dur: number; post: boolean }
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
      intercept: number;
      oob: boolean;
      inbound: boolean;
    }
  | { k: 'reb'; t: number; dur: number; sx: number; sy: number; ex: number; ey: number; z0: number; peak: number; shotTeam: Side }
  | { k: 'loose'; t: number; vx: number; vy: number; shotTeam: Side }
  | { k: 'inbound'; inb: number; recv: number; sx: number; sy: number; t: number; ready: number; made: boolean }
  | { k: 'dead'; t: number; dur: number; next: Side; sx: number; sy: number }
  | { k: 'break'; t: number; dur: number; sx: number; sy: number }
  | { k: 'end' };

type Play =
  | { k: 'pnr'; scr: number; side: number; stage: 'go' | 'set' | 'use' | 'roll'; t: number; pop: boolean; screened: boolean }
  | { k: 'iso'; star: number; t: number }
  | { k: 'post'; star: number; t: number }
  | { k: 'motion'; t: number };

interface Act {
  k: 'advance' | 'probe' | 'drive' | 'post' | 'wait' | 'use' | 'hold';
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

const TOV_TEXT: Record<TurnoverKind, string> = {
  badPass: '패스 실책',
  stolenPass: '패스 실책',
  stolenDribble: '드리블 실책',
  travel: '트래블링',
  doubleDribble: '더블 드리블',
  offFoul: '공격자 파울',
  shotClock: '24초 바이얼레이션',
};

class GameSim {
  private rng: Rng;
  private teams: [Team, Team];
  private onCourt: Player[];
  private P: SP[];
  private ball = { x: 14, y: MID_Y, z: 1, holder: -1 };
  private ph: Phase = { k: 'tip', t: 0 };
  private off: Side = 0;
  private mode: 'advance' | 'set' = 'advance';
  private play: Play | null = null;
  private act: Act = { k: 'hold', u: 0, v: 0, t: 0 };
  private possStart = 0;
  private possLive = false;
  private lastPass: { from: number; to: number; t: number } | null = null;
  private nextThink = 0;
  private nextSpots = 0;
  private helper = -1;
  private misc: { at: number; kind: TurnoverKind } | null = null;
  private quarter = 1;
  private clock: number;
  private shotClock = 24;
  private clockRunning = false;
  private score: [number, number] = [0, 0];
  private arrow: Side = 0;
  private t = 0;
  private tick = 0;
  private buzzer = false;
  private hot: number[];
  /** 선수별 슛 시도. 한 명에게 몰리면 수비가 그 선수를 집중 견제한다. */
  private fga = new Array<number>(10).fill(0);
  private events: GameEvent[] = [];
  private qLen: number;
  private otLen: number;
  private cnt: Counters = { possessions: [0, 0], passes: 0, intercepts: 0, drives: 0, plays: {}, shotTimeSum: 0, shotTimeN: 0 };

  private rPos: number[] = [];
  private rBall: number[] = [];
  private rClock: number[] = [];
  private rShot: number[] = [];
  private rQ: number[] = [];
  private rHolder: number[] = [];
  private rFlags: number[] = [];

  constructor(
    a: Team,
    b: Team,
    private seed: number,
    opts: SimOptions,
  ) {
    this.rng = new Rng(seed);
    this.teams = [a, b];
    this.qLen = (opts.quarterMinutes ?? 10) * 60;
    this.otLen = (opts.overtimeMinutes ?? 5) * 60;
    this.clock = this.qLen;
    this.onCourt = [...a.players.slice(0, 5), ...b.players.slice(0, 5)];
    this.P = this.onCourt.map((pl, i) => this.makeSP(i, pl));
    // 경기마다 슛 감각이 조금씩 다르다. 일관성이 낮을수록 기복이 크다.
    this.hot = this.onCourt.map((pl) => clamp(1 + this.rng.normal(0, ((100 - pl.r.consistency) / 100) * 0.1), 0.85, 1.15));
  }

  private makeSP(i: number, pl: Player): SP {
    const r = pl.r;
    const team = (i < 5 ? 0 : 1) as Side;
    const slot = i % 5;
    return {
      i,
      team,
      slot,
      pl,
      x: 14,
      y: MID_Y,
      vx: 0,
      vy: 0,
      tx: 14,
      ty: MID_Y,
      gx: 14,
      gy: MID_Y,
      urg: 0.5,
      maxSpd: 5.6 + (r.speed - 50) * 0.035,
      acc: 6 + (r.accel - 50) * 0.06,
      tau: 0.1 + ((100 - (r.iq * 0.4 + r.agility * 0.35 + r.perimeterD * 0.25)) / 100) * 0.32,
      stun: 0,
      cut: 0,
      cutU: 0,
      cutV: 0,
      nextCut: 0,
      spot: -1,
      man: (team === 0 ? 5 : 0) + slot,
      screenFlag: 0,
    };
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
      onCourt: this.onCourt,
      rec: {
        n,
        pos: Float32Array.from(this.rPos),
        ball: Float32Array.from(this.rBall),
        clock: Float32Array.from(this.rClock),
        shotClock: Float32Array.from(this.rShot),
        quarter: Uint8Array.from(this.rQ),
        holder: Int8Array.from(this.rHolder),
        flags: Uint8Array.from(this.rFlags),
      },
      events: this.events,
      final: [this.score[0], this.score[1]],
      quarters: this.quarter,
      quarterSeconds: this.qLen,
      counters: this.cnt,
    };
  }

  // ---------------------------------------------------------------- 좌표 도우미

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
  private defenderOf(i: number): SP {
    return this.P.find((p) => p.man === i)!;
  }
  private name(i: number): string {
    return this.onCourt[i].name;
  }

  private emit(e: Omit<GameEvent, 'tick' | 'quarter' | 'clock' | 'score'>) {
    this.events.push({ ...e, tick: this.tick, quarter: this.quarter, clock: Math.max(0, this.clock), score: [this.score[0], this.score[1]] });
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
    this.record();
    this.t += DT;
    this.tick++;
  }

  private record() {
    for (const p of this.P) {
      this.rPos.push(p.x, p.y);
      let f = 0;
      if (p.stun > 0) f |= FLAG_STUN;
      if (this.ph.k === 'gather' && this.ph.shooter === p.i) f |= FLAG_SHOOT;
      if (p.cut > 0) f |= FLAG_CUT;
      if (p.screenFlag > 0) f |= FLAG_SCREEN;
      this.rFlags.push(f);
    }
    this.rBall.push(this.ball.x, this.ball.y, this.ball.z);
    this.rClock.push(Math.max(0, this.clock));
    this.rShot.push(Math.max(0, this.shotClock));
    this.rQ.push(this.quarter);
    this.rHolder.push(this.ball.holder);
  }

  private updatePhase() {
    const ph = this.ph;
    const t = this.t;
    switch (ph.k) {
      case 'tip':
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
        break;
      case 'reb':
        if (t - ph.t >= ph.dur) this.rebArrive(ph);
        break;
      case 'loose':
        this.looseUpdate(ph);
        break;
      case 'inbound':
        this.inboundUpdate(ph);
        break;
      case 'dead':
        if (t - ph.t >= ph.dur) this.startInbound(ph.next, ph.sx, ph.sy, false);
        break;
      case 'break':
        if (t - ph.t >= ph.dur) this.startQuarter();
        break;
      case 'end':
        break;
    }
  }

  private updateClocks() {
    const k = this.ph.k;
    if (this.clockRunning && k !== 'dead' && k !== 'break' && k !== 'end') this.clock -= DT;
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
      const [x, y] = spots[p.slot];
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
    const pg = this.P[w * 5];
    this.startPass(jumper, pg, true, { x: 14, y: MID_Y });
  }

  private endQuarter() {
    this.clockRunning = false;
    this.buzzer = false;
    const q = this.quarter;
    const qName = q <= 4 ? `${q}쿼터` : `연장 ${q - 4}차`;
    this.emit({ type: 'quarterEnd', team: 0, player: -1, other: -1, pts: 0, text: `${qName} 종료 ${this.score[0]} : ${this.score[1]}` });
    if (q >= 4 && this.score[0] !== this.score[1]) {
      this.emit({ type: 'gameEnd', team: this.score[0] > this.score[1] ? 0 : 1, player: -1, other: -1, pts: 0, text: '경기 종료' });
      this.ph = { k: 'end' };
      return;
    }
    this.quarter++;
    this.clock = this.quarter <= 4 ? this.qLen : this.otLen;
    this.shotClock = 24;
    this.play = null;
    this.helper = -1;
    for (const p of this.P) p.stun = p.cut = 0;
    this.ball.holder = -1;
    this.ph = { k: 'break', t: this.t, dur: q === 2 ? 6 : 3, sx: 14, sy: -0.5 };
  }

  private startQuarter() {
    const team = this.arrow;
    this.arrow = (1 - team) as Side;
    const q = this.quarter;
    this.emit({ type: 'quarterStart', team, player: -1, other: -1, pts: 0, text: q <= 4 ? `${q}쿼터 시작` : `연장 ${q - 4}차 시작` });
    this.startInbound(team, 14, -0.5, false);
  }

  // ---------------------------------------------------------------- 공격권

  private changePossession(team: Side, live: boolean) {
    if (this.off !== team || this.events.length < 3) this.cnt.possessions[team]++;
    this.off = team;
    this.mode = 'advance';
    this.play = null;
    this.possStart = this.t;
    this.possLive = live;
    this.lastPass = null;
    this.shotClock = 24;
    this.helper = -1;
    this.act = { k: 'advance', u: 0, v: 0, t: this.t };
    this.nextThink = this.t + 0.3;
    this.nextSpots = 0;
    for (const p of this.P) {
      p.cut = 0;
      p.spot = -1;
    }
    const focus = this.mates(team).reduce((s, p) => s + p.pl.r.focus, 0) / 5;
    const pMisc = 0.02 + ((100 - focus) / 100) * 0.015;
    this.misc = this.rng.chance(pMisc)
      ? { at: this.t + this.rng.range(3, 15), kind: this.rng.pick(['travel', 'travel', 'doubleDribble', 'offFoul'] as const) }
      : null;
  }

  private startInbound(team: Side, sx: number, sy: number, made: boolean) {
    this.changePossession(team, false);
    const mates = this.mates(team);
    let inb: SP;
    if (made) {
      const sorted = [...mates].sort((a, b) => dist(a.x, a.y, this.ball.x, this.ball.y) - dist(b.x, b.y, this.ball.x, this.ball.y));
      inb = sorted[0].slot === 0 && sorted.length > 1 ? sorted[1] : sorted[0];
    } else {
      const sorted = [...mates].filter((p) => p.slot !== 0).sort((a, b) => dist(a.x, a.y, sx, sy) - dist(b.x, b.y, sx, sy));
      inb = sorted[0];
      this.ball.x = sx;
      this.ball.y = sy;
    }
    const recv = inb.slot === 0 ? mates[1] : mates[0];
    this.ball.holder = -1;
    this.ph = { k: 'inbound', inb: inb.i, recv: recv.i, sx, sy, t: this.t, ready: -1, made };
    // 득점 후에는 시계가 계속 돈다 (4쿼터·연장 마지막 2분 제외). 그 외에는 공을 잡을 때 다시 돈다.
    this.clockRunning = made && !(this.quarter >= 4 && this.clock <= 120);
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

  private startDead(next: Side) {
    const sy = this.ball.y < MID_Y ? -0.5 : COURT.width + 0.5;
    const sx = clamp(this.ball.x, 1.5, COURT.length - 1.5);
    this.ball.holder = -1;
    this.clockRunning = false;
    this.play = null;
    this.ph = { k: 'dead', t: this.t, dur: 1.2, next, sx, sy };
  }

  private turnover(player: number, kind: TurnoverKind, stealer = -1) {
    const team = this.off;
    let text = player >= 0 ? `${this.name(player)} ${TOV_TEXT[kind]}` : `${this.teams[team].short} ${TOV_TEXT[kind]}`;
    if (kind === 'shotClock') text = `${this.teams[team].short} ${TOV_TEXT[kind]}`;
    if (stealer >= 0) text = `${this.name(stealer)} 스틸! (${text})`;
    this.emit({ type: 'turnover', team, player, other: stealer, pts: 0, tov: kind, text });
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

  // ---------------------------------------------------------------- 라이브 볼

  private live() {
    const h = this.holder();
    if (!h) {
      this.ph = { k: 'loose', t: this.t, vx: 0, vy: 0, shotTeam: this.off };
      return;
    }
    const off = this.off;
    const H = this.hoop(off);
    const L = this.loc(off, h.x, h.y);

    if (this.mode === 'advance') {
      const back = this.mates((1 - off) as Side).filter((d) => this.loc(off, d.x, d.y).u < L.u + 0.5).length;
      const since = this.t - this.possStart;
      if (L.u < 10.5 && since > 1.2 && (back >= 4 || since > 6)) {
        this.mode = 'set';
        this.choosePlay(h);
        this.nextSpots = 0;
        if (this.act.k === 'advance') this.newProbe(h);
      }
    }
    if (this.mode === 'set' && this.t >= this.nextSpots) {
      this.assignSpots();
      this.nextSpots = this.t + 1.0;
    }
    this.updatePlay(h);
    this.updateCuts();

    // 집중력이 낮으면 가끔 트래블링·공격자 파울 같은 실책
    if (this.misc && this.t >= this.misc.at) {
      const kind = this.misc.kind;
      this.misc = null;
      this.turnover(h.i, kind);
      return;
    }

    // 드리블 중 스틸
    const d = this.defenderOf(h.i);
    const dd = dist(d.x, d.y, h.x, h.y);
    if (dd < 1.05 && d.stun <= 0) {
      const ahead = ((d.x - h.x) * (H.x - h.x) + (d.y - h.y) * (H.y - h.y)) / Math.max(0.01, dist(h.x, h.y, H.x, H.y));
      if (ahead > -0.2) {
        let lam = clamp(0.004 + ((d.pl.r.steal - h.pl.r.ballHandling) / 100) * 0.008, 0.001, 0.014);
        if (this.act.k === 'drive') lam *= 1.8;
        if (this.rng.chance(lam * DT)) {
          this.turnover(h.i, 'stolenDribble', d.i);
          return;
        }
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
    } else if (this.act.k !== 'drive') {
      this.helper = -1;
    }

    if (this.t >= this.nextThink) this.think(h);
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

    // 1) 슛
    if (L.u < 10.2 || tLeft < 2.5) {
      const post = this.act.k === 'post';
      const c0 = this.contest(h, 0.3).c;
      const si = shotInfo(h.pl, L.u, L.v, post, c0);
      const c = this.contest(h, si.kind === 'three' ? 0.32 : 0.25).c;
      let ev = si.pOpen * contestFactor(si.kind, c) * si.pts * this.form(h.i, si);
      ev += (55 - r.teamwork) * 0.0015;
      if (si.kind === 'three') {
        // 수비가 붙은 3점은 꺼린다. 리그 성향상 3점을 아끼는 편 (슈터는 덜 아낀다)
        ev -= c * 0.15 + clamp(0.13 - (r.three - 50) * 0.004, 0, 0.2);
      }
      if (play?.k === 'iso' && play.star === h.i) ev += 0.04;
      if (L.u > 9.6 && tLeft > 3) ev -= 0.1; // 너무 먼 슛은 꺼린다
      ev -= clamp((this.share(h.i) - 0.25) * 1.2, 0, 0.3); // 많이 쐈으면 동료를 찾는다
      opts.push({ v: ev, go: () => this.startGather(h, post), label: 'shot-' + si.kind + '@' + c.toFixed(2) });
    }

    // 2) 돌파
    if (this.act.k === 'drive') {
      const lane = this.laneOpen(h);
      opts.push({ v: lerp(0.62, 1.16, lane), go: () => {}, label: 'keepdrive' });
    } else if (this.act.k !== 'post' && dH > 2.8 && (L.u < 12.5 || (this.possLive && this.t - this.possStart < 6))) {
      const lane = this.laneOpen(h);
      const skill = (r.ballHandling + r.speed + r.accel) / 3;
      let ev = lerp(0.68, 1.26, lane) + (skill - 50) * 0.004;
      if (play?.k === 'iso' && play.star === h.i) ev += 0.05;
      if (this.mode === 'advance' && lane > 0.7) ev += 0.08;
      ev -= clamp((this.share(h.i) - 0.25) * 1.0, 0, 0.25);
      opts.push({ v: ev, go: () => this.startDrive(h), label: 'drive@' + lane.toFixed(2) });
    }

    // 3) 패스: 동료 중 가장 좋아 보이는 한 명만 후보로 (IQ가 낮으면 잘못 볼 수 있다)
    {
      const noise = 0.03 + ((100 - r.iq) / 100) * 0.06;
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
      if (this.mode === 'advance') v += 0.05;
      opts.push({ v, go: () => this.holdAction(h), label: 'hold' });
    }

    const T = 0.03 + ((100 - r.iq) / 100) * 0.08;
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
    return base + 0.06 * clamp((tLeft - 13) / 10, 0, 1);
  }

  /** 팀 슛 중 이 선수 비중 (경기 초반엔 0에 가깝게) */
  private share(i: number): number {
    const base = i < 5 ? 0 : 5;
    let team = 0;
    for (let k = base; k < base + 5; k++) team += this.fga[k];
    return this.fga[i] / (team + 8);
  }

  private form(i: number, si: ShotInfo): number {
    return si.kind === 'dunk' || si.kind === 'layup' ? 1 : this.hot[i];
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
      let cd = clamp((2.0 + reach - dd) / 1.5, 0, 1);
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
        const cr = clamp((2.2 - rimD) / 1.4, 0, 1) * (0.25 + d.pl.r.block / 300 + (d.pl.body.heightCm - 195) / 150) * (1 - dh / 5);
        if (cr > c1) {
          c2 = c1;
          c1 = cr;
          bi = d.i;
        } else if (cr > c2) c2 = cr;
      }
    }
    // 슛을 많이 쏘는 선수는 수비가 집중해서 막는다
    const focus = clamp((this.share(s.i) - 0.22) * 2.2, 0, 0.45);
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
  private passRisk(h: SP, m: SP, perceived: boolean, tx = m.x, ty = m.y): { risk: number; by: number; s: number } {
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
      let pr = 0.12 * Math.exp(-eff / 0.2) * (0.6 + (d.pl.r.steal / 100) * 0.5 + (d.pl.r.iq / 100) * 0.2);
      if (d.stun > 0) pr *= 0.3;
      // 패스하는 선수 바로 앞 수비는 피해서 던진다 (바운드 패스, 머리 위로)
      if (s < 0.3) pr *= 0.25;
      // 긴 패스는 가운데 수비 머리 위로 띄운다
      if (len > 6 && s > 0.3 && s < 0.7) pr *= 0.35;
      surv *= 1 - pr;
      if (pr > bestP) {
        bestP = pr;
        best = d.i;
        bestS = s;
      }
    }
    let risk = (1 - surv) * (1.25 - (h.pl.r.passing / 100) * 0.5);
    if (perceived) risk *= 1.35 - (h.pl.r.vision / 100) * 0.7;
    return { risk: clamp(risk, 0, 0.95), by: best, s: bestS };
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
    if (Lm.u < 10.2) {
      const cm = this.contest(m, ft + 0.3).c;
      const si = shotInfo(m.pl, Lm.u, Lm.v, false, cm);
      const evShot = si.pOpen * contestFactor(si.kind, cm) * si.pts * this.form(m.i, si);
      ev = Math.max(evShot, evCreate);
    } else ev = evCreate * 0.97;
    const { risk } = this.passRisk(h, m, true);
    let v = (1 - risk) * ev - risk * 1.0 - 0.015;
    const play = this.play;
    if (play?.k === 'iso' && play.star === m.i && play.star !== h.i) v += 0.18;
    if (play?.k === 'post' && play.star === m.i && Lm.u < 4) v += 0.12;
    if (this.lastPass && this.lastPass.from === m.i && this.t - this.lastPass.t < 2) v -= 0.06;
    v += (h.pl.r.teamwork - 50) * 0.0008;
    v -= clamp((this.share(m.i) - 0.28) * 0.8, 0, 0.2);
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
    this.cnt.drives++;
    this.act = { k: 'drive', u: 0, v: 0, t: this.t };
    const d = this.defenderOf(h.i);
    if (dist(d.x, d.y, h.x, h.y) < 1.8 && d.stun <= 0) {
      const r = h.pl.r;
      const edge = r.ballHandling + 0.5 * r.speed + 0.5 * r.accel - d.pl.r.perimeterD - d.pl.r.agility;
      const p = 0.05 * sigmoid((edge - 10) / 8);
      if (this.rng.chance(p)) {
        d.stun = 0.7;
        this.nextThink = this.t + 0.15;
        this.emit({ type: 'ankle', team: h.team, player: h.i, other: d.i, pts: 0, text: `${h.pl.name}의 크로스오버! ${d.pl.name} 휘청` });
      }
    }
  }

  private startGather(h: SP, post: boolean) {
    const L = this.loc(this.off, h.x, h.y);
    const si = shotInfo(h.pl, L.u, L.v, post);
    const dur = si.kind === 'three' ? 0.32 : si.kind === 'dunk' || si.kind === 'layup' ? 0.18 : 0.28;
    this.act = { k: 'hold', u: L.u, v: L.v, t: this.t };
    this.ph = { k: 'gather', shooter: h.i, t: this.t, dur, post };
  }

  private release(ph: Extract<Phase, { k: 'gather' }>) {
    const h = this.P[ph.shooter];
    const L = this.loc(this.off, h.x, h.y);
    const { c, blocker, c1 } = this.contest(h);
    const si = shotInfo(h.pl, L.u, L.v, ph.post, c);
    const p = si.pOpen * contestFactor(si.kind, c) * this.form(h.i, si);
    const assist = this.lastPass && this.lastPass.to === h.i && this.t - this.lastPass.t < 3.2 ? this.lastPass.from : -1;
    const fast = this.possLive && this.t - this.possStart < 7;
    this.cnt.shotTimeSum += this.t - this.possStart;
    this.cnt.shotTimeN++;
    this.fga[h.i]++;
    this.ball.holder = -1;
    this.misc = null;

    if (blocker >= 0) {
      const b = this.P[blocker];
      const near = si.kind === 'dunk' || si.kind === 'layup' || si.kind === 'hook' || si.kind === 'floater';
      let pb = c1 * (0.04 + (b.pl.r.block / 100) * 0.2 + ((b.pl.body.heightCm - h.pl.body.heightCm) / 100) * 0.25 + ((b.pl.r.jump - 50) / 100) * 0.05);
      if (!near) pb *= 0.25;
      if (si.kind === 'dunk') pb *= 0.6;
      if (this.rng.chance(clamp(pb, 0, 0.3))) {
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
          text: `${b.pl.name} 블록! (${h.pl.name}의 ${SHOT_LABEL[si.kind]})`,
        });
        const H = this.hoop(h.team);
        const a = Math.atan2(h.y - H.y, h.x - H.x) + this.rng.normal(0, 0.8);
        const rr = this.rng.range(1.5, 4);
        this.startRebound(h.x, h.y, 2.4, h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr, h.team);
        return;
      }
    }
    const made = this.rng.chance(p);
    if (DEBUG.shot) DEBUG.shot(si.kind, c, p, made, this.shotClock);
    this.ph = {
      k: 'shot',
      shooter: h.i,
      t: this.t,
      dur: 0.55 + si.dist * 0.07,
      sx: h.x,
      sy: h.y,
      z0: si.kind === 'dunk' ? 3.0 : 2.3,
      peak: si.kind === 'dunk' ? 0.1 : si.kind === 'layup' ? 0.5 : 1.2 + si.dist * 0.13,
      info: si,
      made,
      assist,
      fast,
    };
  }

  private shotArrive(ph: Extract<Phase, { k: 'shot' }>) {
    const h = this.P[ph.shooter];
    const si = ph.info;
    const label = SHOT_LABEL[si.kind];
    if (ph.made) {
      this.score[h.team] += si.pts;
      const ast = ph.assist >= 0 ? ` (어시스트 ${this.name(ph.assist)})` : '';
      const fb = ph.fast ? '속공 ' : '';
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
        text: `${h.pl.name} ${fb}${label} 성공${ast}`,
      });
      const H = this.hoop(h.team);
      this.ball.x = H.x;
      this.ball.y = H.y;
      this.ball.z = COURT.rimHeight;
      if (this.buzzer) {
        this.endQuarter();
        return;
      }
      this.startInbound((1 - h.team) as Side, 0, 0, true);
      const ib = this.ph as Extract<Phase, { k: 'inbound' }>;
      const newOff = (1 - h.team) as Side;
      const side = this.loc(newOff, H.x, H.y).v >= 0 ? 1 : -1;
      const s = this.wrl(newOff, COURT.length + 0.6, side * 1.8);
      ib.sx = s.x;
      ib.sy = s.y;
      return;
    }
    this.emit({
      type: 'miss',
      team: h.team,
      player: h.i,
      other: -1,
      pts: si.pts,
      shot: si.kind,
      dist: si.dist,
      x: ph.sx,
      y: ph.sy,
      fastBreak: ph.fast,
      text: `${h.pl.name} ${label} 실패`,
    });
    if (this.buzzer) {
      this.endQuarter();
      return;
    }
    const H = this.hoop(h.team);
    const a = Math.atan2(ph.sy - H.y, ph.sx - H.x) + this.rng.normal(0, 1.1);
    const far = si.three ? 2.2 : si.dist < 2 ? 0.8 : 1.4;
    const rr = far + this.rng.range(0, 2.2);
    this.startRebound(H.x, H.y, COURT.rimHeight, H.x + Math.cos(a) * rr, H.y + Math.sin(a) * rr, h.team);
  }

  private startRebound(sx: number, sy: number, z0: number, ex: number, ey: number, shotTeam: Side) {
    // 공이 베이스라인 밖으로 나가지 않게
    const L = this.loc(shotTeam, ex, ey);
    const w = this.wrl(shotTeam, Math.max(0.5, L.u), clamp(L.v, -7.0, 7.0));
    const rr = dist(sx, sy, w.x, w.y);
    this.ball.holder = -1;
    this.ph = { k: 'reb', t: this.t, dur: 0.5 + rr * 0.12, sx, sy, ex: w.x, ey: w.y, z0, peak: 1 + rr * 0.3, shotTeam };
  }

  private rebArrive(ph: Extract<Phase, { k: 'reb' }>) {
    const cands: { p: SP; w: number }[] = [];
    for (const p of this.P) {
      const dd = dist(p.x, p.y, ph.ex, ph.ey);
      if (dd > 2.7) continue;
      const offTeam = p.team === ph.shotTeam;
      const r = p.pl.r;
      const skill = offTeam ? r.offReb : r.defReb;
      const w =
        Math.exp(-dd / 0.85) *
        (0.4 + skill / 100 + r.jump / 250 + r.hustle / 400 + (offTeam ? 0 : r.boxOut / 300)) *
        (1 + (p.pl.body.heightCm - 196) / 45) *
        (offTeam ? 0.62 : 1) *
        (p.stun > 0 ? 0.4 : 1);
      cands.push({ p, w });
    }
    if (cands.length === 0) {
      const a = this.rng.range(0, Math.PI * 2);
      this.ph = { k: 'loose', t: this.t, vx: Math.cos(a) * 1.3, vy: Math.sin(a) * 1.3, shotTeam: ph.shotTeam };
      return;
    }
    const k = this.rng.weighted(cands.map((c) => c.w));
    this.rebound(cands[k].p, ph.shotTeam);
  }

  private looseUpdate(ph: Extract<Phase, { k: 'loose' }>) {
    let best: SP | null = null;
    let bd = Infinity;
    for (const p of this.P) {
      const dd = dist(p.x, p.y, this.ball.x, this.ball.y);
      if (dd < bd) {
        bd = dd;
        best = p;
      }
    }
    if (best && (bd < 0.6 || this.t - ph.t > 4)) {
      this.rebound(best, ph.shotTeam);
      return;
    }
    if (!this.inCourt(this.ball.x, this.ball.y)) {
      this.off = ph.shotTeam;
      this.startDead((1 - ph.shotTeam) as Side);
    }
  }

  private inCourt(x: number, y: number) {
    return x > 0 && x < COURT.length && y > 0 && y < COURT.width;
  }

  private rebound(p: SP, shotTeam: Side) {
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
    } else {
      this.changePossession(p.team, true);
    }
    this.ph = { k: 'live' };
  }

  // ---------------------------------------------------------------- 패스

  private startPass(h: SP, m: SP, inbound: boolean, from?: { x: number; y: number }) {
    const sx = from?.x ?? h.x;
    const sy = from?.y ?? h.y;
    const spd = this.passSpeed(h);
    const ft0 = dist(sx, sy, m.x, m.y) / spd;
    // 받는 선수가 움직이는 방향으로 조금 앞에 준다
    let ex = clamp(m.x + m.vx * ft0 * 0.6, 0.3, COURT.length - 0.3);
    let ey = clamp(m.y + m.vy * ft0 * 0.6, 0.3, COURT.width - 0.3);
    let dur = Math.max(0.15, dist(sx, sy, ex, ey) / spd + 0.05);
    let intercept = -1;
    let oob = false;
    const madeInbound = inbound && this.ph.k === 'inbound' && this.ph.made;
    if (!from && !madeInbound) {
      const pr = this.passRisk(h, m, false, ex, ey);
      if (pr.by >= 0 && this.rng.chance(pr.risk)) {
        intercept = pr.by;
        if (DEBUG.intercept) {
          const d = this.P[pr.by];
          const sd = segDist(d.x, d.y, sx, sy, ex, ey);
          const pf = this.loc(this.off, sx, sy);
          const pt = this.loc(this.off, ex, ey);
          DEBUG.intercept({ risk: pr.risk.toFixed(2), s: pr.s.toFixed(2), sd: sd.d.toFixed(2), len: dist(sx, sy, ex, ey).toFixed(1), who: d.man === h.i ? 'passerD' : d.man === m.i ? 'recvD' : 'other', from: `${pf.u.toFixed(1)},${pf.v.toFixed(1)}`, to: `${pt.u.toFixed(1)},${pt.v.toFixed(1)}`, mode: this.mode });
        }
        ex = lerp(sx, ex, pr.s);
        ey = lerp(sy, ey, pr.s);
        dur = Math.max(0.12, dist(sx, sy, ex, ey) / spd);
      } else if (!inbound) {
        const pOob = 0.004 + ((100 - h.pl.r.passing) / 100) * 0.01 + ((100 - h.pl.r.focus) / 100) * 0.004;
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
    if (intercept >= 0) this.cnt.intercepts++;
    this.ball.holder = -1;
    this.act = { k: 'hold', u: 0, v: 0, t: this.t };
    this.ph = { k: 'pass', from: h.i, to: m.i, t: this.t, dur, sx, sy, ex, ey, intercept, oob, inbound };
  }

  private passArrive(ph: Extract<Phase, { k: 'pass' }>) {
    if (ph.intercept >= 0) {
      this.ball.x = ph.ex;
      this.ball.y = ph.ey;
      this.turnover(ph.from, 'stolenPass', ph.intercept);
      return;
    }
    if (ph.oob) {
      this.ball.x = ph.ex;
      this.ball.y = ph.ey;
      this.turnover(ph.from, 'badPass');
      return;
    }
    const m = this.P[ph.to];
    this.ball.holder = m.i;
    if (ph.inbound) this.clockRunning = true;
    else this.lastPass = { from: ph.from, to: ph.to, t: this.t };
    this.ph = { k: 'live' };
    if (this.play && this.play.k === 'pnr' && this.play.stage !== 'roll') this.play = null;
    this.act = { k: this.mode === 'advance' ? 'advance' : 'hold', u: 0, v: 0, t: this.t };
    this.nextThink = this.t + 0.05 + ((100 - m.pl.r.iq) / 100) * 0.15;
    if (this.mode === 'set') this.nextSpots = 0;
  }

  // ---------------------------------------------------------------- 전술

  private choosePlay(h: SP) {
    const off = this.off;
    const mates = this.mates(off);
    const tac = this.teams[off].tactics;
    const creation = (p: SP) => (p.pl.r.ballHandling + p.pl.r.midRange + p.pl.r.three + p.pl.r.layup + p.pl.r.speed) / 5;
    const star = [...mates].sort((a, b) => creation(b) - creation(a))[0];
    const big = [...mates].filter((p) => p.slot >= 3).sort((a, b) => b.pl.r.postUp - a.pl.r.postUp)[0];
    const screener = [...mates].filter((p) => p.i !== h.i && p.slot >= 2).sort((a, b) => b.pl.r.screen - a.pl.r.screen)[0];
    const avg = mates.reduce((s, p) => s + creation(p), 0) / 5;
    const w = [
      tac.pnr,
      tac.iso * clamp(1 + (creation(star) - avg) / 12, 0.4, 2),
      tac.post * (big.pl.r.postUp >= 55 ? 1.2 : 0.2),
      tac.motion,
    ];
    const k = this.rng.weighted(w);
    const nm = ['pnr', 'iso', 'post', 'motion'][k];
    this.cnt.plays[nm] = (this.cnt.plays[nm] ?? 0) + 1;
    if (k === 0 && screener) {
      const L = this.loc(off, h.x, h.y);
      const side = Math.abs(L.v) > 1.5 ? -Math.sign(L.v) : this.rng.chance(0.5) ? 1 : -1;
      this.play = { k: 'pnr', scr: screener.i, side, stage: 'go', t: this.t, pop: screener.pl.r.three >= 60 && this.rng.chance(0.5), screened: false };
    } else if (k === 1) this.play = { k: 'iso', star: star.i, t: this.t };
    else if (k === 2) this.play = { k: 'post', star: big.i, t: this.t };
    else this.play = { k: 'motion', t: this.t };
  }

  private updatePlay(h: SP) {
    const play = this.play;
    if (!play) return;
    const age = this.t - play.t;
    if (play.k === 'iso' || play.k === 'post' || play.k === 'motion') {
      if (age > 8) this.play = null;
      return;
    }
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
        d.stun = clamp(0.35 + (s.pl.r.screen + s.pl.r.strength - d.pl.r.agility - d.pl.r.iq) / 250, 0.2, 0.9);
        s.screenFlag = 0.5;
        this.nextThink = Math.min(this.nextThink, this.t + 0.1);
        this.emit({ type: 'screen', team: s.team, player: s.i, other: d.i, pts: 0, text: `${s.pl.name}의 스크린` });
      }
      if (age > 0.6) {
        play.stage = 'roll';
        play.t = this.t;
      }
    } else if (play.stage === 'roll') {
      if (age > 3.5) this.play = null;
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
      const pc = 0.012 + (p.pl.r.offBall / 100) * 0.025 + (watching ? 0.04 : 0) + (this.play?.k === 'motion' ? 0.015 : 0);
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
    return false;
  }

  private spotPref(p: SP, kind: Spot['kind']): number {
    const big = p.pl.pos === 'PF' || p.pl.pos === 'C';
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

  private updateTargets() {
    const ph = this.ph;
    if (ph.k === 'tip' || ph.k === 'end') {
      for (const p of this.P) this.setGoal(p, p.x, p.y, 0.3);
      return;
    }
    if (ph.k === 'break') {
      for (const p of this.P) {
        const x = p.team === 0 ? 9.5 + p.slot * 0.9 : 18.5 - p.slot * 0.9;
        this.setGoal(p, x, 1.2, 0.45);
      }
      return;
    }
    if (ph.k === 'dead') {
      for (const p of this.P) this.setGoal(p, p.x + (14 - p.x) * 0.05, p.y + (MID_Y - p.y) * 0.05, 0.3);
      return;
    }
    const off = this.off;
    for (const p of this.mates(off)) this.offTarget(p);
    for (const p of this.mates((1 - off) as Side)) this.defTarget(p);
  }

  private spotGoal(p: SP, urg: number) {
    const off = this.off;
    if (p.spot < 0) {
      // 아직 자리가 없으면 포지션별 기본 자리
      const base = [0, 1, 2, 5, 6][p.slot];
      p.spot = base;
    }
    const s = SPOTS[p.spot];
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

    if (ph.k === 'shot' || ph.k === 'gather' || ph.k === 'reb' || ph.k === 'loose') {
      this.reboundGoal(p, true);
      return;
    }

    if (ph.k === 'pass' && p.i === ph.to && ph.intercept < 0 && !ph.oob) {
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
      // 속공: 양 날개는 코너 쪽 라인으로 달린다
      if (fast && (p.slot === 1 || p.slot === 2)) {
        this.setGoalLocal(p, off, 2.2, (p.slot === 1 ? -1 : 1) * 5.6, 1);
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
    this.spotGoal(p, 0.55);
  }

  private handlerGoal(h: SP) {
    const off = this.off;
    const L = this.loc(off, h.x, h.y);
    const a = this.act;
    switch (a.k) {
      case 'advance': {
        const fast = this.possLive && this.t - this.possStart < 5;
        this.setGoalLocal(h, off, 9.2, clamp(L.v, -3.5, 3.5), fast ? 1 : 0.72);
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
    if (ph.k === 'reb') {
      lx = ph.ex;
      ly = ph.ey;
      near = dist(p.x, p.y, lx, ly) < 4.5 && this.t - ph.t > ph.dur * 0.35;
    } else if (ph.k === 'loose') {
      lx = this.ball.x;
      ly = this.ball.y;
      near = dist(p.x, p.y, lx, ly) < 8;
    }
    if (near) {
      this.setGoal(p, lx, ly, 1);
      return;
    }
    const dH = dist(p.x, p.y, H.x, H.y);
    if (offense) {
      const crash = p.slot >= 3 ? dH < 8 : dH < 3.5 || (p.pl.r.offReb > 62 && dH < 6);
      if (crash) {
        const L = this.loc(off, p.x, p.y);
        this.setGoalLocal(p, off, 2.0, (L.v >= 0 ? 1 : -1) * 1.2, 0.9);
        return;
      }
      if (p.slot === 0 || (p.slot === 1 && dH > 4)) {
        this.setGoalLocal(p, off, p.slot === 0 ? 16 : 13, p.slot === 0 ? 0 : 3, 0.7);
        return;
      }
      this.setGoal(p, p.x, p.y, 0.3);
      return;
    }
    const m = this.P[p.man];
    const mh = Math.max(0.01, dist(m.x, m.y, H.x, H.y));
    const bx = m.x + ((H.x - m.x) / mh) * 0.8;
    const by = m.y + ((H.y - m.y) / mh) * 0.8;
    if (mh > 7) this.setGoal(p, lerp(bx, H.x, 0.3), lerp(by, H.y, 0.3), 0.8);
    else this.setGoal(p, bx, by, 0.85);
  }

  private defTarget(p: SP) {
    const ph = this.ph;
    const off = this.off;
    const H = this.hoop(off);
    if (ph.k === 'shot' || ph.k === 'gather' || ph.k === 'reb' || ph.k === 'loose') {
      if (ph.k === 'gather') {
        // 슛 쏘는 선수 수비는 손을 뻗으러 붙는다
        const s = this.P[ph.shooter];
        if (p.man === s.i) {
          const sh = Math.max(0.01, dist(s.x, s.y, H.x, H.y));
          this.setGoal(p, s.x + ((H.x - s.x) / sh) * 0.7, s.y + ((H.y - s.y) / sh) * 0.7, 1);
          return;
        }
      }
      this.reboundGoal(p, false);
      return;
    }

    const m = this.P[p.man];
    const Lp = this.loc(off, p.x, p.y);
    const Lball = this.loc(off, this.ball.x, this.ball.y);

    // 속공 수비: 공보다 뒤에 있으면 일단 골밑으로 전력 질주
    if (this.mode === 'advance' && ph.k !== 'inbound' && Lp.u > Lball.u + 0.5 && Lball.u < 22) {
      this.setGoalLocal(p, off, 2.5 + p.slot * 0.5, (p.slot - 2) * 1.5, 1);
      return;
    }

    if (this.helper === p.i) {
      const h = this.holder();
      if (h) {
        const dh = Math.max(0.01, dist(h.x, h.y, H.x, H.y));
        this.setGoal(p, h.x + ((H.x - h.x) / dh) * 1.3, h.y + ((H.y - h.y) / dh) * 1.3, 1);
        return;
      }
    }

    let mx = m.x;
    let my = m.y;
    if (ph.k === 'pass' && ph.to === m.i && ph.intercept < 0) {
      mx = ph.ex;
      my = ph.ey;
    }
    if (ph.k === 'pass' && ph.intercept === p.i) {
      this.setGoal(p, ph.ex, ph.ey, 1);
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
      if (Lm.u > 9.8) gap += Math.min(2.5, (Lm.u - 9.8) * 0.6);
      if (this.act.k === 'post' && this.ball.holder === m.i) gap = 0.55;
      gx = mx + ux * gap;
      gy = my + uy * gap;
      urg = 1;
    } else {
      const db = dist(mx, my, this.ball.x, this.ball.y);
      const sag = clamp(1.0 + db * 0.1, 1.0, 2.4);
      const bx = mx + ux * sag;
      const by = my + uy * sag;
      const helpX = lerp(this.ball.x, H.x, 0.55);
      const helpY = lerp(this.ball.y, H.y, 0.55);
      let w = clamp((db - 5) / 9, 0, 0.45) * (0.65 + p.pl.r.helpD / 200);
      // 코너 슈터와 좋은 슈터한테서는 멀리 떨어지지 않는다
      const Lman = this.loc(off, mx, my);
      if (Lman.u < 3.2 && Math.abs(Lman.v) > 5.5) w *= 0.55;
      if (m.pl.r.three >= 60) w *= 0.7;
      else if (m.pl.r.three < 42) w = Math.min(0.6, w * 1.3 + 0.1);
      gx = lerp(bx, helpX, w);
      gy = lerp(by, helpY, w);
    }

    // 수비는 자기 진영에서 기다린다 (풀코트 프레스 없음)
    const Lg = this.loc(off, gx, gy);
    const limit = hasBall ? 15.5 : 13.5;
    if (Lg.u > limit) {
      const w = this.wrl(off, limit, Lg.v);
      gx = w.x;
      gy = w.y;
      urg = Math.min(urg, 0.7);
    }
    this.setGoal(p, gx, gy, urg);
  }

  // ---------------------------------------------------------------- 움직임

  private moveAll() {
    const off = this.off;
    for (const p of this.P) {
      const onDef = p.team !== off;
      const tau = onDef ? p.tau : 0.07;
      const k = Math.min(1, DT / tau);
      p.tx += (p.gx - p.tx) * k;
      p.ty += (p.gy - p.ty) * k;
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      let cap = p.maxSpd * p.urg;
      if (this.ball.holder === p.i) cap *= 0.8 + (p.pl.r.ballHandling / 100) * 0.17;
      // 돌파를 막는 수비는 뒷걸음질·옆걸음이라 앞으로 달리는 공격수보다 느리다
      if (onDef && this.act.k === 'drive' && this.ball.holder >= 0 && p.man === this.ball.holder) cap *= 0.72 + (p.pl.r.agility / 100) * 0.2;
      if (p.stun > 0) cap *= 0.25;
      const want = Math.min(cap, d / 0.3);
      const wx = d > 0.001 ? (dx / d) * want : 0;
      const wy = d > 0.001 ? (dy / d) * want : 0;
      let ax = wx - p.vx;
      let ay = wy - p.vy;
      const al = Math.hypot(ax, ay);
      const maxDv = p.acc * DT;
      if (al > maxDv) {
        ax = (ax / al) * maxDv;
        ay = (ay / al) * maxDv;
      }
      p.vx += ax;
      p.vy += ay;
      p.x += p.vx * DT;
      p.y += p.vy * DT;
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
      p.y = clamp(p.y, -1.2, COURT.width + 1.2);
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
      if (ph.k === 'gather') b.z = lerp(1.1, 2.3, clamp((t - ph.t) / ph.dur, 0, 1));
      else if (ph.k === 'live') b.z = 0.15 + 0.85 * Math.abs(Math.sin(t * Math.PI * 1.7));
      else b.z = 1.1;
      return;
    }
    switch (ph.k) {
      case 'pass': {
        const s = clamp((t - ph.t) / ph.dur, 0, 1);
        b.x = lerp(ph.sx, ph.ex, s);
        b.y = lerp(ph.sy, ph.ey, s);
        b.z = 1.2 + Math.sin(Math.PI * s) * (ph.inbound ? 0.7 : 0.35);
        break;
      }
      case 'shot': {
        const s = clamp((t - ph.t) / ph.dur, 0, 1);
        const H = this.hoop(this.P[ph.shooter].team);
        b.x = lerp(ph.sx, H.x, s);
        b.y = lerp(ph.sy, H.y, s);
        b.z = ph.z0 + (COURT.rimHeight - ph.z0) * s + ph.peak * Math.sin(Math.PI * s);
        break;
      }
      case 'reb': {
        const s = clamp((t - ph.t) / ph.dur, 0, 1);
        b.x = lerp(ph.sx, ph.ex, s);
        b.y = lerp(ph.sy, ph.ey, s);
        b.z = ph.z0 + (1.6 - ph.z0) * s + ph.peak * Math.sin(Math.PI * s);
        break;
      }
      case 'loose': {
        b.x += ph.vx * DT;
        b.y += ph.vy * DT;
        ph.vx *= 0.95;
        ph.vy *= 0.95;
        const age = t - ph.t;
        b.z = Math.abs(Math.sin(age * 5)) * Math.max(0, 0.9 - age * 0.3);
        break;
      }
      case 'inbound':
        if (ph.made) b.z = Math.max(0.1, b.z - 6 * DT);
        break;
      case 'dead':
      case 'break':
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
