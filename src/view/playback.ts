import type { GameEvent, GameResult, Lineup } from '../sim/types';

export interface Frame {
  px: Float32Array; // 20
  ball: [number, number, number];
  clock: number;
  shotClock: number;
  quarter: number;
  holder: number;
  flags: Uint8Array; // 10
  energy: Uint8Array; // 10
}

/** 전체 / 고른 선수가 뛰는 시간만 / 하이라이트만 (V5) */
export type PlayMode = 'all' | 'focus' | 'highlights';

/** 기록된 경기를 재생한다. 위치는 0.1초 프레임 사이를 보간한다. */
export class Playback {
  /** 현재 위치 (틱 단위, 소수) */
  cur = 0;
  speed = 4;
  paused = false;
  private frame: Frame = {
    px: new Float32Array(20),
    ball: [0, 0, 0],
    clock: 0,
    shotClock: 0,
    quarter: 1,
    holder: -1,
    flags: new Uint8Array(10),
    energy: new Uint8Array(10),
  };
  private li = 0;
  /** 이 시각(ms)까지 재생을 멈춘다 (컷인 연출) */
  holdUntil = 0;
  /** 슬로모션 구간 [시작 틱, 끝 틱] */
  slow: [number, number][] = [];
  /** 지금 슬로모션 중인가 */
  slowNow = false;
  mode: PlayMode = 'all';
  /** 'focus' 모드에서 따라갈 선수 */
  focusPid = -1;
  /** 하이라이트 구간 [시작 틱, 끝 틱], 겹치면 합쳐 둔다 */
  highlights: [number, number][] = [];
  /** 모드 때문에 건너뛴 횟수 (화면 전환 연출용) */
  cuts = 0;

  constructor(public game: GameResult) {
    // 버저비터와 막판 결정적인 슛은 느리게 보여준다
    let prevScore: [number, number] = [0, 0];
    for (const e of game.events) {
      if (e.type === 'made' || e.type === 'miss') {
        const buzzer = e.clock < 0.6;
        const margin = Math.abs(prevScore[0] - prevScore[1]);
        const clutch = e.quarter >= 4 && e.clock < 6 && margin <= 3;
        if (buzzer || clutch) this.slow.push([e.tick - 14, e.tick + 4]);
      }
      prevScore = e.score;
    }
    this.highlights = findHighlights(game);
  }

  get ticksPerSecond() {
    return 1 / this.game.dt;
  }
  get last() {
    return this.game.rec.n - 1;
  }
  get ended() {
    return this.cur >= this.last;
  }

  advance(realSeconds: number) {
    if (this.paused || this.ended) return;
    if (performance.now() < this.holdUntil) return;
    this.slowNow = this.speed <= 8 && this.slow.some(([a, b]) => this.cur >= a && this.cur <= b);
    const speed = this.slowNow ? Math.min(this.speed, 1) * 0.3 : this.speed;
    this.cur = Math.min(this.last, this.cur + realSeconds * this.ticksPerSecond * speed);
    this.applyMode();
  }

  /** 모드에 맞지 않는 구간이면 다음 볼 곳으로 건너뛴다 */
  applyMode() {
    if (this.mode === 'all' || this.ended) return;
    let to = this.cur;
    if (this.mode === 'highlights') {
      const seg = this.highlights.find(([, b]) => b >= this.cur);
      to = !seg ? this.last : seg[0] > this.cur ? seg[0] : this.cur;
    } else if (this.focusPid >= 0 && !this.lineupAt(this.cur).pids.includes(this.focusPid)) {
      const next = this.game.lineups.find((l) => l.tick > this.cur && l.pids.includes(this.focusPid));
      to = next ? next.tick : this.last;
    }
    if (to > this.cur + 1) {
      this.cur = to;
      this.cuts++;
    }
  }

  setMode(mode: PlayMode) {
    this.mode = mode;
    this.applyMode();
  }

  /** 하이라이트 몇 번째를 보는 중인지 (1부터, 구간 밖이면 0) */
  highlightIndex(): number {
    const i = this.highlights.findIndex(([a, b]) => this.cur >= a && this.cur <= b);
    return i + 1;
  }

