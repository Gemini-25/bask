// 대학 진학 (W2, M12): 고3이 끝나면 드래프트냐 대학이냐. 대학은 4학년까지, 해마다 얼리 엔트리.
import { Rng } from '../core/rng';
import { overall } from '../data/player';
import { dateOf, type Career } from './career';
import { runDraft } from './draft';
import { coachName } from './people';
import { COLLEGES, generateSchoolRoster, schoolById, type SchoolInfo } from './schools';
import { createSeason } from './season';

/** 대학 제안 세 곳: 명문 / 중위권 / 약체. 고교 성적이 좋아야 명문이 부른다 */
export function collegeOffers(c: Career): SchoolInfo[] {
  const titles = c.games.filter((g) => g.kind === 'official' && g.won).length;
  const score = overall(c.me, c.prefPos) + titles * 0.25 + (c.popularity ?? 0) * 0.08;
  const rng = new Rng((c.seed ^ 0xc011e9e) >>> 0);
  const tier = (lo: number, hi: number) => COLLEGES.filter((u) => u.strength <= hi && u.strength >= lo);
  const pick = (list: SchoolInfo[]) => list[Math.floor(rng.next() * list.length)];
  const top = score >= 52 ? pick(tier(-7, -6)) : pick(tier(-8.5, -8));
  const mid = pick(tier(-9.5, -9).filter((u) => u !== top));
  const low = pick(tier(-11.5, -10));
  return [top, mid, low];
}

/** 대학에 들어간다: 선수단, 감독, 시즌 (라이벌은 다른 대학으로) */
export function enterCollege(c: Career, id: string): string[] {
  const info = schoolById(id);
  const year = dateOf(c.week).year;
  const rng = Rng.fromState(c.rng);
  c.hsSchool ||= c.school;
  c.college = { school: id, year: 1, from: year };
  c.school = id;
  c.roster = generateSchoolRoster(rng.fork(31), info, c.gender, [c.me.number]);
  c.friends = Object.fromEntries(c.roster.map((e) => [e.player.id, e.grade === 1 ? 35 : 20]));
  c.coach = coachName((c.seed ^ id.charCodeAt(2) * 7919) >>> 0);
  c.trust = 35;
  c.pathPending = null;
  const notes = [`${info.name}에 입학했다! 새 감독은 ${c.coach}.`];
  if (c.rival) {
    const others = COLLEGES.filter((u) => u.id !== id);
    const to = others[Math.floor(rng.next() * others.length)];
    c.rival.school = to.id;
    notes.push(`라이벌 ${c.rival.player.name}은(는) ${to.name}에 갔다.`);
  }
  c.rng = rng.state;
  c.season = createSeason(c, year);
  return notes;
}

/** 드래프트에 나간다 (고졸, 얼리 엔트리, 졸업) */
export function declareDraft(c: Career) {
  c.pathPending = null;
  c.draft = runDraft(c);
}

/** 1년 더 다닌다 (새 학년 시즌은 해 넘김 때 이미 만들어 둔다) */
export function stayInCollege(c: Career) {
  c.pathPending = null;
}

/** 이 해는 무슨 해인가 (기록표) */
export function yearLabel(c: Career, y: number): string {
  if (c.pro && y >= (c.proFromYear ?? 3)) return `프로 ${y - (c.proFromYear ?? 3) + 1}시즌`;
  if (c.college && y >= c.college.from) return `대학 ${y - c.college.from + 1}학년`;
  if (y < 3) return `고교 ${y + 1}학년`;
  return `${y + 1}년차`;
}
