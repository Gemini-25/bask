// 공격 세트 (M29): 정해진 자리와 순서로 움직이는 작전. 역할 1 = 볼 핸들러, 2 = 슈터, 3 = 윙, 4 = 파워포워드 (스트레치), 5 = 센터.
// 자리는 공격 방향 기준 [베이스라인에서 거리 u, 가운데에서 옆 v] (v는 고른 쪽 side를 곱한다).
// 스크린: 스크리너가 자리에 서 있고, 받는 선수가 스크리너 어깨를 스치듯 지나간다 → 따라오던 수비가 몸에 걸린다
export type SetId = 'horns' | 'flex' | 'spain' | 'floppy' | 'zipper' | 'elevator' | 'highlow';
export type Role = 1 | 2 | 3 | 4 | 5;

export interface SetStep {
  /** 이 단계 최대 길이 (초) */
  dur: number;
  /** 자리에 다 가면 넘어갈 수 있는 최소 시간 (초) */
  min: number;
  /** 자리 [u, v] */
  at: Partial<Record<Role, [number, number]>>;
  /** 스크린 [스크리너, 받는 선수]: 받는 선수가 스크리너를 스치듯 지나간다 */
  screen?: [Role, Role][];
  /** 이 단계를 시작하며 공을 이 선수에게 */
  ball?: Role;
  /** 이 단계에서 먼저 찾는 선수 (패스 가산점) */
  look?: Role[];
  /** 손을 들고 컷한다 (골밑으로) */
  cut?: Role[];
  /** 마지막 단계 뒤 이어지는 작전 */
  then?: { k: 'pnr'; handler: Role; scr: Role; pop?: boolean; spain?: Role } | { k: 'dho'; big: Role; guard: Role } | { k: 'post'; star: Role };
}

export interface SetDef {
  id: SetId;
  label: string;
  desc: string;
  steps: SetStep[];
}

// 자주 쓰는 자리
const TOP: [number, number] = [8.4, 0];
const CORNER = (s: number): [number, number] => [1.2, 6.6 * s];
const WING = (s: number): [number, number] => [5.8, 5.4 * s];
const ELBOW = (s: number): [number, number] => [5.9, 2.4 * s];
const BLOCK = (s: number): [number, number] => [1.9, 2.0 * s];

export const SETS: SetDef[] = [
  {
    id: 'horns',
    label: '호른스',
    desc: '빅맨 둘이 양쪽 엘보에, 슈터 둘은 코너. 한 빅맨이 스크린을 걸고 굴러 들어가고 다른 빅맨은 밖으로 빠진다',
    steps: [
      { dur: 2.2, min: 1.2, at: { 1: TOP, 4: ELBOW(-1), 5: ELBOW(1), 2: CORNER(-1), 3: CORNER(1) }, ball: 1 },
      { dur: 0.6, min: 0.3, at: { 4: [7.6, -4.4] }, then: { k: 'pnr', handler: 1, scr: 5 } },
    ],
  },
  {
    id: 'flex',
    label: '플렉스',
    desc: '베이스라인 스크린으로 코너의 윙이 반대쪽 골밑으로 컷, 이어서 스크린을 건 선수가 다운스크린을 받고 엘보로',
    steps: [
      { dur: 2.0, min: 1.2, at: { 1: WING(1), 2: TOP, 4: BLOCK(-1), 3: CORNER(-1), 5: ELBOW(-1) }, ball: 1 },
      { dur: 1.8, min: 1.0, at: { 3: BLOCK(1), 4: BLOCK(-1) }, screen: [[4, 3]], ball: 2, look: [3], cut: [3] },
      { dur: 1.8, min: 0.9, at: { 4: ELBOW(-1), 5: [3.2, -2.2] }, screen: [[5, 4]], look: [4, 3] },
    ],
  },
  {
    id: 'spain',
    label: '스페인 픽앤롤',
    desc: '탑에서 픽앤롤, 굴러 들어가는 빅맨의 수비에게 슈터가 뒤에서 스크린을 걸고 3점 라인으로 빠진다',
    steps: [
      { dur: 1.8, min: 1.0, at: { 1: TOP, 5: [6.6, 0.8], 2: [5.0, -0.4], 3: CORNER(1), 4: CORNER(-1) }, ball: 1 },
      { dur: 0.5, min: 0.2, at: {}, then: { k: 'pnr', handler: 1, scr: 5, spain: 2 } },
    ],
  },
  {
    id: 'floppy',
    label: '플로피',
    desc: '슈터가 골밑에서 출발해 양쪽 블록의 빅맨 스크린 중 하나를 골라 윙으로 나와 받아서 쏜다',
    steps: [
      { dur: 2.0, min: 1.2, at: { 1: TOP, 2: [1.2, 0], 4: BLOCK(-1), 5: BLOCK(1), 3: WING(-1) }, ball: 1 },
      { dur: 1.8, min: 0.9, at: { 2: [6.4, 5.0], 5: [2.2, 2.6] }, screen: [[5, 2]], look: [2] },
    ],
  },
  {
    id: 'zipper',
    label: '지퍼',
    desc: '블록에 있던 슈터가 엘보 스크린을 받고 탑으로 올라와 공을 받고, 바로 빅맨과 픽앤롤',
    steps: [
      { dur: 1.6, min: 0.9, at: { 1: WING(1), 2: BLOCK(-1), 5: ELBOW(-1), 3: CORNER(1), 4: CORNER(-1) }, ball: 1 },
      { dur: 1.6, min: 0.8, at: { 2: [8.4, -0.6], 1: CORNER(1), 3: WING(1) }, screen: [[5, 2]], look: [2] },
      { dur: 0.5, min: 0.2, at: {}, ball: 2, then: { k: 'pnr', handler: 2, scr: 5 } },
    ],
  },
  {
    id: 'elevator',
    label: '엘리베이터',
    desc: '빅맨 둘이 탑에 나란히 서 있다가 슈터가 사이로 빠져나가면 문을 닫듯 붙는다. 따라오던 수비는 막히고 슈터는 탑에서 3점',
    steps: [
      { dur: 2.0, min: 1.2, at: { 1: WING(1), 4: [6.6, -0.75], 5: [6.6, 0.75], 2: [2.6, 0], 3: CORNER(-1) }, ball: 1 },
      { dur: 1.6, min: 0.8, at: { 2: [8.6, 0], 4: [6.6, -0.32], 5: [6.6, 0.32] }, screen: [[4, 2], [5, 2]], look: [2] },
    ],
  },
  {
    id: 'highlow',
    label: '하이로우',
    desc: '하이포스트 (자유투 라인)의 빅맨이 공을 받고, 골밑의 빅맨이 수비를 등지고 자리를 잡으면 넣어 준다',
    steps: [
      { dur: 1.8, min: 1.0, at: { 1: WING(1), 4: [5.9, 0], 5: BLOCK(1), 2: CORNER(-1), 3: WING(-1) }, ball: 1 },
      { dur: 2.2, min: 1.0, at: { 5: [1.7, 1.4] }, ball: 4, look: [5] },
    ],
  },
];

export const SET_LABEL: Record<SetId, string> = Object.fromEntries(SETS.map((s) => [s.id, s.label])) as Record<SetId, string>;

export function setDef(id: SetId): SetDef {
  return SETS.find((s) => s.id === id)!;
}
