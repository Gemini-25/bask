import { describe, expect, it } from 'vitest';
import { checkAbilities } from '../src/career/abilities';
import { createCareer, type CreateSpec } from '../src/career/career';
import { forceEvent, resolveEvent } from '../src/career/events';
import { traitGameBoost, traitInjury, traitPointMult, traitSocial, traitUsage, TRAITS } from '../src/career/personality';
import { Rng } from '../src/core/rng';
import { ABILITIES } from '../src/data/abilities';
import { lookFor } from '../src/data/player';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';
import { analyzeGame, derive, emptyRaw, mergeRaw } from '../src/sim/analytics';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({ name: '테스트', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('x'), alloc: {}, school: 'HANB', ...over });

/** 2번 선수에게 설정을 주고 n경기, 그 선수 박스스코어 합 */
function run(n: number, setup: (p: ReturnType<typeof generateTeam>['players'][number]) => void, opts: Parameters<typeof simulateGame>[3] = {}) {
  let fga = 0;
  let stl = 0;
  let blk = 0;
  for (let g = 0; g < n; g++) {
    const a = generateTeam(new Rng(40 + g), TEAM_INFOS[1], 0);
    const b = generateTeam(new Rng(80 + g), TEAM_INFOS[6], 0);
    setup(a.players[2]);
    const l = boxScore(simulateGame(a, b, 120 + g, opts)).players[2];
    fga += l.fga;
    stl += l.stl;
    blk += l.blk;
  }
  return { fga, stl, blk };
}

describe('성격·특수능력 늘리기 (M18)', () => {
  it('성격 23가지, 특수능력 30가지 (나쁜 버릇 7) (M21에 배짱 슈터·입담꾼·겸손, 딥쓰리·체이스다운·쇼타임·난사)', () => {
    expect(TRAITS.length).toBe(23);
    expect(ABILITIES.length).toBe(30);
    expect(ABILITIES.filter((a) => a.bad).length).toBe(7);
  });

  it('새 성격마다 효과가 있다', () => {
    const w = createCareer(spec({ trait: 'workaholic' }), 1);
    expect(traitPointMult(w, 'team')).toBeGreaterThan(1.1);
    const i = createCareer(spec({ trait: 'ironman' }), 1);
    expect(traitInjury(i)).toBeLessThan(1);
    const d = createCareer(spec({ trait: 'defender' }), 1);
    expect(traitGameBoost(d, true).perimeterD).toBe(3);
    const s = createCareer(spec({ trait: 'selfish' }), 1);
    expect(traitUsage(s)).toBeGreaterThan(0);
    expect(traitSocial(s).friends).toBeLessThan(1);
    const so = createCareer(spec({ trait: 'socialite' }), 1);
    expect(traitSocial(so).friends).toBeGreaterThan(1.4);
  });

  it('이벤트로 새 성격이 생긴다', () => {
    const c = createCareer(spec({ trait: 'diligent' }), 2);
    c.pendingEvent = forceEvent(c, 'playStyle', new Rng(1));
    resolveEvent(c, c.pendingEvent!, 1);
    expect(c.traits).toContain('defender');
  });

  it('이기적이면 더 많이 쏜다 (엔진 슛 욕심)', { timeout: 60000 }, () => {
    // 경기마다 흐름이 달라서 넉넉히 돌린다
    const base = run(24, () => {});
    const selfish = run(24, () => {}, { usage: { 2: 0.08 } });
    expect(selfish.fga).toBeGreaterThan(base.fga);
  });

  it('소매치기가 있으면 스틸이 늘고, 림 프로텍터가 지키면 골밑 슛이 덜 들어간다', { timeout: 150000 }, () => {
    // 스틸은 경기당 1~2개라 넉넉히
    const base = run(30, () => {});
    const thief = run(30, (p) => (p.abilities = { pickpocket: 3 }));
    expect(thief.stl).toBeGreaterThan(base.stl);
    // 센터(자리 4)가 골밑을 지킬 때 상대 야투율
    const rim = (ab: Record<string, number>) => {
      let r = emptyRaw();
      for (let g = 0; g < 14; g++) {
        const a = generateTeam(new Rng(40 + g), TEAM_INFOS[1], 0);
        const b = generateTeam(new Rng(80 + g), TEAM_INFOS[6], 0);
        a.players[4].abilities = ab;
        r = mergeRaw(r, analyzeGame(simulateGame(a, b, 120 + g))[4]);
      }
      return derive(r);
    };
    expect(rim({ rimProtector: 3 }).rimPct).toBeLessThan(rim({}).rimPct);
  });

  it('조건을 채우면 새 특수능력, 나쁜 버릇 터널 시야', () => {
    const c = createCareer(spec(), 3);
    c.stats.steals = 25;
    c.me.r.steal = 60;
    c.stats.games = 25;
    c.stats.ast = 5;
    c.me.r.vision = 30;
    const notes = checkAbilities(c);
    expect(c.me.abilities?.pickpocket).toBe(1);
    expect(c.me.abilities?.tunnel).toBe(1);
    expect(notes.join(' ')).toContain('소매치기');
  });
});
