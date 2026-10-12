// 딥쓰리 확인 (M21): npx tsx tools/deep.ts [경기 수]
// 같은 슈터 (3점 92)에게 딥쓰리 특수능력 0~3단계를 주고, 딥쓰리(8m+)·로고샷(9.5m+) 시도·성공률과 리그 평균을 본다
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
import { DEEP_DIST, LOGO_DIST } from '../src/sim/shooting';

const n = Number(process.argv[2] ?? 20);
for (const lvl of [0, 1, 2, 3]) {
  let deepA = 0, deepM = 0, logoA = 0, logoM = 0, threeA = 0, threeM = 0, pts = 0, leagueDeep = 0, leagueThree = 0, shots = 0;
  for (let g = 0; g < n; g++) {
    const a = generateTeam(new Rng(1000 + g), TEAM_INFOS[g % 10], 1);
    const b = generateTeam(new Rng(2000 + g), TEAM_INFOS[(g + 3) % 10], 1);
    const s = a.players[0];
    s.r.three = 92;
    s.r.composure = 80;
    s.abilities = { ...(s.abilities ?? {}), deepRange: lvl };
    if (!lvl) delete s.abilities.deepRange;
    const r = simulateGame(a, b, 500 + g);
    const pid = r.players.indexOf(s);
    for (const e of r.events) {
      if ((e.type !== 'made' && e.type !== 'miss') || e.pts !== 3) continue;
      const d = e.dist ?? 0;
      if (e.player === pid) {
        threeA++;
        if (e.type === 'made') { threeM++; pts += 3; }
        if (d >= DEEP_DIST) { deepA++; if (e.type === 'made') deepM++; }
        if (d >= LOGO_DIST) { logoA++; if (e.type === 'made') logoM++; }
      } else {
        leagueThree++;
        if (d >= DEEP_DIST) leagueDeep++;
      }
    }
    shots += r.events.filter((e) => e.type === 'made' || e.type === 'miss').length;
  }
  const pc = (m: number, a: number) => (a ? ((m / a) * 100).toFixed(0) + '%' : '-');
  console.log(`딥쓰리 ★${lvl}: 3점 ${(threeA / n).toFixed(1)}개 ${pc(threeM, threeA)} · 딥쓰리 ${(deepA / n).toFixed(2)}개 ${pc(deepM, deepA)} · 로고 ${(logoA / n).toFixed(2)}개 ${pc(logoM, logoA)} | 다른 선수 딥쓰리 ${(leagueDeep / n).toFixed(2)}/경기 (3점의 ${((leagueDeep / leagueThree) * 100).toFixed(1)}%)`);
}
