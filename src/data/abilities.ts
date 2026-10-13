// 특수능력 (S8, S9): 좋은 능력은 ★1~3으로 진화하고, 나쁜 능력은 조건을 채우면 사라진다.
import type { Player } from './player';

export type AbilityId = 'clutch' | 'ankle' | 'lockdown' | 'rebound' | 'quickRelease' | 'noLook' | 'zone' | 'moodMaker' | 'genius' | 'poster' | 'stepback' | 'fadeaway' | 'euro' | 'contact' | 'floorGeneral' | 'rimProtector' | 'deadeye' | 'workhorse' | 'pickpocket' | 'transition' | 'deepRange' | 'chaseDown' | 'showtime' | 'glass' | 'chicken' | 'ftPhobia' | 'foulProne' | 'tunnel' | 'lazyD' | 'heatChecker';

export interface AbilityDef {
  id: AbilityId;
  label: string;
  desc: string;
  bad?: boolean;
}

export const ABILITIES: AbilityDef[] = [
  { id: 'clutch', label: '클러치 슈터', desc: '4쿼터 막판 접전에서 슛 성공률이 오른다' },
  { id: 'ankle', label: '앵클 브레이커', desc: '돌파할 때 수비를 넘어뜨릴 확률이 오른다' },
  { id: 'lockdown', label: '철벽 수비', desc: '내가 막는 선수의 슛이 더 어려워진다' },
  { id: 'rebound', label: '리바운드 머신', desc: '리바운드 다툼에서 강해진다' },
  { id: 'quickRelease', label: '퀵 릴리즈', desc: '빠른 슛 동작. 수비 견제를 덜 받는다' },
  { id: 'noLook', label: '노룩 패스', desc: '패스를 가로채일 확률이 줄어든다' },
  { id: 'zone', label: '인 더 존', desc: '연속 3번 넣으면 손끝이 뜨거워진다' },
  { id: 'moodMaker', label: '분위기 메이커', desc: '내가 코트에 있으면 팀원 슛이 조금 좋아진다' },
  // M16: 동작 특수능력
  { id: 'genius', label: '천재', desc: '화려한 동작이 크게 늘고, 돌파 기술이 잘 통한다' },
  { id: 'poster', label: '포스터라이저', desc: '블록하러 뜬 수비 위로 찍는 인유어페이스 덩크' },
  { id: 'stepback', label: '스텝백 장인', desc: '스텝백·사이드스텝으로 수비와 거리를 벌린다' },
  { id: 'fadeaway', label: '페이드어웨이 장인', desc: '뒤로 떨어지며 던져 블록을 거의 안 당한다' },
  { id: 'euro', label: '유로스텝 마스터', desc: '유로스텝·스쿱·리버스·더블 클러치로 골밑을 뚫는다' },
  { id: 'contact', label: '컨택트 피니셔', desc: '몸싸움을 이기고 넣는다. 앤드원이 잘 난다' },
  // M18
  { id: 'floorGeneral', label: '야전사령관', desc: '내 패스를 받은 동료의 슛이 더 잘 들어간다' },
  { id: 'rimProtector', label: '림 프로텍터', desc: '골밑을 지키면 상대 슛이 어려워지고 블록이 는다' },
  { id: 'deadeye', label: '데드아이', desc: '수비가 붙어도 점프슛이 흔들리지 않는다' },
  { id: 'workhorse', label: '철인', desc: '경기 중 체력이 천천히 떨어진다' },
  { id: 'pickpocket', label: '소매치기', desc: '드리블·패스를 잘 가로챈다' },
  { id: 'transition', label: '속공 머신', desc: '속공 마무리가 더 잘 된다' },
  // M21
  { id: 'deepRange', label: '딥쓰리', desc: '3점 라인 한참 뒤에서도 쏜다. 멀어져도 성공률이 덜 떨어지고 수비가 더 멀리서부터 붙는다' },
  { id: 'chaseDown', label: '체이스다운', desc: '속공을 뒤에서 쫓아가 백보드에 찍어 누른다' },
  { id: 'showtime', label: '쇼타임', desc: '비하인드 백·노룩 패스를 즐겨 쓴다. 속공 패스가 덜 끊긴다' },
  { id: 'glass', label: '유리몸', desc: '다치기 쉽다', bad: true },
  { id: 'chicken', label: '새가슴', desc: '막판 접전에서 슛과 자유투가 흔들린다', bad: true },
  { id: 'ftPhobia', label: '자유투 공포증', desc: '자유투 성공률이 크게 떨어진다', bad: true },
  { id: 'foulProne', label: '파울 트러블', desc: '파울을 자주 한다', bad: true },
  { id: 'tunnel', label: '터널 시야', desc: '동료가 잘 안 보인다. 패스를 덜 한다', bad: true },
  { id: 'lazyD', label: '게으른 수비', desc: '맡은 선수를 느슨하게 막는다', bad: true },
  { id: 'heatChecker', label: '난사', desc: '두세 개 연속으로 들어가면 무리한 슛을 쏜다', bad: true },
];

