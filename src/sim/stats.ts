import type { GameResult } from './types';

export interface Line {
  /** 출전 시간 (초) */
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
  /** 뛰는 동안 득실 마진 */
  pm: number;
  played: boolean;
}

export const emptyLine = (): Line => ({ sec: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0, played: false });

export interface BoxScore {
  players: Line[];
  teams: [Line, Line];
  teamFouls: [number, number];
}

type LineKey = Exclude<keyof Line, 'played'>;
const SUM_KEYS: LineKey[] = ['sec', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf'];

/** 이벤트와 출전 기록을 upToTick까지 모아 박스스코어를 만든다 */
export function boxScore(game: GameResult, upToTick = Infinity): BoxScore {
  const { events, lineups, rec, players: roster, teamOf } = game;
  const players = roster.map(emptyLine);
  const last = Math.min(rec.n - 1, Math.floor(upToTick));
  // 출전 시간
  for (let k = 0; k < lineups.length; k++) {
    const from = lineups[k].tick;
    if (from > last) break;
    const to = Math.min(last, k + 1 < lineups.length ? lineups[k + 1].tick : last);
    const sec = rec.elapsed[to] - rec.elapsed[from];
    for (const pid of lineups[k].pids) {
      players[pid].sec += sec;
      players[pid].played = true;
    }
  }
  let li = 0;
  let quarter = 1;
  const teamFouls: [number, number] = [0, 0];
  for (const e of events) {
    if (e.tick > upToTick) break;
    while (li + 1 < lineups.length && lineups[li + 1].tick <= e.tick) li++;
    if (e.quarter !== quarter) {
      if (e.quarter <= 4) {
        teamFouls[0] = 0;
        teamFouls[1] = 0;
      }
      quarter = e.quarter;
    }
    const p = e.player >= 0 ? players[e.player] : null;
    let scored = 0;
    switch (e.type) {
      case 'made':
        if (!p) break;
        p.fgm++;
        p.fga++;
        p.pts += e.pts;
        scored = e.pts;
        if (e.pts === 3) {
          p.tpm++;
          p.tpa++;
        }
        if (e.other >= 0) players[e.other].ast++;
        break;
      case 'miss':
        if (!p) break;
        p.fga++;
        if (e.shot === 'three') p.tpa++;
        if (e.blocked && e.other >= 0) players[e.other].blk++;
        break;
      case 'ft':
        if (!p) break;
        p.fta++;
        if (e.made) {
          p.ftm++;
          p.pts++;
          scored = 1;
        }
        break;
      case 'rebound':
        if (!p) break;
        if (e.offensive) p.oreb++;
        else p.dreb++;
        break;
      case 'turnover':
        if (p) p.tov++;
        if (e.other >= 0) players[e.other].stl++;
        break;
      case 'foul':
        if (p) p.pf++;
        teamFouls[e.team]++;
        break;
      default:
        break;
    }
    if (scored && e.player >= 0) {
      const team = teamOf[e.player];
      for (const pid of lineups[li].pids) players[pid].pm += teamOf[pid] === team ? scored : -scored;
    }
  }
  const sum = (team: 0 | 1): Line => {
    const t = emptyLine();
    roster.forEach((_, pid) => {
      if (teamOf[pid] !== team) return;
      for (const k of SUM_KEYS) t[k] += players[pid][k];
    });
    t.played = true;
    return t;
  };
  return { players, teams: [sum(0), sum(1)], teamFouls };
}

export function minutesText(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
