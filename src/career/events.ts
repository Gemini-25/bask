// 이벤트 (L4, K8): 조건이 맞으면 주말에 가끔 일어난다. 선택지마다 효과가 다르다.
// 글 안의 {me} {coach} {rival} {rivalSchool} {mate} {mentor} {school} 은 실제 이름으로 바뀐다.
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { RATING_LABEL, type RatingKey } from '../data/ratings';
import { addXp, dateOf, type Career } from './career';
import { avgFriendship } from './people';
import { schoolById } from './schools';

export interface Effect {
  P?: number;
  T?: number;
  M?: number;
  trust?: number;
  fatigue?: number;
  /** 컨디션 단계 */
  condition?: number;
  /** 이벤트에 나온 팀원 친밀도 */
  friend?: number;
  /** 팀원 전체 친밀도 */
  friendsAll?: number;
  xp?: Partial<Record<RatingKey, number>>;
  /** 신발 색 바꾸기 */
  shoe?: number;
  text?: string;
  /** 확률로 갈리는 결과 */
  chance?: { p: number; ok: Effect; fail: Effect };
}

export interface Choice {
  label: string;
  hint?: string;
  effect: Effect;
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  /** 이 이벤트에 나올 팀원 */
  mate?: 'senior' | 'best' | 'junior' | 'random';
  once?: boolean;
  /** 다시 나오기까지 최소 주 */
  cooldown?: number;
  weight: number;
  when: (c: Career) => boolean;
  choices: Choice[];
}

const lastGames = (c: Career, n: number) => c.games.slice(-n);
const month = (c: Career) => dateOf(c.week).month;

