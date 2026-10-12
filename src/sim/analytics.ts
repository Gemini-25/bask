// 분석 지표 (M17): 현대 농구에서 보는 지표를 경기 기록(이벤트·라인업·0.1초 위치)에서 계산한다.
// 화면에 다 보여주지는 않는다. 엔진을 평가하고 슈퍼스타가 모든 방면에서 압도하는지 보려고.
//
// 기본 기록에서: TS%, eFG%, USG%, AST%, TOV%, REB%, STL%, BLK%
// 코트에 있을 때: 공격·수비 레이팅 (100 공격당 득실), 넷, 온/오프
// 슛: 상황별 (받자마자·드리블·돌파·포스트·풋백·속공), 동작별, 견제 정도별, 기대 야투율 대비 (슛 메이킹)
// 수비: 1차 수비로 막은 슛의 상대 야투율, 골밑을 지킬 때 상대 야투율
// 돌파: 횟수, 돌파 끝 슛·패스·실책·득점
// 볼: 터치, 보유 시간, 잠재 어시스트 (내 패스를 받아 쏜 슛)
// 그래비티: 공을 가졌을 때 몰려오는 도움 수비 수, 공이 없을 때 맡은 수비와 거리, 수비할 때 상대 골밑 시도 억제
// 종합: BPM (박스 +/-, 100 공격당), WAR (대체 선수보다 몇 승 더)
import type { GameResult, ShotCtx, Side } from './types';
import { DEEP_DIST, LOGO_DIST } from './shooting';

export const SHOT_CTXS: ShotCtx[] = ['catch', 'pullup', 'drive', 'post', 'putback', 'fast', 'other'];
export const CTX_LABEL: Record<ShotCtx, string> = { catch: '캐치앤슛', pullup: '풀업·드리블', drive: '돌파', post: '포스트', putback: '풋백', fast: '속공', other: '그 밖' };

interface Att {
  a: number;
  m: number;
  pts: number;
}
const att = (): Att => ({ a: 0, m: 0, pts: 0 });

/** 합칠 수 있는 원래 숫자 (여러 경기 더하기) */
export interface AdvRaw {
  games: number;
  sec: number;
  pts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  /** 코트에 있을 때 우리 팀 / 상대 팀 */
  on: TeamBucket;
  /** 경기 전체 우리 팀 / 상대 팀 (온/오프의 오프 = 전체 - 온) */
  all: TeamBucket;
  ctx: Record<ShotCtx, Att>;
  moves: Record<string, Att>;
  /** 견제 0~0.25 / 0.25~0.5 / 0.5~ */
  open: Att;
  light: Att;
  tight: Att;
  /** 딥쓰리 (8m+), 로고 샷 (9.5m+) (M21) */
  deep: Att;
  logo: Att;
  /** 슛마다 성공 확률 합 (기대 득점) */
  xfg: number;
  /** 1차 수비로 막은 슛, 골밑을 지킨 슛 */
  dfga: number;
  dfgm: number;
  rimA: number;
  rimM: number;
  drives: number;
  drivePass: number;
  driveTov: number;
  potAst: number;
  touches: number;
  holdSec: number;
  gBall: number;
  gBallN: number;
  gOff: number;
  gOffN: number;
}

interface TeamBucket {
  pts: number;
  oppPts: number;
  poss: number;
  oppPoss: number;
  fga: number;
  fgm: number;
  fta: number;
  tov: number;
  oreb: number;
  dreb: number;
  oppFga: number;
  oppFgm: number;
  oppOreb: number;
  oppDreb: number;
  /** 골밑 (2.5m 안) 슛 시도: 우리 / 상대 */
  rimFga: number;
  oppRimFga: number;
  sec: number;
}

const bucket = (): TeamBucket => ({ pts: 0, oppPts: 0, poss: 0, oppPoss: 0, fga: 0, fgm: 0, fta: 0, tov: 0, oreb: 0, dreb: 0, oppFga: 0, oppFgm: 0, oppOreb: 0, oppDreb: 0, rimFga: 0, oppRimFga: 0, sec: 0 });

export function emptyRaw(): AdvRaw {
  return {
    games: 0,
    sec: 0,
    pts: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    oreb: 0,
    dreb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
    on: bucket(),
    all: bucket(),
    ctx: Object.fromEntries(SHOT_CTXS.map((k) => [k, att()])) as Record<ShotCtx, Att>,
    moves: {},
    open: att(),
    deep: att(),
    logo: att(),
    light: att(),
    tight: att(),
    xfg: 0,
    dfga: 0,
    dfgm: 0,
    rimA: 0,
    rimM: 0,
    drives: 0,
    drivePass: 0,
    driveTov: 0,
    potAst: 0,
    touches: 0,
    holdSec: 0,
    gBall: 0,
    gBallN: 0,
    gOff: 0,
    gOffN: 0,
  };
}

