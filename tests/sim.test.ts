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
  });

  it('점수와 박스스코어가 맞는다', () => {
    const g = game(3);
    const box = boxScore(g.events);
    expect(box.teams[0].pts).toBe(g.final[0]);
    expect(box.teams[1].pts).toBe(g.final[1]);
  });

  it('기록이 정상 범위 안에 있다', () => {
    const g = game(5);
    const { rec } = g;
    expect(rec.pos.length).toBe(rec.n * 20);
    expect(rec.pos.every((v) => Number.isFinite(v) && v > -3 && v < 31)).toBe(true);
    expect(rec.clock.every((v) => v >= 0 && v <= 600)).toBe(true);
    expect(rec.shotClock.every((v) => v >= 0 && v <= 24)).toBe(true);
    // 이벤트는 시간 순서
    expect(g.events.every((e, i) => i === 0 || e.tick >= g.events[i - 1].tick)).toBe(true);
  });
});

describe('밸런스 대략 확인 (E10)', () => {
  it('20경기 평균이 농구다운 범위', () => {
    let fga = 0;
    let fgm = 0;
    let tpa = 0;
    let tpm = 0;
    let tov = 0;
    let poss = 0;
    let passes = 0;
    let inter = 0;
    let pts = 0;
    const N = 20;
    for (let s = 0; s < N; s++) {
      const g = game(100 + s);
      const box = boxScore(g.events);
      for (const t of box.teams) {
        fga += t.fga;
        fgm += t.fgm;
        tpa += t.tpa;
        tpm += t.tpm;
        tov += t.tov;
        pts += t.pts;
      }
      poss += g.counters.possessions[0] + g.counters.possessions[1];
      passes += g.counters.passes;
      inter += g.counters.intercepts;
    }
    const TG = N * 2;
    expect(fgm / fga).toBeGreaterThan(0.38);
    expect(fgm / fga).toBeLessThan(0.55);
    expect(tpm / tpa).toBeGreaterThan(0.28);
    expect(tpm / tpa).toBeLessThan(0.46);
    expect(tov / TG).toBeGreaterThan(7);
    expect(tov / TG).toBeLessThan(22);
    expect(poss / TG).toBeGreaterThan(60);
    expect(poss / TG).toBeLessThan(90);
    expect(pts / TG).toBeGreaterThan(55);
    expect(pts / TG).toBeLessThan(100);
    expect(inter / passes).toBeLessThan(0.04);
  });
});
