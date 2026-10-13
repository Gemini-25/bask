import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { SETS } from '../src/data/sets';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import type { GameResult } from '../src/sim/types';

function games(n: number, base = 0) {
  const out: GameResult[] = [];
  for (let g = 0; g < n; g++) {
    const rng = new Rng(3300 + g + base);
    out.push(simulateGame(generateTeam(rng.fork(1), TEAM_INFOS[g % 10]), generateTeam(rng.fork(2), TEAM_INFOS[(g + 4) % 10]), 1300 + g + base));
  }
  return out;
}

describe('전술 깊이 (M29)', () => {
  const gs = games(14);
  const ev = gs.flatMap((g) => g.events);

  it('공격 세트 7가지: 정의돼 있고, 경기에서 불리고, 세트 스크린이 걸린다', () => {
    expect(SETS.length).toBe(7);
    for (const s of SETS) {
      expect(s.steps.length).toBeGreaterThan(0);
      expect(ev.some((e) => e.type === 'play' && e.play === s.id), s.id).toBe(true);
    }
    // 세트 스크린 (이름이 붙은 스크린), 스페인 스크린
    expect(ev.filter((e) => e.type === 'screen' && /(플렉스|플로피|지퍼|엘리베이터) 스크린/.test(e.text)).length).toBeGreaterThan(10);
    expect(ev.some((e) => e.type === 'screen' && e.text.includes('스페인'))).toBe(true);
    // 세트에서 나온 슛은 그 세트로 기록된다
    const setShots = ev.filter((e) => (e.type === 'made' || e.type === 'miss') && SETS.some((s) => s.id === e.play));
    expect(setShots.length).toBeGreaterThan(50);
  });

  it('픽앤롤 수비: 드롭·헤지·블리츠·스위치·아이스를 팀과 상대에 따라 쓴다', () => {
    const covs = new Set(ev.filter((e) => e.type === 'play' && e.play === 'pnr' && e.cov).map((e) => e.cov));
    for (const c of ['drop', 'hedge', 'blitz', 'switch', 'ice'] as const) expect(covs.has(c), c).toBe(true);
    expect(ev.some((e) => e.type === 'adjust' && e.adj === 'coverage')).toBe(true);
  });

  it('로테이션·스위치: 스크램으로 미스매치를 다시 바꾸고, 스위치가 일어난다', () => {
    expect(ev.some((e) => e.type === 'adjust' && e.adj === 'scram')).toBe(true);
    expect(ev.filter((e) => e.type === 'screen' && e.switched).length).toBeGreaterThan(5);
  });

  it('전환: 속공 수적 우위를 알아보고, 속공 득점이 난다', () => {
    const br = ev.filter((e) => e.type === 'read' && e.read === 'break');
    expect(br.length).toBeGreaterThan(gs.length * 2);
    expect(br.every((e) => /속공 \d대\d!/.test(e.text))).toBe(true);
    const fb = ev.filter((e) => e.type === 'made' && e.play === 'transition');
    expect(fb.length).toBeGreaterThan(gs.length * 3);
  });
});
