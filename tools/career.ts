// 커리어 자동 플레이: 간단한 전략으로 N주를 돌려 성장 곡선·출전 시간·부상을 본다
// npx tsx tools/career.ts [주 수] [배경] [포지션] [시드]
import { BACKGROUNDS, type BackgroundId } from '../src/career/backgrounds';
import { actionById, canDo, costOf, createCareer, dateText, invest, myOverall, POINT_OF, type ActionId, type Career, type FocusId } from '../src/career/career';
import { applyMatch, myTeam, playMatch } from '../src/career/match';
import { schoolById } from '../src/career/schools';
import { afterGame, ensureSeason, playWeek } from '../src/career/turn';
import { resolveEvent } from '../src/career/events';
import { lookFor, overall, type Position } from '../src/data/player';
import { RATING_KEYS, type RatingKey } from '../src/data/ratings';

const WEEKS = Number(process.argv[2] ?? 48);
const BGS = (process.argv[3] ? [process.argv[3]] : BACKGROUNDS.map((b) => b.id)) as BackgroundId[];
const POS = (process.argv[4] ?? 'SG') as Position;
const SEED = Number(process.argv[5] ?? 1);

// 포지션 종합 능력치에 영향이 큰 항목부터 산다
let bought = 0;
function autoInvest(c: Career) {
  const gainOf = (k: RatingKey) => {
    const before = overall(c.me, c.prefPos);
    c.me.r[k]++;
    const after = overall(c.me, c.prefPos);
    c.me.r[k]--;
    return (after - before) / costOf(c.me.r[k], c.potential);
  };
  for (let guard = 0; guard < 400; guard++) {
    let best: RatingKey | null = null;
    let bv = 0;
    for (const k of RATING_KEYS) {
      if (costOf(c.me.r[k], c.potential) > c.points[POINT_OF[k]]) continue;
      // 종합에 안 들어가는 항목도 조금씩
      const v = gainOf(k) + 0.002;
      if (v > bv) {
        bv = v;
        best = k;
      }
    }
    if (!best) break;
    invest(c, { [best]: 1 });
    bought++;
  }
}

for (const bg of BGS) {
  const c = createCareer(
    { name: '테스트', number: 7, gender: 'M', prefPos: POS, background: bg, growth: 'normal', heightDelta: 0, build: 'normal', look: lookFor('t'), alloc: {}, school: process.env.SCHOOL ?? 'HANB' },
    SEED,
  );
  // 자유 포인트는 자동 투자처럼 종합 능력치 위주로
  const free = BACKGROUNDS.find((b) => b.id === bg)!.freePoints;
  c.points = { P: 0, T: 0, M: 0 };
  let left = free;
  while (left > 0) {
    let best: RatingKey = 'speed';
    let bv = -1;
    for (const k of RATING_KEYS) {
      if (c.me.r[k] >= 70) continue;
      const b = overall(c.me, POS);
      c.me.r[k]++;
      const v = overall(c.me, POS) - b;
      c.me.r[k]--;
      if (v > bv) {
        bv = v;
        best = k;
      }
    }
    if (bv < 0) break;
    c.me.r[best]++;
    left--;
  }
  ensureSeason(c);
  const start = myOverall(c);
  const rows: string[] = [];
  let injWeeks = 0;
  let injuries = 0;
  let minutes = 0;
  let games = 0;
  let starts = 0;
  let trainPts = 0;
  let gamePts = 0;
  let xpUps = 0;
  bought = 0;
  const evCount: Record<string, number> = {};
  const focusCycle: FocusId[] = ['shoot', 'drive', 'defense', 'pass'];
  for (let w = 0; w < WEEKS; w++) {
    let id: ActionId;
    if (c.injury) id = 'rehab';
    else if (c.fatigue > 62) id = 'rest';
    else if (c.condition <= 1) id = 'friends';
    else id = (['team', 'solo', 'weight', 'team', 'solo', 'video', 'street'] as ActionId[])[w % 7];
    if (!canDo(c, actionById(id))) id = 'rest';
    const hadInj = !!c.injury;
    const r = playWeek(c, id, focusCycle[w % 4]);
    if (c.pendingEvent) {
      evCount[c.pendingEvent.id] = (evCount[c.pendingEvent.id] ?? 0) + 1;
      resolveEvent(c, c.pendingEvent, 0);
    }
    trainPts += r.gained.P + r.gained.T + r.gained.M;
    xpUps += Object.values(r.ups).reduce((a, b) => a + (b ?? 0), 0);
    if (r.injured) injuries++;
    if (hadInj) injWeeks++;
    autoInvest(c);
    if (r.game) {
      const m = playMatch(c);
      const rep = applyMatch(c, m);
      afterGame(c);
      gamePts += rep.gained.P + rep.gained.T + rep.gained.M;
      xpUps += Object.values(rep.ups).reduce((a, b) => a + (b ?? 0), 0);
      autoInvest(c);
      games++;
      if (rep.line) minutes += rep.line.sec / 60;
      if (m.started) starts++;
      const depth = myTeam(c).meIndex;
      rows.push(`  ${dateText(c.week - 1).padEnd(12)} ${m.label.padEnd(10)} trust ${c.trust.toFixed(0).padStart(3)} OVR ${myOverall(c).toFixed(1).padStart(5)}  fat ${c.fatigue.toFixed(0).padStart(3)} cond ${c.condition}  ${rep.line ? `${(rep.line.sec / 60).toFixed(0).padStart(2)}분 ${String(rep.line.pts).padStart(2)}점 ${rep.grade}` : '결장'}  ${rep.score.join(':')} ${m.started ? '주전' : '벤치'} depth ${depth} ${c.injury ? '부상:' + c.injury.name : ''}`);
    }
  }
  if (process.env.T) {
    for (const t of (c.season?.tours ?? [])) console.log(`  ${t.name}: 우승 ${t.champion ? schoolById(t.champion).name : '-'} · 내 성적 ${t.myFinish ?? '-'}`);
  }
  const team = myTeam(c).team.players.map((p) => overall(p, p.pos).toFixed(0)).join(' ');
  console.log(`\n[${bg}] ${POS} OVR ${start.toFixed(1)} → ${myOverall(c).toFixed(1)}  키 ${c.me.body.heightCm}/${c.finalHeight}  부상 ${injuries}번 ${injWeeks}주  경기 ${games} 주전 ${starts} 평균 ${(minutes / Math.max(1, games)).toFixed(1)}분  남은 포인트 ${JSON.stringify(c.points)}`);
  console.log(`  팀 OVR 순서: ${team}`);
  console.log('  특수능력:', JSON.stringify(c.me.abilities), 'stats', JSON.stringify({ ...c.stats, recentPf: undefined, ftAfter: undefined }));
  if (process.env.E) console.log('  이벤트:', JSON.stringify(evCount), Object.values(evCount).reduce((a, b) => a + b, 0), '번', 'trust', c.trust.toFixed(0), 'rival', c.rival?.w, '-', c.rival?.l);
  console.log(`  포인트: 훈련 ${trainPts} 경기 ${gamePts}  산 능력치 ${bought}  경험치로 오른 능력치 ${xpUps}`);
  if (process.env.V) console.log(rows.join('\n'));
  else console.log(rows.slice(0, 2).concat(['  ...'], rows.slice(-2)).join('\n'));
}
