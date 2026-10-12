// 한 주 진행 묶음: 행동 → 남의 경기 → 내 주말 경기 정하기 → 달마다 팀원 성장 → 해가 바뀌면 진급·졸업
import { Rng } from '../core/rng';
import { generatePlayer, overall, type Position } from '../data/player';
import { RATING_KEYS } from '../data/ratings';
import { dateOf, doWeek, WEEKS_PER_YEAR, type ActionId, type Career, type FocusId, type PendingGame, type WeekResult } from './career';
import { hsHeightAdj, schoolById } from './schools';
import { checkAbilities } from './abilities';
import { checkCombos } from './combos';
import { campDue, checkPosition } from './extras';
import { rollEvent } from './events';
import { declareDraft } from './college';
import { popularityDecay } from './fans';
import { rivalGrow } from './people';
import { proNewYear, proWeek, seasonBase } from './pro';
import { ALLSTAR_WEEK, allStarGame, callUp, NATIONAL_CALL, nationalGames, runAllStar } from './allstar';
import { catchUp, createSeason, gameFor, playOthers } from './season';

/** 올해 시즌이 없으면 만든다 (새 커리어, 새 학년, 예전 세이브) */
export function ensureSeason(c: Career) {
  const year = dateOf(c.week).year;
  if (c.season && c.season.year === year) return;
  if (c.season === null && year >= 3 && !c.college) return;
  c.season = createSeason(c, year);
  if (c.week % WEEKS_PER_YEAR !== 0) {
    const rng = Rng.fromState(c.rng);
    catchUp(c, rng);
    c.rng = rng.state;
  }
}

/** bonus: 훈련 미니게임 결과 배율 (안 하면 1) */
export function playWeek(c: Career, id: ActionId, focus?: FocusId, bonus = 1): WeekResult {
  if (!c.pro) ensureSeason(c);
  // 이벤트는 이번 주 상황(지난 경기 결과 포함)으로 정하고, 훈련 결과 다음에 보여준다
  const er = Rng.fromState(c.rng);
  const ev = c.pendingEvent ?? rollEvent(c, er);
  c.rng = er.state;
  const r = doWeek(c, id, focus, bonus);
  c.pendingEvent = ev;
  r.event = ev;
  const w = c.week - 1;
  const rng = Rng.fromState(c.rng);
  let g: PendingGame | null;
  if (c.pro) {
    // 연봉은 매주 나눠서 들어온다
    c.money += Math.round(c.pro.salary / WEEKS_PER_YEAR);
    popularityDecay(c);
    const base = seasonBase({ ...c, week: w } as Career);
    // 비시즌 국가대표 소집
    if (w - base === NATIONAL_CALL && c.national?.season !== c.league!.season) {
      const camp = callUp(c, base, rng);
      if (camp) {
        c.national = camp;
        r.notes.push('국가대표에 뽑혔다! 아시아컵에 나간다.');
      }
    }
    c.gameQueue = [...nationalGames(c, w), ...proWeek(c, w, rng)];
    // 올스타 위크엔드
    if (w - base === ALLSTAR_WEEK && c.allStar?.season !== c.league!.season + 1) {
      c.allStar = runAllStar(c, rng);
      r.notes.push(...c.allStar.notes);
      const ag = allStarGame(c);
      if (ag) c.gameQueue.unshift(ag);
    }
    g = c.gameQueue.shift() ?? null;
  } else {
    playOthers(c, w, rng);
    // 한 달이 끝나면 팀원들과 라이벌도 조금씩 큰다
    if (w % 4 === 3) {
      teammatesGrow(c, rng);
      rivalGrow(c, rng);
    }
    g = gameFor(c, w, rng);
  }
  // 능력치가 올라 조건을 채운 특수능력 (친밀도·부상 회복 등)
  r.notes.push(...checkAbilities(c));
  r.notes.push(...checkCombos(c));
  // 비시즌 전지훈련, 감독의 포지션 전향 제안
  if (campDue(c, w)) c.campPending = true;
  checkPosition(c);
  c.peakOvr = Math.max(c.peakOvr ?? 0, Math.round(overall(c.me, c.prefPos)));
  c.pendingGame = g;
  r.game = g;
  c.rng = rng.state;
  // 다음 주가 새해이고 경기가 없으면 바로 넘어간다
  if (!g) r.notes.push(...rollover(c));
  return r;
}

/** 경기를 마친 뒤: 같은 주 다음 경기를 꺼내고, 해가 바뀌는 주였으면 넘어간다 */
export function afterGame(c: Career): string[] {
  c.pendingGame = c.gameQueue?.shift() ?? null;
  if (c.pendingGame) return [];
  return rollover(c);
}

/** 해가 바뀌었으면: 고교는 진급, 고3이 끝나면 드래프트, 프로는 새 시즌 */
export function rollover(c: Career): string[] {
  const y = dateOf(c.week).year;
  if (c.week % WEEKS_PER_YEAR !== 0 || y <= (c.yearOf ?? 0)) return [];
  c.yearOf = y;
  if (c.pro) return proNewYear(c);
  if (c.college) {
    // 대학 학년이 끝났다: 4학년이면 드래프트, 아니면 얼리 엔트리를 고른다
    c.me.age = (c.me.age ?? 19) + 1;
    c.college.year++;
    if (c.college.year > 4) {
      c.college.year = 4;
      declareDraft(c);
      return ['대학 4년을 마쳤다! 드래프트 날이다.'];
    }
    const notes = newYear(c);
    c.pathPending = 'college';
    return [`대학 ${c.college.year - 1}학년이 끝났다. 드래프트에 나갈까, 1년 더 다닐까?`, ...notes];
  }
  if (y === 3) {
    c.me.age = (c.me.age ?? 18) + 1;
    c.pathPending = 'hs';
    return ['고교 3년이 끝났다! 진로를 정할 때다.'];
  }
  c.me.age = (c.me.age ?? 16) + 1;
  return newYear(c);
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
  // 상대 학교 선수는 새로 만들어지니 고친 사본도 지운다
  delete c.overrides;
  const year = dateOf(c.week).year;
  const rng = Rng.fromState(c.rng);
  const school = schoolById(c.school);
  const top = c.college ? 4 : 3;
  const grads = c.roster.filter((e) => e.grade >= top);
  c.roster = c.roster.filter((e) => e.grade < top);
  for (const e of c.roster) e.grade++;
  for (const g of grads) delete c.friends[g.player.id];
  if (year < 3 || c.college) {
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
      const p = generatePlayer(rng, pos, school.strength - (c.college ? 4 : 5) + rng.normal(0, 2.5), n, { heightAdj: hsHeightAdj(c.gender) + (c.college ? 0 : -3), gender: c.gender });
      c.roster.push({ player: p, grade: 1 });
      c.friends[p.id] = 30;
    }
    notes.push(c.college ? `대학 ${c.college.year}학년이 됐다! 4학년 선배 ${grads.length}명 졸업, 신입생 ${count}명 입학.` : `${year + 1}학년이 됐다! 3학년 선배 ${grads.length}명 졸업, 신입생 ${count}명 입학.`);
  }
  c.rng = rng.state;
  c.season = createSeason(c, year);
  return notes;
}