  seek(tick: number) {
    this.cur = Math.max(0, Math.min(this.last, tick));
    this.applyMode();
  }

  /** 다음 쿼터 종료 시점으로 */
  skipQuarter() {
    const e = this.game.events.find((ev) => ev.type === 'quarterEnd' && ev.tick > this.cur + 1);
    this.seek(e ? e.tick + 1 : this.last);
  }

  sample(): Frame {
    const { rec } = this.game;
    const f = Math.floor(this.cur);
    const g = Math.min(rec.n - 1, f + 1);
    const a = this.cur - f;
    const out = this.frame;
    for (let i = 0; i < 20; i++) out.px[i] = rec.pos[f * 20 + i] * (1 - a) + rec.pos[g * 20 + i] * a;
    for (let i = 0; i < 3; i++) out.ball[i] = rec.ball[f * 3 + i] * (1 - a) + rec.ball[g * 3 + i] * a;
    out.clock = rec.clock[f];
    out.shotClock = rec.shotClock[f];
    out.quarter = rec.quarter[f];
    out.holder = rec.holder[f];
    for (let i = 0; i < 10; i++) {
      out.flags[i] = rec.flags[f * 10 + i];
      out.energy[i] = rec.energy[f * 10 + i];
    }
    return out;
  }

  /** 그 시점에 코트에 있던 선수들 */
  lineupAt(tick: number): Lineup {
    const ls = this.game.lineups;
    if (this.li >= ls.length || ls[this.li].tick > tick) this.li = 0;
    while (this.li + 1 < ls.length && ls[this.li + 1].tick <= tick) this.li++;
    return ls[this.li];
  }

  /** 선수가 그 시점에 몇 번 자리에 있었는지 (벤치면 -1) */
  slotOf(pid: number, tick: number): number {
    return this.lineupAt(tick).pids.indexOf(pid);
  }

  /** (from, to] 구간에 일어난 이벤트 */
  eventsBetween(from: number, to: number): GameEvent[] {
    const out: GameEvent[] = [];
    for (const e of this.game.events) {
      if (e.tick > to) break;
      if (e.tick > from) out.push(e);
    }
    return out;
  }

  scoreAt(tick: number): [number, number] {
    let s: [number, number] = [0, 0];
    for (const e of this.game.events) {
      if (e.tick > tick) break;
      s = e.score;
    }
    return s;
  }
}

const HL_BEFORE = 50;
const HL_AFTER = 18;

/** 멋진 장면과 막판 접전을 골라 구간으로 만든다 */
export function findHighlights(game: GameResult): [number, number][] {
  const segs: [number, number][] = [];
  let prev: [number, number] = [0, 0];
  for (const e of game.events) {
    const margin = Math.abs(prev[0] - prev[1]);
    const big =
      (e.type === 'made' && (e.pts === 3 || e.shot === 'dunk' || e.alleyOop || e.andOne || e.clock < 1)) ||
      (e.type === 'miss' && e.blocked) ||
      (e.type === 'turnover' && (e.tov === 'stolenPass' || e.tov === 'stolenDribble')) ||
      e.type === 'ankle' ||
      e.type === 'ejected';
    if (big) segs.push([e.tick - HL_BEFORE, e.tick + HL_AFTER]);
    // 4쿼터·연장 마지막 2분이 5점 차 이내면 통째로
    if (e.quarter >= 4 && e.clock <= 120 && margin <= 5 && (e.type === 'made' || e.type === 'miss' || e.type === 'ft' || e.type === 'turnover')) segs.push([e.tick - HL_BEFORE, e.tick + HL_AFTER]);
    if (e.type === 'gameEnd') segs.push([e.tick - 30, e.tick + 40]);
    prev = e.score;
  }
  segs.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  const last = game.rec.n - 1;
  for (const [a0, b0] of segs) {
    const a = Math.max(0, a0);
    const b = Math.min(last, b0);
    const top = out[out.length - 1];
    if (top && a <= top[1] + 20) top[1] = Math.max(top[1], b);
    else out.push([a, b]);
  }
  return out;
}
