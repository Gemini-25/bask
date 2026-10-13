import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { hoopXY } from '../src/sim/court';
import { simulateGame } from '../src/sim/engine';
import { ACT, type GameResult } from '../src/sim/types';
import { ANIMS } from '../src/view/anims';

type T = ReturnType<typeof generateTeam>;
function games(n: number, setup?: (a: T, b: T) => void, base = 0) {
  const out: GameResult[] = [];
  for (let g = 0; g < n; g++) {
    const a = generateTeam(new Rng(2900 + g + base), TEAM_INFOS[g % 10], 1);
    const b = generateTeam(new Rng(2950 + g + base), TEAM_INFOS[(g + 3) % 10], 1);
    setup?.(a, b);
    out.push(simulateGame(a, b, 900 + g + base));
  }
  return out;
}
const slotOf = (g: GameResult, pid: number, tick: number) => {
  let lu = g.lineups[0];
  for (const l of g.lineups) if (l.tick <= tick) lu = l;
  return lu.pids.indexOf(pid);
};
const posOf = (g: GameResult, pid: number, tick: number) => {
  const s = slotOf(g, pid, tick);
  return s < 0 ? null : { x: g.rec.pos[tick * 20 + s * 2], y: g.rec.pos[tick * 20 + s * 2 + 1] };
};

describe('몸싸움·접촉 (M27)', () => {
  const gs = games(5);

  it('몸은 겹치지 않는다 (서로 밀어낸다)', () => {
    let close = 0;
    let n = 0;
    for (const g of gs.slice(0, 2)) {
      const ticks = g.rec.pos.length / 20;
      for (let t = 0; t < ticks; t += 3) {
        for (let a = 0; a < 10; a++)
          for (let b = a + 1; b < 10; b++) {
            const d = Math.hypot(g.rec.pos[t * 20 + a * 2] - g.rec.pos[t * 20 + b * 2], g.rec.pos[t * 20 + a * 2 + 1] - g.rec.pos[t * 20 + b * 2 + 1]);
            n++;
            if (d < 0.4) close++;
          }
      }
    }
    expect(close / n).toBeLessThan(0.002);
  });

  it('돌파·포스트 몸싸움: 무겁고 힘센 쪽이 이긴다', { timeout: 120000 }, () => {
    const won = (strong: boolean) => {
      let w = 0;
      let l = 0;
      const set = (t: T, hi: boolean) =>
        t.players.forEach((p) => {
          p.r.strength = hi ? 95 : 35;
          p.body = { ...p.body, weightKg: p.body.weightKg + (hi ? 18 : -12) };
        });
      for (const g of games(6, (a, b) => (set(a, strong), set(b, !strong)), 40))
        for (const e of g.events) {
          if (e.type !== 'contact') continue;
          if (e.team === 0) w++;
          else l++;
        }
      return w / Math.max(1, w + l);
    };
    expect(won(true)).toBeGreaterThan(won(false) + 0.2);
  });

  it('포스트업: 등지고 밀어붙이면 골대로 다가가고, 수비는 버티는 자세', () => {
    expect(ANIMS[ACT.POSTD]).toBeTruthy();
    expect(ANIMS[ACT.BUMP]).toBeTruthy();
    let postd = 0;
    for (const g of gs) for (let k = 0; k < g.rec.act.length; k++) if (g.rec.act[k] === ACT.POSTD) postd++;
    expect(postd).toBeGreaterThan(20);
    const bd = gs.flatMap((g) => g.events.filter((e) => e.type === 'contact' && e.contact === 'backdown'));
    expect(bd.length).toBeGreaterThan(2);
  });

  it('스크린은 몸이 부딪혀 걸린다 (수비가 스크리너 바로 옆), 차징은 자리를 잡은 수비가 제한 구역 밖에서', () => {
    let n = 0;
    let ok = 0;
    for (const g of gs)
      for (const e of g.events) {
        if (e.type !== 'screen' || e.switched) continue;
        const s = posOf(g, e.player, e.tick);
        const d = posOf(g, e.other, e.tick);
        if (!s || !d) continue;
        n++;
        if (Math.hypot(s.x - d.x, s.y - d.y) < 1.2) ok++;
      }
    expect(n).toBeGreaterThan(20);
    expect(ok / n).toBeGreaterThan(0.85);
    const charges = [...gs, ...games(8, undefined, 70)].flatMap((g) => g.events.filter((e) => e.type === 'foul' && e.foul === 'charge').map((e) => ({ g, e })));
    expect(charges.length).toBeGreaterThan(2);
    for (const { g, e } of charges) {
      const d = posOf(g, e.other, e.tick);
      if (!d) continue;
      const rim = Math.min(...[hoopXY(true), hoopXY(false)].map((h) => Math.hypot(h.x - d.x, h.y - d.y)));
      expect(rim).toBeGreaterThan(1.0);
    }
  });
});
