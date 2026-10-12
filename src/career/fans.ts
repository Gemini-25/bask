// 인기·팬 (L2)과 인터뷰 (L3): 경기 결과로 인기가 오르내리고, SNS 반응 글이 쌓인다.
import { clamp } from '../core/math';
import type { RatingKey } from '../data/ratings';
import { Rng } from '../core/rng';
import type { Career, GameLine } from './career';
import { traitPop, type TraitId } from './personality';

export interface SnsPost {
  week: number;
  who: string;
  text: string;
  likes: number;
}

const HANDLES = ['농구는인생', 'bask_fan', '덩크장인', '3점요정', '코트위시인', '직관러', '벤치워머', '하이라이트봇', 'KBASK기자', '농구부매니저', '골밑지킴이', '야간자습중'];

const GOOD = ['오늘 {me} 미쳤다 ㄷㄷ', '{me} 이 정도면 국대감 아님?', '{pts}점 실화냐', '{me} 하이라이트 무한 반복 중', '역시 {me}… 믿고 본다', '{team} 경기는 {me} 보러 간다'];
const OK = ['{me} 오늘 무난했음', '{me} 꾸준한 게 제일 무섭다', '{pts}점이면 밥값은 했다', '다음 경기 기대한다 {me}'];
const BAD = ['{me} 오늘 왜 저럼…', '{me} 슬럼프인가', '자유투 연습 좀 ㅠㅠ', '{me} 힘내라 다음엔 잘하겠지', '감독님 {me} 좀 쉬게 해줘라'];
const BENCH = ['{me} 언제 뛰냐', '{me} 출전 시간 좀…', '벤치에서 박수 치는 {me} 귀엽다'];
// 별명이 생기면 (M19)
const NICK = ["'{nick}' 클래스 ㄷㄷ", "역시 '{nick}' {me}", "'{nick}' 별명 괜히 붙은 게 아니다", "오늘도 '{nick}' 했다"];

function fill(t: string, c: Career, line: GameLine | null, team: string) {
  return t.replace(/\{me\}/g, c.me.name).replace(/\{nick\}/g, c.nickname ?? c.me.name).replace(/\{pts\}/g, String(line?.pts ?? 0)).replace(/\{team\}/g, team);
}

/** 경기 뒤 인기 변화와 SNS 글 */
export function afterGameFans(c: Career, grade: string, line: GameLine | null, won: boolean, big: boolean, team: string, boost = 1): { dPop: number; posts: SnsPost[] } {
  const rng = Rng.fromState(c.rng);
  const g = { S: 3, A: 1.6, B: 0.6, C: 0.1, D: -0.6, '-': -0.2 }[grade] ?? 0;
  const raw = (g + (won ? 0.3 : 0) + (big ? 1.5 : 0)) * (c.pro ? 0.6 : 0.4);
  // 응원단이 있는 홈 경기는 더 오른다 (떨어질 땐 그대로)
  const dPop = gainPopularity(c, raw > 0 ? raw * boost : raw);
  const pool0 = !line || line.sec < 120 ? BENCH : grade === 'S' || grade === 'A' ? GOOD : grade === 'B' || grade === 'C' ? OK : BAD;
  const pool = pool0 === GOOD && c.nickname ? [...GOOD, ...NICK] : pool0;
  const n = 1 + Math.round((c.popularity ?? 0) / 35) + (big ? 1 : 0);
  const posts: SnsPost[] = [];
  for (let i = 0; i < n; i++) {
    posts.push({ week: c.week - 1, who: rng.pick(HANDLES), text: fill(rng.pick(pool), c, line, team), likes: Math.round(rng.range(1, 10) * (1 + (c.popularity ?? 0) / 10)) });
  }
  c.sns = [...posts, ...(c.sns ?? [])].slice(0, 40);
  c.rng = rng.state;
  return { dPop, posts };
}

/**
 * 인기 변화 (M11): 높을수록 덜 오르고, 고교 때는 40 근처에서 멈춘다.
 * 실제로 바뀐 만큼 돌려준다
 */
export function gainPopularity(c: Career, d: number): number {
  const p = c.popularity ?? 0;
  let v = d;
  if (d > 0) {
    v *= traitPop(c) * Math.max(0, 1 - p / 110);
    // 고교는 40, 대학은 55 근처에서 멈춘다
    if (!c.pro) v *= Math.max(0, 1 - p / (c.college ? 55 : 40));
  }
  c.popularity = clamp(p + v, 0, 100);
  return c.popularity - p;
}

