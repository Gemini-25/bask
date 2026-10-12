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

  constructor(public game: GameResult) {}

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
    this.cur = Math.min(this.last, this.cur + realSeconds * this.ticksPerSecond * this.speed);
  }

  seek(tick: number) {
    this.cur = Math.max(0, Math.min(this.last, tick));
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
