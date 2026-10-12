// 키운 만큼 차이 나나 (M11): npx tsx tools/balance.ts <simple|good> <시드> [햇수]
// 해마다 종합·경기당 득점·출전·인기·수상을 찍고, 끝에 명예의 전당 점수
import { autoWeek, type AutoPolicy } from '../src/career/autoplay';
import { createCareer, dateOf, myOverall } from '../src/career/career';
import { hofScore, proGames } from '../src/career/legacy';
import { lookFor, overall } from '../src/data/player';

const policy = (process.argv[2] ?? 'simple') as AutoPolicy;
const seed = Number(process.argv[3] ?? 1);
const years = Number(process.argv[4] ?? 13);
const c = createCareer({ name: '측정', number: 7, gender: 'M', prefPos: 'SG', background: 'ordinary', growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('b'), alloc: {}, school: 'SONG' }, seed);
// 자유 포인트는 자동 배분과 같게: 종합이 많이 오르는 곳 (만들기 화면의 '자동 배분'을 흉내)
const rows: string[] = [];
let lastYear = 0;
const t0 = Date.now();
for (let w = 0; w < 48 * years; w++) {
  // spread면 포인트를 골고루 뿌린다 (아니면 종합이 많이 오르는 곳부터)
  const r = autoWeek(c, policy, { invest: true, spread: process.argv.includes('spread') });
  if (r.stopped === 'retire') {
    c.retirePending = null;
    if (c.contractPending) c.contractPending = false;
  }
  const y = dateOf(c.week).year;
  if (y !== lastYear) {
    const from = (y - 1) * 48;
    const gs = c.games.filter((g) => g.week >= from && g.week < y * 48 && g.kind === 'official' && g.line && !g.label.startsWith('아시아컵'));
    const n = Math.max(1, gs.length);
    const ppg = gs.reduce((s, g) => s + g.line!.pts, 0) / n;
    const mpg = gs.reduce((s, g) => s + g.line!.sec, 0) / n / 60;
    const tag = y - 1 >= 3 ? `${y - 3}시즌` : '';
    const prizes = tag ? c.trophies.filter((t) => t.includes(`${tag} `)).map((t) => t.replace(`${tag} `, '').replace(/^해외 /, '')) : [];
    const top = Object.entries(c.me.r).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}${v}`).join(' ');
    rows.push(`${y - 1 < 3 ? `고${y}` : `프${y - 3}`}\tOVR ${myOverall(c).toFixed(1)} (${top})\t${gs.length}경기 ${ppg.toFixed(1)}점 ${mpg.toFixed(1)}분\t인기 ${Math.round(c.popularity)}\t돈 ${Math.round(c.money / 10000)}억\t${prizes.join(',')}`);
    // AW=1: 그해 MVP·베스트 5가 누구였고 종합이 얼마였나, 리그 상위 종합
    if (process.env.AW && c.league?.awards?.length && y - 1 >= 3) {
      const a = c.league.awards[c.league.awards.length - 1];
      const ovrOf = (id: string) => {
        if (id === 'me') return myOverall(c);
        for (const t of c.league!.teams) {
          const p = t.players.find((x) => x.id === id);
          if (p) return overall(p);
        }
        return NaN;
      };
      const top = c.league.teams.flatMap((t) => t.players).map((p) => (p.id === 'me' ? myOverall(c) : overall(p))).sort((x, y2) => y2 - x).slice(0, 8);
      rows.push(`\t시상: ${a.awards.filter((x) => x.key === 'mvp' || x.key === 'best5').map((x) => `${x.label === 'MVP' ? 'MVP ' : ''}${x.name}(${ovrOf(x.id).toFixed(0)}, ${x.value})`).join(' / ')}`);
      rows.push(`\t리그 상위 종합: ${top.map((v) => v.toFixed(0)).join(' ')}`);
    }
    lastYear = y;
  }
}
const pro = proGames(c);
const mvp = c.trophies.filter((t) => /시즌 MVP$/.test(t)).length;
const allstar = c.trophies.filter((t) => /올스타$/.test(t)).length;
console.log(`[${typeof policy === 'string' ? policy : 'repeat'} seed ${seed}] ${Math.round((Date.now() - t0) / 1000)}s`);
console.log(rows.join('\n'));
console.log(`프로 ${pro.length}경기 평균 ${(pro.reduce((s, g) => s + (g.line?.pts ?? 0), 0) / Math.max(1, pro.length)).toFixed(1)}점 · MVP ${mvp} · 올스타 ${allstar} · 명예의 전당 점수 ${hofScore(c)} · 아이템 ${c.items.length}`);
