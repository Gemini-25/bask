import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { missBounce, predictCatch, stepBall, type BallBody, type Hits, type MissKind } from '../src/sim/ball';
import { COURT, hoopXY } from '../src/sim/court';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';
import { ACT, type GameResult } from '../src/sim/types';
import { ANIMS } from '../src/view/anims';

function games(n: number, setup?: (a: ReturnType<typeof generateTeam>, b: ReturnType<typeof generateTeam>) => void, base = 0) {
  const out: GameResult[] = [];
  for (let g = 0; g < n; g++) {
    const a = generateTeam(new Rng(2600 + g + base), TEAM_INFOS[g % 10], 1);
    const b = generateTeam(new Rng(2700 + g + base), TEAM_INFOS[(g + 5) % 10], 1);
    setup?.(a, b);
    out.push(simulateGame(a, b, 800 + g + base));
  }
  return out;
}
const hits = (): Hits => ({ rim: 0, board: 0, floor: 0, hard: 0 });
const H = hoopXY(false);
const near = (x: number, y: number) => Math.min(...[hoopXY(true), hoopXY(false)].map((h) => Math.hypot(h.x - x, h.y - y)));
const slotOf = (g: GameResult, pid: number, tick: number) => {
  let lu = g.lineups[0];
  for (const l of g.lineups) if (l.tick <= tick) lu = l;
  return lu.pids.indexOf(pid);
};

/** 공이 2.4m 높이 아래로 처음 내려온 자리까지 림에서 거리 */
function landDist(kind: MissKind, dist: number, seed: number) {
  const r = new Rng(seed);
  const b = missBounce(kind, H, { x: -1, y: 0 }, dist, () => r.next());
  for (let t = 0; t < 4; t += 0.02) {
    stepBall(b, 0.02, true, hits(), 2);
    if (b.vz < 0 && b.z < 2.4) break;
  }
  return Math.hypot(b.x - H.x, b.y - H.y);
}

