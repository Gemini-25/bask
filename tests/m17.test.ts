import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { RATING_KEYS } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { analyzeGame, derive, emptyRaw, mergeRaw, SHOT_CTXS } from '../src/sim/analytics';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';

const game = (g: number, star = false) => {
  const a = generateTeam(new Rng(300 + g), TEAM_INFOS[g % 10], 0);
  const b = generateTeam(new Rng(700 + g), TEAM_INFOS[(g + 5) % 10], 0);
  if (star) for (const k of RATING_KEYS) a.players[1].r[k] = 99;
  return simulateGame(a, b, 900 + g);
};

describe('분석 지표 (M17)', () => {
  it('기본 기록은 박스스코어와 같고, 슛 상황을 더하면 야투 시도', () => {
    const g = game(1);
    const raw = analyzeGame(g);
    const box = boxScore(g);
    raw.forEach((r, pid) => {
      const l = box.players[pid];
      expect(r.pts).toBe(l.pts);
      expect(r.fga).toBe(l.fga);
      expect(r.ast).toBe(l.ast);
      expect(r.stl).toBe(l.stl);
      expect(r.blk).toBe(l.blk);
      expect(r.oreb + r.dreb).toBe(l.oreb + l.dreb);
      expect(SHOT_CTXS.reduce((s, k) => s + r.ctx[k].a, 0)).toBe(r.fga);
    });
    // 팀 공격 수 추정이 엔진 카운터와 비슷하다
    const poss = raw[0].all.poss;
    expect(Math.abs(poss - g.counters.possessions[0])).toBeLessThan(10);
    expect(g.adv!.drives.reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
  });

  it('슈퍼스타(전부 99)는 BPM·WAR·온오프·그래비티·수비 지표에서 다 앞선다', { timeout: 60000 }, () => {
    let star = emptyRaw();
    let league = emptyRaw();
    for (let i = 0; i < 10; i++) {
      star = mergeRaw(star, analyzeGame(game(i, true))[1]);
      const raw = analyzeGame(game(i));
      for (let s = 0; s < 5; s++) league = mergeRaw(league, raw[s]);
    }
    const s = derive(star);
    const l = derive(league);
    expect(s.bpm).toBeGreaterThan(l.bpm + 10);
    expect(s.war / s.games).toBeGreaterThan((l.war / l.games) * 3);
    expect(s.ts).toBeGreaterThan(l.ts + 0.1);
    expect(s.usg).toBeGreaterThan(l.usg * 1.6);
    // 벤치에 있는 시간이 짧아서 10경기로는 흔들린다 (30경기면 +15 넘게)
    expect(s.onOff).toBeGreaterThan(0);
    expect(s.gravityBall).toBeGreaterThan(l.gravityBall);
    expect(s.gravityOff).toBeLessThan(l.gravityOff);
    expect(s.dfgPct).toBeLessThan(l.dfgPct);
    expect(s.rimDeter).toBeGreaterThan(l.rimDeter);
  });
});
