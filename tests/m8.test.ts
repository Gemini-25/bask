import { describe, expect, it } from 'vitest';
import { createCareer, SAVE_VERSION, type CreateSpec } from '../src/career/career';
import { ALLSTAR_WEEK, allStarGame, callUp, NATIONAL_CALL, recordNational, runAllStar } from '../src/career/allstar';
import { seasonAwards, synthLines } from '../src/career/awards';
import { runDraft } from '../src/career/draft';
import { ACHIEVEMENTS, HOF_SCORE, hofScore, legacyBonus, retire, trophyPoints } from '../src/career/legacy';
import { PRO_WEEKS, standings } from '../src/career/league';
import { applyMatch, playMatch, teamInfoOf } from '../src/career/match';
import { createForeignLeague, OVERSEAS_RULES } from '../src/career/overseas';
import { contractOffers, proNewYear, signContract } from '../src/career/pro';
import { exportCareer, importCareer } from '../src/career/save';
import { afterGame, playWeek } from '../src/career/turn';
import { Rng } from '../src/core/rng';
import { lookFor } from '../src/data/player';
import { RATING_KEYS } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { boxScore } from '../src/sim/stats';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({
  name: '테스트',
  number: 7,
  gender: 'M',
  prefPos: 'SG',
  background: 'elite',
  growth: 'normal',
  heightDelta: 0,
  build: 'normal',
  look: lookFor('x'),
  alloc: {},
  school: 'HANB',
  ...over,
});

/** 고교를 건너뛰고 바로 드래프트 (능력치는 리그 정상급) */
function rookie(seed: number, rating = 82) {
  const c = createCareer(spec(), seed);
  for (const k of RATING_KEYS) c.me.r[k] = rating;
  c.week = 3 * 48;
  c.yearOf = 3;
  c.season = null;
  c.me.age = 19;
  c.draft = runDraft(c);
  return c;
}

/** 내 경기는 결과만 보면서 n주 진행 */
function play(c: ReturnType<typeof rookie>, weeks: number) {
  for (let i = 0; i < weeks; i++) {
    playWeek(c, c.injury ? 'rehab' : c.fatigue > 55 ? 'rest' : 'team');
    c.pendingEvent = null;
    if (c.allStar) c.allStar.unseen = false;
    while (c.pendingGame) {
      applyMatch(c, playMatch(c));
      afterGame(c);
    }
    if (c.contractPending) signContract(c, contractOffers(c).mine);
    c.retirePending = null;
  }
}

describe('시상 (L6)', () => {
  it('남의 경기는 팀 득점을 선수에게 나눠 적고, 상은 기록 1위에게', () => {
    const c = rookie(1);
    const L = c.league!;
    const rng = new Rng(3);
    for (let g = 0; g < 20; g++)
      for (const t of L.teams) synthLines(L, t.players, t.info.id, 80 + (g % 7), rng);
    // 팀 득점 합이 맞다
    const team0 = L.teams[0];
    const sum = team0.players.reduce((s, p) => s + (L.stats![p.id]?.pts ?? 0), 0);
    expect(sum).toBe(Array.from({ length: 20 }, (_, g) => 80 + (g % 7)).reduce((a, b) => a + b, 0));
    const wins = Object.fromEntries(standings(L).map((r) => [r.id, r.w]));
    const a = seasonAwards(L, 'BASK 리그', [], wins);
    const top = Object.entries(L.stats!).sort((x, y) => y[1].pts / y[1].g - x[1].pts / x[1].g)[0];
    expect(a.awards.find((x) => x.key === 'pts')!.id).toBe(top[0]);
    expect(a.awards.filter((x) => x.key === 'best5').length).toBe(5);
    // 신인이 없거나 기록이 모자라면 신인왕은 없다
    expect(a.awards.some((x) => x.key === 'roy')).toBe(false);
  });
});

describe('올스타 위크엔드 (L6, L8)', () => {
  it('정규시즌 한가운데 경기 없는 주에 열리고, 두 팀 12명씩, 콘테스트 결승까지', () => {
    const c = rookie(2);
    const base = Math.floor(c.week / 48) * 48;
    expect(c.league!.games.some((g) => g.week === base + ALLSTAR_WEEK)).toBe(false);
    expect(ALLSTAR_WEEK).toBe(PRO_WEEKS.seasonStart + PRO_WEEKS.allStarBreak);
    const w = runAllStar(c, new Rng(5));
    expect(w.dream.length).toBe(12);
    expect(w.magic.length).toBe(12);
    expect(new Set([...w.dream, ...w.magic]).size).toBe(24);
    // 리그 정상급이라 뽑힌다
    expect(w.mySide).toBeGreaterThanOrEqual(0);
    expect(c.trophies.some((t) => t.endsWith('올스타'))).toBe(true);
    expect(w.three.length).toBe(6);
    expect(w.three.filter((r) => r.rounds.length === 2).length).toBe(3);
    expect(w.three.every((r) => r.rounds[0].shots!.length === 25)).toBe(true);
    expect(w.dunk.length).toBe(4);
    expect(w.dunk.filter((r) => r.rounds.length === 3).length).toBe(2);
    for (const r of w.dunk) for (const d of r.rounds) expect(d.score).toBe(d.judges!.reduce((a, b) => a + b, 0));
    // 같은 시드면 같은 결과
    const again = runAllStar(rookie(2), new Rng(5));
    expect(again.threeWinner).toBe(w.threeWinner);
    expect(again.dunkWinner).toBe(w.dunkWinner);
  });

  it('올스타전은 드림팀 vs 매직팀, 감독 신뢰는 안 바뀐다', () => {
    const c = rookie(3);
    c.allStar = runAllStar(c, new Rng(7));
    c.pendingGame = allStarGame(c);
    expect(c.pendingGame?.special).toBe('allstar');
    const trust = c.trust;
    const m = playMatch(c);
    expect(m.game.teams.map((t) => t.id).sort()).toEqual(['DRM', 'MGC']);
    expect(m.myPid).toBeGreaterThanOrEqual(0);
    applyMatch(c, m);
    expect(c.trust).toBe(trust);
    expect(c.allStar.game).toBeDefined();
    expect(teamInfoOf(c, 'DRM').full).toContain('드림팀');
  });
});

