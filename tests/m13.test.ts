import { describe, expect, it } from 'vitest';
import { autoWeek } from '../src/career/autoplay';
import { createCareer, doWeek, SAVE_VERSION, teammates, type CreateSpec } from '../src/career/career';
import { checkCombos, COMBO_FRIEND, comboKind } from '../src/career/combos';
import { EVENTS, forceEvent, resolveEvent, rollEvent } from '../src/career/events';
import { answerPosition, applyStreet, CAMPS, campDue, canCamp, checkPosition, runCamp, runStreet } from '../src/career/extras';
import { hofScore } from '../src/career/legacy';
import { addAffection, meet } from '../src/career/romance';
import { exportCareer, importCareer } from '../src/career/save';
import { Rng } from '../src/core/rng';
import { lookFor, overall } from '../src/data/player';
import { RATING_KEYS } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { miniMult } from '../src/career/extras';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({ name: '테스트', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('x'), alloc: {}, school: 'HANB', ...over });

describe('콤비 기술 (R6, M13)', () => {
  it('친밀도 80을 넘긴 팀원과 콤비가 생기고 (두 명까지), 팀을 떠나면 끝난다', () => {
    const c = createCareer(spec(), 1);
    const mates = teammates(c).map((e) => e.player);
    for (const p of mates.slice(0, 3)) c.friends[p.id] = COMBO_FRIEND + 5;
    const notes = checkCombos(c);
    expect(c.combos.length).toBe(2);
    expect(notes.join(' ')).toContain('콤비 탄생');
    expect(comboKind(c.me, mates[0], 'SG')).toBeTypeOf('string');
    // 한 명이 졸업하면 해체
    c.roster = c.roster.filter((e) => e.player.id !== c.combos[0].mate);
    const out = checkCombos(c);
    expect(out.some((t) => t.includes('끝났다'))).toBe(true);
    expect(c.combos.length).toBe(2);
  });

  it('엔진: 콤비끼리 패스를 더 주고받고, 콤비로 넣으면 표시가 붙는다', () => {
    const a = generateTeam(new Rng(21), TEAM_INFOS[1], 0);
    const b = generateTeam(new Rng(22), TEAM_INFOS[4], 0);
    const pair = (g: ReturnType<typeof simulateGame>) => g.events.filter((e) => e.type === 'made' && e.team === 0 && ((e.player === 0 && e.other === 4) || (e.player === 4 && e.other === 0))).length;
    let base = 0;
    let withCombo = 0;
    let flagged = 0;
    for (let s = 0; s < 12; s++) {
      base += pair(simulateGame(a, b, 300 + s));
      const g = simulateGame(a, b, 300 + s, { combos: [{ a: 0, b: 4, kind: 'pnr' }] });
      withCombo += pair(g);
      flagged += g.events.filter((e) => e.combo).length;
    }
    expect(withCombo).toBeGreaterThan(base);
    expect(flagged).toBeGreaterThan(0);
  });
});

describe('포지션 전향 (M13)', () => {
  it('다른 포지션이 확실히 맞으면 감독이 권하고, 받아들이면 선호 포지션이 바뀐다', () => {
    const c = createCareer(spec({ prefPos: 'PG' }), 2);
    c.week = 30;
    // 센터처럼 만들기
    c.me.r.postUp = c.me.r.postD = c.me.r.offReb = c.me.r.defReb = c.me.r.boxOut = c.me.r.block = c.me.r.strength = 80;
    c.me.r.passing = c.me.r.vision = c.me.r.ballHandling = 20;
    checkPosition(c);
    expect(c.posOffer).not.toBeNull();
    const to = c.posOffer!;
    expect(overall(c.me, to)).toBeGreaterThan(overall(c.me, 'PG') + 2);
    // 다음 제안은 반년 뒤
    const trust = c.trust;
    answerPosition(c, true);
    expect(c.prefPos).toBe(to);
    expect(c.trust).toBeGreaterThan(trust);
    expect(c.posChanges).toBe(1);
    checkPosition(c);
    expect(c.posOffer).toBeNull();
  });
});

describe('전지훈련 (L8)', () => {
  it('고교·대학은 1월, 프로는 프리시즌 전. 한 해에 한 번', () => {
    const c = createCareer(spec(), 3);
    expect(campDue(c, 40)).toBe(true);
    expect(campDue(c, 39)).toBe(false);
    const p0 = c.points.P;
    c.week = 41;
    runCamp(c, 'mountain');
    expect(c.points.P).toBe(p0 + 16);
    expect(campDue(c, 40)).toBe(false);
    expect(campDue(c, 88)).toBe(true);
  });

  it('스킬캠프는 돈이 들고, 은사 합숙은 은사를 만나야 한다', () => {
    const c = createCareer(spec(), 4);
    const skill = CAMPS.find((d) => d.id === 'skill')!;
    const mentor = CAMPS.find((d) => d.id === 'mentor')!;
    expect(canCamp(c, skill)).toBe(false);
    expect(canCamp(c, mentor)).toBe(false);
    c.money = 400;
    c.mentor.met = true;
    expect(canCamp(c, skill)).toBe(true);
    const t0 = c.points.T;
    runCamp(c, 'skill');
    expect(c.money).toBe(100);
    expect(c.points.T).toBe(t0 + 20);
  });
});

