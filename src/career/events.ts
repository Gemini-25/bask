// 이벤트 (L4, K8): 조건이 맞으면 주말에 가끔 일어난다. 선택지마다 효과가 다르다.
// 글 안의 {me} {coach} {rival} {rivalSchool} {mate} {mentor} {school} 은 실제 이름으로 바뀐다.
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { RATING_LABEL, type RatingKey } from '../data/ratings';
import { addXp, dateOf, teammates, type Career } from './career';
import { gainPopularity } from './fans';
import { addTrait, traitDef, type TraitId } from './personality';
import { avgFriendship } from './people';
import { signContract } from './pro';
import { schoolById } from './schools';
import { addAffection, meet, romanceOn, setStatus, type RomanceStatus } from './romance';

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
  /** 프로: 인기, 돈(만원), 받는 물건, 트레이드 */
  pop?: number;
  money?: number;
  item?: string;
  trade?: boolean;
  /** 성격이 하나 생긴다 (두 개까지) */
  trait?: TraitId;
  /** 3x3 길거리 대회에 나간다 */
  street?: boolean;
  /** 연애: 만나기, 호감도, 관계 바뀜 */
  meet?: boolean;
  love?: number;
  loveStatus?: RomanceStatus;
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
  // 성격 (M12): 두 번째 성격이 생긴다
  {
    id: 'awaken',
    title: '달라진 나',
    text: '요즘 코트에서 내가 조금 달라진 것 같다. 어떤 선수가 되고 싶지?',
    once: true,
    weight: 30,
    when: (c) => (c.traits ?? []).length < 2 && c.week >= 60,
    choices: [
      { label: '아무도 안 볼 때 한 번 더 던진다', effect: { trait: 'diligent', T: 2 } },
      { label: '앞에서 팀을 이끈다', effect: { trait: 'leader', friendsAll: 3 } },
      { label: '무대를 즐긴다', effect: { trait: 'showman', pop: 2 } },
    ],
  },
  // M18: 성격이 생기는 이벤트 더
  {
    id: 'habit',
    title: '나만의 습관',
    text: '훈련이 끝나고 텅 빈 체육관. 요즘 내 습관이 생기는 것 같다.',
    once: true,
    weight: 25,
    when: (c) => (c.traits ?? []).length < 2 && c.week >= 30,
    choices: [
      { label: '불 꺼질 때까지 더 한다', effect: { trait: 'workaholic', T: 2, fatigue: 6 } },
      { label: '매일 같은 루틴을 지킨다', effect: { trait: 'steady', M: 2 } },
      { label: '자유투 100개를 다 넣어야 집에 간다', effect: { trait: 'perfectionist', xp: { freeThrow: 0.4 } } },
      { label: '아파도 참고 뛴다', effect: { trait: 'ironman', P: 2 } },
    ],
  },
  {
    id: 'playStyle',
    title: '내 농구',
    text: '감독님이 묻는다. "{me}, 넌 코트에서 어떤 선수가 되고 싶냐?"',
    once: true,
    weight: 25,
    when: (c) => (c.traits ?? []).length < 2 && c.games.filter((g) => g.kind === 'official').length >= 8,
    choices: [
      { label: '"한 방이 있는 슈터요."', effect: { trait: 'sniper', xp: { three: 0.3 } } },
      { label: '"상대 에이스를 지우는 선수요."', effect: { trait: 'defender', xp: { perimeterD: 0.3 } } },
      { label: '"동료를 살리는 선수요."', effect: { trait: 'unselfish', friendsAll: 3 } },
      { label: '"공은 저한테 주세요."', effect: { trait: 'selfish', xp: { competitive: 0.3 } } },
    ],
  },
  {
    id: 'outside',
    title: '코트 밖의 나',
    text: '주말에 친구가 묻는다. "너 농구 말고 뭐 좋아해?"',
    once: true,
    weight: 20,
    when: (c) => (c.traits ?? []).length < 2 && c.week >= 50,
    choices: [
      { label: '사람 만나는 거', effect: { trait: 'socialite', friendsAll: 2 } },
      { label: '카메라 앞에 서는 거', effect: { trait: 'mediaStar', pop: 2 } },
      { label: '그냥 그날 기분대로', effect: { trait: 'natural', xp: { sense: 0.4 } } },
      { label: '골목에서 공 튀기는 거', effect: { trait: 'streaky', xp: { ballHandling: 0.3 } } },
    ],
  },
  {
    id: 'bigStage',
    title: '큰 경기의 무게',
    text: '중요한 경기에서 손이 떨렸다. 이 떨림을 어떻게 할까?',
    once: true,
    weight: 30,
    when: (c) => (c.traits ?? []).length < 2 && c.games.filter((g) => g.kind === 'official').length >= 12,
    choices: [
      { label: '이를 악물고 이겨 낸다', effect: { trait: 'competitor', M: 2 } },
      { label: '마음을 비운다', effect: { trait: 'cool', M: 2 } },
      { label: '웃어넘긴다', effect: { trait: 'optimist', condition: 1 } },
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
    text: '동네 3x3 길거리 대회 초대장이 왔다. 8팀이 나와서 21점 먼저 내는 토너먼트! 같이 나갈 팀원도 둘 있다.',
    cooldown: 30,
    weight: 60,
    // 비시즌 여름에 한 번: 고교·대학은 7~8월, 프로는 비시즌 (시즌 전)
    when: (c) => !c.injury && (c.pro ? c.week % 48 >= 2 && c.week % 48 <= 7 : month(c) === 7 || month(c) === 8),
    choices: [
      { label: '나간다', hint: '토너먼트를 바로 치른다', effect: { street: true } },
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
  // ───────────── 연애 (R4, M13). 설정에서 끄면 안 나온다 ─────────────
  {
    id: 'loveMeet',
    title: '두근두근',
    text: '연습이 끝나고 나오는데, 매번 관중석에서 보던 사람이 수건을 건넨다. "오늘 3점슛 멋있었어요."',
    cooldown: 30,
    weight: 10,
    when: (c) => romanceOn(c) && !c.romance && c.week >= 10,
    choices: [
      { label: '이름을 물어본다', effect: { meet: true, M: 3, condition: 1, text: '{love}. 이름을 몇 번이고 되뇌었다.' } },
      { label: '고개만 숙이고 지나간다', effect: { xp: { focus: 0.2 }, text: '지금은 농구만 생각하자.' } },
    ],
  },
  {
    id: 'loveDate',
    title: '{love}의 연락',
    text: '{love}에게서 문자가 왔다. "이번 주말에 시간 돼요?"',
    cooldown: 8,
    weight: 14,
    when: (c) => romanceOn(c) && !!c.romance && c.romance.status !== 'married',
    choices: [
      { label: '영화 보러 간다', hint: '피로 -6', effect: { love: 12, fatigue: -6, condition: 1, money: -3, text: '팝콘을 나눠 먹었다. 경기 생각이 하나도 안 났다.' } },
      { label: '같이 공원 코트에 간다', effect: { love: 7, T: 3, text: '{love}이(가) 리바운드를 잡아 줬다. 슛이 더 잘 들어간다.' } },
      { label: '훈련 때문에 미룬다', effect: { love: -8, T: 2, text: '"다음엔 꼭이요." 답장이 짧다.' } },
    ],
  },
  {
    id: 'loveConfess',
    title: '고백',
    text: '{love}와(과) 걷는 밤길. 지금 말하지 않으면 계속 이대로일 것 같다.',
    once: false,
    cooldown: 12,
    weight: 60,
    when: (c) => romanceOn(c) && c.romance?.status === 'crush' && c.romance.affection >= 50,
    choices: [
      { label: '"좋아해요."', effect: { chance: { p: 0.75, ok: { loveStatus: 'dating', M: 6, condition: 2 }, fail: { love: -15, condition: -1, text: '"조금만 더 생각해 볼게요..."' } } } },
      { label: '아직은...', effect: { love: -3 } },
    ],
  },
  {
    id: 'loveCheer',
    title: '응원 온 {love}',
    text: '관중석에 {love}이(가) 손팻말을 들고 앉아 있다. "{me} 화이팅!"',
    cooldown: 10,
    weight: 12,
    when: (c) => romanceOn(c) && (c.romance?.status === 'dating' || c.romance?.status === 'married') && lastGames(c, 1).some((g) => g.kind === 'official'),
    choices: [
      { label: '손을 흔든다', effect: { love: 5, condition: 1, xp: { competitive: 0.2 } } },
      { label: '경기에 집중한다', effect: { love: 1, xp: { focus: 0.3 } } },
    ],
  },
  {
    id: 'loveFight',
    title: '말다툼',
    text: '"요즘 연습 얘기밖에 안 하잖아." {love}이(가) 서운해한다.',
    cooldown: 20,
    weight: 6,
    when: (c) => romanceOn(c) && c.romance?.status === 'dating',
    choices: [
      { label: '먼저 사과한다', effect: { love: 4, M: 2, fatigue: 3 } },
      { label: '"나 지금 중요한 때야."', effect: { love: -14, condition: -1, xp: { focus: 0.3 } } },
    ],
  },
  {
    id: 'loveProposal',
    title: '반지',
    text: '{love}와(과) 만난 지 꽤 됐다. 주머니 속 반지 상자가 무겁다.',
    cooldown: 24,
    weight: 60,
    when: (c) => romanceOn(c) && c.romance?.status === 'dating' && c.romance.affection >= 85 && !!c.pro && (c.me.age ?? 0) >= 25 && c.week - c.romance.met >= 96,
    choices: [
      { label: '청혼한다', effect: { loveStatus: 'married', M: 10, condition: 2, money: -500, pop: 3 } },
      { label: '아직 때가 아니다', effect: { love: -2 } },
    ],
  },
];

// 프로 이벤트 (M7)
EVENTS.push(
  {
    id: 'tradeRumor',
    title: '트레이드 소문',
    text: '구단이 너를 트레이드 카드로 쓴다는 기사가 났다. 감독 {coach}은(는) 말이 없다.',
    cooldown: 20,
    weight: 40,
    when: (c) => !!c.pro && c.trust < 30,
    choices: [
      { label: '"더 열심히 하겠습니다."', effect: { trust: 5, fatigue: 5, text: '훈련장에 제일 먼저 나와 제일 늦게 나갔다.' } },
      { label: '트레이드를 요청한다', effect: { trade: true, text: '구단이 요청을 받아들였다. 새 팀으로 간다.' } },
    ],
  },
  {
    id: 'fanLetter',
    title: '팬레터',
    text: '구단으로 팬레터가 왔다. "선수님 덕분에 농구를 시작했어요!"',
    cooldown: 16,
    weight: 15,
    when: (c) => (c.popularity ?? 0) >= 30,
    choices: [
      { label: '답장을 쓴다', effect: { condition: 1, M: 2, pop: 1 } },
      { label: '사인볼을 보낸다', effect: { pop: 2, money: -10 } },
    ],
  },
  {
    id: 'rookieWall',
    title: '신인의 벽',
    text: '프로는 고교와 다르다. 몸싸움도, 속도도. 선배 {mate}이(가) 웃으며 어깨를 친다. "다들 한 번씩 겪어."',
    mate: 'random',
    once: true,
    weight: 60,
    when: (c) => !!c.pro && c.pro.season === 0 && c.games.filter((g) => g.label.includes('정규')).length >= 3,
    choices: [
      { label: '웨이트를 늘린다', effect: { P: 4, fatigue: 6, friend: 3 } },
      { label: '영상으로 공부한다', effect: { M: 4, xp: { iq: 0.4 }, friend: 3 } },
    ],
  },
  {
    id: 'sponsor',
    title: '스폰서 제안',
    text: '스포츠 브랜드에서 후원 계약을 제안했다! 신발과 용품을 준다고 한다.',
    once: true,
    weight: 50,
    when: (c) => !!c.pro && (c.popularity ?? 0) >= 45,
    choices: [
      { label: '계약한다', effect: { money: 3000, pop: 3, item: 'shoeLight', text: '계약금 3000만 원과 새 농구화를 받았다.' } },
      { label: '지금은 농구만', effect: { trust: 2, text: '감독님이 그 말을 들었다.' } },
    ],
  },
);

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
  const list = teammates(c).filter((x) => (e.mate === 'senior' ? x.grade === 3 : e.mate === 'junior' ? x.grade === 1 : true));
  if (!list.length) return undefined;
  if (e.mate === 'best') return list.reduce((a, b) => ((c.friends[a.player.id] ?? 0) >= (c.friends[b.player.id] ?? 0) ? a : b)).player.id;
  return rng.pick(list).player.id;
}

/** 개발자 패널: 조건을 안 보고 이 이벤트를 지금 일으킨다 */
export function forceEvent(c: Career, id: string, rng: Rng): PendingEvent | null {
  const e = eventById(id);
  if (!e) return null;
  (c.seenEvents ??= {})[e.id] = c.week;
  return { id: e.id, mate: pickMate(c, e, rng) };
}

export function eventById(id: string) {
  return EVENTS.find((e) => e.id === id);
}

/** 글 속 이름 바꾸기 */
export function fill(c: Career, text: string, mate?: string) {
  const mateName = teammates(c).find((e) => e.player.id === mate)?.player.name ?? '팀원';
  return text
    .replace(/\{me\}/g, c.me.name)
    .replace(/\{coach\}/g, c.coach)
    .replace(/\{rival\}/g, c.rival?.player.name ?? '라이벌')
    .replace(/\{rivalSchool\}/g, c.rival ? rivalWhere(c) : '')
    .replace(/\{mate\}/g, mateName)
    .replace(/\{mentor\}/g, c.mentor.name)
    .replace(/\{school\}/g, schoolById(c.school).name)
    .replace(/\{love\}/g, c.romance?.name ?? '그 사람');
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
    if (e.pop) gainPopularity(c, e.pop);
    if (e.money) c.money = Math.max(0, (c.money ?? 0) + e.money);
    if (e.item && !(c.items ??= []).includes(e.item)) c.items.push(e.item);
    if (e.trade && c.pro && c.league) {
      const others = c.league.teams.filter((t) => t.info.id !== c.pro!.team);
      const to = others[Math.floor(rng.next() * others.length)];
      signContract(c, { team: to.info.id, salary: c.pro.salary, years: Math.max(1, c.pro.years) });
      out.push(`${to.info.city} ${to.info.name}(으)로 이적했다!`);
    }
    if (e.xp) {
      const ups: Partial<Record<RatingKey, number>> = {};
      for (const [k, v] of Object.entries(e.xp)) addXp(c, k as RatingKey, v!, ups);
      for (const [k, n] of Object.entries(ups)) out.push(`${RATING_LABEL[k as RatingKey]} +${n}`);
    }
    if (e.street) c.streetPending = true;
    if (e.meet && !c.romance) meet(c, rng);
    if (e.love) {
      const t = addAffection(c, e.love);
      if (t) out.push(t);
    }
    if (e.loveStatus) {
      const t = setStatus(c, e.loveStatus);
      if (t) out.push(t);
    }
    if (e.trait && addTrait(c, e.trait)) out.push(`성격이 생겼다: ${traitDef(e.trait).label} (${traitDef(e.trait).desc})`);
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
  if (e.pop) parts.push(`인기 +${e.pop}`);
  if (e.money) parts.push(`돈 ${e.money > 0 ? '+' : ''}${e.money}만`);
  if (e.trade) parts.push('다른 팀으로');
  if (e.trait) parts.push(`성격: ${traitDef(e.trait).label}`);
  if (e.love) parts.push(`호감 ${e.love > 0 ? '+' : ''}${e.love}`);
  if (e.xp) parts.push(Object.keys(e.xp).map((k) => `${RATING_LABEL[k as RatingKey]} 경험치`).join(', '));
  return parts.join(' · ');
}

/** 라이벌이 뛰는 곳 (해외에 나가 있으면 국내 리그에서 찾는다) */
function rivalWhere(c: Career) {
  const id = c.rival!.school;
  for (const L of [c.league, c.homeLeague, c.abroadLeague]) {
    const t = L?.teams.find((x) => x.info.id === id);
    if (t) return t.info.name;
  }
  return schoolById(id).name;
}
