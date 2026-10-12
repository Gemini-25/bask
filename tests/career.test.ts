import { describe, expect, it } from 'vitest';
import { BACKGROUNDS } from '../src/career/backgrounds';
import {
  actionById,
  applyAlloc,
  canDo,
  costOf,
  createCareer,
  creationBase,
  CREATE_CAP,
  dateText,
  doWeek,
  GAME_EVERY,
  invest,
  investCost,
  MAX_RATING,
  type CreateSpec,
} from '../src/career/career';
import { applyMatch, depthChart, myTeam, playMatch } from '../src/career/match';
import { exportCareer, importCareer } from '../src/career/save';
import { lookFor, POSITIONS } from '../src/data/player';
import { RATING_KEYS } from '../src/data/ratings';
import { Rng } from '../src/core/rng';
import { generateSchoolRoster, SCHOOLS } from '../src/career/schools';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({
  name: '테스트',
  number: 7,
  gender: 'M',
  prefPos: 'SG',
  background: 'ordinary',
  growth: 'normal',
  heightDelta: 0,
  build: 'normal',
  look: lookFor('x'),
  alloc: {},
  school: 'HANB',
  ...over,
});

describe('선수 만들기 (M1, M2)', () => {
  it('자유 포인트는 총량과 상한을 넘지 않는다', () => {
    const b = creationBase(spec());
    const greedy = Object.fromEntries(RATING_KEYS.map((k) => [k, 50]));
    const { r, used } = applyAlloc(b.r, greedy, b.bg.freePoints);
    expect(used).toBeLessThanOrEqual(b.bg.freePoints);
    expect(RATING_KEYS.every((k) => r[k] <= Math.max(CREATE_CAP, b.r[k]))).toBe(true);
  });

  it('같은 설정이면 같은 시작 능력치 (랜덤 없음)', () => {
    const a = creationBase(spec());
    const b = creationBase(spec());
    expect(a.r).toEqual(b.r);
  });

  it('천재는 전부 99', () => {
    const c = createCareer(spec({ background: 'genius' }), 1);
    expect(RATING_KEYS.every((k) => c.me.r[k] === MAX_RATING)).toBe(true);
  });

  it('배경마다 시작 능력치 범위가 정상', () => {
    for (const bg of BACKGROUNDS) {
      for (const pos of POSITIONS) {
        const b = creationBase(spec({ background: bg.id, prefPos: pos, heightDelta: 8, build: 'solid' }));
        expect(RATING_KEYS.every((k) => b.r[k] >= 1 && b.r[k] <= MAX_RATING)).toBe(true);
      }
    }
  });
});

describe('주간 행동과 성장 (T1~T3)', () => {
  it('비용은 능력치가 높을수록, 잠재력을 넘으면 더 비싸다', () => {
    expect(costOf(30, 80)).toBeLessThan(costOf(60, 80));
    expect(costOf(80, 80)).toBeGreaterThan(costOf(79, 80));
    expect(costOf(99, 99)).toBe(Infinity);
  });

  it('투자: 포인트가 모자라면 안 되고, 되면 정확히 차감', () => {
    const c = createCareer(spec(), 2);
    c.points = { P: 0, T: 100, M: 0 };
    expect(invest(c, { speed: 1 })).toBe(false);
    const before = c.me.r.three;
    const cost = investCost(c, { three: 3 });
    expect(invest(c, { three: 3 })).toBe(true);
    expect(c.me.r.three).toBe(before + 3);
    expect(c.points.T).toBe(100 - cost.T);
  });

  it('한 주가 지나면 날짜가 가고 4주마다 연습경기', () => {
    const c = createCareer(spec(), 3);
    expect(dateText(c.week)).toBe('1학년 3월 1주');
    for (let i = 0; i < GAME_EVERY - 1; i++) expect(doWeek(c, 'rest').game).toBeNull();
    const r = doWeek(c, 'video');
    expect(r.game).not.toBeNull();
    expect(c.pendingGame).toBe(r.game);
    expect(dateText(c.week)).toBe('1학년 4월 1주');
  });

  it('부상 중엔 훈련 못 하고, 재활은 다쳤을 때만', () => {
    const c = createCareer(spec(), 4);
    expect(canDo(c, actionById('rehab'))).toBe(false);
    c.injury = { name: '발목 염좌', weeks: 3, total: 3 };
    expect(canDo(c, actionById('team'))).toBe(false);
    expect(canDo(c, actionById('rehab'))).toBe(true);
    expect(() => doWeek(c, 'weight')).toThrow();
    doWeek(c, 'rehab');
    expect(c.injury?.weeks).toBe(1);
  });

  it('피로가 높을수록 자주 다친다', () => {
    let low = 0;
    let high = 0;
    for (let s = 0; s < 400; s++) {
      const a = createCareer(spec(), s);
      a.fatigue = 20;
      if (doWeek(a, 'weight').injured) low++;
      const b = createCareer(spec(), s);
      b.fatigue = 90;
      if (doWeek(b, 'weight').injured) high++;
    }
    expect(high).toBeGreaterThan(low * 3);
  });
});

