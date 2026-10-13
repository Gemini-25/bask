// 역할 (M24): 엔진이 작전을 짤 때 쓰는 기준 그대로, 코트에 선 다섯 명이 각자 무슨 일을 맡는지.
// 공 운반 (primary), 아이솔 1옵션 (creation), 픽앤롤·핸드오프 스크리너, 포스트업, 핀다운 슈터, 대기 자리 (spotPref),
// 수비는 상대 위협 순서대로 맞는 수비수를 붙인다 (assignDefense)
import { POS_GROUP, type Player } from '../data/player';

/** 혼자 만들어 내는 공격력 (아이솔레이션 1옵션을 고르는 기준) */
export const creation = (p: Player) => (p.r.ballHandling + p.r.midRange + p.r.three + p.r.layup + p.r.speed) / 5;
/** 공을 운반하는 선수를 고르는 기준 */
export const carryScore = (p: Player) => p.r.ballHandling + p.r.passing;
/** 수비가 먼저 막을 상대를 고르는 기준 (경기 중엔 야투 시도도 더한다) */
export const threat = (p: Player) => p.r.ballHandling + p.r.three + p.r.midRange + p.r.layup;
const isBig = (p: Player) => POS_GROUP[p.pos] === 'B';
/** 핀다운 슈터 (3점 55부터), 포스트업 (55부터), 팝 (3점 60부터), 스트레치 빅 (3점 58부터) */
export const ROLE_MIN = { shooter: 55, post: 55, pop: 60, stretch: 58 };

export type RoleKey = 'ace' | 'handler' | 'roll' | 'pop' | 'post' | 'shooter' | 'slasher' | 'stretch' | 'playmaker' | 'rebounder' | 'stopper' | 'glue';
export const ROLE_LABEL: Record<RoleKey, string> = {
  ace: '에이스',
  handler: '볼 핸들러',
  roll: '롤맨',
  pop: '팝 빅맨',
  post: '포스트 공격',
  shooter: '슈터',
  slasher: '슬래셔',
  stretch: '스트레치 빅',
  playmaker: '플레이메이커',
  rebounder: '리바운더',
  stopper: '수비 전문',
  glue: '살림꾼',
};
/** 코트 위 머리표용 짧은 이름 */
export const ROLE_SHORT: Record<RoleKey, string> = {
  ace: '에이스',
  handler: '핸들러',
  roll: '롤맨',
  pop: '팝',
  post: '포스트',
  shooter: '슈터',
  slasher: '슬래셔',
  stretch: '스트레치',
  playmaker: '패서',
  rebounder: '리바',
  stopper: '수비',
  glue: '살림꾼',
};
export const ROLE_DESC: Record<RoleKey, string> = {
  ace: '막히면 공을 받아 1대1로 해결한다 (아이솔레이션 1옵션)',
  handler: '공을 몰고 넘어와 공격을 시작하고, 픽앤롤에서 공을 쥔다',
  roll: '스크린을 걸고 골밑으로 굴러 들어간다',
  pop: '스크린을 걸고 3점 라인 밖으로 빠져 슛을 노린다',
  post: '골밑에서 등지고 공을 받아 마무리한다',
  shooter: '스크린을 받고 3점 자리로 나와 받자마자 쏜다',
  slasher: '빈틈이 보이면 골밑으로 파고든다',
  stretch: '빅맨이지만 밖에 서서 수비를 끌어낸다',
  playmaker: '패스로 동료의 슛을 만든다',
  rebounder: '골밑에서 리바운드와 풋백을 노린다',
  stopper: '공격보다 수비와 허슬로 기여한다',
  glue: '빈 곳을 메우며 공을 돌린다',
};

export type DefKey = 'stopper' | 'rim' | 'post' | 'perimeter';
export const DEF_LABEL: Record<DefKey, string> = { stopper: '상대 에이스 전담', rim: '림 보호', post: '골밑 수비', perimeter: '외곽 수비' };

export interface Role {
  key: RoleKey;
  /** 공격에서 맡은 일 (엔진 기준) */
  jobs: string[];
  def: DefKey;
  /** 대인방어로 맡는 상대 (상대 다섯이 주어지면) */
  guards?: Player;
}

function argmax<T>(xs: T[], f: (x: T) => number): T | undefined {
  let best: T | undefined;
  let bv = -Infinity;
  for (const x of xs) {
    const v = f(x);
    if (v > bv) {
      bv = v;
      best = x;
    }
  }
  return best;
}