describe('3x3 길거리 대회 (L8)', () => {
  it('8팀 토너먼트: 지면 끝나고, 이긴 경기는 21점을 먼저 낸다. 같은 시드면 같은 결과', () => {
    const run = () => {
      const c = createCareer(spec(), 5);
      return { c, r: runStreet(c) };
    };
    const { c, r } = run();
    expect(r.team.length).toBe(3);
    expect(r.games.length).toBeGreaterThanOrEqual(1);
    expect(r.games.length).toBeLessThanOrEqual(3);
    for (const g of r.games) {
      expect(Math.max(...g.score)).toBeLessThanOrEqual(21);
      expect(g.score[0]).not.toBe(g.score[1]);
      expect(g.log.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(run().r)).toBe(JSON.stringify(r));
    // 이벤트에서 나가면 대회가 걸린다
    c.pendingEvent = forceEvent(c, 'street3x3', new Rng(1));
    resolveEvent(c, c.pendingEvent!, 0);
    expect(c.streetPending).toBe(true);
    applyStreet(c, r);
    expect(c.streetPending).toBe(false);
  });

  it('우승 트로피는 학교 대회 우승으로 셈하지 않는다', () => {
    const c = createCareer(spec(), 6);
    for (const k of RATING_KEYS) c.me.r[k] = 95;
    let won = false;
    for (let i = 0; i < 6 && !won; i++) {
      const r = runStreet(c);
      applyStreet(c, r);
      won = r.finish === '우승';
    }
    expect(won).toBe(true);
    expect(c.trophies.some((t) => t.includes('3x3'))).toBe(true);
    expect(c.trophies.some((t) => /고교 .*우승/.test(t))).toBe(false);
    expect(hofScore(c)).toBe(0);
  });
});

describe('연애 (R4) · 미니게임 (T4) · 세이브', () => {
  it('설정에서 끄면 연애 이벤트가 안 나온다', () => {
    const love = EVENTS.filter((e) => e.id.startsWith('love')).map((e) => e.id);
    expect(love.length).toBeGreaterThanOrEqual(5);
    const c = createCareer(spec(), 7);
    c.week = 20;
    c.settings.romance = false;
    const rng = new Rng(9);
    for (let i = 0; i < 400; i++) {
      c.seenEvents = {};
      const ev = rollEvent(c, rng);
      if (ev) expect(love).not.toContain(ev.id);
    }
  });

  it('만나서 사귀고, 호감도가 바닥나면 헤어진다', () => {
    const c = createCareer(spec(), 8);
    c.pendingEvent = forceEvent(c, 'loveMeet', new Rng(1));
    resolveEvent(c, c.pendingEvent!, 0);
    expect(c.romance?.status).toBe('crush');
    expect(c.romance?.name.length).toBeGreaterThan(1);
    c.romance!.affection = 60;
    // 고백은 확률이라 여러 번
    for (let i = 0; i < 10 && c.romance?.status === 'crush'; i++) {
      c.pendingEvent = forceEvent(c, 'loveConfess', new Rng(i));
      resolveEvent(c, c.pendingEvent!, 0);
      if (c.romance) c.romance.affection = 60;
    }
    expect(c.romance?.status).toBe('dating');
    expect(addAffection(c, -200)).toContain('멀어졌다');
    expect(c.romance).toBeNull();
    meet(c, new Rng(3));
    expect(c.romance).not.toBeNull();
  });

  it('미니게임 배율 0.8~1.3, 훈련 포인트에 곱해진다', () => {
    expect(miniMult(0)).toBe(0.8);
    expect(miniMult(1)).toBe(1.3);
    expect(miniMult(2)).toBe(1.3);
    const pts = (bonus: number) => {
      const c = createCareer(spec(), 10);
      const r = doWeek(c, 'weight', undefined, bonus);
      return r.gained.P;
    };
    expect(pts(1.3)).toBeGreaterThan(pts(0.8));
  });

  it('v5 세이브를 불러오면 새 칸이 채워진다', () => {
    const c = createCareer(spec(), 11);
    const raw = JSON.parse(exportCareer(c));
    raw.career.v = 5;
    for (const k of ['combos', 'posOffer', 'campPending', 'streetPending', 'romance', 'settings']) delete raw.career[k];
    const back = importCareer(JSON.stringify(raw));
    expect(back.v).toBe(SAVE_VERSION);
    expect(back.combos).toEqual([]);
    expect(back.settings).toEqual({ romance: true, minigame: true });
    expect(back.romance).toBeNull();
  });

  it('자동 진행은 3x3·전지훈련·전향 제안을 알아서 처리한다', { timeout: 60000 }, () => {
    const c = createCareer(spec(), 12);
    for (let w = 0; w < 48; w++) {
      autoWeek(c, 'good', { invest: true });
      expect(c.streetPending).toBe(false);
      expect(c.campPending).toBe(false);
      expect(c.posOffer).toBeNull();
    }
    expect(c.campYear).toBe(0);
  });
});
