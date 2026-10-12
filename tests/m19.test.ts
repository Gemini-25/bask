import { describe, expect, it } from 'vitest';
import { createCareer, type CreateSpec } from '../src/career/career';
import { exportCareer, importCareer } from '../src/career/save';
import { checkNickname, confidenceAfterGame, confidenceBoost, confidenceDrift, displayName } from '../src/career/spirit';
import { gameMe } from '../src/career/match';
import { lookFor } from '../src/data/player';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({ name: '테스트', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('x'), alloc: {}, school: 'HANB', ...over });

describe('빠진 것 묶음 (M19)', () => {
  it('자신감: 잘한 경기·승리로 오르고 못하면 떨어지고, 매주 50 쪽으로', () => {
    const c = createCareer(spec(), 1);
    expect(c.confidence).toBe(50);
    confidenceAfterGame(c, 'S', true, true);
    expect(c.confidence).toBe(60);
    confidenceDrift(c);
    expect(c.confidence).toBe(59);
    confidenceAfterGame(c, 'D', false, true);
    expect(c.confidence).toBe(53);
    c.confidence = 100;
    expect(confidenceBoost(c).composure).toBe(5);
    const me = gameMe(c, true);
    c.confidence = 50;
    const me2 = gameMe(c, true);
    expect(me.r.composure - me2.r.composure).toBe(5);
  });

  it('별명: 기록이 차면 붙고, 더 큰 기록이면 바뀐다', () => {
    const c = createCareer(spec(), 2);
    expect(checkNickname(c)).toEqual([]);
    c.stats.threesMade = 80;
    expect(checkNickname(c)[0]).toContain("'슈터'");
    c.stats.clutchMade = 25;
    expect(checkNickname(c)[0]).toContain('클러치 킹');
    expect(displayName(c)).toBe("'클러치 킹' 테스트");
    expect(createCareer(spec({ background: 'genius' }), 3) && checkNickname(createCareer(spec({ background: 'genius' }), 3))[0]).toContain('천재');
  });

  it('v7 세이브를 불러오면 자신감 50, 별명 없음', () => {
    const c = createCareer(spec(), 4);
    const raw = JSON.parse(exportCareer(c));
    raw.career.v = 7;
    delete raw.career.confidence;
    delete raw.career.nickname;
    const back = importCareer(JSON.stringify(raw));
    expect(back.confidence).toBe(50);
    expect(back.nickname).toBeNull();
  });
});
