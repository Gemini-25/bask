import { describe, expect, it } from 'vitest';
import { SkipRun, skipWeeks, type SkipOpts } from '../src/career/autoplay';
import { createCareer, type CreateSpec } from '../src/career/career';
import { Rng } from '../src/core/rng';
import { generatePlayer, lookFor } from '../src/data/player';
import { RATING_KEYS } from '../src/data/ratings';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { COURT, hoopXY } from '../src/sim/court';
import { simulateGame } from '../src/sim/engine';
import { dunkReach, leapOf } from '../src/sim/leap';
import { lineupRoles, matchups } from '../src/sim/roles';
import { shotInfo } from '../src/sim/shooting';
import { boxScore } from '../src/sim/stats';
import type { GameResult } from '../src/sim/types';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({ name: '테스트', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('x'), alloc: {}, school: 'HANB', ...over });

function games(n: number, star?: number) {
  const out: GameResult[] = [];
  for (let g = 0; g < n; g++) {
    const a = generateTeam(new Rng(900 + g), TEAM_INFOS[g % 10], 1);
    const b = generateTeam(new Rng(950 + g), TEAM_INFOS[(g + 4) % 10], 1);
    if (star !== undefined) {
      for (const k of RATING_KEYS) a.players[1].r[k] = star;
      a.players[1].body = { ...a.players[1].body, heightCm: Math.max(a.players[1].body.heightCm, 198) };
    }
    out.push(simulateGame(a, b, 600 + g));
  }
  return out;
}

