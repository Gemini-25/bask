import { describe, expect, it } from 'vitest';
import { autoInvest, autoWeek } from '../src/career/autoplay';
import { createCareer, type CreateSpec } from '../src/career/career';
import { EVENTS, forceEvent, resolveEvent } from '../src/career/events';
import { Rng } from '../src/core/rng';
import { lookFor } from '../src/data/player';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';

const spec: CreateSpec = { name: '테스트', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('x'), alloc: {}, school: 'HANB' };

describe('개발자 패널 (K9)', () => {
  it('엔진이 슛·자유투마다 성공 확률을 남긴다 (결과는 그대로)', () => {
    const a = generateTeam(new Rng(1), TEAM_INFOS[0]);
    const b = generateTeam(new Rng(2), TEAM_INFOS[1]);
    const g = simulateGame(a, b, 7);
    const shots = g.events.filter((e) => e.type === 'made' || e.type === 'miss' || e.type === 'ft');
    expect(shots.length).toBeGreaterThan(100);
    for (const e of shots) {
      expect(e.prob).toBeGreaterThan(0);
      expect(e.prob).toBeLessThan(1);
    }
    // 같은 시드면 같은 경기
    expect(simulateGame(a, b, 7).final).toEqual(g.final);
  });

  it('자동 진행: 경기 직전에서 멈추고, 아니면 경기를 결과만 치르며 간다', () => {
    const c = createCareer(spec, 3);
    let stopped = null;
    for (let i = 0; i < 8 && !stopped; i++) stopped = autoWeek(c, 'simple', { stop: 'game' }).stopped;
    expect(stopped).toBe('game');
    expect(c.pendingGame).not.toBeNull();
    const d = createCareer(spec, 3);
    let games = 0;
    for (let i = 0; i < 12; i++) games += autoWeek(d, 'simple', { invest: true }).games;
    expect(d.week).toBe(12);
    expect(games).toBeGreaterThan(0);
    expect(d.pendingGame).toBeNull();
    expect(d.games.length).toBe(games);
  });

  it('반복 행동과 자동 투자', () => {
    const c = createCareer(spec, 4);
    for (let i = 0; i < 6; i++) autoWeek(c, { repeat: 'weight' });
    expect(c.log.filter((l) => l.action === 'weight').length).toBeGreaterThan(2);
    c.points = { P: 50, T: 50, M: 50 };
    const before = Object.values(c.me.r).reduce((a, b) => a + b, 0);
    autoInvest(c);
    expect(Object.values(c.me.r).reduce((a, b) => a + b, 0)).toBeGreaterThan(before);
    expect(c.points.P + c.points.T + c.points.M).toBeLessThan(150);
  });

  it('이벤트 강제 발동: 조건을 안 봐도 고를 수 있다', () => {
    const c = createCareer(spec, 5);
    for (const e of EVENTS) {
      const ev = forceEvent(c, e.id, new Rng(1));
      expect(ev?.id).toBe(e.id);
      // 고르면 끝난다 (팀원이 필요한 이벤트도 안 터진다)
      expect(() => resolveEvent(c, ev!, 0)).not.toThrow();
    }
  });
});