describe('국가대표 (L7)', () => {
  it('리그 최고 12명에 들면 뽑히고, 조별 2승이면 결승, 결승에서 이기면 우승 트로피', () => {
    const c = rookie(4);
    const base = Math.floor(c.week / 48) * 48;
    const camp = callUp(c, base, new Rng(9))!;
    expect(camp).not.toBeNull();
    expect(camp.squad).toContain('me');
    expect(camp.squad.length).toBe(12);
    expect(camp.games.length).toBe(3);
    c.national = camp;
    const [g1, g2, g3] = camp.games;
    recordNational(c, g1.week, g1.opp, [90, 80]);
    recordNational(c, g2.week, g2.opp, [70, 80]);
    expect(recordNational(c, g3.week, g3.opp, [99, 70])).toContain('결승');
    const fin = camp.games.find((g) => g.final)!;
    expect(fin.opp).toBe('AUS');
    recordNational(c, fin.week, fin.opp, [88, 85]);
    expect(camp.result).toBe('우승');
    expect(c.trophies.some((t) => t.includes('아시아컵 우승'))).toBe(true);
  });

  it('비시즌에 소집돼서 아시아컵 경기를 치른다', () => {
    const c = rookie(5);
    play(c, 48 - (c.week % 48));
    expect(c.week % 48).toBe(0);
    play(c, NATIONAL_CALL + 2);
    expect(c.national).not.toBeNull();
    expect(c.games.some((g) => g.label.startsWith('아시아컵'))).toBe(true);
  });

  it('리그에서 못하면 안 뽑힌다', () => {
    const c = rookie(6, 40);
    expect(callUp(c, 0, new Rng(1))).toBeNull();
  });
});

describe('해외 리그 (L9)', () => {
  it('더 센 가상 리그 10팀, 외국 이름', () => {
    const L = createForeignLeague(new Rng(1), 'M');
    expect(L.teams.length).toBe(10);
    for (const t of L.teams) expect(t.players.length).toBeGreaterThanOrEqual(12);
    expect(L.teams[0].players[0].name).toContain(' ');
  });

  it('해외 진출하면 리그가 바뀌고, 쿼터 12분·6반칙 규칙, 복귀하면 국내 리그로', () => {
    const c = rookie(7, 90);
    c.trophies.push('1시즌 MVP');
    const home = c.league!;
    const { abroad } = contractOffers(c);
    expect(abroad.length).toBe(1);
    expect(abroad[0].abroad).toBe(true);
    signContract(c, abroad[0]);
    expect(c.overseas).toBe(true);
    expect(c.homeLeague).toBe(home);
    expect(c.league!.teams.some((t) => t.info.id === c.pro!.team)).toBe(true);
    expect(c.league!.season).toBe(home.season);
    expect(c.teamHistory.length).toBe(2);
    // 첫 경기까지 진행
    c.week = Math.floor(c.week / 48) * 48 + PRO_WEEKS.seasonStart;
    c.pendingGame = { kind: 'official', pro: true, opponent: c.league!.teams.find((t) => t.info.id !== c.pro!.team)!.info.id, label: '정규시즌 1라운드', home: true };
    const m = playMatch(c);
    expect(m.game.quarterSeconds).toBe(OVERSEAS_RULES.quarterMinutes * 60);
    // 시즌이 지나면 국내 리그도 한 해가 간다
    const hs = home.season;
    c.week = Math.ceil((c.week + 1) / 48) * 48;
    proNewYear(c);
    expect(home.season).toBe(hs + 1);
    // 복귀
    c.contractPending = true;
    const back = contractOffers(c).abroad;
    expect(back.every((o) => o.home)).toBe(true);
    signContract(c, back[0]);
    expect(c.overseas).toBe(false);
    expect(c.league).toBe(home);
    expect(c.abroadLeague).not.toBeNull();
  });

  it('엔진: 6반칙 규칙이면 5반칙으로는 안 나간다', () => {
    const a = generateTeam(new Rng(1), TEAM_INFOS[0], 0);
    const b = generateTeam(new Rng(2), TEAM_INFOS[1], 0);
    let six = 0;
    for (let s = 0; s < 12; s++) {
      const g = simulateGame(a, b, s, { foulOut: 6 });
      const box = boxScore(g);
      for (const l of box.players) expect(l.pf).toBeLessThanOrEqual(6);
      six += g.events.filter((e) => e.text?.includes('6반칙 퇴장')).length;
      expect(g.events.some((e) => e.text?.includes('5반칙 퇴장'))).toBe(false);
    }
    expect(six).toBeGreaterThanOrEqual(0);
  });
});

