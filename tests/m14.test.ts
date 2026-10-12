import { describe, expect, it } from 'vitest';
import { createCareer, type CreateSpec } from '../src/career/career';
import { editGroups, findEditable, isGenerated, marksDev, revertEdit, snapEdit, storeOverride } from '../src/career/edit';
import { opponentTeam } from '../src/career/match';
import { newYear } from '../src/career/turn';
import { readFileSync } from 'node:fs';
import { autoWeek } from '../src/career/autoplay';
import { importCareer } from '../src/career/save';
import { lookFor } from '../src/data/player';
import { RATING_KEYS } from '../src/data/ratings';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({ name: '테스트', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('x'), alloc: {}, school: 'HANB', ...over });

describe('인게임 에디터 (M14)', () => {
  it('고교: 나, 팀원, 라이벌, 상대 학교 9곳이 묶음으로 나온다', () => {
    const c = createCareer(spec(), 1);
    const g = editGroups(c);
    expect(g[0].entries[0].key).toBe('me');
    expect(g.find((x) => x.id === 'mate')!.entries.length).toBe(c.roster.length);
    expect(g.filter((x) => x.id.startsWith('school:')).length).toBe(9);
    for (const grp of g) for (const e of grp.entries.slice(0, 3)) expect(findEditable(c, e.key)?.player.id).toBe(e.player.id);
  });

  it('세이브에 있는 선수는 그 객체를 바로 고친다', () => {
    const c = createCareer(spec(), 2);
    const mate = c.roster[0].player;
    const e = findEditable(c, `mate:${mate.id}`)!;
    expect(e.player).toBe(mate);
    expect(findEditable(c, 'me')!.player).toBe(c.me);
    expect(findEditable(c, 'rival')!.player).toBe(c.rival!.player);
  });

  it('상대 학교 선수는 고친 사본이 그해 경기에 쓰이고, 새해에 지워진다', () => {
    const c = createCareer(spec(), 3);
    const grp = editGroups(c).find((x) => x.id.startsWith('school:'))!;
    const e = findEditable(c, grp.entries[0].key)!;
    expect(isGenerated(e.key)).toBe(true);
    for (const k of RATING_KEYS) e.player.r[k] = 99;
    storeOverride(c, e.player);
    const again = opponentTeam(c, e.team).players.find((p) => p.id === e.player.id)!;
    expect(again.r.three).toBe(99);
    c.week = 48;
    newYear(c);
    expect(c.overrides).toBeUndefined();
  });

  it('처음 값으로: 능력치·성격·친밀도·콤비까지 되돌린다 (같은 객체 그대로)', () => {
    const c = createCareer(spec({ trait: 'diligent' }), 4);
    const me = findEditable(c, 'me')!;
    const s = snapEdit(c, me);
    const three = c.me.r.three;
    c.me.r.three = 99;
    c.traits.push('showman', 'cool', 'hothead');
    c.prefPos = 'C';
    c.potential = 99;
    revertEdit(c, me, s);
    expect(c.me.r.three).toBe(three);
    expect(c.traits).toEqual(['diligent']);
    expect(c.prefPos).toBe('SG');
    expect(me.player).toBe(c.me);
    const mate = findEditable(c, `mate:${c.roster[1].player.id}`)!;
    const ms = snapEdit(c, mate);
    const f0 = c.friends[mate.player.id];
    c.friends[mate.player.id] = 99;
    c.combos.push({ mate: mate.player.id, name: mate.player.name, kind: 'pnr' });
    mate.player.name = '바뀜';
    revertEdit(c, mate, ms);
    expect(c.friends[mate.player.id]).toBe(f0);
    expect(c.combos).toEqual([]);
    expect(mate.player.name).not.toBe('바뀜');
    expect(c.roster[1].player).toBe(mate.player);
  });

  it('🔧: 내 선수는 뭐든, 다른 선수는 이름·등번호·겉모습이면 안 남는다', () => {
    expect(marksDev('me', 'name')).toBe(true);
    expect(marksDev('mate:x', 'name')).toBe(false);
    expect(marksDev('lg:A:x', 'look')).toBe(false);
    expect(marksDev('lg:A:x', 'r')).toBe(true);
    expect(marksDev('school:A:x', 'abilities')).toBe(true);
  });

  it('프로: 리그 다른 팀 선수도 고칠 수 있다', { timeout: 60000 }, () => {
    // 고3 마지막 주 샘플 세이브 → 드래프트까지
    const c = importCareer(readFileSync('play/sample-pre-draft-save.json', 'utf8'));
    for (let w = 0; w < 6 && !c.pro; w++) autoWeek(c, 'simple');
    expect(c.pro).not.toBeNull();
    const g = editGroups(c);
    const lg = g.filter((x) => x.id.startsWith('lg:'));
    expect(lg.length).toBe(c.league!.teams.length - 1);
    const e = findEditable(c, lg[0].entries[0].key)!;
    expect(c.league!.teams.some((t) => t.players.includes(e.player))).toBe(true);
  });
});
