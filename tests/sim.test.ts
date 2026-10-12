import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';

function game(seed: number) {
  const rng = new Rng(seed);
  const a = generateTeam(rng.fork(1), TEAM_INFOS[seed % 10]);
  const b = generateTeam(rng.fork(2), TEAM_INFOS[(seed + 3) % 10]);
  return simulateGame(a, b, seed);
}

describe('경기 시뮬레이션', () => {
  it('끝까지 진행되고 승자가 있다', () => {
    const g = game(7);
    expect(g.events.at(-1)?.type).toBe('gameEnd');
    expect(g.final[0]).not.toBe(g.final[1]);
    expect(g.quarters).toBeGreaterThanOrEqual(4);
  });

  it('같은 시드면 같은 경기 (E9)', () => {
    const a = game(11);
    const b = game(11);
    expect(a.final).toEqual(b.final);
    expect(a.events.length).toBe(b.events.length);
    expect(a.rec.n).toBe(b.rec.n);
    expect(a.rec.pos[5000]).toBe(b.rec.pos[5000]);
    expect(a.lineups.length).toBe(b.lineups.length);
  });

  it('점수와 박스스코어가 맞는다 (자유투 포함)', () => {
    const g = game(3);
    const box = boxScore(g);
    expect(box.teams[0].pts).toBe(g.final[0]);
    expect(box.teams[1].pts).toBe(g.final[1]);
    const p0 = box.teams[0];
    expect(p0.pts).toBe((p0.fgm - p0.tpm) * 2 + p0.tpm * 3 + p0.ftm);
  });

  it('기록이 정상 범위 안에 있다', () => {
    const g = game(5);
    const { rec } = g;
    expect(rec.pos.length).toBe(rec.n * 20);
    expect(rec.pos.every((v) => Number.isFinite(v) && v > -3 && v < 31)).toBe(true);
    expect(rec.clock.every((v) => v >= 0 && v <= 600)).toBe(true);
    expect(rec.shotClock.every((v) => v >= 0 && v <= 24)).toBe(true);
    expect(rec.energy.every((v) => v <= 100)).toBe(true);
    // 이벤트와 출전 기록은 시간 순서
    expect(g.events.every((e, i) => i === 0 || e.tick >= g.events[i - 1].tick)).toBe(true);
    expect(g.lineups.every((l, i) => i === 0 || l.tick >= g.lineups[i - 1].tick)).toBe(true);
  });

  it('교체: 코트에는 항상 팀별로 다른 선수 5명, 출전 시간 합은 경기 시간 × 5', () => {
    const g = game(9);
    for (const l of g.lineups) {
      expect(new Set(l.pids).size).toBe(10);
      for (let i = 0; i < 10; i++) expect(g.teamOf[l.pids[i]]).toBe(i < 5 ? 0 : 1);
    }
    expect(g.lineups.length).toBeGreaterThan(10);
    const box = boxScore(g);
    const total = g.rec.elapsed[g.rec.n - 1];
    expect(box.teams[0].sec).toBeCloseTo(total * 5, 0);
    expect(box.teams[1].sec).toBeCloseTo(total * 5, 0);
  });

  it('파울과 자유투: 슈팅 파울이면 자유투, 5반칙이면 퇴장 후 다시 안 뛴다', () => {
    for (const seed of [21, 22, 23]) {
      const g = game(seed);
      const fouls = g.events.filter((e) => e.type === 'foul');
      expect(fouls.length).toBeGreaterThan(15);
      expect(g.events.some((e) => e.type === 'ft')).toBe(true);
      for (const e of g.events.filter((x) => x.type === 'ejected')) {
        const later = g.lineups.filter((l) => l.tick > e.tick + 1);
        expect(later.every((l) => !l.pids.includes(e.player))).toBe(true);
      }
    }
  });
});

describe('밸런스 대략 확인 (E10)', () => {
  it('20경기 평균이 농구다운 범위', () => {
    const sum = { fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0, tov: 0, pts: 0, pf: 0 };
    let poss = 0;
    let passes = 0;
    let inter = 0;
    const N = 20;
    for (let s = 0; s < N; s++) {
      const g = game(100 + s);
      const box = boxScore(g);
      for (const t of box.teams) for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += t[k];
      poss += g.counters.possessions[0] + g.counters.possessions[1];
      passes += g.counters.passes;
      inter += g.counters.intercepts;
    }
    const TG = N * 2;
    expect(sum.fgm / sum.fga).toBeGreaterThan(0.4);
    expect(sum.fgm / sum.fga).toBeLessThan(0.55);
    expect(sum.tpm / sum.tpa).toBeGreaterThan(0.28);
    expect(sum.tpm / sum.tpa).toBeLessThan(0.45);
    expect(sum.ftm / sum.fta).toBeGreaterThan(0.65);
    expect(sum.ftm / sum.fta).toBeLessThan(0.88);
    expect(sum.fta / TG).toBeGreaterThan(10);
    expect(sum.fta / TG).toBeLessThan(30);
    expect(sum.pf / TG).toBeGreaterThan(12);
    expect(sum.pf / TG).toBeLessThan(26);
    expect(sum.tov / TG).toBeGreaterThan(8);
    expect(sum.tov / TG).toBeLessThan(20);
    expect(poss / TG).toBeGreaterThan(62);
    expect(poss / TG).toBeLessThan(88);
    expect(sum.pts / TG).toBeGreaterThan(65);
    expect(sum.pts / TG).toBeLessThan(100);
    expect(inter / passes).toBeLessThan(0.04);
  });
});