/** 팀 기록 한 줄을 코트에 있는 선수들 버킷에 */
type Delta = Partial<Record<keyof TeamBucket, number>>;

/** 한 경기 → 선수별 원래 숫자 */
export function analyzeGame(g: GameResult): AdvRaw[] {
  const { events, lineups, rec, teamOf } = g;
  const out = g.players.map(() => emptyRaw());
  const last = rec.n - 1;
  // 출전 시간 (라인업 구간)
  const teamSec: [number, number] = [0, 0];
  for (let k = 0; k < lineups.length; k++) {
    const from = lineups[k].tick;
    const to = Math.min(last, k + 1 < lineups.length ? lineups[k + 1].tick : last);
    const sec = rec.elapsed[to] - rec.elapsed[from];
    for (const pid of lineups[k].pids) out[pid].sec += sec;
    teamSec[0] += sec;
    teamSec[1] += sec;
  }
  out.forEach((r, pid) => {
    if (r.sec > 0) r.games = 1;
    r.on.sec = r.sec;
    r.all.sec = teamSec[teamOf[pid]];
  });
  // 팀 버킷: 이벤트마다 코트에 있는 선수(on)와 같은 팀 전원(all)에 더한다
  let li = 0;
  const add = (team: Side, d: Delta, opp: Delta) => {
    const onPids = lineups[li].pids;
    g.players.forEach((_, pid) => {
      const r = out[pid];
      const mine = teamOf[pid] === team;
      const dd = mine ? d : opp;
      for (const [k, v] of Object.entries(dd)) {
        const key = k as keyof TeamBucket;
        r.all[key] += v!;
        if (onPids.includes(pid)) r.on[key] += v!;
      }
    });
  };
  for (const e of events) {
    while (li + 1 < lineups.length && lineups[li + 1].tick <= e.tick) li++;
    const p = e.player >= 0 ? out[e.player] : null;
    const team = e.team as Side;
    switch (e.type) {
      case 'made':
      case 'miss': {
        if (!p) break;
        const made = e.type === 'made';
        p.fga++;
        if (made) {
          p.fgm++;
          p.pts += e.pts;
        }
        if (e.shot === 'three') {
          p.tpa++;
          if (made) p.tpm++;
        }
        if (made && e.other >= 0) out[e.other].ast++;
        if (!made && e.blocked && e.other >= 0) out[e.other].blk++;
        // 잠재 어시스트: 내 패스를 받아 쏜 슛 (들어갔든 안 들어갔든)
        const passer = made ? e.other : e.passer;
        if (passer !== undefined && passer >= 0) out[passer].potAst++;
        const pts = made ? e.pts : 0;
        const c = p.ctx[e.ctx ?? 'other'];
        c.a++;
        c.m += made ? 1 : 0;
        c.pts += pts;
        if (e.move) {
          const mv = (p.moves[e.move] ??= att());
          mv.a++;
          mv.m += made ? 1 : 0;
          mv.pts += pts;
        }
        if (e.pts === 3 && (e.dist ?? 0) >= DEEP_DIST) {
          p.deep.a++;
          p.deep.m += made ? 1 : 0;
          p.deep.pts += pts;
          if ((e.dist ?? 0) >= LOGO_DIST) {
            p.logo.a++;
            p.logo.m += made ? 1 : 0;
            p.logo.pts += pts;
          }
        }
        const cb = (e.contest ?? 0) < 0.25 ? p.open : (e.contest ?? 0) < 0.5 ? p.light : p.tight;
        cb.a++;
        cb.m += made ? 1 : 0;
        cb.pts += pts;
        p.xfg += e.prob ?? 0;
        if (e.def !== undefined && e.def >= 0) {
          out[e.def].dfga++;
          if (made) out[e.def].dfgm++;
        }
        if (e.rim !== undefined && e.rim >= 0) {
          out[e.rim].rimA++;
          if (made) out[e.rim].rimM++;
        }
        const rim = (e.dist ?? 9) < 2.5 ? 1 : 0;
        add(team, { fga: 1, fgm: made ? 1 : 0, pts, poss: 1, rimFga: rim }, { oppFga: 1, oppFgm: made ? 1 : 0, oppPts: pts, oppPoss: 1, oppRimFga: rim });
        break;
      }
      case 'ft':
        if (!p) break;
        p.fta++;
        if (e.made) {
          p.ftm++;
          p.pts++;
        }
        add(team, { fta: 1, pts: e.made ? 1 : 0, poss: 0.44 }, { oppPts: e.made ? 1 : 0, oppPoss: 0.44 });
        break;
      case 'rebound':
        if (!p) break;
        if (e.offensive) {
          p.oreb++;
          add(team, { oreb: 1, poss: -1 }, { oppOreb: 1, oppPoss: -1 });
        } else {
          p.dreb++;
          add(team, { dreb: 1 }, { oppDreb: 1 });
        }
        break;
      case 'turnover':
        if (p) p.tov++;
        if (e.other >= 0) out[e.other].stl++;
        add(team, { tov: 1, poss: 1 }, { oppPoss: 1 });
        break;
      case 'foul':
        if (p) p.pf++;
        break;
      default:
        break;
    }
  }
  // 돌파 (엔진 카운터)
  if (g.adv) {
    g.players.forEach((_, pid) => {
      out[pid].drives += g.adv!.drives[pid] ?? 0;
      out[pid].drivePass += g.adv!.drivePass[pid] ?? 0;
      out[pid].driveTov += g.adv!.driveTov[pid] ?? 0;
    });
  }
  // 터치·보유 시간·그래비티: 0.1초 기록에서 (3틱마다)
  let lj = 0;
  let prevHolder = -1;
  for (let t = 0; t <= last; t++) {
    while (lj + 1 < lineups.length && lineups[lj + 1].tick <= t) lj++;
    const pids = lineups[lj].pids;
    const hs = rec.holder[t];
    if (hs >= 0) {
      const hp = pids[hs];
      if (hs !== prevHolder) out[hp].touches++;
      out[hp].holdSec += g.dt;
    }
    prevHolder = hs;
    if (hs < 0 || t % 3) continue;
    const offTeam = hs < 5 ? 0 : 1;
    for (let k = offTeam * 5; k < offTeam * 5 + 5; k++) {
      const x = rec.pos[t * 20 + k * 2];
      const y = rec.pos[t * 20 + k * 2 + 1];
      // 수비 다섯 명과의 거리 (가까운 순)
      const near: number[] = [];
      for (let j = (1 - offTeam) * 5; j < (1 - offTeam) * 5 + 5; j++) near.push(Math.hypot(rec.pos[t * 20 + j * 2] - x, rec.pos[t * 20 + j * 2 + 1] - y));
      near.sort((p1, p2) => p1 - p2);
      const r = out[pids[k]];
      if (k === hs) {
        // 공을 가졌을 때: 맡은 수비 말고 3.5m 안으로 몰려온 도움 수비 수
        r.gBall += near.slice(1).filter((d) => d < 3.5).length;
        r.gBallN++;
      } else {
        // 공이 없을 때: 맡은 수비(가장 가까운 수비)와 거리
        r.gOff += near[0];
        r.gOffN++;
      }
    }
  }
  return out;
}