/** 인기는 매주 식는다. 높을수록 더 빨리 */
export function popularityDecay(c: Career) {
  const p = c.popularity ?? 0;
  c.popularity = Math.max(0, p - (c.pro ? 0.1 : 0.05) - p * 0.004);
}

export interface InterviewChoice {
  label: string;
  effect: { pop?: number; trust?: number; friends?: number; xp?: Partial<Record<RatingKey, number>> };
  reply: string;
}

/** 경기 뒤 인터뷰 (잘했거나 큰 경기일 때) */
/** 성격에 따라 하나 더 고를 수 있는 답 */
const TRAIT_ANSWER: Partial<Record<TraitId, InterviewChoice>> = {
  showman: { label: '"오늘의 주인공은 저죠!"', effect: { pop: 3, trust: -1 }, reply: '관중석이 들썩였다. 감독님은 고개를 저었다.' },
  cool: { label: '"평소대로 했을 뿐입니다."', effect: { xp: { composure: 0.4 } }, reply: '담담한 한마디에 기자들이 받아 적는다.' },
  hothead: { label: '"다음엔 더 박살 내겠습니다!"', effect: { pop: 2, trust: -2 }, reply: '상대 팀 팬들이 술렁였다.' },
  leader: { label: '"다 같이 만든 승리입니다."', effect: { friends: 3, trust: 1 }, reply: '라커룸에서 박수가 터졌다.' },
  competitor: { label: '"아직 배고픕니다."', effect: { xp: { competitive: 0.4 }, pop: 1 }, reply: '눈빛이 달랐다.' },
  // M18
  selfish: { label: '"제가 이겼습니다."', effect: { pop: 2, friends: -3 }, reply: '팀원들 표정이 굳었다.' },
  unselfish: { label: '"제 패스를 넣어 준 동료들이 대단하죠."', effect: { friends: 4 }, reply: '동료들이 머리를 쓰다듬었다.' },
  mediaStar: { label: '(카메라를 보며) "다들 보고 있죠?"', effect: { pop: 4 }, reply: '클립이 SNS에 퍼졌다.' },
  perfectionist: { label: '"자유투 하나 놓친 게 아직 아쉽습니다."', effect: { xp: { freeThrow: 0.3 }, trust: 1 }, reply: '기자들이 웃었다. 감독님은 웃지 않았다.' },
  sniper: { label: '"림이 바다만 해 보였어요."', effect: { pop: 2, xp: { three: 0.2 } }, reply: '오늘의 명언으로 뽑혔다.' },
  defender: { label: '"상대 에이스 몇 점 넣었죠?"', effect: { xp: { perimeterD: 0.3 }, trust: 1 }, reply: '상대 팀 라커룸이 조용해졌다.' },
  socialite: { label: '"오늘 밤엔 다 같이 고기 먹으러 갑니다!"', effect: { friends: 3, pop: 1 }, reply: '팀 단톡방이 불이 났다.' },
};

export function interviewFor(grade: string, official: boolean, traits: TraitId[] = []): { q: string; choices: InterviewChoice[] } | null {
  if (!(grade === 'S' || grade === 'A') && !(official && grade !== '-')) return null;
  const q = grade === 'S' ? '오늘 정말 대단했어요. 소감 한마디 해주세요!' : '오늘 경기 어떠셨어요?';
  return {
    q,
    choices: [
      { label: '"팀원들 덕분입니다."', effect: { friends: 3, pop: 0.5, xp: { teamwork: 0.4 } }, reply: '겸손한 신인이라는 기사가 났다.' },
      { label: '"이 정도는 기본이죠."', effect: { pop: 2, trust: -1, xp: { competitive: 0.4 } }, reply: '자신감 넘치는 인터뷰가 화제가 됐다.' },
      { label: '"다음 경기가 더 중요합니다."', effect: { trust: 1, xp: { composure: 0.4 } }, reply: '감독님이 고개를 끄덕였다.' },
      ...traits.map((t) => TRAIT_ANSWER[t]).filter((x): x is InterviewChoice => !!x),
    ],
  };
}
