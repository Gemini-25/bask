import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { winProb, winProbSeries } from '../src/sim/winprob';
import { Playback } from '../src/view/playback';

function game(seed: number) {
  const rng = new Rng(seed);
  const a = generateTeam(rng.fork(1), TEAM_INFOS[seed % 10]);
  const b = generateTeam(rng.fork(2), TEAM_INFOS[(seed + 3) % 10]);
  return simulateGame(a, b, seed);
}

const g = game(21);

describe('재생 모드 (V5)', () => {
  it('하이라이트 구간은 정렬되어 있고 겹치지 않는다', () => {
    const pb = new Playback(g);
    expect(pb.highlights.length).toBeGreaterThan(10);
    for (let i = 0; i < pb.highlights.length; i++) {
      const [a, b] = pb.highlights[i];
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(pb.last);
      expect(a).toBeLessThan(b);
      if (i) expect(a).toBeGreaterThan(pb.highlights[i - 1][1]);
    }
  });

  it('하이라이트 모드는 구간 안에서만 재생한다', () => {
    const pb = new Playback(g);
    pb.speed = 16;
    pb.setMode('highlights');
    let bad = 0;
    while (!pb.ended) {
      pb.advance(0.05);
      if (!pb.ended && !pb.highlights.some(([a, b]) => pb.cur >= a && pb.cur <= b + 1)) bad++;
    }
    expect(bad).toBe(0);
    expect(pb.cuts).toBeGreaterThan(5);
  });

  it('고른 선수만 모드는 그 선수가 코트에 있을 때만 재생한다', () => {
    const pb = new Playback(g);
    // 벤치 선수 중 출전한 선수를 고른다
    const pid = g.lineups.at(-1)!.pids.find((p) => !g.lineups[0].pids.includes(p)) ?? 6;
    pb.focusPid = pid;
    pb.speed = 16;
    pb.setMode('focus');
    let bad = 0;
    while (!pb.ended) {
      pb.advance(0.05);
      if (!pb.ended && !pb.lineupAt(Math.floor(pb.cur)).pids.includes(pid)) bad++;
    }
    expect(bad).toBe(0);
  });
});

describe('승리 확률 (V7)', () => {
  it('점수 차와 남은 시간에 따라 움직인다', () => {
    expect(winProb(0, 2400, 0)).toBeCloseTo(0.5, 2);
    expect(winProb(10, 60, 0)).toBeGreaterThan(0.98);
    expect(winProb(-3, 30, 0)).toBeLessThan(0.2);
    expect(winProb(5, 2000, 0)).toBeLessThan(winProb(5, 200, 0));
  });

  it('경기 내내 0~1이고 끝에서 승자 쪽으로 정해진다', () => {
    const s = winProbSeries(g);
    expect(s.every((p) => p.p >= 0 && p.p <= 1)).toBe(true);
    expect(s.every((p, i) => i === 0 || p.t >= s[i - 1].t)).toBe(true);
    expect(s.at(-1)!.p).toBe(g.final[0] > g.final[1] ? 1 : 0);
  });
});