/** 여러 경기 더하기 */
export function mergeRaw(a: AdvRaw, b: AdvRaw): AdvRaw {
  const sumObj = <T extends object>(x: T, y: T): T => {
    const o = { ...x } as Record<string, unknown>;
    for (const [k, v] of Object.entries(y)) {
      if (typeof v === 'number') o[k] = ((o[k] as number) ?? 0) + v;
      else if (v && typeof v === 'object') o[k] = sumObj((o[k] as object) ?? {}, v as object);
    }
    return o as T;
  };
  return sumObj(a, b);
}

/** BPM 보정: 리그 평균이 0 근처가 되게 (tools/analytics.ts로 맞춘 값) */
export const BPM_CAL = { scale: 0.3, offset: 5.6 };
/** 대체 선수 BPM, 1점 득실 = 몇 승 */
const REPL_BPM = -2;
const WIN_PER_POINT = 0.033;

export interface AdvMetrics {
  games: number;
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  ts: number;
  efg: number;
  usg: number;
  astPct: number;
  tovPct: number;
  rebPct: number;
  stlPct: number;
  blkPct: number;
  ortg: number;
  drtg: number;
  net: number;
  onOff: number;
  /** 슛 상황별 [시도/경기, 야투율] */
  ctx: Record<ShotCtx, [number, number]>;
  open: [number, number];
  /** 딥쓰리·로고 샷 [시도/경기, 성공률] (M21) */
  deep: [number, number];
  logo: [number, number];
  light: [number, number];
  tight: [number, number];
  xfg: number;
  shotMaking: number;
  dfgPct: number;
  dfgaPg: number;
  rimPct: number;
  rimPg: number;
  drivesPg: number;
  driveShotPct: number;
  drivePassPct: number;
  driveTovPct: number;
  potAstPg: number;
  touchesPg: number;
  holdPg: number;
  gravityBall: number;
  gravityOff: number;
  /** 수비 그래비티: 코트에 있을 때 상대 골밑 시도가 100 공격당 얼마나 줄어드나 */
  rimDeter: number;
  bpm: number;
  war: number;
}