export const EVENTS: EventDef[] = [
  {
    id: 'rivalMeet',
    title: '라이벌 등장',
    text: '{rivalSchool}의 {rival}이(가) 우리 체육관에 찾아왔다. "네가 그 신입생이구나? 대회에서 보자."',
    once: true,
    weight: 100,
    when: (c) => c.week >= 1 && !!c.rival,
    choices: [
      { label: '"기다릴게."', effect: { xp: { competitive: 0.6 }, condition: 1, text: '{rival}이(가) 피식 웃고 돌아갔다. 가슴이 뛴다.' } },
      { label: '대꾸하지 않는다', effect: { xp: { composure: 0.6 }, text: '말보다 코트에서 보여주면 된다.' } },
    ],
  },
  {
    id: 'seniorShot',
    title: '선배의 조언',
    text: '3학년 {mate} 선배가 슈팅 폼을 봐 주겠다고 한다.',
    mate: 'senior',
    cooldown: 16,
    weight: 10,
    when: (c) => c.week >= 2 && c.roster.some((e) => e.grade === 3),
    choices: [
      { label: '배운다', effect: { xp: { three: 0.5, midRange: 0.3 }, friend: 6, text: '팔꿈치 각도를 고쳤다. 손끝 감각이 달라졌다.' } },
      { label: '혼자 해 볼게요', effect: { xp: { competitive: 0.3 }, friend: -3, text: '{mate} 선배가 어깨를 으쓱했다.' } },
    ],
  },
  {
    id: 'coachWarn',
    title: '감독님 호출',
    text: '감독 {coach}: "요즘 훈련 태도가 마음에 안 든다. 팀 훈련은 빠지고 공원에서 논다며?"',
    cooldown: 10,
    weight: 30,
    when: (c) => c.trust < 35 && c.week >= 4,
    choices: [
      { label: '"죄송합니다. 열심히 하겠습니다."', effect: { trust: 5, condition: -1, text: '감독님이 고개를 끄덕였다.' } },
      { label: '"제 방식이 있습니다."', effect: { trust: -4, xp: { competitive: 0.5 }, text: '감독님 표정이 굳었다. 실력으로 보여줄 수밖에.' } },
    ],
  },
  {
    id: 'coachTrust',
    title: '감독님의 믿음',
    text: '감독 {coach}: "중요한 순간엔 너한테 공 간다. 준비해."',
    once: true,
    weight: 60,
    when: (c) => c.trust >= 70,
    choices: [{ label: '"맡겨 주세요."', effect: { trust: 2, xp: { composure: 0.6, leadership: 0.3 }, condition: 1 } }],
  },
  {
    id: 'rivalSns',
    title: '라이벌 소식',
    text: '{rival}의 하이라이트 영상이 SNS에서 화제다. 댓글에 "고교 최고 유망주"라는 말이 보인다.',
    cooldown: 14,
    weight: 8,
    when: (c) => c.week >= 8 && !!c.rival,
    choices: [
      { label: '자극받아 야간 훈련', effect: { T: 4, fatigue: 6, text: '밤 11시까지 체육관 불이 켜져 있었다.' } },
      { label: '신경 쓰지 않는다', effect: { condition: 1, xp: { composure: 0.3 }, text: '남은 남이다. 내 길을 가자.' } },
    ],
  },
  {
    id: 'rain',
    title: '장마',
    text: '장마로 공원 코트가 잠겼다. 오늘 저녁은 뭘 할까?',
    cooldown: 20,
    weight: 12,
    when: (c) => month(c) === 6 || month(c) === 7,
    choices: [
      { label: '체육관에서 자유투', effect: { xp: { freeThrow: 0.5 }, fatigue: 4 } },
      { label: '집에서 NBA 경기 보기', effect: { M: 3, fatigue: -4 } },
    ],
  },
  {
    id: 'kidFan',
    title: '꼬마 팬',
    text: '경기장 밖에서 꼬마가 사인해 달라고 종이를 내민다!',
    cooldown: 20,
    weight: 14,
    when: (c) => lastGames(c, 3).some((g) => g.grade === 'S' || g.grade === 'A'),
    choices: [
      { label: '사인해 준다', effect: { condition: 1, xp: { leadership: 0.3 }, text: '꼬마가 "형/언니 최고!" 하며 뛰어갔다.' } },
      { label: '같이 사진도 찍는다', effect: { condition: 1, M: 2, text: '처음 받아 보는 응원. 어깨가 으쓱해진다.' } },
    ],
  },
  {
    id: 'tired',
    title: '무거운 몸',
    text: '몸이 천근만근이다. 트레이너 선생님이 이번 주는 좀 쉬라고 한다.',
    cooldown: 6,
    weight: 40,
    when: (c) => c.fatigue >= 75 && !c.injury,
    choices: [
      { label: '말 듣고 쉰다', effect: { fatigue: -15, text: '하루 푹 자고 나니 다리가 가볍다.' } },
      { label: '괜찮습니다', effect: { chance: { p: 0.65, ok: { xp: { hustle: 0.4 }, text: '이를 악물고 버텼다.' }, fail: { condition: -1, fatigue: 5, text: '훈련 중에 다리가 풀렸다. 컨디션이 떨어졌다.' } } } },
    ],
  },
  {
    id: 'teamDinner',
    title: '승리 회식',
    text: '감독님이 대회 승리 기념으로 고기를 사 주셨다!',
    cooldown: 6,
    weight: 50,
    when: (c) => {
      const g = c.games[c.games.length - 1];
      return !!g && g.kind === 'official' && g.won && g.week === c.week - 1;
    },
    choices: [{ label: '잘 먹겠습니다!', effect: { friendsAll: 3, condition: 1, trust: 1 } }],
  },
  {
    id: 'mateWorry',
    title: '친구의 고민',
    text: '{mate}이(가) 요즘 출전 시간 때문에 힘들다고 털어놓는다.',
    mate: 'best',
    cooldown: 16,
    weight: 10,
    when: (c) => Object.values(c.friends).some((v) => v >= 55),
    choices: [
      { label: '같이 야간 훈련', effect: { friend: 8, fatigue: 7, T: 2, text: '둘이서 슛 500개를 던졌다.' } },
      { label: '감독님께 말씀드려 본다', effect: { friend: 4, trust: -2, text: '감독님은 "실력으로 말하라"고 하셨다.' } },
      { label: '그냥 들어 준다', effect: { friend: 3, M: 2 } },
    ],
  },
  {
    id: 'mentorHomework',
    title: '은사의 숙제',
    text: '{mentor} 선생님: "자유투 100개 연속 넣기 전엔 집에 가지 마라."',
    cooldown: 12,
    weight: 12,
    when: (c) => c.mentor.met,
    choices: [
      { label: '해낸다', effect: { chance: { p: 0.5, ok: { xp: { freeThrow: 0.9, consistency: 0.3 }, text: '100개째가 들어가자 선생님이 웃었다.' }, fail: { xp: { freeThrow: 0.4 }, fatigue: 6, text: '87개에서 끊겼다... 그래도 손에 감이 남았다.' } } } },
      { label: '"내일 할게요..."', effect: { M: 1, text: '선생님이 혀를 찼다.' } },
    ],
  },
  {
    id: 'kidsCourt',
    title: '공원의 꼬마들',
    text: '공원 코트에서 꼬마들이 농구를 가르쳐 달라고 조른다.',
    cooldown: 16,
    weight: 10,
    when: (c) => (c.counts.street ?? 0) >= 3,
    choices: [
      { label: '가르쳐 준다', effect: { xp: { leadership: 0.5, teamwork: 0.3 }, condition: 1 } },
      { label: '오늘은 바빠', effect: { xp: { hustle: 0.2 } } },
    ],
  },
  {
    id: 'newShoes',
    title: '새 농구화',
    text: '부모님이 새 농구화를 사 주셨다! 무슨 색으로 할까?',
    once: true,
    weight: 8,
    when: (c) => c.week >= 6,
    choices: [
      { label: '빨강', effect: { shoe: 2, condition: 1 } },
      { label: '파랑', effect: { shoe: 3, condition: 1 } },
      { label: '검정', effect: { shoe: 1, condition: 1 } },
    ],
  },
  {
    id: 'tacticsNote',
    title: '전술 노트',
    text: '감독님이 30년 동안 쓴 전술 노트를 빌려주셨다.',
    once: true,
    weight: 20,
    when: (c) => (c.counts.video ?? 0) >= 3 && c.trust >= 45,
    choices: [{ label: '밤새 읽는다', effect: { xp: { iq: 0.8, vision: 0.4 }, fatigue: 4, trust: 1 } }],
  },
  {
    id: 'slump',
    title: '슬럼프',
    text: '요즘 슛이 하나도 안 들어간다. 림이 바늘구멍 같다.',
    cooldown: 12,
    weight: 40,
    when: (c) => {
      const g = lastGames(c, 2);
      return g.length === 2 && g.every((x) => x.grade === 'D' || x.grade === 'C');
    },
    choices: [
      { label: '기본으로 돌아간다', effect: { xp: { consistency: 0.5, freeThrow: 0.2 }, text: '골밑 슛부터 다시. 한 개씩.' } },
      { label: '머리를 식힌다', effect: { fatigue: -10, condition: 1, text: '하루 농구공을 내려놓았다.' } },
    ],
  },
  {
    id: 'interview',
    title: '지역 신문 인터뷰',
    text: '지역 신문 기자가 인터뷰를 요청했다. "{school}의 새로운 에이스"라는 제목이라고.',
    cooldown: 20,
    weight: 30,
    when: (c) => !!c.season?.tours.some((t) => t.myFinish === '우승' && t.weeks[t.weeks.length - 1] === c.week - 1),
    choices: [
      { label: '"팀원들 덕분입니다."', effect: { friendsAll: 3, trust: 1, xp: { teamwork: 0.4 } } },
      { label: '"전국 제패가 목표입니다."', effect: { xp: { competitive: 0.4, leadership: 0.4 }, condition: 1 } },
    ],
  },
  {
    id: 'newYearGoal',
    title: '새해 다짐',
    text: '새해가 밝았다. 올해 목표는?',
    cooldown: 40,
    weight: 80,
    when: (c) => month(c) === 1,
    choices: [
      { label: '더 높이!', effect: { T: 3, P: 2 } },
      { label: '다치지 않기', effect: { fatigue: -10, condition: 1 } },
    ],
  },
  {
    id: 'street3x3',
    title: '3x3 대회 초대장',
    text: '동네 3x3 길거리 대회 초대장이 왔다. 상품은 최신 농구공!',
    cooldown: 30,
    weight: 25,
    when: (c) => (month(c) === 1 || month(c) === 2) && !c.injury,
    choices: [
      { label: '나간다', effect: { fatigue: 10, chance: { p: 0.45, ok: { T: 6, condition: 1, xp: { ballHandling: 0.3 }, text: '우승! 새 공을 품에 안았다.' }, fail: { T: 3, text: '4강에서 졌다. 상대가 대학생이었다...' } } } },
      { label: '안 나간다', effect: { fatigue: -4 } },
    ],
  },
  {
    id: 'juniorAsk',
    title: '후배의 부탁',
    text: '1학년 {mate}이(가) 수비 요령을 알려 달라고 한다.',
    mate: 'junior',
    cooldown: 16,
    weight: 10,
    when: (c) => dateOf(c.week).grade >= 2 && c.roster.some((e) => e.grade === 1),
    choices: [
      { label: '알려 준다', effect: { friend: 6, xp: { leadership: 0.5, perimeterD: 0.2 } } },
      { label: '"보고 배워."', effect: { xp: { competitive: 0.2 }, friend: -2 } },
    ],
  },
  {
    id: 'chemistry',
    title: '팀 분위기',
    text: '요즘 팀 분위기가 좋다. 패스가 척척 맞는다.',
    cooldown: 20,
    weight: 15,
    when: (c) => avgFriendship(c) >= 45,
    choices: [{ label: '좋아!', effect: { xp: { teamwork: 0.5, passing: 0.2 }, condition: 1 } }],
  },
];

