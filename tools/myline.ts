// 세이브의 내 선수로 프로 경기를 몇 번 돌려 기록을 본다: npx tsx tools/myline.ts <세이브.json> [경기 수]
import { readFileSync } from 'node:fs';
import { playMatch } from '../src/career/match';
import { importCareer } from '../src/career/save';
import { boxScore } from '../src/sim/stats';
import { overall } from '../src/data/player';

const c = importCareer(readFileSync(process.argv[2], 'utf8'));
const n = Number(process.argv[3] ?? 6);
console.log('OVR', overall(c.me, c.prefPos).toFixed(1), 'three', c.me.r.three, 'mid', c.me.r.midRange, 'layup', c.me.r.layup, 'handling', c.me.r.ballHandling);
const opp = c.league!.teams.find((t) => t.info.id !== c.pro!.team)!.info.id;
for (let i = 0; i < n; i++) {
  c.pendingGame = { kind: 'official', pro: true, opponent: opp, label: 'test', home: i % 2 === 0 };
  const m = playMatch(c, 1000 + i);
  const box = boxScore(m.game);
  const l = box.players[m.myPid];
  const side = m.home ? 0 : 1;
  const t = box.teams[side];
  console.log(`${(l.sec / 60).toFixed(0)}분 ${l.pts}점 FG ${l.fgm}/${l.fga} 3P ${l.tpm}/${l.tpa} FT ${l.ftm}/${l.fta} | 팀 FGA ${t.fga} 비중 ${((l.fga / t.fga) * 100).toFixed(0)}% | 점수 ${m.game.final.join(':')}`);
}