const pct = (m: number, a: number) => (a > 0 ? m / a : 0);

export function derive(r: AdvRaw): AdvMetrics {
  const g = Math.max(1, r.games);
  const min = r.sec / 60;
  const on = r.on;
  const poss = Math.max(1, on.poss);
  const oppPoss = Math.max(1, on.oppPoss);
  const offPoss = Math.max(1, r.all.poss - on.poss);
  const offOppPoss = Math.max(1, r.all.oppPoss - on.oppPoss);
  const ortg = (on.pts / poss) * 100;
  const drtg = (on.oppPts / oppPoss) * 100;
  const offNet = ((r.all.pts - on.pts) / offPoss - (r.all.oppPts - on.oppPts) / offOppPoss) * 100;
  const net = ortg - drtg;
  const plays = r.fga + 0.44 * r.fta + r.tov;
  const teamPlays = on.fga + 0.44 * on.fta + on.tov;
  // 박스 +/- (100 공격당): 득점 효율, 리바운드, 어시스트, 수비, 실책·실패한 슛
  const raw = 0.95 * r.pts + 0.35 * r.oreb + 0.25 * r.dreb + 0.75 * r.ast + 1.4 * r.stl + 0.9 * r.blk - 0.95 * r.tov - 0.7 * (r.fga - r.fgm) - 0.45 * (r.fta - r.ftm) - 0.15 * r.pf;
  const onOff = net - offNet;
  const bpm = ((raw / poss) * 100 * BPM_CAL.scale - BPM_CAL.offset) + 0.15 * Math.max(-15, Math.min(15, onOff));
  const war = (bpm - REPL_BPM) * (poss / 100) * WIN_PER_POINT;
  const ctx = Object.fromEntries(SHOT_CTXS.map((k) => [k, [r.ctx[k].a / g, pct(r.ctx[k].m, r.ctx[k].a)]])) as Record<ShotCtx, [number, number]>;
  const driveEnds = r.ctx.drive.a + r.drivePass + r.driveTov;
  return {
    games: r.games,
    mpg: min / g,
    ppg: r.pts / g,
    rpg: (r.oreb + r.dreb) / g,
    apg: r.ast / g,
    spg: r.stl / g,
    bpg: r.blk / g,
    ts: pct(r.pts, 2 * (r.fga + 0.44 * r.fta)),
    efg: pct(r.fgm + 0.5 * r.tpm, r.fga),
    usg: teamPlays > 0 ? plays / teamPlays : 0,
    astPct: pct(r.ast, Math.max(1, on.fgm - r.fgm)),
    tovPct: pct(r.tov, plays),
    rebPct: pct(r.oreb + r.dreb, on.fga - on.fgm + on.oppFga - on.oppFgm),
    stlPct: pct(r.stl, oppPoss),
    blkPct: pct(r.blk, on.oppFga),
    ortg,
    drtg,
    net,
    onOff,
    ctx,
    open: [r.open.a / g, pct(r.open.m, r.open.a)],
    deep: [(r.deep?.a ?? 0) / g, pct(r.deep?.m ?? 0, r.deep?.a ?? 0)],
    logo: [(r.logo?.a ?? 0) / g, pct(r.logo?.m ?? 0, r.logo?.a ?? 0)],
    light: [r.light.a / g, pct(r.light.m, r.light.a)],
    tight: [r.tight.a / g, pct(r.tight.m, r.tight.a)],
    xfg: pct(r.xfg, r.fga),
    shotMaking: pct(r.fgm, r.fga) - pct(r.xfg, r.fga),
    dfgPct: pct(r.dfgm, r.dfga),
    dfgaPg: r.dfga / g,
    rimPct: pct(r.rimM, r.rimA),
    rimPg: r.rimA / g,
    drivesPg: r.drives / g,
    driveShotPct: pct(r.ctx.drive.a, driveEnds),
    drivePassPct: pct(r.drivePass, driveEnds),
    driveTovPct: pct(r.driveTov, driveEnds),
    potAstPg: r.potAst / g,
    touchesPg: r.touches / g,
    holdPg: r.holdSec / g,
    gravityBall: pct(r.gBall, r.gBallN),
    gravityOff: pct(r.gOff, r.gOffN),
    rimDeter: ((r.all.oppRimFga - on.oppRimFga) / offOppPoss - on.oppRimFga / oppPoss) * 100,
    bpm,
    war,
  };
}
