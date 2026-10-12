// 드래프트 (W11): 고3이 끝나면 프로 10팀이 2라운드까지 신인을 뽑는다. 지난 시즌 꼴찌가 먼저.
import { Rng } from '../core/rng';
import { overall, type Player } from '../data/player';
import type { Career } from './career';
import { createLeague, draftClass, freeNumber, leagueTeam, scheduleSeason, type League } from './league';
import { rookieSalary } from './money';
import { coachName } from './people';

export interface Pick {
  no: number;
  round: number;
  team: string;
  name: string;
  pos: string;
  ovr: number;
  me: boolean;
  rival: boolean;
}

export interface DraftResult {
  picks: Pick[];
  myNo: number;
  team: string;
  salary: number;
}

/** 내 지명 가치: 종합 능력치 + 잠재력 + 고교 성적 + 인기 */
export function draftValue(c: Career): number {
  const titles = c.games.filter((g) => g.kind === 'official' && g.won).length;
  return overall(c.me, c.prefPos) + (c.potential - 80) * 0.15 + titles * 0.15 + (c.popularity ?? 0) * 0.05;
}

export function runDraft(c: Career): DraftResult {
  const rng = Rng.fromState(c.rng);
  const L: League = c.league ?? createLeague(rng.fork(5));
  const others = draftClass(rng, 19 - (c.rival ? 1 : 0));
  const pool: { p: Player; v: number; me: boolean; rival: boolean }[] = others.map((p) => ({ p, v: overall(p) + (p.age === 19 ? 1.5 : 0), me: false, rival: false }));
  pool.push({ p: c.me, v: draftValue(c), me: true, rival: false });
  if (c.rival) pool.push({ p: c.rival.player, v: overall(c.rival.player, c.rival.player.pos) + 1, me: false, rival: true });
  const picks: Pick[] = [];
  let no = 0;
  let myTeam = L.lastOrder[0];
  for (let round = 0; round < 2; round++)
    for (const id of L.lastOrder) {
      if (!pool.length) break;
      // 구단마다 보는 눈이 조금씩 다르다
      let best = 0;
      let bv = -Infinity;
      pool.forEach((x, i) => {
        const v = x.v + rng.normal(0, 1.5);
        if (v > bv) {
          bv = v;
          best = i;
        }
      });
      const x = pool.splice(best, 1)[0];
      no++;
      picks.push({ no, round: round + 1, team: id, name: x.p.name, pos: x.me ? c.prefPos : x.p.pos, ovr: Math.round(x.me ? overall(c.me, c.prefPos) : overall(x.p)), me: x.me, rival: x.rival });
      const t = leagueTeam(L, id);
      if (x.me) myTeam = id;
      else if (x.rival) c.rival!.school = id;
      else {
        if (t.players.length >= 13) {
          // 가장 약한 선수를 내보낸다
          const worst = t.players.reduce((a, b) => (overall(a) <= overall(b) ? a : b));
          t.players = t.players.filter((p) => p !== worst);
        }
        if (t.players.some((p) => p.number === x.p.number)) x.p.number = freeNumber(t, rng);
        t.players.push(x.p);
      }
    }
  const myNo = picks.find((p) => p.me)!.no;
  // 내 등번호가 겹치면 남는 번호로
  const t = leagueTeam(L, myTeam);
  if (t.players.some((p) => p.number === c.me.number)) c.me.number = freeNumber(t, rng);
  const salary = rookieSalary(myNo);
  c.league = L;
  c.pro = { team: myTeam, salary, years: 2, pickNo: myNo, season: 0 };
  c.trust = 35;
  c.coach = coachName((c.seed ^ myTeam.charCodeAt(0) * 7919) >>> 0);
  c.friends = Object.fromEntries(t.players.map((p) => [p.id, 25]));
  c.roster = [];
  c.season = null;
  c.rng = rng.state;
  scheduleSeason(L, c.week);
  return { picks, myNo, team: myTeam, salary };
}