export interface PendingEvent {
  id: string;
  mate?: string;
}

/** 이 주에 이벤트가 일어날지 정한다. 조건 맞는 것 중 무게로 하나 */
export function rollEvent(c: Career, rng: Rng): PendingEvent | null {
  const seen = (c.seenEvents ??= {});
  const ok = EVENTS.filter((e) => {
    const last = seen[e.id];
    if (last !== undefined && (e.once || c.week - last < (e.cooldown ?? 12))) return false;
    return e.when(c);
  });
  if (!ok.length) return null;
  // 확정 이벤트(무게 50 이상)는 자주, 나머지는 가끔
  const strong = ok.filter((e) => e.weight >= 50);
  const pool = strong.length && rng.chance(0.8) ? strong : rng.chance(0.28) ? ok : [];
  if (!pool.length) return null;
  const e = pool[rng.weighted(pool.map((x) => x.weight))];
  seen[e.id] = c.week;
  return { id: e.id, mate: pickMate(c, e, rng) };
}

function pickMate(c: Career, e: EventDef, rng: Rng): string | undefined {
  if (!e.mate) return undefined;
  const list = c.roster.filter((x) => (e.mate === 'senior' ? x.grade === 3 : e.mate === 'junior' ? x.grade === 1 : true));
  if (!list.length) return undefined;
  if (e.mate === 'best') return list.reduce((a, b) => ((c.friends[a.player.id] ?? 0) >= (c.friends[b.player.id] ?? 0) ? a : b)).player.id;
  return rng.pick(list).player.id;
}

