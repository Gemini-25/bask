import { describe, expect, it } from 'vitest';
import { createCareer, type CreateSpec } from '../src/career/career';
import { traitStyle } from '../src/career/personality';
import { exportCareer, importCareer } from '../src/career/save';
import { Rng } from '../src/core/rng';
import { ABILITIES } from '../src/data/abilities';
import { SHOT_MOVES } from '../src/data/moves';
import { deriveSense, fillSense, generatePlayer, lookFor } from '../src/data/player';
import { RATING_KEYS } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';
const boxScoreOf = (r: ReturnType<typeof simulateGame>, i: number) => boxScore(r).players[i];
import { ACT, DRIBBLE_MOVES, type GameEvent } from '../src/sim/types';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({ name: '테스트', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('x'), alloc: {}, school: 'HANB', ...over });

/** 2번 선수를 키워서 12경기, 그 선수의 슛 이벤트 */
function shots(setup: (r: Record<string, number>, ab: Record<string, number>) => void, games = 12, everyone = false) {
  const out: GameEvent[] = [];
  for (let g = 0; g < games; g++) {
    const a = generateTeam(new Rng(11 + g), TEAM_INFOS[2], 1);
    const b = generateTeam(new Rng(12 + g), TEAM_INFOS[3], 1);
    const s = a.players[2];
    for (const k of RATING_KEYS) s.r[k] = 85;
    const ab: Record<string, number> = {};
    setup(s.r as unknown as Record<string, number>, ab);
    s.abilities = ab;
    const r = simulateGame(a, b, 77 + g);
    out.push(...r.events.filter((e) => (everyone || e.player === 2) && (e.type === 'made' || e.type === 'miss')));
  }
  return out;
}

describe('동작 (M16)', () => {
  it('동작 20가지, 드리블 기술 9가지, 동작마다 새 포즈', () => {
    expect(SHOT_MOVES.length).toBeGreaterThanOrEqual(19);
    expect(DRIBBLE_MOVES.length).toBe(9);
    for (const m of SHOT_MOVES) expect(Object.values(ACT)).toContain(m.act);
  });

  it('경기에 동작이 나오고 문자 중계에 이름이 붙는다', () => {
    const ev = shots(() => {});
    const moved = ev.filter((e) => e.move);
    expect(moved.length).toBeGreaterThan(ev.length * 0.15);
    const step = moved.find((e) => e.move === 'stepback');
    expect(step?.text).toContain('스텝백');
  });

  it('특수능력·센스·천재가 있으면 화려한 동작이 훨씬 자주', () => {
    const flashy = new Set(SHOT_MOVES.filter((m) => m.flashy).map((m) => m.id));
    const rate = (ev: GameEvent[]) => ev.filter((e) => e.move && flashy.has(e.move)).length / ev.length;
    const plain = shots((r) => (r.sense = 40));
    const star = shots((r, ab) => {
      r.sense = 95;
      ab.genius = 3;
      ab.stepback = 3;
      ab.euro = 3;
    });
    expect(rate(star)).toBeGreaterThan(rate(plain) * 1.5);
  });

  it('덩커는 블록하러 뜬 수비 위로 찍는다 (인유어페이스), 공격 리바운드는 풋백', () => {
    const ev = shots((r, ab) => {
      r.dunk = 94;
      r.jump = 94;
      ab.poster = 3;
    });
    expect(ev.some((e) => e.poster && e.type === 'made' && e.text.includes('인유어페이스'))).toBe(true);
    // 풋백은 드물어서 그 경기들의 모든 선수로 본다
    const all = shots((r, ab) => {
      r.dunk = 94;
      r.jump = 94;
      ab.poster = 3;
    }, 12, true);
    expect(all.some((e) => e.move === 'putback')).toBe(true);
  });

  it('센스: 모든 선수에게 있고, 예전 세이브는 채운다', () => {
    const p = generatePlayer(new Rng(3), 'PG', 0, 1);
    expect(p.r.sense).toBe(deriveSense(p.r, p.id));
    const c = createCareer(spec(), 5);
    const raw = JSON.parse(exportCareer(c));
    raw.career.v = 6;
    delete raw.career.me.r.sense;
    for (const e of raw.career.roster) delete e.player.r.sense;
    const back = importCareer(JSON.stringify(raw));
    expect(typeof back.me.r.sense).toBe('number');
    expect(back.roster.every((e) => typeof e.player.r.sense === 'number')).toBe(true);
    expect(back.stats.moves).toBe(0);
    const o = { a: [{ id: 'x', r: { iq: 50, vision: 50, agility: 50 } }] };
    fillSense(o);
    expect((o.a[0].r as Record<string, number>).sense).toBeGreaterThan(0);
  });

  it('특수능력 6개 더 (천재·포스터라이저·스텝백·페이드어웨이·유로스텝·컨택트), 성격은 동작 성향', () => {
    for (const id of ['genius', 'poster', 'stepback', 'fadeaway', 'euro', 'contact']) expect(ABILITIES.some((a) => a.id === id)).toBe(true);
    const c = createCareer(spec({ trait: 'showman' }), 6);
    expect(traitStyle(c).flash).toBeGreaterThan(1);
    const g = createCareer(spec({ background: 'genius' }), 6);
    expect(g.me.abilities?.genius).toBe(3);
  });
});

describe('슈퍼스타 (M16): 전부 99면 혼자 경기를 찢는다', () => {
  it('99 선수: 경기당 40점 넘게, 리바·어시·스틸·블록도 많고, 팀이 거의 다 이긴다', { timeout: 60000 }, () => {
    let pts = 0;
    let stocks = 0;
    let wins = 0;
    let base = 0;
    const n = 12;
    for (let g = 0; g < n; g++) {
      const mk = () => [generateTeam(new Rng(300 + g), TEAM_INFOS[g % 10], 0), generateTeam(new Rng(700 + g), TEAM_INFOS[(g + 5) % 10], 0)];
      const [a, b] = mk();
      for (const k of RATING_KEYS) a.players[1].r[k] = 99;
      const r = simulateGame(a, b, 900 + g);
      const l = boxScoreOf(r, 1);
      pts += l.pts;
      stocks += l.stl + l.blk;
      if (r.final[0] > r.final[1]) wins++;
      const [a2, b2] = mk();
      const r2 = simulateGame(a2, b2, 900 + g);
      base += boxScoreOf(r2, 1).pts;
    }
    expect(pts / n).toBeGreaterThan(40);
    expect(pts / n).toBeGreaterThan((base / n) * 2);
    expect(stocks / n).toBeGreaterThan(3.5);
    expect(wins / n).toBeGreaterThanOrEqual(0.75);
  });
});