/** 이 선수 혼자 본 성향 (작전에서 따로 맡은 일이 없을 때, 벤치 선수) */
export function archetype(p: Player): RoleKey {
  const r = p.r;
  if (isBig(p)) {
    if (r.three >= ROLE_MIN.stretch) return 'stretch';
    if (r.postUp >= 62 && r.postUp >= r.screen) return 'post';
    if ((r.defReb + r.offReb) / 2 >= 62) return 'rebounder';
    if (r.screen >= 58) return r.three >= ROLE_MIN.pop ? 'pop' : 'roll';
    return (r.block + r.postD) / 2 >= 60 ? 'stopper' : 'rebounder';
  }
  const slash = (r.speed + r.layup + r.dunk) / 3;
  const pass = (r.passing + r.vision) / 2;
  if (POS_GROUP[p.pos] === 'G' && pass >= 66 && pass >= r.three) return 'playmaker';
  if (r.three >= 66 && r.three >= slash) return 'shooter';
  if (slash >= 64) return 'slasher';
  if (pass >= 66) return 'playmaker';
  if (r.three >= 62) return 'shooter';
  if ((r.perimeterD + r.steal + r.hustle) / 3 >= 62) return 'stopper';
  return 'glue';
}

/** 코트 위 다섯 명의 역할. opp를 주면 누가 누구를 막는지도 */
export function lineupRoles(five: Player[], opp?: Player[]): Role[] {
  const handler = argmax(five, carryScore)!;
  const ace = argmax(five, creation)!;
  const screener = argmax(
    five.filter((p) => p !== handler && POS_GROUP[p.pos] !== 'G'),
    (p) => p.r.screen,
  );
  const bigs = five.filter(isBig);
  const post = argmax(bigs.length ? bigs : five, (p) => p.r.postUp);
  const shooter = argmax(
    five.filter((p) => p !== handler && !isBig(p)),
    (p) => p.r.three,
  );
  // 림 보호: 블록과 키가 가장 좋은 빅맨
  const rim = argmax(bigs.length ? bigs : five, (p) => p.r.block + (p.body.heightCm - 200) * 0.6 + p.r.helpD * 0.3);
  const guards = opp ? matchups(five, opp) : new Map<Player, Player>();
  const top = opp ? [...opp].sort((a, b) => threat(b) - threat(a))[0] : undefined;
  return five.map((p) => {
    const jobs: string[] = [];
    if (p === handler) jobs.push('공 운반 · 픽앤롤 볼 핸들러');
    if (p === ace) jobs.push('아이솔레이션 1옵션');
    if (p === screener) jobs.push(`픽앤롤·핸드오프 스크린 (${p.r.three >= ROLE_MIN.pop ? '팝' : '롤'})`);
    const posts = p === post && p.r.postUp >= ROLE_MIN.post;
    if (posts) jobs.push('포스트업');
    const pins = p === shooter && p.r.three >= ROLE_MIN.shooter;
    if (pins) jobs.push('핀다운 슈터');
    if (p !== handler) jobs.push(isBig(p) ? (p.r.three >= ROLE_MIN.stretch ? '외곽에 벌려 선다' : '골밑 대기 (덩커 스팟)') : '3점 라인 대기');
    let key: RoleKey;
    if (p === ace) key = 'ace';
    else if (p === handler) key = 'handler';
    else if (p === screener) key = p.r.three >= ROLE_MIN.pop ? 'pop' : 'roll';
    else if (posts) key = 'post';
    else if (pins) key = 'shooter';
    else key = archetype(p);
    const g = guards.get(p);
    const def: DefKey = g && g === top ? 'stopper' : p === rim ? 'rim' : isBig(p) ? 'post' : 'perimeter';
    return { key, jobs, def, guards: g };
  });
}

/** 대인방어 짝 (엔진 assignDefense와 같은 기준, 경기 전이라 야투 시도는 뺀다) */
export function matchups(ds: Player[], os: Player[]): Map<Player, Player> {
  const out = new Map<Player, Player>();
  const used = new Set<Player>();
  for (const o of [...os].sort((a, b) => threat(b) - threat(a))) {
    let best: Player | null = null;
    let bc = -Infinity;
    for (const d of ds) {
      if (used.has(d)) continue;
      const g = POS_GROUP[d.pos] === POS_GROUP[o.pos] ? 12 : POS_GROUP[d.pos] === 'W' || POS_GROUP[o.pos] === 'W' ? 4 : -10;
      const skill = isBig(o) ? d.r.postD : d.r.perimeterD;
      const c = g + skill * 0.15 - Math.abs(d.body.heightCm - o.body.heightCm) * 0.3;
      if (c > bc) {
        bc = c;
        best = d;
      }
    }
    if (best) {
      out.set(best, o);
      used.add(best);
    }
  }
  return out;
}

/** 한 줄로: '에이스 · 외곽 수비' */
export function roleText(r: Role): string {
  return `${ROLE_LABEL[r.key]} · ${DEF_LABEL[r.def]}`;
}
