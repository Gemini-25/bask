import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { generatePlayer } from '../src/data/player';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { tendencyOf } from '../src/sim/tendency';
import type { GameResult } from '../src/sim/types';

function games(n: number, base = 0) {
  const out: GameResult[] = [];
  for (let g = 0; g < n; g++) {
    const rng = new Rng(3100 + g + base);
    const ia = g % 10;
    const ib = (g + 3) % 10;
    out.push(simulateGame(generateTeam(rng.fork(1), TEAM_INFOS[ia]), generateTeam(rng.fork(2), TEAM_INFOS[ib]), 1100 + g + base));
  }
  return out;
}

describe('판단 AI·감독 조정 (M28)', () => {
  const gs = games(12);

  it('성향: 능력치 안에서 두드러진 쪽 (3점 슈터·림 어택·포스트·패스), 고르면 성향 없음', () => {
    const p = generatePlayer(new Rng(1), 'SG', 0, 5);
    for (const k of Object.keys(p.r) as (keyof typeof p.r)[]) p.r[k] = 55;
    expect(tendencyOf(p).labels.length).toBeLessThanOrEqual(1);
    p.r.three = 90;
    const sh = tendencyOf(p);
    expect(sh.three).toBeGreaterThan(0.5);
    expect(sh.labels[0]).toBe('3점 슈터');
    p.r.three = 55;
    p.r.passing = 90;
    p.r.vision = 90;
    expect(tendencyOf(p).labels).toContain('패스 우선');
  });

  it('감독 조정이 경기 중에 나온다: 집중 견제는 그때 상대 최다 득점 선수', () => {
    const adj = gs.flatMap((g) => g.events.filter((e) => e.type === 'adjust').map((e) => ({ g, e })));
    const kinds = new Set(adj.map((a) => a.e.adj));
    for (const k of ['focus', 'late', 'mismatch'] as const) expect(kinds.has(k), k).toBe(true);
    expect(kinds.size).toBeGreaterThanOrEqual(5);
    let n = 0;
    for (const { g, e } of adj) {
      if (e.adj !== 'focus') continue;
      const pts = new Map<number, number>();
      for (const x of g.events) {
        if (x.tick > e.tick) break;
        if (x.type === 'made') pts.set(x.player, (pts.get(x.player) ?? 0) + x.pts);
        if (x.type === 'ft' && x.made) pts.set(x.player, (pts.get(x.player) ?? 0) + 1);
      }
      const opp = 1 - e.team;
      // 감독은 코트 위 선수 중에서 고른다
      let lu = g.lineups[0];
      for (const l of g.lineups) if (l.tick <= e.tick) lu = l;
      const on = new Set(lu.pids);
      const top = Math.max(...[...pts].filter(([pid]) => g.teamOf[pid] === opp && on.has(pid)).map(([, v]) => v));
      expect(g.teamOf[e.player]).toBe(opp);
      expect(pts.get(e.player)).toBe(top);
      n++;
    }
    expect(n).toBeGreaterThan(3);
  });

  it('막판: 쿼터 마지막 공격은 시간을 끌다가 마지막 몇 초에 쏜다', () => {
    const last: number[] = [];
    for (const g of gs)
      for (const e of g.events) {
        if ((e.type !== 'made' && e.type !== 'miss') || e.clock >= 24 || e.clock <= 0) continue;
        const nxt = g.events.find((x) => x.tick > e.tick && (x.type === 'made' || x.type === 'miss' || x.type === 'quarterEnd'));
        if (nxt?.type === 'quarterEnd') last.push(e.clock);
      }
    expect(last.length).toBeGreaterThan(15);
    expect(last.filter((c) => c <= 4).length / last.length).toBeGreaterThan(0.4);
  });

  it('수비 읽기: 달려드는 수비를 보고 치고 나가고, 도움 수비가 오면 빼 준다', () => {
    const reads = gs.flatMap((g) => g.events.filter((e) => e.type === 'read'));
    expect(reads.some((e) => e.read === 'closeout')).toBe(true);
    expect(reads.some((e) => e.read === 'kick' || e.read === 'dump')).toBe(true);
  });
});