export function eventById(id: string) {
  return EVENTS.find((e) => e.id === id);
}

/** 글 속 이름 바꾸기 */
export function fill(c: Career, text: string, mate?: string) {
  const mateName = c.roster.find((e) => e.player.id === mate)?.player.name ?? '팀원';
  return text
    .replace(/\{me\}/g, c.me.name)
    .replace(/\{coach\}/g, c.coach)
    .replace(/\{rival\}/g, c.rival?.player.name ?? '라이벌')
    .replace(/\{rivalSchool\}/g, c.rival ? schoolById(c.rival.school).name : '')
    .replace(/\{mate\}/g, mateName)
    .replace(/\{mentor\}/g, c.mentor.name)
    .replace(/\{school\}/g, schoolById(c.school).name);
}

/** 선택지를 고르면 효과를 적용하고 결과 글을 돌려준다 */
export function resolveEvent(c: Career, ev: PendingEvent, choice: number): string[] {
  const def = eventById(ev.id);
  c.pendingEvent = null;
  if (!def) return [];
  const ch = def.choices[Math.max(0, Math.min(def.choices.length - 1, choice))];
  const rng = Rng.fromState(c.rng);
  const out: string[] = [];
  const apply = (e: Effect) => {
    if (e.chance) apply(rng.chance(e.chance.p) ? e.chance.ok : e.chance.fail);
    for (const k of ['P', 'T', 'M'] as const) if (e[k]) c.points[k] += e[k]!;
    if (e.trust) c.trust = clamp(c.trust + e.trust, 0, 100);
    if (e.fatigue) c.fatigue = clamp(c.fatigue + e.fatigue, 0, 100);
    if (e.condition) c.condition = clamp(c.condition + e.condition, 0, 4);
    if (e.friend && ev.mate) c.friends[ev.mate] = clamp((c.friends[ev.mate] ?? 20) + e.friend, 0, 100);
    if (e.friendsAll) for (const id of Object.keys(c.friends)) c.friends[id] = clamp(c.friends[id] + e.friendsAll, 0, 100);
    if (e.shoe !== undefined) c.me.look.shoe = e.shoe;
    if (e.xp) {
      const ups: Partial<Record<RatingKey, number>> = {};
      for (const [k, v] of Object.entries(e.xp)) addXp(c, k as RatingKey, v!, ups);
      for (const [k, n] of Object.entries(ups)) out.push(`${RATING_LABEL[k as RatingKey]} +${n}`);
    }
    if (e.text) out.unshift(fill(c, e.text, ev.mate));
  };
  apply(ch.effect);
  c.rng = rng.state;
  return out;
}

/** 효과를 짧게 (선택지 아래 작은 글씨) */
export function effectHint(e: Effect): string {
  if (e.chance) return '결과는 운에 달렸다';
  const parts: string[] = [];
  for (const k of ['P', 'T', 'M'] as const) if (e[k]) parts.push(`${{ P: '피지컬', T: '기술', M: '정신' }[k]} ${e[k]! > 0 ? '+' : ''}${e[k]}`);
  if (e.trust) parts.push(`감독 신뢰 ${e.trust > 0 ? '+' : ''}${e.trust}`);
  if (e.fatigue) parts.push(`피로 ${e.fatigue > 0 ? '+' : ''}${e.fatigue}`);
  if (e.condition) parts.push(`컨디션 ${e.condition > 0 ? '↑' : '↓'}`);
  if (e.friend) parts.push(`친밀도 ${e.friend > 0 ? '+' : ''}${e.friend}`);
  if (e.friendsAll) parts.push(`팀 친밀도 +${e.friendsAll}`);
  if (e.xp) parts.push(Object.keys(e.xp).map((k) => `${RATING_LABEL[k as RatingKey]} 경험치`).join(', '));
  return parts.join(' · ');
}
