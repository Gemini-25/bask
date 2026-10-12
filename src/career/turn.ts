// 한 주 진행 묶음: 행동 → 남의 경기 → 내 주말 경기 정하기 → 달마다 팀원 성장 → 해가 바뀌면 진급·졸업
import { Rng } from '../core/rng';
import { generatePlayer, type Position } from '../data/player';
import { RATING_KEYS } from '../data/ratings';
import { dateOf, doWeek, WEEKS_PER_YEAR, type ActionId, type Career, type FocusId, type WeekResult } from './career';
import { hsHeightAdj, schoolById } from './schools';
import { checkAbilities } from './abilities';
import { rollEvent } from './events';
import { rivalGrow } from './people';
import { catchUp, createSeason, gameFor, playOthers } from './season';

/** 올해 시즌이 없으면 만든다 (새 커리어, 새 학년, 예전 세이브) */
export function ensureSeason(c: Career) {
  const year = dateOf(c.week).year;
  if (c.season && c.season.year === year) return;
  if (c.season === null && year >= 3) return;
  c.season = createSeason(c, year);
  if (c.week % WEEKS_PER_YEAR !== 0) {
    const rng = Rng.fromState(c.rng);
    catchUp(c, rng);
    c.rng = rng.state;
  }
}

export function playWeek(c: Career, id: ActionId, focus?: FocusId): WeekResult {
  ensureSeason(c);
  // 이벤트는 이번 주 상황(지난 경기 결과 포함)으로 정하고, 훈련 결과 다음에 보여준다
  const er = Rng.fromState(c.rng);
  const ev = c.pendingEvent ?? rollEvent(c, er);
  c.rng = er.state;
  const r = doWeek(c, id, focus);
  c.pendingEvent = ev;
  r.event = ev;
  const w = c.week - 1;
  const rng = Rng.fromState(c.rng);
  playOthers(c, w, rng);
  // 한 달이 끝나면 팀원들과 라이벌도 조금씩 큰다
  if (w % 4 === 3) {
    teammatesGrow(c, rng);
    rivalGrow(c, rng);
  }
  // 능력치가 올라 조건을 채운 특수능력 (친밀도·부상 회복 등)
  r.notes.push(...checkAbilities(c));
  const g = gameFor(c, w, rng);
  c.pendingGame = g;
  r.game = g;
  c.rng = rng.state;
  // 다음 주가 새 학년이고 경기가 없으면 바로 진급
  if (c.week % WEEKS_PER_YEAR === 0 && !g) r.notes.push(...newYear(c));
  return r;
}

/** 경기를 마친 뒤 부른다 (해가 바뀌는 주에 경기가 있었을 때 진급 처리) */
export function afterGame(c: Career): string[] {
  if (c.week % WEEKS_PER_YEAR === 0 && dateOf(c.week).year !== c.season?.year) return newYear(c);
  return [];
}

function teammatesGrow(c: Career, rng: Rng) {
  for (const e of c.roster) {
    const rate = e.grade === 1 ? 0.3 : e.grade === 2 ? 0.25 : 0.15;
    for (const k of RATING_KEYS) {
      if (rng.chance(rate)) e.player.r[k] = Math.min(95, e.player.r[k] + 1);
    }
  }
}

const NEW_POS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** 3학년 졸업, 진급, 신입생 입학, 새 시즌 */
export function newYear(c: Career): string[] {
  const notes: string[] = [];
  const year = dateOf(c.week).year;
  const rng = Rng.fromState(c.rng);
  const school = schoolById(c.school);
  const grads = c.roster.filter((e) => e.grade >= 3);
  c.roster = c.roster.filter((e) => e.grade < 3);
  for (const e of c.roster) e.grade++;
  for (const g of grads) delete c.friends[g.player.id];
  if (year < 3) {
    // 신입생: 빠진 포지션부터 채운다
    const count = Math.max(3, 13 - c.roster.length);
    const taken = [c.me.number, ...c.roster.map((e) => e.player.number)];
    const used = new Set(taken);
    for (let i = 0; i < count; i++) {
      const have = (p: Position) => c.roster.filter((e) => e.player.pos === p).length;
      const pos = [...NEW_POS].sort((a, b) => have(a) - have(b))[0];
      let n = rng.int(0, 99);
      while (used.has(n)) n = rng.int(0, 99);
      used.add(n);
      const p = generatePlayer(rng, pos, school.strength - 5 + rng.normal(0, 2.5), n, { heightAdj: hsHeightAdj(c.gender) - 3, gender: c.gender });
      c.roster.push({ player: p, grade: 1 });
      c.friends[p.id] = 30;
    }
    notes.push(`${year + 1}학년이 됐다! 3학년 선배 ${grads.length}명 졸업, 신입생 ${count}명 입학.`);
  } else {
    notes.push('고교 3년이 끝났다! 드래프트와 프로 무대는 다음 버전에서.');
  }
  c.rng = rng.state;
  c.season = createSeason(c, year);
  return notes;
}
