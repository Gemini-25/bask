import type { GameEvent } from './types';

export interface Line {
  pts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  oreb: number;
  dreb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
}

export const emptyLine = (): Line => ({ pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0 });

export interface BoxScore {
  players: Line[];
  teams: [Line, Line];
}

/** 이벤트를 upToTick까지 모아 박스스코어를 만든다 */
export function boxScore(events: readonly GameEvent[], upToTick = Infinity): BoxScore {
  const players = Array.from({ length: 10 }, emptyLine);
  for (const e of events) {
    if (e.tick > upToTick) break;
    const p = e.player >= 0 ? players[e.player] : null;
    switch (e.type) {
      case 'made':
        if (!p) break;
        p.fgm++;
        p.fga++;
        p.pts += e.pts;
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
      case 'rebound':
        if (!p) break;
        if (e.offensive) p.oreb++;
        else p.dreb++;
        break;
      case 'turnover':
        if (p) p.tov++;
        if (e.other >= 0) players[e.other].stl++;
        break;
      default:
        break;
    }
  }
  const sum = (from: number): Line => {
    const t = emptyLine();
    for (let i = from; i < from + 5; i++) for (const k of Object.keys(t) as (keyof Line)[]) t[k] += players[i][k];
    return t;
  };
  return { players, teams: [sum(0), sum(5)] };
}
