import { describe, expect, it } from 'vitest';
import { checkAbilities } from '../src/career/abilities';
import { createCareer, SAVE_VERSION, type CreateSpec } from '../src/career/career';
import { EVENTS, fill, resolveEvent, rollEvent } from '../src/career/events';
import { applyMatch, playMatch } from '../src/career/match';
import { exportCareer, importCareer } from '../src/career/save';
import { createSeason, groupStandings } from '../src/career/season';
import { afterGame, ensureSeason, playWeek } from '../src/career/turn';
import { Rng } from '../src/core/rng';
import { lookFor } from '../src/data/player';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({
  name: '테스트',
  number: 7,
  gender: 'M',
  prefPos: 'SF',
  background: 'ordinary',
  growth: 'normal',
  heightDelta: 0,
  build: 'normal',
  look: lookFor('x'),
  alloc: {},
  school: 'MUDE',
  ...over,
});

describe('시즌 일정 (W8)', () => {
  it('대회 4개: 8강 토너먼트, 10팀 조별리그, 왕중왕전', () => {
    const c = createCareer(spec(), 1);
    const s = createSeason(c, 0)!;
    expect(s.tours.map((t) => t.id)).toEqual(['spring', 'summer', 'national', 'kings']);
    const spring = s.tours[0];
    expect(spring.teams).toContain('MUDE');
    expect(spring.teams.length).toBe(8);
    expect(spring.matches.length).toBe(4);
    const summer = s.tours[1];
    expect(summer.groups!.map((g) => g.length)).toEqual([5, 5]);
    // 5팀 리그: 팀마다 4경기
    for (const id of summer.teams) expect(summer.matches.filter((m) => m.a === id || m.b === id).length).toBe(4);
    expect(s.tours[3].teams.length).toBe(0);
  });

  it('1년을 다 돌면 모든 대회가 끝나고, 진급해서 새 시즌', () => {
    const c = createCareer(spec(), 2);
    ensureSeason(c);
    const seniors = c.roster.filter((e) => e.grade === 3).length;
    let games = 0;
    for (let w = 0; w < 48; w++) {
      playWeek(c, w % 3 === 0 ? 'rest' : 'team');
      if (c.pendingEvent) resolveEvent(c, c.pendingEvent, 0);
      if (c.pendingGame) {
        applyMatch(c, playMatch(c));
        afterGame(c);
        games++;
      }
      if (w === 46) {
        for (const t of c.season!.tours) {
          expect(t.done).toBe(true);
          expect(t.champion).toBeTruthy();
          expect(t.matches.every((m) => m.score && m.winner)).toBe(true);
          expect(t.myFinish).toBeTruthy();
        }
        const kings = c.season!.tours[3];
        expect(kings.teams.length).toBe(4);
        const summer = c.season!.tours[1];
        expect(groupStandings(summer, 0).reduce((n, s) => n + s.w + s.l, 0)).toBe(20);
      }
    }
    expect(games).toBeGreaterThanOrEqual(10);
    expect(c.week).toBe(48);
    expect(c.season!.year).toBe(1);
    expect(c.roster.every((e) => e.grade >= 2 || c.roster.some((x) => x.grade === 1))).toBe(true);
    expect(c.roster.some((e) => e.grade === 3)).toBe(true);
    expect(c.roster.some((e) => e.grade === 4)).toBe(false);
    expect(c.roster.length).toBeGreaterThanOrEqual(12);
    expect(seniors).toBeGreaterThan(0);
    expect(c.games.filter((g) => g.kind === 'official').length).toBeGreaterThanOrEqual(3);
  });
});

describe('감독 신뢰도와 친밀도 (R1, R2)', () => {
  it('팀 훈련은 신뢰를 올리고 길거리 농구는 내린다', () => {
    const a = createCareer(spec(), 3);
    const b = createCareer(spec(), 3);
    playWeek(a, 'team');
    playWeek(b, 'street');
    expect(a.trust).toBeGreaterThan(40);
    expect(b.trust).toBeLessThan(40);
  });

  it('친구와 놀면 친밀도가 오른다', () => {
    const c = createCareer(spec(), 4);
    const before = Object.values(c.friends).reduce((x, y) => x + y, 0);
    playWeek(c, 'friends');
    expect(Object.values(c.friends).reduce((x, y) => x + y, 0)).toBeGreaterThan(before + 10);
  });

  it('라이벌은 다른 학교, 같은 포지션, 상대 명단에 들어간다', () => {
    const c = createCareer(spec(), 5);
    expect(c.rival).toBeTruthy();
    expect(c.rival!.school).not.toBe(c.school);
    expect(c.rival!.player.pos).toBe('SF');
  });
});

