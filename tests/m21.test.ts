import { describe, expect, it } from 'vitest';
import { checkAbilities } from '../src/career/abilities';
import { createCareer, type CreateSpec } from '../src/career/career';
import { traitCeleb, traitDeep, TRAITS } from '../src/career/personality';
import { Rng } from '../src/core/rng';
import { generatePlayer, lookFor } from '../src/data/player';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { COURT, hoopXY } from '../src/sim/court';
import { simulateGame } from '../src/sim/engine';
import { DEEP_DIST, shotInfo } from '../src/sim/shooting';
import { ACT, DUNK_ACT, type GameResult } from '../src/sim/types';
import { ANIMS } from '../src/view/anims';

const spec = (over: Partial<CreateSpec> = {}): CreateSpec => ({ name: '테스트', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('x'), alloc: {}, school: 'HANB', ...over });

const DUNKY = new Set<number>([...Object.values(DUNK_ACT), ACT.POSTER, ACT.CDUNK, ACT.PUTBACK, ACT.ALLEY, ACT.DUNK]);
const LAYUPY = new Set<number>([ACT.LAYUP, ACT.EURO, ACT.SCOOP, ACT.REVLAY, ACT.FINGER, ACT.POWERLAY, ACT.CLUTCH, ACT.CONTACT, ACT.TIPIN]);

function games(n: number, setup?: (a: ReturnType<typeof generateTeam>, b: ReturnType<typeof generateTeam>) => void, base = 0) {
  const out: GameResult[] = [];
  for (let g = 0; g < n; g++) {
    const a = generateTeam(new Rng(900 + g + base), TEAM_INFOS[g % 10], 1);
    const b = generateTeam(new Rng(950 + g + base), TEAM_INFOS[(g + 4) % 10], 1);
    setup?.(a, b);
    out.push(simulateGame(a, b, 600 + g + base));
  }
  return out;
}

function slotOf(g: GameResult, pid: number, tick: number) {
  let lu = g.lineups[0];
  for (const l of g.lineups) if (l.tick <= tick) lu = l;
  return lu.pids.indexOf(pid);
}

