import { describe, expect, it } from 'vitest';
import { runAllStar } from '../src/career/allstar';
import { createCareer, type CreateSpec } from '../src/career/career';
import { runDraft } from '../src/career/draft';
import { EVENTS, effectHint, fill, forceEvent, resolveEvent, type Effect } from '../src/career/events';
import { Rng } from '../src/core/rng';
import { DUNKS, dunkList } from '../src/data/dunks';
import { generatePlayer, lookFor } from '../src/data/player';
import { RATING_KEYS } from '../src/data/ratings';
import { DUNK_ACT, DUNK_LABEL } from '../src/sim/types';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({ name: '테스트', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('x'), alloc: {}, school: 'HANB', ...over });

function pro(seed: number) {
  const c = createCareer(spec({ background: 'elite' }), seed);
  for (const k of RATING_KEYS) c.me.r[k] = 82;
  c.week = 3 * 48;
  c.yearOf = 3;
  c.season = null;
  c.me.age = 19;
  c.draft = runDraft(c);
  return c;
}

const effects = (e: Effect): Effect[] => (e.chance ? [e, ...effects(e.chance.ok), ...effects(e.chance.fail)] : [e]);

describe('콘텐츠 (M20)', () => {
  it('이벤트 55개 넘게, id는 겹치지 않고 선택지·경험치 키가 올바르다', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(55);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
    for (const e of EVENTS) {
      expect(e.choices.length).toBeGreaterThan(0);
      for (const ch of e.choices)
        for (const ef of effects(ch.effect)) for (const k of Object.keys(ef.xp ?? {})) expect(RATING_KEYS as string[]).toContain(k);
    }
  });

  it('고교·프로 커리어 모두 글 속 이름이 다 바뀐다 ({…}가 안 남는다)', () => {
    const hs = createCareer(spec(), 1);
    const p = pro(2);
    p.nickname = '슈터';
    for (const c of [hs, p])
      for (const e of EVENTS) {
        const ev = forceEvent(c, e.id, new Rng(3))!;
        for (const t of [e.title, e.text, ...e.choices.map((ch) => ch.label), ...e.choices.flatMap((ch) => effects(ch.effect).map((x) => x.text ?? ''))]) expect(fill(c, t, ev.mate)).not.toMatch(/\{\w+\}/);
      }
  });

  it('조건이 맞는 시기에만: 시험은 학생, 향수병은 해외, 은퇴 고민은 33살부터', () => {
    const hs = createCareer(spec(), 4);
    const p = pro(5);
    const ev = (id: string) => EVENTS.find((e) => e.id === id)!;
    hs.week = 4; // 4월 1주
    expect(ev('exam').when(hs)).toBe(true);
    p.week = 3 * 48 + 8;
    expect(ev('exam').when(p)).toBe(false);
    expect(ev('homesick').when(p)).toBe(false);
    p.overseas = true;
    expect(ev('homesick').when(p)).toBe(true);
    expect(ev('twilight').when(p)).toBe(false);
    p.me.age = 34;
    expect(ev('twilight').when(p)).toBe(true);
  });

  it('자신감 효과: 바닥난 자신감 이벤트로 오른다, 힌트에 표시', () => {
    const c = createCareer(spec(), 6);
    c.confidence = 15;
    const def = EVENTS.find((e) => e.id === 'confLow')!;
    expect(def.when(c)).toBe(true);
    expect(effectHint(def.choices[0].effect)).toContain('자신감 +10');
    resolveEvent(c, forceEvent(c, 'confLow', new Rng(1))!, 0);
    expect(c.confidence).toBe(25);
  });

  it('프로 베테랑·신인 이벤트는 나이로 팀원을 고른다', () => {
    const c = pro(7);
    const team = c.league!.teams.find((t) => t.info.id === c.pro!.team)!;
    const vet = forceEvent(c, 'vetAdvice', new Rng(2))!;
    if (vet.mate) expect(team.players.find((x) => x.id === vet.mate)!.age!).toBeGreaterThanOrEqual(31);
    const kid = forceEvent(c, 'rookieMentor', new Rng(2))!;
    if (kid.mate) expect(team.players.find((x) => x.id === kid.mate)!.age!).toBeLessThanOrEqual(23);
  });

  it('새 덩크 4개: 해머·슈퍼맨은 경기용, 스콜피온·셀프 앨리웁은 콘테스트 전용', () => {
    for (const id of ['hammer', 'superman', 'scorpion', 'selfOop'] as const) {
      expect(DUNKS.find((d) => d.id === id)).toBeTruthy();
      expect(DUNK_LABEL[id]).toBeTruthy();
      expect(DUNK_ACT[id]).toBeGreaterThan(57);
    }
    expect(DUNKS.find((d) => d.id === 'scorpion')!.contestOnly).toBe(true);
    expect(DUNKS.find((d) => d.id === 'hammer')!.contestOnly).toBeFalsy();
    const p = generatePlayer(new Rng(1), 'SF', 0, 1);
    for (const k of RATING_KEYS) p.r[k] = 70;
    expect(dunkList(p)).not.toContain('superman');
  });

  it('덩크 콘테스트는 가장 화려한 덩크부터 (콘테스트 전용이 나온다)', () => {
    const c = pro(8);
    for (const k of RATING_KEYS) c.me.r[k] = 99;
    c.league!.season = 0;
    const w = runAllStar(c, new Rng(3));
    const mine = w.dunk.find((r) => r.id === 'me');
    expect(mine).toBeTruthy();
    const contest = new Set(DUNKS.filter((d) => d.contestOnly).map((d) => d.id));
    expect(mine!.rounds.some((r) => contest.has(r.dunk!))).toBe(true);
  });
});