/** 덩크·레이업마다 발이 떨어진 자리에서 림까지 거리와 체공 (초) */
function takeoffs(gs: GameResult[], kind: 'dunk' | 'layup', pid?: number) {
  const out: { d: number; air: number }[] = [];
  for (const g of gs)
    for (const e of g.events) {
      if (e.type !== 'made' || e.shot !== kind || e.alleyOop || e.dunk === 'putback' || e.blocked) continue;
      if (pid !== undefined && e.player !== pid) continue;
      let lu = g.lineups[0];
      for (const l of g.lineups) if (l.tick <= e.tick) lu = l;
      const s = lu.pids.indexOf(e.player);
      let f = e.tick;
      while (f > 0 && g.rec.pz[(f - 1) * 10 + s] > 0) f--;
      const x = g.rec.pos[f * 20 + s * 2];
      const y = g.rec.pos[f * 20 + s * 2 + 1];
      out.push({ d: Math.min(...[hoopXY(true), hoopXY(false)].map((H) => Math.hypot(H.x - x, H.y - y))), air: (e.tick - f) * g.dt });
    }
  return out;
}
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('도약·99·건너뛰기·역할 (M24)', () => {
  const gs = games(4);

  it('덩크는 림에서 떨어진 곳에서 뛰어 날아가 꽂는다 (점프가 좋을수록 멀리서)', () => {
    const t = takeoffs(gs, 'dunk');
    expect(t.length).toBeGreaterThan(10);
    expect(avg(t.map((x) => x.d))).toBeGreaterThan(1.6);
    expect(Math.max(...t.map((x) => x.air))).toBeLessThan(1.25);
    const star = takeoffs(games(4, 99), 'dunk', 1);
    expect(star.length).toBeGreaterThan(3);
    expect(avg(star.map((x) => x.d))).toBeGreaterThan(2.6);
    expect(avg(star.map((x) => x.d))).toBeGreaterThan(avg(t.map((x) => x.d)) + 0.5);
  });

  it('피지컬: 점프·키가 좋을수록 높이 뜨고 멀리서 뛰고, 덩크를 고를 수 있는 거리도 길다', () => {
    const p = generatePlayer(new Rng(5), 'SF', 0, 3);
    p.body = { heightCm: 198, wingspanCm: 206, weightKg: 95 };
    p.r.jump = 50;
    const lo = leapOf(p);
    const rLo = dunkReach(p);
    p.r.jump = 95;
    const hi = leapOf(p);
    expect(hi.vert).toBeGreaterThan(lo.vert + 0.25);
    expect(hi.range).toBeGreaterThan(lo.range + 0.4);
    expect(dunkReach(p)).toBeGreaterThan(rLo);
    // 키가 크면 덜 뛰어도 림 위로 손이 올라간다
    const tall = { ...p, body: { heightCm: 212, wingspanCm: 222, weightKg: 105 } };
    expect(leapOf(tall).clear).toBeGreaterThan(hi.clear);
    // 경기 기록: 덩크마다 도약 거리·점프·체공, 점프가 좋은 선수가 더 멀리서
    const ls = gs.flatMap((g) => g.events.filter((e) => e.type === 'made' && e.leap).map((e) => ({ ...e.leap!, jump: g.players[e.player].r.jump })));
    expect(ls.length).toBeGreaterThan(10);
    const good = ls.filter((l) => l.jump >= 68);
    const poor = ls.filter((l) => l.jump < 60);
    expect(avg(good.map((l) => l.d))).toBeGreaterThan(avg(poor.map((l) => l.d)));
    expect(avg(good.map((l) => l.h))).toBeGreaterThan(avg(poor.map((l) => l.h)));
  });

  it('레이업도 한두 걸음 앞에서 뜬다', () => {
    const t = takeoffs(gs, 'layup');
    expect(t.length).toBeGreaterThan(20);
    expect(avg(t.map((x) => x.d))).toBeGreaterThan(1.1);
  });

  it('99는 99답게: 엘리트 슛 보정, 경기에서도 높은 성공률', () => {
    const p = generatePlayer(new Rng(3), 'SG', 0, 7);
    const at = (v: number) => {
      p.r.three = v;
      return shotInfo(p, COURT.hoopFromBaseline + 7.2, 0).pOpen;
    };
    // 80까지는 그대로, 99에서 크게
    expect(at(99) - at(90)).toBeGreaterThan((at(80) - at(71)) * 1.4);
    let fgm = 0;
    let fga = 0;
    let tpm = 0;
    let tpa = 0;
    for (const g of games(6, 99)) {
      const l = boxScore(g).players[1];
      fgm += l.fgm;
      fga += l.fga;
      tpm += l.tpm;
      tpa += l.tpa;
    }
    // 99는 흔하지 않다: 리그 최상위보다 한 단계 위
    expect(fgm / fga).toBeGreaterThan(0.72);
    expect(tpm / tpa).toBeGreaterThan(0.55);
  });

  it('일정 건너뛰기: 정한 만큼 넘기고, 경기는 결과만, 다음 경기 앞에서는 멈춘다', () => {
    const c = createCareer(spec(), 11);
    const o: SkipOpts = { span: 6, routine: 'auto', stopGames: 'none', stopEvents: false, invest: true };
    const w0 = c.week;
    const r = skipWeeks(c, o);
    expect(r.weeks).toBeGreaterThan(0);
    expect(c.week - w0).toBe(r.weeks);
    expect(c.pendingEvent).toBeNull();
    if (!r.stopped) expect(r.weeks).toBe(6);
    // 다음 경기까지: 경기가 남은 채로 멈춘다
    c.campPending = false;
    c.posOffer = null;
    const g = skipWeeks(c, { ...o, span: 'game' });
    if (g.stopped === 'game') expect(c.pendingGame).toBeTruthy();
  });

  it('건너뛰다 이벤트에서 멈추면 고른 뒤 그 주 경기부터 이어 간다', () => {
    const c = createCareer(spec(), 12);
    const run = new SkipRun(c, { span: 20, routine: 'auto', stopGames: 'none', stopEvents: true, invest: false });
    let events = 0;
    for (let k = 0; k < 200 && !(run.finished && run.res.stopped !== 'event'); k++) {
      run.step();
      if (run.finished && run.res.stopped === 'event') {
        events++;
        c.pendingEvent = null;
        run.resume();
      }
    }
    expect(events).toBeGreaterThan(0);
    // 이벤트가 있어도 끝까지 (또는 사람이 봐야 할 화면까지) 간다
    expect(run.res.weeks).toBeGreaterThan(events);
    expect(run.res.games.length).toBeGreaterThan(0);
  });

  it('역할: 엔진 기준 그대로 (공 운반·아이솔 1옵션·스크리너), 수비 짝은 한 명씩', () => {
    const g = gs[0];
    const lu = g.lineups[0];
    const five = (t: number) => lu.pids.slice(t * 5, t * 5 + 5).map((p) => g.players[p]);
    const rs = lineupRoles(five(0), five(1));
    expect(rs.filter((r) => r.jobs.some((j) => j.startsWith('공 운반'))).length).toBe(1);
    expect(rs.filter((r) => r.jobs.includes('아이솔레이션 1옵션')).length).toBe(1);
    expect(rs.filter((r) => r.jobs.some((j) => j.startsWith('픽앤롤·핸드오프 스크린'))).length).toBe(1);
    const m = matchups(five(0), five(1));
    expect(new Set(m.values()).size).toBe(5);
    expect(rs.filter((r) => r.def === 'stopper').length).toBe(1);
    // 경기에서 아이솔레이션을 부른 선수는 그 라인업의 에이스
    let iso = 0;
    for (const e of g.events) {
      // 감독 조정으로 부른 아이솔 (몰아주기·미스매치·마지막 공격)은 빼고
      if (e.type !== 'play' || e.play !== 'iso' || e.reason) continue;
      let l = g.lineups[0];
      for (const x of g.lineups) if (x.tick <= e.tick) l = x;
      const t = g.teamOf[e.player];
      const f = l.pids.slice(t * 5, t * 5 + 5).map((p) => g.players[p]);
      const r = lineupRoles(f)[f.indexOf(g.players[e.player])];
      expect(r.key).toBe('ace');
      iso++;
    }
    expect(iso).toBeGreaterThan(3);
  });
});
