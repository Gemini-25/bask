import { describe, expect, it } from 'vitest';
import { createCareer, type CreateSpec } from '../src/career/career';

import { resolveEvent } from '../src/career/events';
import { createLeague, PRO_WEEKS, standings, offseason, draftClass, scheduleSeason } from '../src/career/league';
import { applyMatch, playMatch } from '../src/career/match';
import { buy, gearBoost } from '../src/career/money';
import { contractOffers, signContract } from '../src/career/pro';
import { exportCareer, importCareer } from '../src/career/save';
import { afterGame, playWeek } from '../src/career/turn';
import { Rng } from '../src/core/rng';
import { lookFor } from '../src/data/player';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({
  name: '테스트',
  number: 7,
  gender: 'M',
  prefPos: 'PG',
  background: 'elite',
  growth: 'normal',
  heightDelta: 0,
  build: 'normal',
  look: lookFor('x'),
  alloc: {},
  school: 'HANB',
  ...over,
});

/** 고3 끝까지 빨리 돌린다 (경기는 결과만) */
function toDraft(seed: number) {
  const c = createCareer(spec(), seed);
  while (!c.pro) {
    playWeek(c, c.injury ? 'rehab' : c.fatigue > 60 ? 'rest' : 'team');
    if (c.pendingEvent) resolveEvent(c, c.pendingEvent, 0);
    while (c.pendingGame) {
      applyMatch(c, playMatch(c));
      afterGame(c);
    }
  }
  return c;
}

describe('프로 리그 (W6, W7)', () => {
  it('정규시즌 27경기: 팀마다 9팀과 3번씩', () => {
    const L = createLeague(new Rng(1));
    scheduleSeason(L, 0);
    expect(L.games.length).toBe(135);
    for (const t of L.teams) expect(L.games.filter((g) => g.a === t.info.id || g.b === t.info.id).length).toBe(27);
    // 한 주에 팀당 한 경기
    for (let w = PRO_WEEKS.seasonStart; w < PRO_WEEKS.seasonStart + 27; w++) {
      const ids = L.games.filter((g) => g.week === w).flatMap((g) => [g.a, g.b]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('비시즌: 나이를 먹고, 은퇴하고, 신인으로 12명 이상 채운다', () => {
    const L = createLeague(new Rng(2));
    const ages = L.teams[0].players.map((p) => p.age!);
    offseason(L, new Rng(3), draftClass(new Rng(4), 20));
    for (const t of L.teams) expect(t.players.length).toBeGreaterThanOrEqual(12);
    const stay = L.teams[0].players.filter((p) => p.age !== undefined);
    expect(stay.length).toBeGreaterThan(0);
    expect(Math.max(...ages)).toBeLessThanOrEqual(36);
  });
});

describe('드래프트에서 프로 첫 시즌까지 (W11)', () => {
  const c = toDraft(5);

  it('고3이 끝나면 드래프트로 프로 팀과 신인 계약', () => {
    expect(c.week).toBe(144);
    expect(c.pro).toBeTruthy();
    expect(c.draft?.picks.length).toBe(20);
    expect(c.draft?.picks.filter((p) => p.me).length).toBe(1);
    expect(c.pro!.salary).toBeGreaterThan(0);
    expect(c.pro!.years).toBe(2);
    expect(c.roster.length).toBe(0);
    expect(c.league!.teams.find((t) => t.info.id === c.pro!.team)!.players.length).toBeGreaterThanOrEqual(12);
  });

  it('프로 1시즌: 정규시즌 → 플레이오프 → 우승팀, 연봉이 들어오고 나이를 먹는다', () => {
    const d = structuredClone(c);
    d.draft = null;
    let my = 0;
    while (d.week < 192) {
      playWeek(d, d.injury ? 'rehab' : d.fatigue > 60 ? 'rest' : 'team');
      if (d.pendingEvent) resolveEvent(d, d.pendingEvent, 0);
      while (d.pendingGame) {
        applyMatch(d, playMatch(d));
        afterGame(d);
        my++;
      }
      if (d.week === 191) {
        const L = d.league!;
        expect(standings(L).reduce((n, r) => n + r.w + r.l, 0)).toBe(270);
        expect(L.series.length).toBe(5);
      }
    }
    expect(my).toBeGreaterThanOrEqual(29);
    expect(d.league!.history.length).toBe(1);
    expect(d.league!.history[0].champion).toBeTruthy();
    expect(d.money).toBeGreaterThan(d.pro!.salary * 0.9);
    expect(d.me.age).toBe(20);
    expect(d.pro!.years).toBe(1);
    // 저장하고 다시 읽어도 리그가 그대로
    const back = importCareer(exportCareer(d));
    expect(back.league!.teams.length).toBe(10);
  }, 60_000);

  it('재계약: 다른 팀을 고르면 이적', () => {
    const d = structuredClone(c);
    const { others } = contractOffers(d);
    signContract(d, others[0]);
    expect(d.pro!.team).toBe(others[0].team);
    expect(d.contractPending).toBe(false);
  });

  it('장비를 사면 경기 중 능력치가 오른다', () => {
    const d = structuredClone(c);
    d.money = 1000;
    expect(buy(d, 'shoeLight')).toBe(true);
    expect(buy(d, 'shoeLight')).toBe(false);
    expect(gearBoost(d).speed).toBe(2);
    expect(d.money).toBe(700);
  });
});

describe('세이브 v2 → v3', () => {
  it('프로 항목이 채워진다', () => {
    const c = createCareer(spec(), 9);
    const raw = JSON.parse(exportCareer(c));
    raw.career.v = 2;
    for (const k of ['pro', 'league', 'gameQueue', 'draft', 'contractPending', 'money', 'items', 'popularity', 'sns', 'yearOf']) delete raw.career[k];
    const back = importCareer(JSON.stringify(raw));
    expect(back.v).toBe(3);
    expect(back.money).toBe(0);
    expect(back.pro).toBeNull();
    expect(back.yearOf).toBe(0);
  });
});


