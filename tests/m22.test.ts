import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { RatingKey } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';
import type { GameResult } from '../src/sim/types';
import { tacticsHtml } from '../src/view/tactics';

/** 팀0 전원에게 능력치를 주고 n경기: 점수 차, 슛 선택 (평균 성공 확률), 실책, 야투율, 상대 야투율 */
function run(n: number, keys: RatingKey[], v: number) {
  let margin = 0;
  let xfg = 0;
  let shots = 0;
  let tov = 0;
  let fgm = 0;
  let fga = 0;
  let oFgm = 0;
  let oFga = 0;
  for (let g = 0; g < n; g++) {
    const a = generateTeam(new Rng(5000 + g), TEAM_INFOS[g % 10], 0);
    const b = generateTeam(new Rng(6000 + g), TEAM_INFOS[(g + 5) % 10], 0);
    for (const p of a.players) for (const k of keys) p.r[k] = v;
    const r = simulateGame(a, b, 7000 + g);
    const box = boxScore(r);
    margin += r.final[0] - r.final[1];
    tov += box.teams[0].tov;
    fgm += box.teams[0].fgm;
    fga += box.teams[0].fga;
    oFgm += box.teams[1].fgm;
    oFga += box.teams[1].fga;
    for (const e of r.events)
      if ((e.type === 'made' || e.type === 'miss') && e.team === 0) {
        shots++;
        xfg += e.prob ?? 0;
      }
  }
  return { margin: margin / n, xfg: xfg / shots, tov: tov / n, fg: fgm / fga, oppFg: oFgm / oFga };
}

describe('작전이 보이게, 농구 IQ·위치선정 (M22)', () => {
  const g: GameResult = simulateGame(generateTeam(new Rng(1), TEAM_INFOS[0], 0), generateTeam(new Rng(2), TEAM_INFOS[3], 0), 33);

  it('작전을 부르면 기록이 남고, 슛·실책엔 그 공격의 작전이 붙는다', () => {
    const plays = g.events.filter((e) => e.type === 'play');
    expect(plays.length).toBeGreaterThan(40);
    const kinds = new Set(plays.map((e) => e.play));
    for (const k of ['pnr', 'iso', 'motion']) expect(kinds.has(k as never)).toBe(true);
    // 픽앤롤은 스크리너가 있다
    expect(plays.filter((e) => e.play === 'pnr').every((e) => e.other >= 0)).toBe(true);
    const shots = g.events.filter((e) => e.type === 'made' || e.type === 'miss');
    expect(shots.filter((e) => e.play).length / shots.length).toBeGreaterThan(0.8);
  });

  it('작전 탭: 작전별 공격당 득점과 선수 판단', () => {
    const html = tacticsHtml(g, g.rec.n, [{ fill: '#e0473d', num: '#ffffff', paint: '#e0473d', label: '' }, { fill: '#3d8fe0', num: '#ffffff', paint: '#3d8fe0', label: '' }], g.lineups.at(-1)!.pids);
    expect(html).toContain('픽앤롤');
    expect(html).toContain('공격당');
    expect(html).toContain('슛 선택');
  });

  it('농구 IQ가 높으면 좋은 슛을 고르고 실책이 적고 더 이긴다', { timeout: 120000 }, () => {
    const hi = run(20, ['iq'], 85);
    const lo = run(20, ['iq'], 40);
    expect(hi.xfg).toBeGreaterThan(lo.xfg);
    expect(hi.tov).toBeLessThan(lo.tov);
    expect(hi.margin).toBeGreaterThan(lo.margin + 2);
  });

  it('위치선정 (오프볼)이 좋으면 야투율이 오르고, 도움 수비가 좋으면 상대 야투율이 내려간다', { timeout: 120000 }, () => {
    const ob = [run(20, ['offBall'], 85), run(20, ['offBall'], 40)];
    expect(ob[0].fg).toBeGreaterThan(ob[1].fg);
    const help = [run(20, ['helpD'], 85), run(20, ['helpD'], 40)];
    expect(help[0].oppFg).toBeLessThan(help[1].oppFg);
  });
});