describe('공 물리·리바운드 (M26)', () => {
  const gs = games(5);

  it('공은 중력으로 떨어지고, 림·백보드에 맞으면 튀고, 바닥에서 튀다가 구른다', () => {
    // 림 앞쪽 고리 위로 떨어뜨리면 튄다
    const b: BallBody = { x: H.x + 0.23, y: H.y, z: COURT.rimHeight + 0.6, vx: 0, vy: 0, vz: 0 };
    const h = hits();
    for (let k = 0; k < 15; k++) stepBall(b, 0.1, true, h);
    expect(h.rim).toBeGreaterThan(0);
    // 백보드를 향해 던지면 되튀어 나온다
    const bb: BallBody = { x: H.x + 1.5, y: H.y + 0.5, z: 3.4, vx: -6, vy: 0, vz: 0.6 };
    const hb = hits();
    for (let k = 0; k < 8; k++) stepBall(bb, 0.1, true, hb);
    expect(hb.board).toBeGreaterThan(0);
    expect(bb.vx).toBeGreaterThan(0);
    // 바닥: 튈 때마다 낮아지다가 구르고 멈춘다
    const f: BallBody = { x: 14, y: 7.5, z: 2, vx: 2, vy: 0, vz: 0 };
    const hf = hits();
    let peak2 = 0;
    for (let k = 0; k < 120; k++) {
      stepBall(f, 0.1, true, hf);
      if (hf.floor >= 1 && hf.floor < 2) peak2 = Math.max(peak2, f.z);
    }
    expect(hf.floor).toBeGreaterThan(1);
    expect(peak2).toBeLessThan(2);
    expect(f.z).toBeCloseTo(0.12, 2);
    expect(Math.abs(f.vx)).toBeLessThan(0.3);
  });

  it('빗나간 공은 림 안으로 떨어지지 않는다, 먼 슛일수록 멀리 튄다', () => {
    for (let s = 0; s < 40; s++) {
      const b: BallBody = { x: H.x + (s % 5) * 0.02 - 0.04, y: H.y + 0.03, z: COURT.rimHeight + 0.5, vx: 0, vy: 0, vz: -1 };
      for (let k = 0; k < 10; k++) stepBall(b, 0.1, true, hits());
      // 고리 아래로 통과했다면 림 바로 밑에 있을 것
      expect(Math.hypot(b.x - H.x, b.y - H.y) > 0.2 || b.z > COURT.rimHeight).toBe(true);
    }
    const avg = (k: MissKind, d: number) => [...Array(30)].reduce((a, _, i) => a + landDist(k, d, i + 1), 0) / 30;
    expect(avg('front', 7.2)).toBeGreaterThan(avg('front', 1.2) + 0.7);
    // 공이 떨어질 자리 예측 (선수들이 간다)
    const r = new Rng(3);
    const b = missBounce('front', H, { x: -1, y: 0 }, 7, () => r.next());
    const c = predictCatch(b, true);
    expect(c.t).toBeGreaterThan(0.1);
    expect(Math.hypot(c.x - H.x, c.y - H.y)).toBeGreaterThan(0.5);
  });

  it('경기: 빗나간 슛마다 어디 맞았는지, 림 소리, 먼 슛의 리바운드는 멀리서', () => {
    let miss = 0;
    let kinds = 0;
    const far: number[] = [];
    const close: number[] = [];
    let bounces = 0;
    for (const g of gs) {
      for (let i = 0; i < g.events.length; i++) {
        const e = g.events[i];
        if (e.type === 'bounce') bounces++;
        if (e.type !== 'miss' || e.blocked) continue;
        miss++;
        if (e.missKind) kinds++;
        const nx = g.events.slice(i + 1, i + 8).find((x) => x.type === 'rebound');
        if (!nx) continue;
        const b = (nx.tick - 1) * 3;
        const d = near(g.rec.ball[b], g.rec.ball[b + 1]);
        if (e.shot === 'three') far.push(d);
        if (e.shot === 'layup' || e.shot === 'dunk') close.push(d);
      }
    }
    expect(kinds).toBe(miss);
    expect(bounces).toBeGreaterThan(miss * 0.8);
    const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    expect(avg(far)).toBeGreaterThan(avg(close) + 0.4);
  });

  it('리바운드는 손이 닿는 선수가 잡는다 (공 옆에 있다), 리바운드·박스아웃이 좋으면 더 잡는다', () => {
    let ok = 0;
    let n = 0;
    for (const g of gs)
      for (const e of g.events) {
        if (e.type !== 'rebound') continue;
        const s = slotOf(g, e.player, e.tick);
        if (s < 0) continue;
        const b = (e.tick - 1) * 3;
        const px = g.rec.pos[e.tick * 20 + s * 2];
        const py = g.rec.pos[e.tick * 20 + s * 2 + 1];
        n++;
        if (Math.hypot(px - g.rec.ball[b], py - g.rec.ball[b + 1]) < 1.6) ok++;
      }
    expect(ok / n).toBeGreaterThan(0.9);
    // 수비 리바운드·박스아웃을 올리면 상대 공격 리바운드가 준다
    const orb = (v: number) => {
      let o = 0;
      let d = 0;
      for (const g of games(6, (a) => a.players.forEach((p) => ((p.r.defReb = v), (p.r.boxOut = v))), 30)) {
        const bx = boxScore(g);
        o += bx.teams[1].oreb;
        d += bx.teams[0].dreb;
      }
      return o / (o + d);
    };
    expect(orb(90)).toBeLessThan(orb(35) - 0.04);
  });

  it('팁인·탭아웃·다이빙: 공중에서 건드려 넣고, 바닥 공에는 몸을 던진다', () => {
    expect(ANIMS[ACT.TIPIN]).toBeTruthy();
    expect(ANIMS[ACT.DIVE]).toBeTruthy();
    // 팁인은 드물다 (팀당 경기 0.2개쯤)
    const more = [...gs, ...games(11, undefined, 60)];
    const tips = more.flatMap((g) => g.events.filter((e) => (e.type === 'made' || e.type === 'miss') && e.move === 'tipIn'));
    expect(tips.length).toBeGreaterThanOrEqual(2);
    let dive = 0;
    for (const g of more) for (let k = 0; k < g.rec.act.length; k++) if (g.rec.act[k] === ACT.DIVE) dive++;
    expect(dive).toBeGreaterThan(0);
  });

  it('패스: 공이 지나가는 길에 손이 닿아야 끊는다 (가로챈 선수는 공 근처), 놓친 패스는 루즈볼', () => {
    let n = 0;
    let ok = 0;
    let fumbles = 0;
    for (const g of gs)
      for (let i = 0; i < g.events.length; i++) {
        const e = g.events[i];
        if (e.type === 'loose' && e.fumble) fumbles++;
        if (e.type !== 'turnover' || e.tov !== 'stolenPass' || e.other < 0) continue;
        // 쳐낸 공을 나중에 잡은 스틸은 빼고, 날아가는 패스를 바로 잡은 것만
        if (g.events[i - 1]?.type === 'loose') continue;
        const s = slotOf(g, e.other, e.tick);
        if (s < 0) continue;
        // 가로챈 선수와 날아오던 공의 길 (직전 두 틱의 공 자리를 이은 선) 사이 거리
        const a = (e.tick - 2) * 3;
        const b = (e.tick - 1) * 3;
        const dx = g.rec.ball[b] - g.rec.ball[a];
        const dy = g.rec.ball[b + 1] - g.rec.ball[a + 1];
        const len = Math.hypot(dx, dy);
        if (len < 0.2) continue;
        const px = g.rec.pos[(e.tick - 1) * 20 + s * 2] - g.rec.ball[b];
        const py = g.rec.pos[(e.tick - 1) * 20 + s * 2 + 1] - g.rec.ball[b + 1];
        n++;
        if (Math.abs(px * dy - py * dx) / len < 1.2) ok++;
      }
    expect(n).toBeGreaterThan(20);
    expect(ok / n).toBeGreaterThan(0.85);
    expect(fumbles).toBeGreaterThan(0);
  });
});