export function abilityDef(id: AbilityId) {
  return ABILITIES.find((a) => a.id === id)!;
}

/** 선수의 능력 단계 (없으면 0) */
export function lv(p: Player, id: AbilityId): number {
  return p.abilities?.[id] ?? 0;
}

export function stars(n: number) {
  return '★'.repeat(n);
}

// 경기 엔진이 쓰는 효과 크기 (단계별, 0단계는 효과 없음)
export const FX = {
  clutch: [0, 0.03, 0.05, 0.08],
  ankle: [1, 1.4, 1.7, 2.0],
  lockdown: [0, 0.08, 0.14, 0.2],
  rebound: [0, 0.15, 0.3, 0.45],
  quickRelease: [0, 0.1, 0.18, 0.25],
  noLook: [0, 0.2, 0.35, 0.5],
  zone: [0, 0.04, 0.06, 0.08],
  moodMaker: [0, 0.01, 0.015, 0.02],
  /** 동작 특수능력: 그 동작을 고르는 무게 배율 */
  moveBoost: [1, 2.2, 3.2, 4.4],
  /** 천재: 화려한 동작 무게 배율, 앵클 브레이크 배율 */
  geniusFlash: [1, 1.6, 2.2, 3],
  geniusAnkle: [1, 1.15, 1.3, 1.45],
  /** 컨택트 피니셔: 파울 당해도 넣는 확률 배율 */
  contactAndOne: [1, 1.15, 1.25, 1.35],
  /** M18: 야전사령관 (패스 받은 슛 성공률), 림 프로텍터 (골밑 견제·블록), 데드아이 (점프슛 견제 줄이기),
   *  철인 (체력 소모), 소매치기 (스틸), 속공 머신 (속공 성공률) */
  floorGeneral: [0, 0.025, 0.04, 0.055],
  rimProtector: [0, 0.15, 0.27, 0.4],
  rimDeny: [0, 0.05, 0.09, 0.13],
  deadeye: [0, 0.08, 0.14, 0.2],
  workhorse: [0, 0.12, 0.2, 0.28],
  pickpocket: [0, 0.3, 0.5, 0.7],
  transition: [0, 0.035, 0.06, 0.085],
  /** M21: 딥쓰리 (사거리 +m, 멀어질 때 떨어지는 기울기), 체이스다운 (속공 뒤에서 블록), 쇼타임 (화려한 패스, 속공 패스 끊길 확률 줄이기) */
  deepExtra: [0, 0.4, 0.75, 1.1],
  deepSlope: [1, 0.8, 0.65, 0.5],
  chaseDown: [0, 0.06, 0.1, 0.14],
  /** 쇼타임이 화려한 패스를 고를 확률 */
  showtimeFancy: [0, 0.03, 0.05, 0.08],
  showtime: [0, 0.2, 0.32, 0.45],
};