describe('동작·딥쓰리·특성 (M21)', () => {
  const gs = games(4);

  it('모든 동작에 키프레임이 있다', () => {
    for (const [name, act] of Object.entries(ACT)) expect(ANIMS[act], name).toBeTruthy();
  });

  it('공을 쥔 선수 기록 (carry): 들고 있으면 그 선수, 슛 모으는 중에도', () => {
    const g = gs[0];
    expect(g.rec.carry.length).toBe(g.rec.n);
    for (let f = 0; f < g.rec.n; f++) if (g.rec.holder[f] >= 0) expect(g.rec.carry[f]).toBe(g.rec.holder[f]);
    expect([...g.rec.carry].some((c, f) => c >= 0 && g.rec.holder[f] < 0)).toBe(true);
  });

  it('덩크라고 기록된 슛은 덩크 동작으로 림 앞까지 가서 꽂고, 레이업은 레이업 동작', () => {
    let dunks = 0;
    let layups = 0;
    for (const g of gs)
      for (const e of g.events) {
        if (e.type !== 'made' && e.type !== 'miss') continue;
        if (e.blocked) continue;
        const slot = slotOf(g, e.player, e.tick);
        if (slot < 0) continue;
        const act = g.rec.act[(e.tick - 2) * 10 + slot];
        if (e.shot === 'dunk') {
          dunks++;
          expect(DUNKY.has(act), `덩크인데 동작 ${act}`).toBe(true);
          // 꽂는 순간 림 바로 앞 (골밑에 선수가 몰리면 조금 밀린다)
          const x = g.rec.pos[e.tick * 20 + slot * 2];
          const y = g.rec.pos[e.tick * 20 + slot * 2 + 1];
          const near = [hoopXY(true), hoopXY(false)].some((H) => Math.hypot(H.x - x, H.y - y) < 1.3);
          expect(near).toBe(true);
          // 경기·쿼터가 끝나는 마지막 덩크는 끝 세리머니가 덮는다
          const last = g.events.some((x) => (x.type === 'quarterEnd' || x.type === 'gameEnd') && x.tick >= e.tick && x.tick - e.tick < 12);
          if (e.type === 'made' && !last) expect([...Array(8)].some((_, k) => g.rec.act[(e.tick + k) * 10 + slot] === ACT.HANG)).toBe(true);
        } else if (e.shot === 'layup') {
          layups++;
          expect(DUNKY.has(act), `레이업인데 덩크 동작 ${act}`).toBe(false);
          expect(LAYUPY.has(act) || act === ACT.FLOAT, `레이업 동작 ${act}`).toBe(true);
        }
      }
    expect(dunks).toBeGreaterThan(5);
    expect(layups).toBeGreaterThan(20);
  });

  it('딥쓰리: 사거리가 길면 멀리서 덜 떨어지고, 특수능력 ★3이면 딥쓰리를 더 쏜다', () => {
    const p = generatePlayer(new Rng(3), 'SG', 0, 7);
    p.r.three = 90;
    const near = shotInfo(p, COURT.hoopFromBaseline + 9, 0);
    const far = shotInfo(p, COURT.hoopFromBaseline + 9, 0, false, 0, { extra: 1.6, slope: 0.5 });
    expect(far.pOpen).toBeGreaterThan(near.pOpen + 0.05);
    const count = (lvl: number) => {
      let deep = 0;
      let deepAct = 0;
      for (const g of games(8, (a) => {
        a.players[0].r.three = 92;
        a.players[0].abilities = lvl ? { deepRange: lvl } : {};
      }, 50)) {
        const pid = 0;
        for (const e of g.events)
          if ((e.type === 'made' || e.type === 'miss') && e.player === pid && e.pts === 3 && (e.dist ?? 0) >= DEEP_DIST) {
            deep++;
            const slot = slotOf(g, pid, e.tick);
            // 공이 날아가는 시간 (1초 남짓) 전에 딥쓰리 동작
            if ([...Array(20)].some((_, k) => g.rec.act[(e.tick - k) * 10 + slot] === ACT.DEEP)) deepAct++;
          }
      }
      return { deep, deepAct };
    };
    const base = count(0);
    const star = count(3);
    expect(star.deep).toBeGreaterThan(base.deep * 1.4);
    expect(star.deepAct).toBeGreaterThan(star.deep * 0.5);
  });

  it('체이스다운·쇼타임: 특수능력이 있으면 경기에 나온다', () => {
    let chase = 0;
    let fancy = 0;
    for (const g of games(10, (a, b) => {
      for (const p of [a.players[0], b.players[0], a.players[1], b.players[1]]) {
        p.abilities = { chaseDown: 3, showtime: 3 };
        p.r.speed = 90;
      }
    }, 100)) {
      chase += g.events.filter((e) => e.chase).length;
      fancy += g.events.filter((e) => e.fancy).length;
    }
    expect(chase).toBeGreaterThan(0);
    expect(fancy).toBeGreaterThan(0);
  });

  it('성격 3가지: 배짱 슈터는 사거리, 입담꾼은 쉿, 세리머니 성향', () => {
    expect(TRAITS.map((t) => t.id)).toEqual(expect.arrayContaining(['gunslinger', 'trashTalker', 'humble']));
    const g = createCareer(spec({ trait: 'gunslinger' } as Partial<CreateSpec>), 1);
    g.traits = ['gunslinger'];
    expect(traitDeep(g)).toBeGreaterThan(0);
    expect(traitCeleb(g)).toContain(ACT.TURNAWAY);
    const t = createCareer(spec(), 2);
    t.traits = ['trashTalker'];
    expect(traitCeleb(t)).toContain(ACT.SHH);
  });

  it('딥쓰리를 많이 넣고 3점이 좋으면 특수능력 딥쓰리', () => {
    const c = createCareer(spec(), 3);
    c.stats.deepMade = 25;
    c.me.r.three = 82;
    const notes = checkAbilities(c);
    expect(c.me.abilities?.deepRange).toBe(2);
    expect(notes.join()).toContain('딥쓰리');
  });
});
