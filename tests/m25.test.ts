import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { DRIBBLES } from '../src/data/dribbles';
import { SHOT_MOVES } from '../src/data/moves';
import type { RatingKey } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { hoopXY } from '../src/sim/court';
import { simulateGame } from '../src/sim/engine';
import { ACT, DRIBBLE_MOVES, type GameResult } from '../src/sim/types';
import { ANIMS, poseAt } from '../src/view/anims';

function games(n: number, setup?: (a: ReturnType<typeof generateTeam>) => void, base = 0) {
  const out: GameResult[] = [];
  for (let g = 0; g < n; g++) {
    const a = generateTeam(new Rng(1300 + g + base), TEAM_INFOS[g % 10], 1);
    const b = generateTeam(new Rng(1400 + g + base), TEAM_INFOS[(g + 3) % 10], 1);
    setup?.(a);
    out.push(simulateGame(a, b, 700 + g + base));
  }
  return out;
}
const slotOf = (g: GameResult, pid: number, tick: number) => {
  let lu = g.lineups[0];
  for (const l of g.lineups) if (l.tick <= tick) lu = l;
  return lu.pids.indexOf(pid);
};
const actsAround = (g: GameResult, slot: number, t0: number, t1: number) => [...Array(t1 - t0)].map((_, k) => g.rec.act[(t0 + k) * 10 + slot]);

describe('드리블·동작이 엔진에서 수비를 제친다 (M25)', () => {
  const gs = games(5);
  const dr = gs.flatMap((g) => g.events.filter((e) => (e.type === 'dribble' || e.type === 'ankle') && e.dmove).map((e) => ({ g, e })));

  it('드리블 기술 12가지 모두 정의, 경기에 나오고 수비가 단계별로 당한다', () => {
    expect(DRIBBLES.length).toBe(DRIBBLE_MOVES.length);
    for (const m of DRIBBLES) expect(ANIMS[m.act]).toBeTruthy();
    expect(dr.length).toBeGreaterThan(60);
    // 한 발 늦음 → 반대로 쏠리는 동작, 휘청 → 비틀, 주저앉음 → 엉덩방아
    let ok = 0;
    for (const { g, e } of dr) {
      const s = slotOf(g, e.other, e.tick);
      if (s < 0) continue;
      const want = e.stage === 3 ? ACT.ANKLE : e.stage === 2 ? ACT.STUN : ACT.BEATEN;
      if (actsAround(g, s, e.tick, e.tick + 3).includes(want)) ok++;
    }
    expect(ok / dr.length).toBeGreaterThan(0.85);
  });

  it('크게 꺾는 기술 (크로스오버·킬러)은 실제로 옆으로 방향을 바꾼다', () => {
    let n = 0;
    let lat = 0;
    for (const { g, e } of dr) {
      if (e.dmove !== ACT.CROSSOVER && e.dmove !== ACT.KILLER) continue;
      const s = slotOf(g, e.player, e.tick);
      if (s < 0) continue;
      const p0 = { x: g.rec.pos[(e.tick - 2) * 20 + s * 2], y: g.rec.pos[(e.tick - 2) * 20 + s * 2 + 1] };
      const p1 = { x: g.rec.pos[(e.tick + 4) * 20 + s * 2], y: g.rec.pos[(e.tick + 4) * 20 + s * 2 + 1] };
      const H = [hoopXY(true), hoopXY(false)].sort((a, b) => Math.hypot(a.x - p0.x, a.y - p0.y) - Math.hypot(b.x - p0.x, b.y - p0.y))[0];
      const fx = H.x - p0.x;
      const fy = H.y - p0.y;
      const fl = Math.hypot(fx, fy) || 1;
      lat += Math.abs(((p1.x - p0.x) * -fy + (p1.y - p0.y) * fx) / fl);
      n++;
    }
    expect(n).toBeGreaterThan(5);
    expect(lat / n).toBeGreaterThan(0.6);
  });

  it('볼핸들링이 좋을수록 기술을 자주 쓰고 더 잘 제친다 (앵클 브레이커는 거의 잘하는 선수)', { timeout: 120000 }, () => {
    const run = (v: number) => {
      const keys: RatingKey[] = ['ballHandling', 'agility', 'sense'];
      let beats = 0;
      let moves = 0;
      let ankles = 0;
      for (const g of games(6, (a) => a.players.forEach((p) => keys.forEach((k) => (p.r[k] = v))), 50)) {
        for (const e of g.events) {
          if (e.team !== 0 || !e.dmove) continue;
          if (e.type === 'dribble' || e.type === 'ankle') beats++;
          if (e.type === 'ankle') ankles++;
        }
        moves += g.counters.moves ?? 0;
      }
      return { beats, moves, ankles };
    };
    const hi = run(90);
    const lo = run(45);
    expect(hi.beats).toBeGreaterThan(lo.beats * 4);
    expect(hi.ankles).toBeGreaterThan(lo.ankles);
  });

  it('슛 동작도 수비를 제친다: 펌프 페이크에 수비가 뜨고, 컨택트에 밀려나고, 유로스텝·스텝백에 한 발 늦는다', () => {
    const beats = SHOT_MOVES.filter((m) => m.beat);
    expect(beats.length).toBeGreaterThanOrEqual(13);
    const seen = new Set<number>();
    for (const g of gs)
      for (const e of g.events) {
        if ((e.type !== 'made' && e.type !== 'miss') || !e.move) continue;
        const def = e.def ?? -1;
        if (def < 0) continue;
        const s = slotOf(g, def, e.tick);
        if (s < 0) continue;
        const acts = actsAround(g, s, e.tick - 12, e.tick + 1);
        for (const a of [ACT.SHOVED, ACT.BEATEN, ACT.CONTEST]) if (acts.includes(a)) seen.add(a);
      }
    expect(seen.has(ACT.BEATEN)).toBe(true);
    expect(seen.has(ACT.CONTEST)).toBe(true);
  });

  it('걸음: 보폭 주기에 맞춰 발을 디디고 (미끄러지지 않게), 속도에 따라 걷기·달리기·질주, 수비는 사이드 스텝', () => {
    const at = (phase: number, speed: number, act: number = ACT.IDLE) => poseAt(act, { time: 0, seed: 0, speed, phase });
    // 같은 시각이라도 보폭 주기가 다르면 다른 발
    expect(at(0, 4).lF[0]).not.toBeCloseTo(at(0.5, 4).lF[0], 0);
    // 질주는 무릎을 더 높이 든다, 앞으로 더 기운다
    expect(Math.abs(at(0.75, 7).lF[1])).toBeGreaterThan(Math.abs(at(0.75, 1.5).lF[1]) + 30);
    expect(at(0, 7).lean).toBeGreaterThan(at(0, 1.5).lean);
    // 사이드 스텝은 다리를 벌렸다 모은다
    expect(at(0, 2, ACT.SLIDE).ws).not.toBeCloseTo(at(0.25, 2, ACT.SLIDE).ws, 0);
    // 급정지는 몸을 뒤로 젖힌다
    expect(poseAt(ACT.IDLE, { time: 0, seed: 0, speed: 4, phase: 0, accel: -12 }).lean).toBeLessThan(0);
  });
});
