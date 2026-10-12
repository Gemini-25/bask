// 인기·팬 (L2)과 인터뷰 (L3): 경기 결과로 인기가 오르내리고, SNS 반응 글이 쌓인다.
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import type { Career, GameLine } from './career';

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

function fill(t: string, c: Career, line: GameLine | null, team: string) {
  return t.replace(/\{me\}/g, c.me.name).replace(/\{pts\}/g, String(line?.pts ?? 0)).replace(/\{team\}/g, team);
}

/** 경기 뒤 인기 변화와 SNS 글 */
export function afterGameFans(c: Career, grade: string, line: GameLine | null, won: boolean, big: boolean, team: string): { dPop: number; posts: SnsPost[] } {
  const rng = Rng.fromState(c.rng);
  const g = { S: 3, A: 1.6, B: 0.6, C: 0.1, D: -0.6, '-': -0.2 }[grade] ?? 0;
  const dPop = (g + (won ? 0.3 : 0) + (big ? 1.5 : 0)) * (c.pro ? 0.6 : 0.4);
  c.popularity = clamp((c.popularity ?? 0) + dPop, 0, 100);
  const pool = !line || line.sec < 120 ? BENCH : grade === 'S' || grade === 'A' ? GOOD : grade === 'B' || grade === 'C' ? OK : BAD;
  const n = 1 + Math.round((c.popularity ?? 0) / 35) + (big ? 1 : 0);
  const posts: SnsPost[] = [];
  for (let i = 0; i < n; i++) {
    posts.push({ week: c.week - 1, who: rng.pick(HANDLES), text: fill(rng.pick(pool), c, line, team), likes: Math.round(rng.range(1, 10) * (1 + (c.popularity ?? 0) / 10)) });
  }
  c.sns = [...posts, ...(c.sns ?? [])].slice(0, 40);
  c.rng = rng.state;
  return { dPop, posts };
}

/** 인기는 매주 조금씩 식는다 */
export function popularityDecay(c: Career) {
  c.popularity = Math.max(0, (c.popularity ?? 0) - 0.15);
}

export interface InterviewChoice {
  label: string;
  effect: { pop?: number; trust?: number; friends?: number; xp?: Partial<Record<'teamwork' | 'leadership' | 'competitive' | 'composure', number>> };
  reply: string;
}

/** 경기 뒤 인터뷰 (잘했거나 큰 경기일 때) */
export function interviewFor(grade: string, official: boolean): { q: string; choices: InterviewChoice[] } | null {
  if (!(grade === 'S' || grade === 'A') && !(official && grade !== '-')) return null;
  const q = grade === 'S' ? '오늘 정말 대단했어요. 소감 한마디 해주세요!' : '오늘 경기 어떠셨어요?';
  return {
    q,
    choices: [
      { label: '"팀원들 덕분입니다."', effect: { friends: 3, pop: 0.5, xp: { teamwork: 0.4 } }, reply: '겸손한 신인이라는 기사가 났다.' },
      { label: '"이 정도는 기본이죠."', effect: { pop: 2, trust: -1, xp: { competitive: 0.4 } }, reply: '자신감 넘치는 인터뷰가 화제가 됐다.' },
      { label: '"다음 경기가 더 중요합니다."', effect: { trust: 1, xp: { composure: 0.4 } }, reply: '감독님이 고개를 끄덕였다.' },
    ],
  };
}
