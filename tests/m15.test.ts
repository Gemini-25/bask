import { describe, expect, it } from 'vitest';
import { seasonAwards } from '../src/career/awards';
import { createLeague } from '../src/career/league';
import { Rng } from '../src/core/rng';
import { overall } from '../src/data/player';
import { RATING_KEYS } from '../src/data/ratings';

describe('시상 기준 (M15)', () => {
  it('MVP는 득점만이 아니라 팀 성적과 평판(종합)으로: 종합 64 득점왕보다 종합 80 에이스', () => {
    const L = createLeague(new Rng(5));
    const [ta, tb] = L.teams;
    const scorer = ta.players[0];
    const star = tb.players[0];
    for (const k of RATING_KEYS) {
      scorer.r[k] = 55;
      star.r[k] = 82;
    }
    scorer.r.three = 99;
    expect(overall(star)).toBeGreaterThan(overall(scorer) + 15);
    L.stats = {
      [scorer.id]: { name: scorer.name, team: ta.info.id, pos: scorer.pos, g: 27, min: 27 * 32, pts: 27 * 31, reb: 27 * 2, ast: 27 * 5, stl: 27, blk: 0 },
      [star.id]: { name: star.name, team: tb.info.id, pos: star.pos, g: 27, min: 27 * 34, pts: 27 * 24, reb: 27 * 6, ast: 27 * 6, stl: 27 * 1.5, blk: 27 * 0.8 },
    };
    const wins = { [ta.info.id]: 12, [tb.info.id]: 19 };
    const aw = seasonAwards(L, '테스트', [], wins);
    expect(aw.awards.find((a) => a.key === 'mvp')!.id).toBe(star.id);
    expect(aw.awards.find((a) => a.key === 'pts')!.id).toBe(scorer.id);
  });

  it('리그 팀마다 에이스가 있다 (상위 종합 75 안팎)', () => {
    const L = createLeague(new Rng(7));
    const tops = L.teams.map((t) => Math.max(...t.players.map((p) => overall(p))));
    const avg = tops.reduce((a, b) => a + b, 0) / tops.length;
    expect(avg).toBeGreaterThan(70);
    expect(Math.max(...tops)).toBeLessThan(90);
  });
});
