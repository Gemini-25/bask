import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { DUNKS, dunkList } from '../src/data/dunks';
import { generatePlayer } from '../src/data/player';
import { RATING_KEYS } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';
import { ACT, DRIBBLE_MOVES } from '../src/sim/types';
import { SONGS } from '../src/view/music';

describe('연출 (M10)', () => {
  const games = (() => {
    const a = generateTeam(new Rng(11), TEAM_INFOS[2], 2);
    const b = generateTeam(new Rng(12), TEAM_INFOS[3], 2);
    // 덩크를 잘하는 선수를 넣어 본다
    for (const k of RATING_KEYS) a.players[2].r[k] = 92;
    return Array.from({ length: 10 }, (_, s) => simulateGame(a, b, 100 + s));
  })();

  it('쳐낸 공은 루즈볼이 되고, 수비가 잡으면 쳐낸 선수의 스틸', () => {
    let deflects = 0;
    let recovered = 0;
    for (const g of games) {
      deflects += g.events.filter((e) => e.type === 'loose' && !e.offensive).length;
      recovered += g.events.filter((e) => e.type === 'loose' && e.offensive).length;
      // 박스스코어 스틸 = 스틸 붙은 실책 이벤트
      const box = boxScore(g);
      const steals = box.players.reduce((s, l) => s + l.stl, 0);
      expect(steals).toBe(g.events.filter((e) => e.type === 'turnover' && e.other >= 0).length);
    }
    expect(deflects).toBeGreaterThan(5);
    expect(recovered).toBeGreaterThan(0);
  });

  it('드리블 기술과 덩크 동작이 기록에 나온다 (콘테스트 전용 덩크는 경기에선 안 한다)', () => {
    const acts = new Set<number>();
    for (const g of games) for (const a of g.rec.act) acts.add(a);
    expect(DRIBBLE_MOVES.filter((m) => acts.has(m)).length).toBeGreaterThanOrEqual(3);
    const styles = new Set(games.flatMap((g) => g.events.filter((e) => e.dunk).map((e) => e.dunk)));
    expect(styles.has('between')).toBe(false);
    expect(styles.has('ftline')).toBe(false);
    expect(acts.has(ACT.FTLINE)).toBe(false);
  });

  it('덩크 10가지, 능력치가 되면 열린다', () => {
    expect(DUNKS.length).toBe(10);
    const p = generatePlayer(new Rng(1), 'SF', 0, 1);
    for (const k of RATING_KEYS) p.r[k] = 95;
    expect(dunkList(p).length).toBe(10);
  });

  it('곡 데이터: 멜로디 길이는 마디(8칸)의 배수, 화음은 세 음', () => {
    for (const s of Object.values(SONGS)) {
      expect(s.lead.length % 8).toBe(0);
      expect(s.drums.length).toBe(8);
      for (const c of s.chords) expect(c.length).toBe(3);
    }
  });
});
