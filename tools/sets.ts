// 전술 진단 (M29): 세트·작전별 공격당 득점, 세트 스크린, 픽앤롤 수비 종류, 태그·스크램, 속공 수적 우위
// npx tsx tools/sets.ts [경기 수]
import { Rng } from '../src/core/rng';
import { generateTeam, TEAM_INFOS } from '../src/data/teams';
import { simulateGame } from '../src/sim/engine';
const N = Number(process.argv[2] ?? 30);
const c: Record<string, number> = {};
const add = (k: string, v = 1) => (c[k] = (c[k] ?? 0) + v);
const eff: Record<string, { poss: number; pts: number }> = {};
for (let g = 0; g < N; g++) {
  const rng = new Rng(1000 + g);
  const ia = rng.int(0, 9);
  let ib = rng.int(0, 9);
  if (ib === ia) ib = (ib + 1) % 10;
  const r = simulateGame(generateTeam(rng.fork(1), TEAM_INFOS[ia]), generateTeam(rng.fork(2), TEAM_INFOS[ib]), 5000 + g);
  for (const e of r.events) {
    if (e.type === 'play' && e.play) add('call:' + e.play);
    if (e.type === 'screen') add(e.text.includes('스페인') ? 'screen:spain' : e.text.includes('다운스크린') ? 'screen:down' : e.text.match(/(호른스|플렉스|플로피|지퍼|엘리베이터|하이로우)/) ? 'screen:set' : 'screen:other');
    if (e.type === 'adjust' && (e.adj === 'coverage' || e.adj === 'scram')) add(e.adj + (e.adj === 'coverage' ? ':' + e.text.split('픽앤롤 수비 ')[1]?.split(' ·')[0] : ''));
    if (e.type === 'read' && e.read === 'break') add('break:' + e.text);
    if ((e.type === 'made' || e.type === 'miss' || e.type === 'turnover') && e.play) {
      const b = (eff[e.play] ??= { poss: 0, pts: 0 });
      b.poss++;
      if (e.type === 'made') b.pts += e.pts;
    }
  }
}
for (const [k, v] of Object.entries(c).sort()) console.log(`${k.padEnd(28)} ${(v / N).toFixed(2)}/경기`);
for (const [k, b] of Object.entries(eff).sort((a, b) => b[1].poss - a[1].poss)) console.log(`${k.padEnd(12)} ${(b.poss / N).toFixed(1)}회 ${(b.pts / Math.max(1, b.poss)).toFixed(2)}점/회`);
