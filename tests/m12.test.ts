import { describe, expect, it } from 'vitest';
import { autoWeek } from '../src/career/autoplay';
import { actionById, canDo, createCareer, dateText, doWeek, SAVE_VERSION, setCalendar, type CreateSpec } from '../src/career/career';
import { collegeOffers, enterCollege, yearLabel } from '../src/career/college';
import { forceEvent, resolveEvent } from '../src/career/events';
import { gameMe } from '../src/career/match';
import { addTrait, traitGameBoost, traitPointMult } from '../src/career/personality';
import { exportCareer, importCareer } from '../src/career/save';
import { COLLEGE_TOURS } from '../src/career/season';
import { isCollege } from '../src/career/schools';
import { rollover } from '../src/career/turn';
import { Rng } from '../src/core/rng';
import { lookFor } from '../src/data/player';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({ name: '테스트', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('x'), alloc: {}, school: 'HANB', ...over });

/** 고3이 막 끝난 커리어 */
function graduated(seed: number) {
  const c = createCareer(spec(), seed);
  c.week = 144;
  c.yearOf = 2;
  c.season = null;
  c.me.age = 18;
  const notes = rollover(c);
  return { c, notes };
}

describe('대학 진학 (W2, M12)', () => {
  it('고3이 끝나면 바로 드래프트하지 않고 진로를 묻는다', () => {
    const { c, notes } = graduated(1);
    expect(c.pathPending).toBe('hs');
    expect(c.draft).toBeNull();
    expect(notes[0]).toContain('진로');
    const offers = collegeOffers(c);
    expect(offers.length).toBe(3);
    expect(new Set(offers.map((u) => u.id)).size).toBe(3);
    expect(offers.every((u) => isCollege(u.id))).toBe(true);
  });

  it('대학에 들어가면 4학년까지 있는 선수단과 대학 대회', () => {
    const { c } = graduated(2);
    const id = collegeOffers(c)[1].id;
    enterCollege(c, id);
    expect(c.pathPending).toBeNull();
    expect(c.school).toBe(id);
    expect(c.hsSchool).toBe('HANB');
    expect(c.roster.some((e) => e.grade === 4)).toBe(true);
    expect(c.season?.tours.map((t) => t.id)).toEqual(COLLEGE_TOURS.map((t) => t.id));
    setCalendar(c);
    expect(dateText(c.week)).toContain('대학 1학년');
    expect(yearLabel(c, 3)).toBe('대학 1학년');
    setCalendar(null);
  });

  it('대학 4년을 다니고 드래프트 → 프로 1년차, 나이 23', { timeout: 120000 }, () => {
    const { c } = graduated(3);
    enterCollege(c, collegeOffers(c)[2].id);
    let years = 0;
    for (let w = 0; w < 48 * 4 + 2 && !c.pro; w++) {
      const r = autoWeek(c, 'simple', { invest: true, path: 'college' });
      if (r.notes.some((n) => n.includes('학년이 끝났다'))) years++;
    }
    expect(years).toBe(3);
    expect(c.pro).not.toBeNull();
    expect(c.proFromYear).toBe(7);
    expect(c.me.age).toBe(23);
    expect(c.games.some((g) => COLLEGE_TOURS.some((t) => g.label.startsWith(t.name)))).toBe(true);
    setCalendar(c);
    expect(dateText(c.week)).toContain('프로 1년차');
    setCalendar(null);
  });

  it('얼리 엔트리: 1학년만 마치고 드래프트', { timeout: 60000 }, () => {
    const { c } = graduated(4);
    enterCollege(c, collegeOffers(c)[0].id);
    for (let w = 0; w < 50 && !c.pro; w++) autoWeek(c, 'simple', { invest: true, path: 'draft' });
    expect(c.pro).not.toBeNull();
    expect(c.proFromYear).toBe(4);
  });
});

describe('성격 (M6, M12)', () => {
  it('만들 때 하나, 이벤트로 하나 더, 두 개까지', () => {
    const c = createCareer(spec({ trait: 'cool' }), 1);
    expect(c.traits).toEqual(['cool']);
    const ev = forceEvent(c, 'awaken', new Rng(1))!;
    const out = resolveEvent(c, ev, 0);
    expect(c.traits).toEqual(['cool', 'diligent']);
    expect(out.some((n) => n.includes('성격'))).toBe(true);
    expect(addTrait(c, 'leader')).toBe(false);
  });

  it('효과: 성실은 훈련 포인트, 냉철은 경기 중 침착성, 소심은 공식전에서 떨린다', () => {
    const c = createCareer(spec({ trait: 'diligent' }), 1);
    expect(traitPointMult(c, 'team')).toBeCloseTo(1.08);
    expect(traitPointMult(c, 'rest')).toBe(1);
    const d = createCareer(spec({ trait: 'cool' }), 1);
    expect(gameMe(d, true).r.composure).toBe(Math.min(99, d.me.r.composure + 4 + [-5, -2, 0, 2, 4][d.condition]));
    const t = createCareer(spec({ trait: 'timid' }), 1);
    expect(traitGameBoost(t, true).composure).toBeLessThan(0);
    expect(traitGameBoost(t, false).composure ?? 0).toBe(0);
  });
});

describe('아르바이트 (T2)', () => {
  it('고교·대학 때만, 돈이 들어오고 감독님은 싫어한다', () => {
    const c = createCareer(spec(), 5);
    const a = actionById('parttime');
    expect(canDo(c, a)).toBe(true);
    const trust = c.trust;
    doWeek(c, 'parttime');
    expect(c.money).toBeGreaterThanOrEqual(30);
    expect(c.trust).toBeLessThan(trust);
    c.pro = { team: 'SEO', salary: 1000, years: 2, pickNo: 1, season: 0 };
    expect(canDo(c, a)).toBe(false);
  });
});

describe('세이브 v5', () => {
  it('v4 세이브를 읽으면 대학·성격 항목이 채워진다', () => {
    const c = createCareer(spec(), 6);
    const raw = JSON.parse(exportCareer(c));
    raw.career.v = 4;
    for (const k of ['college', 'hsSchool', 'proFromYear', 'pathPending', 'traits']) delete raw.career[k];
    const back = importCareer(JSON.stringify(raw));
    expect(back.v).toBe(SAVE_VERSION);
    expect(back.college).toBeNull();
    expect(back.proFromYear).toBe(3);
    expect(back.traits).toEqual([]);
    expect(back.hsSchool).toBe('HANB');
  });
});
