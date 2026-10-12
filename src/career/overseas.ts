// 해외 리그 (L9): 더 센 가상 리그. 쿼터 12분, 6반칙 퇴장. 국내 리그는 그동안 homeLeague로 따로 돌아간다.
import { Rng } from '../core/rng';
import type { Gender } from '../data/names';
import { overall } from '../data/player';
import { generateTeam, type TeamInfo } from '../data/teams';
import type { Career } from './career';
import { draftClass, finishOf, freeNumber, leagueTeam, offseason, scheduleSeason, standings, type League, type LeagueTeam } from './league';
import { coachName } from './people';
import type { Offer } from './pro';

/** 해외 리그 경기 규칙 */
export const OVERSEAS_RULES = { quarterMinutes: 12, foulOut: 6 };
/** 해외 진출 제안이 오는 종합 능력치 */
export const OVERSEAS_OVR = 72;

const T = (pace: number, pnr: number, iso: number, post: number, zone: number, press: number, sw: number) => ({ pace, pnr, iso, post, motion: 0.3, pindown: 0.15, dho: 0.15, zone, zoneType: '23' as const, press, switch: sw, double: 0.2 });

export const FOREIGN_INFOS: (TeamInfo & { strength: number })[] = [
  { id: 'HRB', city: '하버시티', name: '스팅레이즈', short: '하버', color: '#2a7fd4', color2: '#e6f2ff', strength: 9, tactics: T(0.7, 0.5, 0.3, 0.1, 0, 0.05, 0.6) },
  { id: 'RDR', city: '레드록', name: '스콜피온즈', short: '레드록', color: '#c4452d', color2: '#ffe9d6', strength: 8, tactics: T(0.6, 0.4, 0.4, 0.1, 0.05, 0.1, 0.5) },
  { id: 'NTH', city: '노스게이트', name: '울버린즈', short: '노스', color: '#3b3f4a', color2: '#ffc53d', strength: 7, tactics: T(0.5, 0.4, 0.2, 0.3, 0.1, 0.05, 0.4) },
  { id: 'SLV', city: '실버레이크', name: '헤론즈', short: '실버', color: '#9aa7b8', color2: '#13213a', strength: 7, tactics: T(0.6, 0.5, 0.2, 0.2, 0.05, 0.05, 0.5) },
  { id: 'IRV', city: '아이언밸리', name: '포저스', short: '아이언', color: '#6b4f3a', color2: '#f2d9b8', strength: 6, tactics: T(0.4, 0.3, 0.2, 0.4, 0.15, 0.05, 0.3) },
  { id: 'SUN', city: '선코스트', name: '플레어즈', short: '선코스트', color: '#ff8a1f', color2: '#3a1a00', strength: 6, tactics: T(0.85, 0.4, 0.3, 0.1, 0, 0.2, 0.6) },
  { id: 'PNE', city: '파인크레스트', name: '엘크스', short: '파인', color: '#2f7a46', color2: '#eaf7ea', strength: 5, tactics: T(0.5, 0.4, 0.2, 0.2, 0.1, 0.1, 0.4) },
  { id: 'MTR', city: '메트로폴', name: '볼츠', short: '메트로', color: '#ffd400', color2: '#1a1a2a', strength: 8, tactics: T(0.75, 0.5, 0.4, 0.1, 0, 0.05, 0.6) },
  { id: 'DST', city: '데저트스프링', name: '바이퍼스', short: '데저트', color: '#7a2fbf', color2: '#f3e6ff', strength: 5, tactics: T(0.6, 0.3, 0.3, 0.2, 0.2, 0.15, 0.3) },
  { id: 'BLU', city: '블루포트', name: '앵커스', short: '블루포트', color: '#163a6e', color2: '#d9e6ff', strength: 6, tactics: T(0.5, 0.4, 0.2, 0.3, 0.1, 0.05, 0.4) },
];

const FIRST_M = ['마커스', '제일런', '타이리스', '케빈', '데릭', '안드레', '브랜든', '카일', '트레이', '말릭', '다니엘', '루카스', '오스카', '니코', '이반', '마테오', '라파엘', '데니스', '셰인', '자말', '테렌스', '오마르', '그레이슨', '에릭'];
const FIRST_F = ['케일라', '브리아나', '재스민', '아리아나', '니아', '엠마', '소피아', '클로이', '올리비아', '마야', '로렌', '테일러', '에이버리', '나탈리', '이자벨', '라일라', '조이', '해나', '에바', '서맨사'];
const LAST = ['존슨', '윌리엄스', '브라운', '데이비스', '밀러', '윌슨', '앤더슨', '토머스', '잭슨', '화이트', '해리스', '마틴', '톰슨', '로빈슨', '클라크', '루이스', '워커', '홀', '앨런', '영', '킹', '라이트', '스콧', '그린', '베이커', '애덤스', '넬슨', '카터', '미첼', '페레스', '로페스', '가르시아', '페트로프', '실바', '오코예', '디알로'];