describe('은퇴, 명예의 전당, 2세 (L10~L12)', () => {
  it('트로피 점수와 통산 기록으로 명예의 전당, 오래 뛴 팀은 영구결번', () => {
    const c = rookie(8);
    expect(trophyPoints('3시즌 MVP')).toBe(12);
    expect(trophyPoints('해외 3시즌 MVP')).toBe(18);
    expect(trophyPoints('3시즌 올스타전 MVP')).toBe(1);
    expect(trophyPoints('3시즌 우승')).toBe(6);
    expect(trophyPoints('3시즌 올스타')).toBe(2);
    c.trophies.push('1시즌 MVP', '2시즌 MVP', '3시즌 MVP', '4시즌 MVP', '5시즌 MVP', '3시즌 우승', '4시즌 우승', '6시즌 우승');
    for (let s = 1; s <= 7; s++) c.trophies.push(`${s}시즌 올스타`, `${s}시즌 베스트 5`);
    expect(hofScore(c)).toBeGreaterThanOrEqual(HOF_SCORE);
    c.pro!.season = 6;
    c.me.age = 33;
    const s = retire(
      c,
      (id) => teamInfoOf(c, id).full,
      (id) => teamInfoOf(c, id).color,
    );
    expect(s.hof).toBe(true);
    expect(s.retiredBy).toBe(teamInfoOf(c, c.pro!.team).full);
    expect(s.seasons).toBe(7);
    expect(c.retired).toBe(s);
    const b = legacyBonus(s);
    expect(b.parent).toBe('테스트');
    expect(b.points).toBeGreaterThan(6);
    expect(b.generation).toBe(2);
  });

  it('2세는 자유 포인트·잠재력·용돈을 더 받는다', () => {
    const alloc = Object.fromEntries(RATING_KEYS.map((k) => [k, 5]));
    const plain = createCareer(spec({ background: 'ordinary', alloc }), 1);
    const kid = createCareer(spec({ background: 'ordinary', alloc, legacy: { parent: '아빠', points: 20, potential: 4, money: 5000, generation: 2 } }), 1);
    const total = (x: typeof plain) => RATING_KEYS.reduce((s, k) => s + x.me.r[k], 0);
    expect(total(kid) - total(plain)).toBe(20);
    expect(kid.potential - plain.potential).toBe(4);
    expect(kid.money).toBe(5000);
    expect(kid.legacy?.parent).toBe('아빠');
  });

  it('나이가 차면 은퇴를 묻고, 39살이면 무조건', () => {
    const c = rookie(9);
    c.me.age = 38;
    c.week = Math.ceil((c.week + 1) / 48) * 48;
    proNewYear(c);
    expect(c.retirePending).toBe('forced');
    const d = rookie(10);
    d.me.age = 31;
    d.pro!.years = 1;
    d.week = Math.ceil((d.week + 1) / 48) * 48;
    proNewYear(d);
    expect(d.contractPending).toBe(true);
    expect(d.retirePending).toBe('choice');
  });
});

describe('업적 (K6)', () => {
  it('커리어 상태로 판정한다', () => {
    const c = rookie(11);
    const ok = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!.test(c);
    expect(ok('draft')).toBe(true);
    expect(ok('mvp')).toBe(false);
    c.trophies.push('2시즌 MVP');
    expect(ok('mvp')).toBe(true);
    expect(ok('allstar')).toBe(false);
    c.trophies.push('2시즌 올스타');
    expect(ok('allstar')).toBe(true);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('세이브 v4', () => {
  it('v3 세이브를 읽으면 M8 항목이 채워진다', () => {
    const c = rookie(12);
    const raw = JSON.parse(exportCareer(c));
    const old = raw.career;
    old.v = 3;
    for (const k of ['trophies', 'ceremony', 'overseas', 'homeLeague', 'abroadLeague', 'allStar', 'national', 'teamHistory', 'peakOvr', 'retirePending', 'retired', 'legacy']) delete old[k];
    const back = importCareer(JSON.stringify(raw));
    expect(back.v).toBe(SAVE_VERSION);
    expect(back.trophies).toEqual([]);
    expect(back.overseas).toBe(false);
    expect(back.allStar).toBeNull();
    expect(back.teamHistory.length).toBe(1);
    expect(back.retired).toBeNull();
    // 이어서 진행해도 된다
    play(back, 2);
    expect(back.week).toBe(c.week + 2);
  });
});