describe('이벤트 (L4)', () => {
  it('글 속 이름표가 다 바뀐다', () => {
    const c = createCareer(spec(), 6);
    for (const e of EVENTS) {
      expect(fill(c, e.text, c.roster[0].player.id)).not.toMatch(/\{/);
      for (const ch of e.choices) if (ch.effect.text) expect(fill(c, ch.effect.text)).not.toMatch(/\{/);
    }
  });

  it('한 번만 나오는 이벤트는 다시 안 나오고, 고르면 효과가 들어간다', () => {
    const c = createCareer(spec(), 7);
    c.week = 2;
    const seen = new Set<string>();
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++) {
      const ev = rollEvent(c, rng);
      if (!ev) continue;
      const def = EVENTS.find((e) => e.id === ev.id)!;
      if (def.once) {
        expect(seen.has(ev.id)).toBe(false);
        seen.add(ev.id);
      }
      c.week++;
    }
    expect(seen.has('rivalMeet')).toBe(true);
    c.pendingEvent = { id: 'newYearGoal' };
    const t = c.points.T;
    resolveEvent(c, c.pendingEvent, 0);
    expect(c.points.T).toBe(t + 3);
    expect(c.pendingEvent).toBeNull();
  });
});

describe('특수능력 (S8)', () => {
  it('배경에 따라 시작 능력, 천재는 전부 ★3', () => {
    expect(createCareer(spec({ background: 'street' }), 8).me.abilities).toEqual({ ankle: 1 });
    const g = createCareer(spec({ background: 'genius' }), 8).me.abilities!;
    expect(Object.values(g).length).toBe(20);
    expect(Object.values(g).every((n) => n === 3)).toBe(true);
  });

  it('기록과 능력치가 차면 얻고 진화한다. 나쁜 버릇은 극복하면 사라진다', () => {
    const c = createCareer(spec(), 9);
    c.stats.clutchMade = 12;
    c.me.r.composure = 60;
    checkAbilities(c);
    expect(c.me.abilities!.clutch).toBe(2);
    c.stats.fta = 30;
    c.stats.ftm = 10;
    checkAbilities(c);
    expect(c.me.abilities!.ftPhobia).toBe(1);
    c.me.r.freeThrow = 60;
    c.stats.ftAfter = { m: 8, a: 10 };
    checkAbilities(c);
    expect(c.me.abilities!.ftPhobia).toBeUndefined();
  });
});

describe('세이브 변환 (K4)', () => {
  it('v1 세이브를 읽으면 새 항목이 채워지고 시즌이 이어진다', () => {
    const c = createCareer(spec(), 10);
    for (let i = 0; i < 9; i++) playWeek(c, 'rest');
    const v1 = JSON.parse(exportCareer(c));
    const old = v1.career;
    old.v = 1;
    old.pendingGame = 'HANB';
    for (const k of ['season', 'trust', 'friends', 'coach', 'rival', 'mentor', 'seenEvents', 'pendingEvent', 'stats']) delete old[k];
    for (const g of old.games) {
      delete g.kind;
      delete g.label;
    }
    delete old.me.abilities;
    const back = importCareer(JSON.stringify(v1));
    expect(back.v).toBe(SAVE_VERSION);
    expect(back.pendingGame).toEqual({ kind: 'practice', opponent: 'HANB', label: '연습경기', home: expect.any(Boolean) });
    expect(back.trust).toBe(40);
    expect(back.rival).toBeTruthy();
    ensureSeason(back);
    // 4월 2주(8강)는 이미 지나갔으니 결과가 채워져 있다
    const spring = back.season!.tours[0];
    expect(spring.matches.filter((m) => m.round === 0).every((m) => m.score)).toBe(true);
  });
});