export function foreignName(rng: Rng, gender: Gender = 'M') {
  return `${rng.pick(gender === 'F' ? FIRST_F : FIRST_M)} ${rng.pick(LAST)}`;
}

export function createForeignLeague(rng: Rng, gender: Gender): League {
  const teams: LeagueTeam[] = FOREIGN_INFOS.map(({ strength, ...info }) => {
    const t = generateTeam(rng.fork(info.id.charCodeAt(0) * 37 + info.id.charCodeAt(2)), info, strength);
    for (const [i, p] of t.players.entries()) {
      p.name = foreignName(rng, gender);
      p.age = Math.round(Math.min(35, Math.max(21, rng.normal(i < 5 ? 28 : 25, 3.5))));
      // 키도 더 크다
      p.body = { ...p.body, heightCm: p.body.heightCm + 3, wingspanCm: p.body.wingspanCm + 4 };
    }
    return { info, players: t.players };
  });
  const lastOrder = [...teams].sort((x, y) => avg(x) - avg(y)).map((t) => t.info.id);
  return { season: 0, teams, games: [], series: [], lastOrder, history: [] };
}

const avg = (t: LeagueTeam) => t.players.slice(0, 8).reduce((s, p) => s + overall(p), 0) / 8;

/** 개발자 패널: 다음 재계약에 해외 제안을 무조건 넣는다 */
export const devFlags = { forceAbroad: false };

/** 해외 진출 제안 (재계약 때, 능력이 되면) */
export function overseasOffer(c: Career, base: number, rng: Rng): Offer | null {
  if (c.overseas) return null;
  const ovr = overall(c.me, c.prefPos);
  // 능력치가 되거나, MVP를 받았으면 해외 구단이 찾아온다
  if (ovr < OVERSEAS_OVR && !c.trophies.some((t) => /시즌 MVP$/.test(t)) && !devFlags.forceAbroad) return null;
  const team = rng.pick(FOREIGN_INFOS).id;
  return { team, salary: Math.round((base * 1.7) / 100) * 100, years: 2, abroad: true };
}

/** 해외에서 뛰다가 국내 복귀 제안 */
export function homecomingOffers(c: Career, base: number, rng: Rng): Offer[] {
  if (!c.overseas || !c.homeLeague) return [];
  return [...c.homeLeague.teams]
    .map((t) => ({ t, k: rng.next() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 2)
    .map(({ t }) => ({ team: t.info.id, salary: Math.round((base * rng.range(1.0, 1.25)) / 100) * 100, years: 3, home: true }));
}

/** 리그를 옮긴다 (해외 진출 / 국내 복귀). 새 리그의 이번 시즌 일정을 짠다 */
export function moveLeague(c: Career, toAbroad: boolean, base: number) {
  if (toAbroad === c.overseas) return;
  const rng = Rng.fromState(c.rng);
  if (toAbroad) {
    c.homeLeague = c.league;
    if (!c.abroadLeague) {
      c.abroadLeague = createForeignLeague(rng.fork(404), c.gender);
      // 시즌 번호는 국내 리그와 맞춘다
      c.abroadLeague.season = c.homeLeague!.season;
    }
    c.league = c.abroadLeague;
    c.abroadLeague = null;
    c.overseas = true;
  } else {
    c.abroadLeague = c.league;
    c.league = c.homeLeague;
    c.homeLeague = null;
    c.overseas = false;
  }
  const L = c.league!;
  L.stats = {};
  scheduleSeason(L, base);
  c.rng = rng.state;
}

/** 내가 없는 리그도 한 해가 지나간다 (나이, 은퇴, 신인) */
export function idleSeason(L: League, rng: Rng) {
  const order = [...L.teams].sort((a, b) => avg(a) + rng.normal(0, 2) - (avg(b) + rng.normal(0, 2)));
  L.lastOrder = order.map((t) => t.info.id);
  L.history.push({ season: L.season, champion: order[order.length - 1].info.id, myFinish: '-' });
  offseason(L, rng, draftClass(rng, 20));
  L.season++;
}

/** 새 팀에 들어갔을 때 감독·친밀도·등번호 */
export function joinTeam(c: Career, team: string) {
  const L = c.league!;
  c.pro!.team = team;
  c.trust = 40;
  c.coach = c.overseas ? `${foreignName(new Rng((c.seed ^ team.charCodeAt(0) * 7919) >>> 0))} 감독` : coachName((c.seed ^ team.charCodeAt(0) * 7919) >>> 0);
  const t = leagueTeam(L, team);
  c.friends = Object.fromEntries(t.players.map((p) => [p.id, c.overseas ? 15 : 25]));
  if (t.players.some((p) => p.number === c.me.number)) c.me.number = freeNumber(t, Rng.fromState(c.rng));
}

export { finishOf, standings };
