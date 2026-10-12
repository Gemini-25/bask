// 콤비 기술 (R6, M13): 친밀도 80이 넘는 팀원과 콤비가 생긴다 (두 명까지). 팀이 바뀌면 해체.
import type { Player } from '../data/player';
import { COMBO_LABEL, type ComboKind } from '../sim/engine';
import { teammates, type Career } from './career';

export interface Combo {
  mate: string;
  name: string;
  kind: ComboKind;
}

export const COMBO_FRIEND = 80;

/** 두 선수의 역할로 콤비 종류를 정한다 */
export function comboKind(me: Player, mate: Player, myPos: string): ComboKind {
  const guard = myPos === 'PG' || myPos === 'SG';
  const big = mate.pos === 'PF' || mate.pos === 'C';
  if (me.r.jump >= 62 && me.r.dunk >= 58 && mate.r.passing >= 62) return 'alley';
  if (guard && big) return 'pnr';
  if (mate.r.three >= 66) return 'kick';
  return 'giveGo';
}

/** 매주: 새 콤비, 떠난 팀원과는 해체 */
export function checkCombos(c: Career): string[] {
  const notes: string[] = [];
  c.combos ??= [];
  const roster = teammates(c).map((e) => e.player);
  const ids = new Set(roster.map((p) => p.id));
  for (const cb of [...c.combos]) {
    if (!ids.has(cb.mate)) {
      c.combos = c.combos.filter((x) => x !== cb);
      notes.push(`${cb.name}와(과)의 ${COMBO_LABEL[cb.kind]}가 끝났다. 이제 같은 팀이 아니다.`);
    }
  }
  if (c.combos.length >= 2) return notes;
  const cand = roster.filter((p) => (c.friends[p.id] ?? 0) >= COMBO_FRIEND && !c.combos.some((x) => x.mate === p.id)).sort((a, b) => (c.friends[b.id] ?? 0) - (c.friends[a.id] ?? 0));
  for (const p of cand) {
    if (c.combos.length >= 2) break;
    const kind = comboKind(c.me, p, c.prefPos);
    c.combos.push({ mate: p.id, name: p.name, kind });
    notes.push(`${p.name}와(과) 콤비 탄생: ${COMBO_LABEL[kind]}!`);
  }
  return notes;
}

/** 경기 엔진에 넘길 콤비 (선수 번호) */
export function comboOpts(c: Career, players: Player[], myPid: number): { a: number; b: number; kind: ComboKind }[] {
  if (myPid < 0 || !c.combos?.length) return [];
  const out: { a: number; b: number; kind: ComboKind }[] = [];
  for (const cb of c.combos) {
    const pid = players.findIndex((p) => p.id === cb.mate);
    if (pid >= 0) out.push({ a: myPid, b: pid, kind: cb.kind });
  }
  return out;
}