describe('연습경기 (E7, T1)', () => {
  it('출전 명단: 주전 5명은 포지션 순서, 12명 이하, 내 선수 포함', () => {
    const c = createCareer(spec({ background: 'lateTall' }), 5);
    const { team, meIndex } = myTeam(c);
    expect(team.players.slice(0, 5).map((p) => p.pos)).toEqual(POSITIONS);
    expect(team.players.length).toBeLessThanOrEqual(12);
    expect(meIndex).toBeGreaterThanOrEqual(0);
    expect(meIndex).toBeLessThanOrEqual(5);
  });

  it('depthChart는 선수를 빠뜨리거나 겹치지 않는다', () => {
    const roster = generateSchoolRoster(new Rng(9), SCHOOLS[2], 'M').map((e) => e.player);
    const order = depthChart(roster);
    expect(new Set(order.map((p) => p.id)).size).toBe(roster.length);
  });

  it('경기를 치르면 기록이 남고 포인트가 들어오고, 신입생도 뛴다', () => {
    const c = createCareer(spec({ background: 'convert' }), 6);
    for (let i = 0; i < GAME_EVERY; i++) doWeek(c, 'video');
    const m = playMatch(c);
    expect(m.myPid).toBeGreaterThanOrEqual(0);
    const rep = applyMatch(c, m);
    expect(c.games.length).toBe(1);
    expect(c.pendingGame).toBeNull();
    expect(rep.line!.sec).toBeGreaterThan(8 * 60);
    expect(rep.gained.T).toBeGreaterThan(0);
  });

  it('다친 선수는 결장', () => {
    const c = createCareer(spec(), 7);
    for (let i = 0; i < GAME_EVERY; i++) doWeek(c, 'rest');
    c.injury = { name: '발목 염좌', weeks: 2, total: 2 };
    const m = playMatch(c);
    expect(m.myPid).toBe(-1);
    const rep = applyMatch(c, m);
    expect(rep.line).toBeNull();
  });
});

describe('저장 (K4)', () => {
  it('내보내고 다시 불러오면 같은 상태', () => {
    const c = createCareer(spec(), 8);
    for (let i = 0; i < 6; i++) doWeek(c, i % 2 ? 'team' : 'solo', 'drive');
    const back = importCareer(exportCareer(c));
    expect(back).toEqual(c);
    // 불러온 뒤에도 같은 난수로 이어진다
    const a = doWeek(c, 'team');
    const b = doWeek(back, 'team');
    expect(a.gained).toEqual(b.gained);
  });

  it('BASK 세이브가 아니면 거부', () => {
    expect(() => importCareer('{"hello":1}')).toThrow();
    expect(() => importCareer('not json')).toThrow();
    expect(() => importCareer(JSON.stringify({ app: 'bask', career: { v: 999, me: {}, week: 0 } }))).toThrow(/새로운 버전/);
  });
});
