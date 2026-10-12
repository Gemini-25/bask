// 사람들: 감독, 라이벌 (R3), 은사 (T5), 팀원 친밀도 (R1)
import { Rng } from '../core/rng';
import { koreanName } from '../data/names';
import { generatePlayer, lookFor, overall, type Player } from '../data/player';
import { RATING_KEYS, type RatingKey } from '../data/ratings';
import type { Career } from './career';
import { hsHeightAdj, SCHOOLS, schoolById } from './schools';

export interface Rival {
  player: Player;
  school: string;
  /** 맞대결 전적 (우리 학교 기준) */
  w: number;
  l: number;
}

export interface Mentor {
  name: string;
  /** 만났나 */
  met: boolean;
  /** 마지막 특훈 주 */
  last: number;
}

/** 라이벌: 다른 강호 학교, 같은 포지션, 나보다 조금 잘하는 신입생 */
export function createRival(c: Career, rng: Rng): Rival {
  const pool = SCHOOLS.filter((s) => s.id !== c.school).sort((a, b) => b.strength - a.strength).slice(0, 4);
  const school = rng.pick(pool);
  const target = overall(c.me, c.prefPos) + 2;
  let p = generatePlayer(rng, c.prefPos, -18, rng.int(0, 99), { heightAdj: hsHeightAdj(c.gender) - 3, gender: c.gender });
  // 종합 능력치를 목표에 맞춘다
  for (let guard = 0; guard < 400 && overall(p, c.prefPos) < target; guard++) {
    const k = rng.pick(RATING_KEYS);
    if (p.r[k] < 70) p.r[k]++;
  }
  p = { ...p, id: 'rival', name: koreanName(rng, c.gender), pos: c.prefPos };
  p.look = lookFor(p.id + p.name);
  p.look.headband = true;
  // 라이벌은 포지션에 맞는 특수능력 하나를 갖고 시작한다
  const ab = ({ PG: 'noLook', SG: 'quickRelease', SF: 'clutch', PF: 'rebound', C: 'rebound' } as const)[c.prefPos];
  p.abilities = { [ab]: 1 };
  return { player: p, school: school.id, w: 0, l: 0 };
}

/** 라이벌도 한 달에 종합 1쯤 큰다 (내가 평균적으로 크는 속도) */
export function rivalGrow(c: Career, rng: Rng) {
  const r = c.rival;
  if (!r) return;
  const p = r.player;
  const before = overall(p, p.pos);
  for (let guard = 0; guard < 200 && overall(p, p.pos) < before + 1; guard++) {
    const k = rng.pick(RATING_KEYS) as RatingKey;
    if (p.r[k] < 92) p.r[k]++;
  }
}

/** 상대 학교 명단에 라이벌을 넣는다 (같은 포지션 선수 대신) */
export function withRival(c: Career, schoolId: string, players: Player[]): Player[] {
  const r = c.rival;
  if (!r || r.school !== schoolId) return players;
  const out = [...players];
  const i = out.findIndex((p) => p.pos === r.player.pos);
  // 등번호가 겹치면 빠지는 선수 번호를 물려받는다
  const clash = out.some((p, k) => k !== i && p.number === r.player.number);
  const rival = clash && i >= 0 ? { ...r.player, number: out[i].number } : r.player;
  if (i >= 0) out[i] = rival;
  else out.push(rival);
  return out;
}

export function createMentor(rng: Rng): Mentor {
  // 은퇴한 전설 (가상 인물)
  return { name: `${rng.pick(['김', '박', '이', '최'])}${rng.pick(['철', '현', '도', '태'])}${rng.pick(['수', '민', '호', '진'])}`, met: false, last: -99 };
}

/** 감독 이름 */
export function coachName(seed: number) {
  const rng = new Rng(seed ^ 0x51ed);
  return koreanName(rng, 'M');
}

export function avgFriendship(c: Career): number {
  const v = Object.values(c.friends);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/** 가장 친한 팀원 */
export function bestFriend(c: Career): { name: string; id: string; v: number } | null {
  let best: { name: string; id: string; v: number } | null = null;
  for (const e of c.roster) {
    const v = c.friends[e.player.id] ?? 0;
    if (!best || v > best.v) best = { name: e.player.name, id: e.player.id, v };
  }
  return best;
}

export function teammateName(c: Career, id: string) {
  return c.roster.find((e) => e.player.id === id)?.player.name ?? '팀원';
}

export function schoolName(id: string) {
  return schoolById(id).name;
}
