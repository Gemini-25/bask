// 동작 키프레임 (M21): 동작마다 관절 각도와 공 위치를 시간 순서로 적는다.
// 각도는 도(°): 팔은 0 = 아래, 90 = 앞, 180 = 위, 그보다 크면 머리 뒤. 팔꿈치·무릎은 윗마디에 더하는 각.
// 다리도 0 = 아래, 90 = 앞 (허벅지가 수평). 무릎은 음수로 굽힌다.
// 정면 모습에선 w(옆으로 벌린 정도, 음수면 몸 가운데로)로 팔을 옆으로 편다.
import { ACT } from '../sim/types';

export type FaceMode = 'side' | 'front' | 'back' | 'away' | 'spin';
export type Eyes = 'open' | 'dizzy' | 'happy' | 'focus' | 'sad' | 'angry';
/** 공: 앞손, 뒷손, 두 손 사이, 또는 몸 기준 자리 [앞으로 px, 바닥에서 높이 px, 옆 px(+가 앞손 쪽), 몸 뒤] */
export type BallAt = 'F' | 'B' | 'FB' | readonly [number, number, number?, boolean?];
type J = readonly [number, number];

export interface Pose {
  aF: J;
  aB: J;
  lF: J;
  lB: J;
  wF: number;
  wB: number;
  /** 아래팔만 따로 벌리는 정도 (없으면 wF·wB) */
  wFe?: number;
  wBe?: number;
  /** 정면 모습에서 두 발 사이 (px) */
  ws: number;
  lean: number;
  crouch: number;
  dx: number;
  dy: number;
  rot: number;
  ball?: BallAt;
  eyes: Eyes;
  face?: FaceMode;
  mouth?: boolean;
}

type Key = { t: number } & Partial<Pose>;

export interface Anim {
  keys: Key[];
  /** 모든 키에 깔리는 값 */
  base?: Partial<Pose>;
  /** 되풀이 (1초에 몇 번). 없으면 동작 시작부터 끝까지 한 번 */
  loop?: number;
  /** 공이 손을 떠나는 지점 (0~1). 기록에서 실제로 떠난 때에 맞춰 늘이고 줄인다 */
  rel?: number;
  /** 잔상 */
  trail?: boolean;
  /** 다리는 걷기·달리기 그대로 (팔과 공만 이 동작) */
  legsFree?: boolean;
  /** 움직일 때 발걸음에 맞춰 되풀이 (한 보폭 주기에 몇 번, M25: 드리블이 발에 맞게 튄다) */
  stepSync?: number;
  /** 다리는 수비 사이드 스텝 (legsFree와 같이) */
  shuffle?: boolean;
}

const HANDS_CHEST = { aF: [25, 105], aB: [20, 108], wF: -0.7, wB: -0.7, ball: 'FB' } as const;
const CROUCH_LEGS = { lF: [48, -95], lB: [42, -90] } as const;
const TUCK = { lF: [62, -100], lB: [-18, -78] } as const;
const SET = { aF: [150, 55], aB: [138, 62], wF: -0.4, wB: -0.5, ball: 'F' } as const;
const RELEASE = { aF: [168, 8], aB: [140, 45], wF: -0.1, wB: -0.4 } as const;
const GATHER = { aF: [22, 92], aB: [16, 96], wF: -0.6, wB: -0.6, ball: 'FB', lF: [42, -28], lB: [-30, -58], lean: 14 } as const;
const TAKEOFF = { lF: [82, -96], lB: [-16, -14] } as const;
const SLAM = (a: number) => ({ aF: [a, 6] as J, lean: 12, eyes: 'angry' as Eyes });

const A = (keys: Key[], o: Omit<Anim, 'keys'> = {}): Anim => ({ keys, ...o });

/** 점프슛 공통: 웅크렸다가 공을 이마 위로, 꼭대기에서 놓는다 */
function jumper(extra: { lean?: number[]; legs?: Partial<Pose>; dip?: number } = {}): Anim {
  const ln = extra.lean ?? [6, 2, 0, -2, 0];
  return A(
    [
      { t: 0, ...HANDS_CHEST, ...CROUCH_LEGS, lean: ln[0], eyes: 'focus', crouch: extra.dip ?? 0 },
      { t: 0.28, aF: [118, 72], aB: [104, 82], wF: -0.6, wB: -0.6, ball: 'FB', lF: [22, -45], lB: [16, -38], lean: ln[1], eyes: 'focus' },
      { t: 0.5, ...SET, ...(extra.legs ?? { lF: [10, -18], lB: [0, -14] }), lean: ln[2], eyes: 'focus' },
      { t: 0.62, ...RELEASE, ...(extra.legs ?? { lF: [6, -16], lB: [-4, -20] }), lean: ln[3] },
      { t: 1, aF: [158, 20], aB: [70, 30], lF: [6, -10], lB: [0, -6], lean: ln[4] },
    ],
    { rel: 0.55 },
  );
}

/** 레이업 공통: 공을 모아 한 발로 뛰고, 팔을 뻗어 올려놓는다 */
function layup(arm: J[], o: { lean?: number; rel?: number; trail?: boolean } = {}): Anim {
  return A(
    [
      { t: 0, ...GATHER },
      { t: 0.3, ...TAKEOFF, aF: arm[0], aB: [92, 58], wF: 0, wB: 0.2, ball: 'F', lean: o.lean ?? 6, eyes: 'focus' },
      { t: o.rel ?? 0.55, lF: [86, -100], lB: [-10, -10], aF: arm[1], aB: [118, 40], ball: 'F', lean: 0, eyes: 'focus' },
      { t: 0.78, lF: [60, -82], lB: [-6, -14], aF: arm[2] ?? arm[1], aB: [100, 40] },
      { t: 1, lF: [20, -30], lB: [0, -10], aF: [150, 15], aB: [60, 30] },
    ],
    { rel: o.rel ?? 0.55, trail: o.trail },
  );
}

/** 덩크 공통: 모으고, 뛰고, (가운데 동작), 꼭대기에서 꽂는다 */
function dunk(mid: Key[], o: { slam?: number; legs?: Partial<Pose>; trail?: boolean; both?: boolean } = {}): Anim {
  const legs = o.legs ?? TUCK;
  return A(
    [
      { t: 0, ...GATHER, ...CROUCH_LEGS, lean: 12 },
      { t: 0.2, ...TAKEOFF, aF: [112, 62], aB: [90, 50], wF: 0, wB: 0.2, ball: o.both ? 'FB' : 'F', lean: 8, eyes: 'focus' },
      ...mid.map((k) => ({ ...legs, ...k })),
      { t: 0.9, ...legs, ...SLAM(o.slam ?? 132), aB: o.both ? [o.slam ?? 132, 6] : [70, 30], ball: o.both ? 'FB' : 'F' },
      { t: 1, ...legs, aF: [122, 10], aB: o.both ? [120, 10] : [60, 30], lean: 10, eyes: 'angry' },
    ],
    { rel: 0.9, trail: o.trail },
  );
}

/**
 * 한 손에서 다른 손으로 넘기는 드리블 (정면에서 본다, M25): 공을 넘기며 몸을 반대쪽으로 크게 옮기고,
 * 새 방향으로 발을 크게 내디뎌 치고 나간다. twice면 한 번 더 되돌린다 (더블 크로스오버)
 */
function cross(o: { wide?: number; legs?: Partial<Pose>; via?: BallAt; dx?: number; twice?: boolean; trail?: boolean }): Anim {
  const w = o.wide ?? 0.7;
  const dx = o.dx ?? 3;
  const set = { ws: 5, lF: [30, -62] as J, lB: [-8, -30] as J };
  const plant = { ws: 9, lF: [-6, -26] as J, lB: [44, -76] as J, ...(o.legs ?? {}) };
  const mid = { ws: 3, lF: [20, -52] as J, lB: [-20, -52] as J };
  const keys: Key[] = o.twice
    ? [
        { t: 0, aF: [38, 30], wF: w, aB: [30, 38], wB: 0.2, ball: 'F', dx, ...set },
        { t: 0.18, aF: [22, 18], wF: 0.1, aB: [22, 18], wB: 0.1, ball: o.via ?? [3, 0, 0], dx: 0, ...mid },
        { t: 0.36, aF: [30, 38], wF: 0.2, aB: [38, 30], wB: w, ball: 'B', dx: -dx, ...set, lF: [-8, -30], lB: [30, -62] },
        { t: 0.54, aF: [22, 18], wF: 0.1, aB: [22, 18], wB: 0.1, ball: o.via ?? [3, 0, 0], dx: 0, ...mid },
        { t: 0.72, aF: [38, 30], wF: w, aB: [30, 38], wB: 0.2, ball: 'F', dx: dx * 1.4, lean: 18, ...plant, lF: plant.lB, lB: plant.lF },
        { t: 1, aF: [40, 34], wF: w, aB: [30, 38], wB: 0.2, ball: 'F', dx: dx * 1.2, lean: 20, ws: 6 },
      ]
    : [
        { t: 0, aF: [38, 30], wF: w, aB: [30, 38], wB: 0.2, ball: 'F', dx, ...set },
        { t: 0.32, aF: [22, 18], wF: 0.1, aB: [22, 18], wB: 0.1, ball: o.via ?? [3, 0, 0], dx: 0, ...mid },
        { t: 0.58, aF: [30, 38], wF: 0.2, aB: [38, 30], wB: w, ball: 'B', dx: -dx * 1.4, lean: 18, ...plant },
        { t: 1, aF: [30, 38], wF: 0.2, aB: [40, 34], wB: w, ball: 'B', dx: -dx * 1.2, lean: 20, ws: 6 },
      ];
  return A(keys, { base: { face: 'front', crouch: 2, lean: 12, ws: 4, ...CROUCH_LEGS, eyes: 'focus' }, trail: o.trail });
}

const STANCE_BASE = { crouch: 2, lean: 14, aF: [75, 25], aB: [65, 30], wF: 1.1, wB: 1.0, eyes: 'focus' } as Partial<Pose>;

export const ANIMS: Record<number, Anim> = {
  [ACT.IDLE]: A(
    [
      { t: 0, aF: [10, 18], aB: [-8, 14] },
      { t: 0.5, aF: [12, 24], aB: [-6, 18], crouch: 1 },
      { t: 1, aF: [10, 18], aB: [-8, 14] },
    ],
    { loop: 0.45, legsFree: true },
  ),
  [ACT.DRIBBLE]: A(
    [
      { t: 0, aF: [46, 36], aB: [62, 40], wB: 0.9, ball: 'F' },
      { t: 0.5, aF: [30, 14], aB: [62, 40], wB: 0.9, ball: [7, 0, 4] },
      { t: 1, aF: [46, 36], aB: [62, 40], wB: 0.9, ball: 'F' },
    ],
    { loop: 1.8, stepSync: 2, legsFree: true, base: { crouch: 2, lean: 12, eyes: 'focus' } },
  ),
  // 평소 드리블 (M25): 달릴 땐 앞으로 크게 밀고, 수비 앞에선 낮게 가리고, 서서 간을 볼 땐 다리 사이로
  [ACT.SPEEDDRIB]: A(
    [
      { t: 0, aF: [70, 20], aB: [-20, 40], ball: 'F', eyes: 'focus' },
      { t: 0.5, aF: [56, 10], aB: [-20, 40], ball: [12, 0, 3] },
      { t: 1, aF: [70, 20], aB: [-20, 40], ball: 'F' },
    ],
    { loop: 1.4, stepSync: 1, legsFree: true, base: { lean: 14, eyes: 'focus' } },
  ),
  [ACT.POCKET]: A(
    [
      { t: 0, aF: [36, 30], wF: 0.6, aB: [96, 60], wB: 0.4, ball: 'F' },
      { t: 0.5, aF: [20, 14], wF: 0.6, aB: [96, 60], wB: 0.4, ball: [2, 0, 6] },
      { t: 1, aF: [36, 30], wF: 0.6, aB: [96, 60], wB: 0.4, ball: 'F' },
    ],
    { loop: 3, stepSync: 2, legsFree: true, base: { crouch: 3, lean: 18, eyes: 'focus' } },
  ),
  [ACT.RHYTHM]: A(
    [
      { t: 0, aF: [36, 30], wF: 0.7, aB: [30, 38], wB: 0.2, ball: 'F', dx: 1 },
      { t: 0.25, aF: [16, 20], wF: 0.1, aB: [16, 20], wB: 0.1, ball: [0, 2, 0], dx: 0 },
      { t: 0.5, aF: [30, 38], wF: 0.2, aB: [36, 30], wB: 0.7, ball: 'B', dx: -1 },
      { t: 0.75, aF: [16, 20], wF: 0.1, aB: [16, 20], wB: 0.1, ball: [0, 2, 0], dx: 0 },
      { t: 1, aF: [36, 30], wF: 0.7, aB: [30, 38], wB: 0.2, ball: 'F', dx: 1 },
    ],
    { loop: 1.3, base: { face: 'front', crouch: 2, lean: 10, ws: 7, lF: [36, -60], lB: [-30, -50], eyes: 'focus' } },
  ),
  [ACT.HOLD]: A([{ t: 0, ...HANDS_CHEST, lF: [26, -46], lB: [-16, -36], crouch: 1, lean: 8, eyes: 'focus' }, { t: 1, ...HANDS_CHEST, lF: [26, -46], lB: [-16, -36], crouch: 1, lean: 9, eyes: 'focus' }], { loop: 0.5 }),
  [ACT.POST]: A(
    [
      { t: 0, aF: [12, 70], aB: [-52, 40], ball: 'F' },
      { t: 0.5, aF: [20, 30], aB: [-52, 40], ball: [6, 0, 4] },
      { t: 1, aF: [12, 70], aB: [-52, 40], ball: 'F' },
    ],
    { loop: 1.4, base: { face: 'away', lF: [36, -62], lB: [-26, -52], lean: -12, crouch: 2, eyes: 'focus' } },
  ),
  [ACT.FT]: A(
    [
      { t: 0, aF: [42, 40], aB: [20, 30], ball: 'F' },
      { t: 0.5, aF: [30, 18], aB: [20, 30], ball: [6, 0, 3] },
      { t: 1, aF: [42, 40], aB: [20, 30], ball: 'F' },
    ],
    { loop: 1.2, base: { lF: [12, -20], lB: [-6, -16], lean: 6, eyes: 'focus' } },
  ),
  // ───────────── 점프슛 ─────────────
  [ACT.SHOOT]: jumper(),
  [ACT.DEEP]: jumper({ lean: [14, 6, -4, -6, 0], legs: { lF: [38, -26], lB: [-12, -20] }, dip: 1 }),
  [ACT.STEPBACK]: A(
    [
      { t: 0, aF: [42, 30], aB: [60, 40], ball: 'F', lF: [40, -30], lB: [-30, -52], lean: 18 },
      { t: 0.22, ...HANDS_CHEST, lF: [12, -62], lB: [-22, -72], lean: -6 },
      { t: 0.38, ...HANDS_CHEST, ...CROUCH_LEGS, lean: 4, eyes: 'focus' },
      { t: 0.56, ...SET, lF: [10, -18], lB: [0, -14], lean: -2, eyes: 'focus' },
      { t: 0.68, ...RELEASE, lF: [6, -16], lB: [-4, -20], lean: -4 },
      { t: 1, aF: [158, 20], aB: [70, 30], lF: [6, -10], lB: [0, -6], lean: 0 },
    ],
    { rel: 0.6 },
  ),
  [ACT.SIDESTEP]: A(
    [
      { t: 0, aF: [42, 30], aB: [60, 40], ball: 'F', lF: [36, -30], lB: [-30, -52], lean: 14 },
      { t: 0.25, ...HANDS_CHEST, lF: [36, -18], lB: [-36, -18], ws: 6, lean: 4 },
      { t: 0.4, ...HANDS_CHEST, ...CROUCH_LEGS, ws: 4, lean: 4, eyes: 'focus' },
      { t: 0.58, ...SET, lF: [10, -18], lB: [0, -14], eyes: 'focus' },
      { t: 0.7, ...RELEASE, lF: [6, -16], lB: [-4, -20] },
      { t: 1, aF: [158, 20], aB: [70, 30], lF: [6, -10], lB: [0, -6] },
    ],
    { rel: 0.62 },
  ),
  [ACT.FADE]: A(
    [
      { t: 0, ...HANDS_CHEST, ...CROUCH_LEGS, lean: 4, eyes: 'focus' },
      { t: 0.28, aF: [120, 70], aB: [104, 80], wF: -0.6, wB: -0.6, ball: 'FB', lF: [36, -60], lB: [0, -30], lean: -12 },
      { t: 0.5, ...SET, lF: [52, -62], lB: [-6, -20], lean: -24, eyes: 'focus' },
      { t: 0.66, ...RELEASE, lF: [56, -60], lB: [-8, -22], lean: -28 },
      { t: 1, aF: [150, 20], aB: [60, 30], lF: [20, -30], lB: [-10, -10], lean: -14 },
    ],
    { rel: 0.55 },
  ),
  [ACT.TURNFADE]: A(
    [
      { t: 0, face: 'away', aF: [14, 70], aB: [-50, 40], ball: 'F', lF: [36, -62], lB: [-26, -52], lean: -10, crouch: 2 },
      { t: 0.24, face: 'away', ...HANDS_CHEST, lF: [40, -80], lB: [-20, -60], lean: -6, crouch: 2 },
      { t: 0.32, face: 'front', ...HANDS_CHEST, ...CROUCH_LEGS },
      { t: 0.42, face: 'side', aF: [126, 66], aB: [110, 78], wF: -0.6, wB: -0.6, ball: 'FB', lF: [36, -60], lB: [0, -30], lean: -14 },
      { t: 0.6, ...SET, lF: [52, -62], lB: [-6, -20], lean: -26, eyes: 'focus' },
      { t: 0.74, ...RELEASE, lF: [56, -60], lB: [-8, -22], lean: -28 },
      { t: 1, aF: [150, 20], aB: [60, 30], lF: [20, -30], lB: [-10, -10], lean: -14 },
    ],
    { rel: 0.64 },
  ),
  [ACT.ONELEG]: A(
    [
      { t: 0, ...HANDS_CHEST, ...CROUCH_LEGS, lean: 4, eyes: 'focus' },
      { t: 0.3, aF: [126, 66], aB: [110, 78], wF: -0.6, wB: -0.6, ball: 'FB', lF: [86, -118], lB: [0, -6], lean: -10 },
      { t: 0.5, ...SET, lF: [92, -122], lB: [-2, -4], lean: -20, eyes: 'focus' },
      { t: 0.66, ...RELEASE, lF: [94, -124], lB: [-4, -4], lean: -24 },
      { t: 0.86, aF: [160, 14], aB: [80, 30], lF: [88, -120], lB: [-4, -4], lean: -22 },
      { t: 1, aF: [150, 20], aB: [60, 30], lF: [30, -40], lB: [-6, -8], lean: -10 },
    ],
    { rel: 0.55 },
  ),
  [ACT.CONTACT]: A(
    [
      { t: 0, ...HANDS_CHEST, aB: [72, 28], wB: 0.6, lF: [46, -50], lB: [-26, -42], lean: 26, eyes: 'angry' },
      { t: 0.28, ...HANDS_CHEST, aB: [80, 20], wB: 0.6, lF: [40, -70], lB: [-14, -30], lean: 20, eyes: 'angry' },
      { t: 0.5, ...SET, aB: [100, 20], lF: [30, -50], lB: [-8, -20], lean: 10 },
      { t: 0.64, ...RELEASE, lF: [20, -40], lB: [-6, -20], lean: 8 },
      { t: 1, aF: [150, 20], aB: [60, 30], lF: [10, -20], lB: [0, -8], lean: 6 },
    ],
    { rel: 0.55 },
  ),
  // 훅슛: 몸을 옆으로 돌리고 (정면에서 보인다) 팔을 크게 돌려 머리 위로
  [ACT.HOOK]: A(
    [
      { t: 0, ...HANDS_CHEST, lF: [30, -50], lB: [-10, -30], crouch: 1, eyes: 'focus' },
      { t: 0.24, aF: [82, 4], wF: 1.3, aB: [70, 40], wB: 0.9, ball: 'F', lF: [72, -92], lB: [0, -10], eyes: 'focus' },
      { t: 0.45, aF: [176, 0], wF: 0.3, aB: [74, 40], wB: 0.9, ball: 'F', lF: [76, -96], lB: [0, -8] },
      { t: 0.62, aF: [198, 10], wF: -0.2, aB: [70, 40], wB: 0.9, lF: [60, -80], lB: [0, -8] },
      { t: 1, aF: [120, 20], wF: 0.3, aB: [30, 20], wB: 0.4, lF: [10, -20], lB: [0, -6] },
    ],
    { rel: 0.45, base: { face: 'front' } },
  ),
  [ACT.SKYHOOK]: A(
    [
      { t: 0, ...HANDS_CHEST, lF: [26, -40], lB: [-10, -26], crouch: 1, eyes: 'focus' },
      { t: 0.24, aF: [86, 0], wF: 1.4, aB: [80, 30], wB: 1.0, ball: 'F', lF: [66, -86], lB: [0, -6], eyes: 'focus' },
      { t: 0.45, aF: [178, 0], wF: 0.2, aB: [84, 30], wB: 1.0, ball: 'F', lF: [70, -90], lB: [0, -4] },
      { t: 0.62, aF: [196, 4], wF: -0.1, aB: [84, 30], wB: 1.0, lF: [60, -80], lB: [0, -4] },
      { t: 1, aF: [130, 10], wF: 0.3, aB: [30, 20], wB: 0.4, lF: [10, -20], lB: [0, -6] },
    ],
    { rel: 0.45, base: { face: 'front' } },
  ),
  // 플로터·티어드롭: 한 발로 뛰어 한 손으로 높이 띄운다
  [ACT.FLOAT]: A(
    [
      { t: 0, ...HANDS_CHEST, lF: [40, -30], lB: [-30, -52], lean: 16 },
      { t: 0.25, ...TAKEOFF, aF: [118, 52], aB: [80, 30], wF: 0, wB: 0.4, ball: 'F', lean: 6, eyes: 'focus' },
      { t: 0.45, lF: [84, -98], lB: [-12, -12], aF: [156, 16], aB: [86, 30], ball: 'F', lean: 2, eyes: 'focus' },
      { t: 0.7, lF: [60, -80], lB: [-8, -12], aF: [162, 6], aB: [80, 30] },
      { t: 1, lF: [20, -30], lB: [0, -10], aF: [130, 20], aB: [50, 30] },
    ],
    { rel: 0.45 },
  ),
  // ───────────── 레이업 ─────────────
  [ACT.LAYUP]: layup([
    [112, 58],
    [166, 4],
    [170, 0],
  ]),
  [ACT.FINGER]: layup([
    [72, 40],
    [130, 22],
    [140, 10],
  ]),
  [ACT.SCOOP]: A(
    [
      { t: 0, ...GATHER },
      { t: 0.3, lF: [74, -40], lB: [-42, -30], aF: [28, 18], aB: [70, 40], wB: 0.4, ball: 'F', lean: 26, eyes: 'focus' },
      { t: 0.55, lF: [84, -90], lB: [-14, -14], aF: [100, 0], aB: [80, 40], ball: 'F', lean: 14, eyes: 'focus' },
      { t: 0.78, lF: [60, -80], lB: [-6, -14], aF: [126, 0], aB: [80, 40], lean: 8 },
      { t: 1, lF: [20, -30], lB: [0, -10], aF: [110, 10], aB: [50, 30], lean: 6 },
    ],
    { rel: 0.55, trail: true },
  ),
  // 리버스 레이업: 림을 등지고 머리 뒤로 올려놓는다
  [ACT.REVLAY]: A(
    [
      { t: 0, ...GATHER },
      { t: 0.3, ...TAKEOFF, aF: [112, 58], aB: [92, 58], ball: 'F', lean: 4, eyes: 'focus' },
      { t: 0.4, face: 'away', ...TAKEOFF, aF: [190, 20], aB: [120, 40], ball: 'F', lean: -4 },
      { t: 0.56, face: 'away', lF: [80, -96], lB: [-10, -10], aF: [214, 4], aB: [120, 40], ball: 'F', lean: -10 },
      { t: 0.8, face: 'away', lF: [60, -82], lB: [-6, -14], aF: [205, 6], aB: [100, 40], lean: -6 },
      { t: 1, face: 'away', lF: [20, -30], lB: [0, -10], aF: [170, 10], aB: [60, 30] },
    ],
    { rel: 0.56, base: { face: 'side' } },
  ),
  // 유로스텝: 한 발, 반대로 한 발 (공은 허리 옆에 감싸고), 그리고 뛴다
  [ACT.EURO]: A(
    [
      { t: 0, aF: [12, 70], aB: [8, 78], wF: 0.6, wB: -0.4, ball: 'FB', lF: [46, -18], lB: [-36, -46], lean: 14, dx: 1 },
      { t: 0.3, aF: [8, 78], aB: [12, 70], wF: -0.4, wB: 0.6, ball: 'FB', lF: [-32, -50], lB: [48, -18], lean: -4, dx: -1 },
      { t: 0.5, ...TAKEOFF, aF: [118, 52], aB: [92, 58], ball: 'F', lean: 6, eyes: 'focus' },
      { t: 0.66, lF: [86, -100], lB: [-10, -10], aF: [166, 4], aB: [118, 40], ball: 'F', eyes: 'focus' },
      { t: 0.84, lF: [60, -82], lB: [-6, -14], aF: [170, 0], aB: [100, 40] },
      { t: 1, lF: [20, -30], lB: [0, -10], aF: [150, 15], aB: [60, 30] },
    ],
    { rel: 0.66, trail: true },
  ),
  // 파워 레이업: 두 발로 멈춰 서서 두 손으로
  [ACT.POWERLAY]: A(
    [
      { t: 0, ...HANDS_CHEST, lF: [52, -102], lB: [46, -98], crouch: 2, lean: 12, eyes: 'angry' },
      { t: 0.3, aF: [140, 40], aB: [140, 42], wF: -0.4, wB: -0.4, ball: 'FB', lF: [16, -32], lB: [10, -30], lean: 4, eyes: 'angry' },
      { t: 0.55, aF: [166, 10], aB: [162, 14], wF: -0.3, wB: -0.3, ball: 'FB', lF: [12, -26], lB: [8, -24], lean: 2 },
      { t: 1, aF: [140, 20], aB: [136, 20], lF: [20, -40], lB: [16, -36], lean: 6 },
    ],
    { rel: 0.55 },
  ),
  // 더블 클러치: 공중에서 공을 내렸다가 다시 올린다
  [ACT.CLUTCH]: A(
    [
      { t: 0, ...GATHER },
      { t: 0.2, ...TAKEOFF, aF: [150, 30], aB: [110, 40], ball: 'F', lean: 4, eyes: 'focus' },
      { t: 0.4, lF: [80, -96], lB: [-12, -12], aF: [42, 30], aB: [60, 40], ball: 'F', lean: -8 },
      { t: 0.55, lF: [82, -98], lB: [-12, -12], aF: [96, 40], aB: [80, 40], ball: 'F', lean: -4 },
      { t: 0.7, lF: [80, -96], lB: [-10, -10], aF: [166, 4], aB: [110, 40], ball: 'F', lean: 2 },
      { t: 1, lF: [20, -30], lB: [0, -10], aF: [150, 15], aB: [60, 30] },
    ],
    { rel: 0.7, trail: true },
  ),
  // ───────────── 덩크 ─────────────
  [ACT.DUNK]: dunk([{ t: 0.6, aF: [174, 4], aB: [80, 40], ball: 'F', lean: 4, eyes: 'focus' }]),
  [ACT.DUNK2]: dunk(
    [
      { t: 0.36, aF: [164, 22], aB: [160, 26], wF: -0.3, wB: -0.3, ball: 'FB', eyes: 'angry' },
      { t: 0.7, aF: [188, 16], aB: [184, 16], wF: -0.2, wB: -0.2, ball: 'FB', lean: -6, eyes: 'angry' },
    ],
    { both: true, legs: { lF: [30, -86], lB: [22, -80] } },
  ),
  [ACT.CDUNK]: dunk(
    [
      { t: 0.36, aF: [150, 40], aB: [146, 40], wF: -0.3, wB: -0.3, ball: 'FB', lean: 20, eyes: 'angry' },
      { t: 0.7, aF: [178, 10], aB: [174, 10], wF: -0.2, wB: -0.2, ball: 'FB', lean: 14, eyes: 'angry' },
    ],
    { both: true, legs: { lF: [70, -90], lB: [-14, -24] } },
  ),
  [ACT.TOMAHAWK]: dunk([
    { t: 0.4, aF: [200, 56], aB: [108, 22], ball: 'F', lean: -10, eyes: 'angry' },
    { t: 0.76, aF: [224, 40], aB: [112, 20], ball: 'F', lean: -16, lF: [58, -112], lB: [-26, -72], eyes: 'angry' },
  ]),
  [ACT.REVERSE]: dunk([
    { t: 0.34, face: 'side', aF: [160, 20], aB: [150, 26], ball: 'FB' },
    { t: 0.44, face: 'away', aF: [186, 10], aB: [182, 10], ball: 'FB', lean: -4 },
    { t: 0.76, face: 'away', aF: [206, 10], aB: [202, 10], ball: 'FB', lean: -10 },
    { t: 0.89, face: 'away', aF: [222, 6], aB: [218, 6], ball: 'FB', lean: -12 },
  ], { both: true }),
  [ACT.WINDMILL]: dunk(
    [
      { t: 0.3, aF: [96, 0], aB: [80, 30], ball: 'F', eyes: 'focus' },
      { t: 0.44, aF: [8, 0], aB: [80, 30], ball: 'F' },
      { t: 0.58, aF: [-84, 0], aB: [80, 30], ball: 'F' },
      { t: 0.72, aF: [-172, 0], aB: [80, 30], ball: 'F' },
      { t: 0.82, aF: [-204, 4], aB: [80, 30], ball: 'F', eyes: 'angry' },
    ],
    { slam: -228, trail: true },
  ),
  [ACT.D360]: dunk(
    [
      { t: 0.24, face: 'spin', rot: 0, ...HANDS_CHEST },
      { t: 0.72, face: 'spin', rot: 1, ...HANDS_CHEST },
      { t: 0.8, face: 'side', aF: [176, 4], aB: [100, 30], ball: 'F', eyes: 'angry' },
    ],
    { trail: true },
  ),
  [ACT.DOUBLE]: dunk(
    [
      { t: 0.34, aF: [170, 10], aB: [110, 30], ball: 'F' },
      { t: 0.5, aF: [44, 36], aB: [70, 40], ball: 'F', lean: -6 },
      { t: 0.64, aF: [100, 40], aB: [80, 40], ball: 'F', lean: -2 },
      { t: 0.8, aF: [178, 4], aB: [100, 30], ball: 'F', eyes: 'angry' },
    ],
    { trail: true },
  ),
  // 엘보우 행: 팔꿈치까지 림 안으로 깊게
  [ACT.ELBOW]: dunk(
    [
      { t: 0.4, aF: [150, 30], aB: [90, 40], ball: 'F' },
      { t: 0.74, aF: [182, 0], aB: [100, 30], ball: 'F', lean: -2, eyes: 'angry' },
    ],
    { slam: 176 },
  ),
  // 비트윈 더 레그: 다리 사이로 공을 넘겨 반대 손으로
  [ACT.BETWEEN]: A(
    [
      { t: 0, ...GATHER, ...CROUCH_LEGS, lean: 12 },
      { t: 0.2, ...TAKEOFF, aF: [60, 50], aB: [60, 40], ball: 'F', lean: 6 },
      { t: 0.42, lF: [84, -24], lB: [-44, -30], aF: [10, 30], aB: [-6, 30], ball: [1, 9, 0], lean: 6, eyes: 'focus' },
      { t: 0.54, lF: [80, -30], lB: [-40, -34], aF: [30, 30], aB: [10, 40], ball: 'B', lean: 4 },
      { t: 0.76, ...TUCK, aF: [80, 30], aB: [178, 4], ball: 'B', lean: 2 },
      { t: 0.9, ...TUCK, aF: [70, 30], aB: [132, 6], ball: 'B', lean: 12, eyes: 'angry' },
      { t: 1, ...TUCK, aF: [60, 30], aB: [122, 10], lean: 10 },
    ],
    { rel: 0.9, trail: true },
  ),
  // 자유투 라인 덩크: 멀리서 다리를 쭉 벌리고 날아간다
  [ACT.FTLINE]: A(
    [
      { t: 0, ...GATHER, lean: 16 },
      { t: 0.2, lF: [72, -16], lB: [-62, -28], aF: [-40, 10], aB: [70, 30], ball: 'F', lean: 14 },
      { t: 0.5, lF: [74, -14], lB: [-64, -26], aF: [92, 10], aB: [60, 30], ball: 'F', lean: 12, eyes: 'focus' },
      { t: 0.74, lF: [70, -30], lB: [-50, -40], aF: [176, 4], aB: [80, 30], ball: 'F', lean: 6 },
      { t: 0.9, lF: [60, -60], lB: [-30, -50], ...SLAM(132), ball: 'F' },
      { t: 1, lF: [50, -70], lB: [-20, -60], aF: [122, 10], aB: [60, 30], lean: 10 },
    ],
    { rel: 0.9, trail: true },
  ),
  // 크레들 (락 더 베이비): 공을 팔에 감싸 몸 뒤로 크게 휘돌린다
  [ACT.CRADLE]: dunk(
    [
      { t: 0.3, aF: [70, 70], aB: [80, 30], ball: 'F' },
      { t: 0.44, aF: [-20, 90], aB: [80, 30], ball: 'F' },
      { t: 0.58, aF: [-100, 70], aB: [80, 30], ball: 'F' },
      { t: 0.72, aF: [-174, 40], aB: [80, 30], ball: 'F' },
      { t: 0.82, aF: [-204, 14], aB: [80, 30], ball: 'F', eyes: 'angry' },
    ],
    { slam: -228, trail: true },
  ),
  // 해머: 두 손으로 머리 뒤까지 젖혔다가 망치처럼
  [ACT.HAMMER]: dunk(
    [
      { t: 0.36, aF: [168, 24], aB: [164, 26], wF: -0.3, wB: -0.3, ball: 'FB' },
      { t: 0.74, aF: [214, 56], aB: [210, 56], wF: -0.3, wB: -0.3, ball: 'FB', lean: -18, lF: [24, -104], lB: [-12, -112], eyes: 'angry' },
    ],
    { both: true, slam: 118 },
  ),
  // 슈퍼맨: 몸을 눕혀 한 팔을 쭉 뻗는다
  [ACT.SUPERMAN]: dunk(
    [
      { t: 0.4, aF: [96, 0], aB: [-30, 10], ball: 'F', lean: 40, lF: [-40, -10], lB: [-62, -16] },
      { t: 0.76, aF: [104, 0], aB: [-40, 10], ball: 'F', lean: 58, lF: [-60, 0], lB: [-82, -8], eyes: 'focus' },
    ],
    { slam: 122, legs: { lF: [-60, 0], lB: [-82, -8] }, trail: true },
  ),
  // 스콜피온: 공을 머리 뒤로, 발뒤꿈치가 머리에 닿을 듯
  [ACT.SCORPION]: dunk(
    [
      { t: 0.36, aF: [170, 24], aB: [166, 26], ball: 'FB' },
      { t: 0.7, aF: [226, 70], aB: [220, 70], ball: 'FB', lean: -16, lF: [10, -122], lB: [-62, -132], eyes: 'focus' },
    ],
    { both: true, slam: 124, legs: { lF: [10, -122], lB: [-62, -132] }, trail: true },
  ),
  // 셀프 앨리웁: 공을 앞으로 띄우고 따라가서 잡아 꽂는다
  [ACT.SELFOOP]: A(
    [
      { t: 0, aF: [30, 40], aB: [20, 30], ball: 'F', lF: [40, -30], lB: [-30, -52], lean: 14 },
      { t: 0.12, aF: [96, 10], aB: [30, 30], ball: 'F', lF: [30, -40], lB: [-20, -50], lean: 10 },
      { t: 0.3, aF: [60, 20], aB: [30, 30], ball: [22, 34, 2], lF: [40, -30], lB: [-30, -52], lean: 14 },
      { t: 0.46, ...CROUCH_LEGS, aF: [40, 30], aB: [40, 30], ball: [20, 46, 2], lean: 10 },
      { t: 0.6, ...TUCK, aF: [172, 4], aB: [168, 4], ball: 'FB', lean: 4, eyes: 'happy' },
      { t: 0.9, ...TUCK, ...SLAM(132), aB: [80, 30], ball: 'F' },
      { t: 1, ...TUCK, aF: [122, 10], aB: [60, 30], lean: 10 },
    ],
    { rel: 0.9 },
  ),
  [ACT.POSTER]: A(
    [
      { t: 0, ...GATHER, ...CROUCH_LEGS, lean: 16, eyes: 'angry' },
      { t: 0.22, lF: [88, -78], lB: [-22, -18], aF: [150, 40], aB: [100, 20], ball: 'F', lean: 10, eyes: 'angry' },
      { t: 0.5, lF: [92, -82], lB: [-22, -20], aF: [204, 60], aB: [118, 10], ball: 'F', lean: -6, eyes: 'angry' },
      { t: 0.76, lF: [90, -84], lB: [-20, -24], aF: [208, 40], aB: [120, 10], ball: 'F', lean: -8, eyes: 'angry' },
      { t: 0.9, lF: [80, -84], lB: [-20, -28], aF: [120, 0], aB: [110, 10], ball: 'F', lean: 18, eyes: 'angry' },
      { t: 1, lF: [70, -84], lB: [-18, -30], aF: [112, 4], aB: [100, 10], lean: 16, eyes: 'angry' },
    ],
    { rel: 0.9, trail: true },
  ),
  // 풋백: 공중에서 튄 공을 두 손으로 잡아 한 손으로 꽂는다
  [ACT.PUTBACK]: A(
    [
      { t: 0, ...TUCK, aF: [178, 0], aB: [174, 0], wF: 0.2, wB: 0.2, ball: 'FB', eyes: 'focus' },
      { t: 0.5, ...TUCK, aF: [186, 10], aB: [178, 10], ball: 'F', lean: -4, eyes: 'angry' },
      { t: 0.86, ...TUCK, ...SLAM(134), aB: [90, 30], ball: 'F' },
      { t: 1, ...TUCK, aF: [124, 10], aB: [70, 30], lean: 10, eyes: 'angry' },
    ],
    { rel: 0.86 },
  ),
  // 앨리웁: 날아오는 공을 공중에서 잡아 꽂는다
  [ACT.ALLEY]: A(
    [
      { t: 0, ...TAKEOFF, aF: [166, 0], aB: [160, 0], wF: 0.3, wB: 0.3, ball: 'FB', lean: 6, eyes: 'focus' },
      { t: 0.4, ...TUCK, aF: [182, 10], aB: [178, 10], ball: 'FB', eyes: 'focus' },
      { t: 0.68, ...TUCK, aF: [192, 14], aB: [186, 14], ball: 'FB', lean: -6, eyes: 'angry' },
      { t: 0.88, ...TUCK, aF: [130, 4], aB: [126, 4], ball: 'FB', lean: 12, eyes: 'angry' },
      { t: 1, ...TUCK, aF: [120, 10], aB: [116, 10], lean: 10, eyes: 'angry' },
    ],
    { rel: 0.88 },
  ),
  // 림에 매달린다 (두 손으로 림을 잡고 다리가 흔들린다)
  [ACT.HANG]: A(
    [
      { t: 0, lF: [14, -10], lB: [-8, -6] },
      { t: 0.5, lF: [-6, -22], lB: [12, -12] },
      { t: 1, lF: [14, -10], lB: [-8, -6] },
    ],
    { loop: 1.1, base: { aF: [180, 0], aB: [178, 0], wF: 0.2, wB: 0.2, eyes: 'angry', mouth: true } },
  ),
  // ───────────── 패스 ─────────────
  [ACT.PASS]: A([
    { t: 0, ...HANDS_CHEST, lF: [26, -30], lB: [-20, -36], lean: 6 },
    { t: 0.4, aF: [86, 4], aB: [84, 6], wF: -0.1, wB: -0.1, lF: [36, -20], lB: [-22, -32], lean: 10 },
    { t: 1, aF: [70, 20], aB: [64, 24], lF: [30, -20], lB: [-20, -30], lean: 8 },
  ]),
  [ACT.BOUNCE]: A([
    { t: 0, ...HANDS_CHEST, lF: [30, -40], lB: [-22, -40], lean: 10 },
    { t: 0.4, aF: [56, 4], aB: [54, 6], wF: -0.1, wB: -0.1, lF: [50, -46], lB: [-30, -30], lean: 18 },
    { t: 1, aF: [50, 20], aB: [46, 24], lF: [40, -40], lB: [-24, -30], lean: 14 },
  ]),
  [ACT.LOB]: A([
    { t: 0, aF: [130, 60], aB: [126, 62], wF: -0.4, wB: -0.4, lF: [20, -20], lB: [-16, -20], lean: -2 },
    { t: 0.4, aF: [152, 4], aB: [150, 6], wF: -0.1, wB: -0.1, lF: [20, -16], lB: [-16, -16], lean: -6 },
    { t: 1, aF: [140, 20], aB: [136, 20], lean: -2 },
  ]),
  // 비하인드 백 패스: 등 뒤로 감아서 던진다
  [ACT.BEHINDPASS]: A([
    { t: 0, aF: [20, 60], aB: [40, 40], lF: [30, -30], lB: [-20, -36], lean: 8 },
    { t: 0.3, aF: [-62, -30], aB: [50, 40], lF: [30, -30], lB: [-20, -36], lean: 10 },
    { t: 0.55, aF: [-84, -60], aB: [50, 40], lean: 8 },
    { t: 1, aF: [-50, -30], aB: [40, 40], lean: 6 },
  ]),
  // 노룩 패스: 앞(카메라)을 보면서 옆으로 뿌린다
  [ACT.NOLOOK]: A(
    [
      { t: 0, ...HANDS_CHEST },
      { t: 0.35, aF: [90, 0], wF: 1.4, aB: [30, 40], wB: 0.2 },
      { t: 1, aF: [70, 10], wF: 1.2, aB: [20, 30], wB: 0.2 },
    ],
    { base: { face: 'front', lF: [20, -20], lB: [-16, -20], eyes: 'happy' } },
  ),
  // ───────────── 리바운드·수비 ─────────────
  [ACT.REBOUND]: A([
    { t: 0, ...CROUCH_LEGS, aF: [60, 40], aB: [56, 40], wF: 0.5, wB: 0.5 },
    { t: 0.36, lF: [30, -62], lB: [20, -56], aF: [176, 0], aB: [172, 0], wF: 0.2, wB: 0.2, ball: 'FB', eyes: 'focus' },
    { t: 0.7, lF: [26, -50], lB: [18, -46], aF: [40, 116], aB: [36, 116], wF: 0.7, wB: 0.7, ball: 'FB', eyes: 'angry' },
    { t: 1, ...CROUCH_LEGS, aF: [36, 112], aB: [32, 112], wF: 0.7, wB: 0.7, ball: 'FB' },
  ]),
  [ACT.BLOCK]: A([
    { t: 0, ...CROUCH_LEGS, aF: [120, 30], aB: [90, 30] },
    { t: 0.35, lF: [40, -62], lB: [-10, -22], aF: [182, 0], aB: [110, 30], wF: 0.2, eyes: 'angry' },
    { t: 0.55, lF: [36, -56], lB: [-10, -20], aF: [146, 0], aB: [110, 30], eyes: 'angry' },
    { t: 1, lF: [20, -30], lB: [-6, -10], aF: [140, 10], aB: [90, 30] },
  ]),
  // 체이스다운 블록: 뒤에서 쫓아와 백보드에 찍어 누른다
  [ACT.CHASE]: A(
    [
      { t: 0, lF: [40, -30], lB: [-36, -60], aF: [-30, 60], aB: [40, 60], lean: 20 },
      { t: 0.35, lF: [62, -60], lB: [-52, -40], aF: [162, 0], aB: [60, 30], lean: 12, eyes: 'angry' },
      { t: 0.55, lF: [56, -60], lB: [-46, -40], aF: [128, 0], aB: [60, 30], lean: 16, eyes: 'angry' },
      { t: 1, lF: [30, -40], lB: [-20, -30], aF: [120, 10], aB: [50, 30], lean: 12 },
    ],
    { trail: true },
  ),
  [ACT.CONTEST]: A([
    { t: 0, aF: [120, 20], aB: [60, 30], lF: [20, -30], lB: [-10, -20] },
    { t: 0.4, aF: [178, 0], aB: [70, 30], wF: 0.1, lF: [16, -36], lB: [-6, -24], eyes: 'angry' },
    { t: 1, aF: [170, 4], aB: [70, 30], lF: [10, -20], lB: [-4, -10] },
  ]),
  [ACT.STANCE]: A(
    [
      { t: 0, lF: [36, -86], lB: [-26, -76], ws: 3 },
      { t: 0.5, lF: [26, -76], lB: [-36, -86], ws: 5 },
      { t: 1, lF: [36, -86], lB: [-26, -76], ws: 3 },
    ],
    { loop: 1.3, base: STANCE_BASE },
  ),
  [ACT.SCREEN]: A([{ t: 0, aF: [24, 122], aB: [24, 122], wF: -0.9, wB: -0.9, lF: [16, -16], lB: [-16, -16], ws: 3, crouch: 1, lean: 4, eyes: 'angry' }]),
  [ACT.STUN]: A(
    [
      { t: 0, lean: -14, aF: [140, 40], wF: 1.1, aB: [120, 50], wB: 1.1, lF: [30, -20], lB: [-36, -30] },
      { t: 0.5, lean: 8, aF: [100, 60], wF: 1.1, aB: [152, 30], wB: 1.1, lF: [-20, -30], lB: [26, -16] },
      { t: 1, lean: -14, aF: [140, 40], wF: 1.1, aB: [120, 50], wB: 1.1, lF: [30, -20], lB: [-36, -30] },
    ],
    { loop: 2.2, base: { eyes: 'dizzy' } },
  ),
  [ACT.FALL]: A([
    { t: 0, lean: -16, aF: [150, 40], aB: [130, 40], wF: 1, wB: 1, lF: [30, -30], lB: [-20, -40], eyes: 'dizzy' },
    { t: 0.35, lean: -44, aF: [150, 40], aB: [140, 40], wF: 1, wB: 1, lF: [62, -30], lB: [42, -50], eyes: 'dizzy' },
    { t: 0.6, lean: -26, aF: [-40, 10], aB: [-50, 10], wF: 0.6, wB: 0.6, lF: [90, -4], lB: [86, -10], eyes: 'dizzy' },
    { t: 1, lean: -24, aF: [-40, 10], aB: [-50, 10], wF: 0.6, wB: 0.6, lF: [90, -4], lB: [86, -10], eyes: 'sad' },
  ]),
  [ACT.STEAL]: A([
    { t: 0, ...CROUCH_LEGS, aF: [70, 20], aB: [60, 30], lean: 16 },
    { t: 0.35, lF: [66, -40], lB: [-46, -20], aF: [86, 0], aB: [-30, 20], lean: 32, eyes: 'focus' },
    { t: 1, lF: [50, -50], lB: [-36, -30], aF: [70, 20], aB: [-10, 20], lean: 20 },
  ]),
  [ACT.BOXOUT]: A([{ t: 0, aF: [72, 10], aB: [66, 14], wF: 1.3, wB: 1.3, lF: [30, -72], lB: [-30, -72], ws: 5, crouch: 1, lean: -6, eyes: 'angry' }]),
  // ───────────── 감정 ─────────────
  [ACT.CELEBRATE]: A(
    [
      { t: 0, aF: [168, 10], aB: [166, 10], wF: 0.9, wB: 0.9, dy: 0 },
      { t: 0.5, aF: [176, 0], aB: [172, 4], wF: 0.9, wB: 0.9, dy: -2 },
      { t: 1, aF: [168, 10], aB: [166, 10], wF: 0.9, wB: 0.9, dy: 0 },
    ],
    { loop: 2.2, legsFree: true, base: { eyes: 'happy', mouth: true } },
  ),
  [ACT.HIGHFIVE]: A([
    { t: 0, aF: [120, 20], aB: [30, 20], wF: 0.2 },
    { t: 0.4, aF: [166, 0], aB: [30, 20], wF: 0.2, dy: -2, eyes: 'happy' },
    { t: 1, aF: [150, 10], aB: [30, 20], wF: 0.2, eyes: 'happy' },
  ]),
  [ACT.DEJECT]: A([{ t: 0, lean: 34, aF: [46, -22], aB: [40, -16], lF: [22, -32], lB: [-10, -26], crouch: 1, eyes: 'sad' }]),
  [ACT.INJURED]: A([{ t: 0, lean: 40, crouch: 2, aF: [56, -52], aB: [46, -40], lF: [42, -84], lB: [-20, -40], eyes: 'sad' }]),
  // 세리머니 (M21)
  [ACT.GOGGLES]: A(
    [
      { t: 0, aF: [110, 80], aB: [110, 80], wF: 0.8, wB: 0.8, wFe: -0.9, wBe: -0.9 },
      { t: 0.5, aF: [114, 80], aB: [114, 80], wF: 0.8, wB: 0.8, wFe: -0.9, wBe: -0.9, dy: -1 },
      { t: 1, aF: [110, 80], aB: [110, 80], wF: 0.8, wB: 0.8, wFe: -0.9, wBe: -0.9 },
    ],
    { loop: 1.4, legsFree: true, base: { face: 'front', eyes: 'happy' } },
  ),
  [ACT.FLEX]: A(
    [
      { t: 0, aF: [90, 92], aB: [90, 92], wF: 1.4, wB: 1.4 },
      { t: 0.5, aF: [96, 104], aB: [96, 104], wF: 1.4, wB: 1.4, crouch: 1 },
      { t: 1, aF: [90, 92], aB: [90, 92], wF: 1.4, wB: 1.4 },
    ],
    { loop: 1.6, base: { face: 'front', eyes: 'angry', mouth: true, lF: [10, -10], lB: [-10, -10], ws: 4 } },
  ),
  [ACT.SHIMMY]: A(
    [
      { t: 0, aF: [40, 80], aB: [40, 80], wF: 0.7, wB: 0.7, dx: 1 },
      { t: 0.5, aF: [44, 84], aB: [44, 84], wF: 0.7, wB: 0.7, dx: -1 },
      { t: 1, aF: [40, 80], aB: [40, 80], wF: 0.7, wB: 0.7, dx: 1 },
    ],
    { loop: 3.2, legsFree: true, base: { face: 'front', eyes: 'happy', mouth: true } },
  ),
  [ACT.SHH]: A([{ t: 0, aF: [30, 120], wF: -0.2, wFe: -1, aB: [8, 10], wB: 0.2, eyes: 'focus' }], { legsFree: true, base: { face: 'front' } }),
  [ACT.ROAR]: A(
    [
      { t: 0, aF: [-24, 50], aB: [-24, 50], wF: 1, wB: 1, lean: -8, crouch: 1 },
      { t: 0.5, aF: [30, 122], aB: [10, 20], wF: -0.3, wB: 0.6, lean: 0 },
      { t: 1, aF: [-24, 50], aB: [-24, 50], wF: 1, wB: 1, lean: -8, crouch: 1 },
    ],
    { loop: 1.4, base: { face: 'front', eyes: 'angry', mouth: true, lF: [14, -20], lB: [-14, -20], ws: 4 } },
  ),
  // 슛을 쏘자마자 돌아서서 걸어간다 (들어갈 줄 안다)
  [ACT.TURNAWAY]: A([{ t: 0, aF: [160, 10], aB: [12, 10] }, { t: 1, aF: [90, 20], aB: [12, 10] }], { legsFree: true }),
  // ───────────── 드리블 기술 ─────────────
  [ACT.CROSSOVER]: cross({}),
  [ACT.KILLER]: cross({ wide: 1.5, dx: 5, legs: { lF: [-10, -20], lB: [56, -100], ws: 11 }, trail: true }),
  [ACT.DBLCROSS]: cross({ twice: true, dx: 3, trail: true }),
  [ACT.LEGS]: A(
    [
      { t: 0, aF: [38, 30], wF: 0.6, aB: [30, 38], wB: 0.2, ball: 'F', dx: 2, lF: [30, -62], lB: [-8, -30], ws: 5 },
      // 앞발을 크게 내딛고 다리 사이로 공을 넘긴다
      { t: 0.4, aF: [20, 20], wF: 0.1, aB: [20, 20], wB: 0.1, ball: [0, 2, 0], dx: 0, lF: [60, -50], lB: [-40, -30], ws: 8, crouch: 3 },
      { t: 0.7, aF: [30, 38], wF: 0.2, aB: [38, 30], wB: 0.7, ball: 'B', dx: -2, lF: [40, -60], lB: [-24, -40], ws: 6 },
      { t: 1, aF: [30, 38], wF: 0.2, aB: [40, 34], wB: 0.7, ball: 'B', dx: -2, lF: [30, -62], lB: [-8, -30], ws: 5 },
    ],
    { base: { face: 'front', crouch: 2, lean: 12, ws: 5, eyes: 'focus' } },
  ),
  [ACT.BEHIND]: A(
    [
      { t: 0, aF: [38, 30], wF: 0.6, aB: [30, 38], wB: 0.2, ball: 'F', dx: 2, lF: [30, -62], lB: [-8, -30], ws: 5 },
      { t: 0.3, aF: [-36, 40], wF: 0.4, aB: [24, 30], wB: 0.2, ball: [-3, 8, 3, true], dx: 1 },
      { t: 0.5, aF: [-44, 40], wF: 0.2, aB: [-30, 40], wB: 0.2, ball: [-3, 3, 0, true], dx: 0, ws: 3 },
      { t: 0.72, aF: [20, 30], wF: 0.2, aB: [-30, 40], wB: 0.4, ball: [-3, 8, -3, true], dx: -3, lF: [-6, -26], lB: [44, -76], ws: 9, lean: 18 },
      { t: 1, aF: [30, 38], wF: 0.2, aB: [40, 34], wB: 0.7, ball: 'B', dx: -3, lean: 20, ws: 6 },
    ],
    { base: { face: 'front', crouch: 2, lean: 12, ws: 4, ...CROUCH_LEGS, eyes: 'focus' } },
  ),
  [ACT.SHAKE]: A(
    [
      { t: 0, aF: [38, 30], wF: 0.8, aB: [30, 38], wB: 0.2, ball: 'F', dx: 4, lF: [30, -62], lB: [-8, -30], ws: 6 },
      { t: 0.2, aF: [22, 18], wF: 0.1, aB: [22, 18], wB: 0.1, ball: [3, 0, 0], dx: 0, ws: 3 },
      { t: 0.4, aF: [30, 38], wF: 0.2, aB: [38, 30], wB: 0.8, ball: 'B', dx: -4, lF: [-8, -30], lB: [30, -62], ws: 6 },
      { t: 0.6, aF: [22, 18], wF: 0.1, aB: [22, 18], wB: 0.1, ball: [3, 0, 0], dx: 0, ws: 3 },
      { t: 0.8, aF: [38, 30], wF: 0.8, aB: [30, 38], wB: 0.2, ball: 'F', dx: 6, lF: [44, -76], lB: [-6, -26], ws: 10, lean: 20 },
      { t: 1, aF: [40, 34], wF: 0.8, aB: [30, 38], wB: 0.2, ball: 'F', dx: 5, lean: 20, ws: 6 },
    ],
    { base: { face: 'front', crouch: 2, lean: 12, ws: 4, ...CROUCH_LEGS, eyes: 'focus' }, trail: true },
  ),
  // 인앤아웃: 넘길 듯 안쪽으로 공을 끌었다가 그대로 바깥으로 치고 나간다
  [ACT.INOUT]: A(
    [
      { t: 0, aF: [38, 30], wF: 0.6, aB: [30, 38], wB: 0.2, ball: 'F', dx: 1, lF: [30, -62], lB: [-8, -30], ws: 5 },
      { t: 0.4, aF: [26, 22], wF: -0.2, aB: [30, 38], wB: 0.2, ball: [4, 3, 0], dx: -3, lF: [-8, -30], lB: [30, -62], lean: 6, ws: 6 },
      { t: 0.75, aF: [40, 30], wF: 0.9, aB: [30, 38], wB: 0.2, ball: 'F', dx: 4, lF: [44, -76], lB: [-6, -26], ws: 9, lean: 20 },
      { t: 1, aF: [40, 30], wF: 0.9, aB: [30, 38], wB: 0.2, ball: 'F', dx: 4, lean: 20, ws: 6 },
    ],
    { base: { face: 'front', crouch: 2, lean: 10, ws: 4, ...CROUCH_LEGS, eyes: 'focus' } },
  ),
  // 스핀: 수비를 등지며 한 바퀴 돌아 반대로 빠져나간다 (축발을 딛고)
  [ACT.SPIN]: A(
    [
      { t: 0, face: 'spin', rot: 0, aF: [40, 80], aB: [60, 40], ball: 'F', lean: 12, lF: [36, -50], lB: [-20, -50], crouch: 2 },
      { t: 0.3, face: 'spin', rot: 0.35, aF: [60, 90], aB: [80, 50], wF: 0.6, ball: 'F', lean: 6, lF: [10, -40], lB: [-40, -40], crouch: 2 },
      { t: 0.7, face: 'spin', rot: 0.9, aF: [40, 80], aB: [60, 40], ball: 'F', lean: 10, lF: [-30, -50], lB: [36, -50], crouch: 2 },
      { t: 1, face: 'side', aF: [46, 36], aB: [62, 40], ball: 'F', lean: 20, lF: [50, -60], lB: [-34, -64] },
    ],
    { trail: true, base: { crouch: 1, eyes: 'focus' } },
  ),
  // 하프 스핀: 돌 듯하다가 원래 쪽으로 되돌아 나간다
  [ACT.HALFSPIN]: A(
    [
      { t: 0, face: 'spin', rot: 0, aF: [40, 80], aB: [60, 40], ball: 'F', lean: 12, lF: [36, -50], lB: [-20, -50], crouch: 2 },
      { t: 0.4, face: 'spin', rot: 0.4, aF: [60, 90], aB: [80, 50], ball: 'F', lean: 6, lF: [10, -40], lB: [-40, -40], crouch: 2 },
      { t: 0.7, face: 'spin', rot: 0.05, aF: [40, 80], aB: [60, 40], ball: 'F', lean: 14, lF: [40, -60], lB: [-24, -50], crouch: 2 },
      { t: 1, face: 'side', aF: [46, 36], aB: [62, 40], ball: 'F', lean: 20, lF: [50, -60], lB: [-34, -64] },
    ],
    { trail: true, base: { crouch: 1, eyes: 'focus' } },
  ),
  // 헤지테이션: 슛할 듯 멈칫 일어섰다가 확 낮춰 치고 나간다
  [ACT.HESI]: A([
    { t: 0, aF: [70, 40], aB: [62, 40], wB: 0.9, ball: 'F', lF: [30, -50], lB: [-14, -40], lean: 8, crouch: 1 },
    { t: 0.42, aF: [96, 60], aB: [70, 50], wB: 0.6, ball: 'F', lF: [10, -12], lB: [-8, -12], lean: -6, dy: -2, eyes: 'focus' },
    { t: 0.58, aF: [40, 20], aB: [62, 40], wB: 0.9, ball: [10, 0, 4], lF: [60, -104], lB: [-36, -64], lean: 28, crouch: 2 },
    { t: 1, aF: [46, 36], aB: [62, 40], wB: 0.9, ball: 'F', lF: [52, -70], lB: [-40, -70], lean: 24 },
  ]),
  // 스터터 스텝: 제자리에서 발을 다다닥 굴러 수비를 멈춰 세우고 튀어 나간다
  [ACT.STUTTER]: A([
    { t: 0, aF: [50, 36], aB: [62, 40], wB: 0.9, ball: 'F', lF: [16, -30], lB: [-10, -30], lean: 6 },
    { t: 0.1, lF: [28, -54], lB: [-6, -14], dy: -1 },
    { t: 0.2, lF: [6, -14], lB: [-20, -54], dy: 0, ball: [6, 0, 4] },
    { t: 0.3, lF: [28, -54], lB: [-6, -14], dy: -1, ball: 'F' },
    { t: 0.4, lF: [6, -14], lB: [-20, -54], dy: 0, ball: [6, 0, 4] },
    { t: 0.5, lF: [28, -54], lB: [-6, -14], dy: -1, ball: 'F', eyes: 'focus' },
    { t: 0.65, aF: [40, 20], ball: [10, 0, 4], lF: [62, -104], lB: [-38, -64], lean: 28, crouch: 2 },
    { t: 1, aF: [46, 36], ball: 'F', lF: [52, -70], lB: [-40, -70], lean: 24 },
  ]),
  // 스냅백: 확 밀고 들어가다 뒤로 튕기듯 빠진다 (슛 자세로 내려선다)
  [ACT.SNAP]: A([
    { t: 0, aF: [40, 24], aB: [62, 40], wB: 0.9, ball: 'F', lF: [44, -30], lB: [-30, -56], lean: 22 },
    { t: 0.35, aF: [30, 20], aB: [62, 40], wB: 0.9, ball: [10, 0, 4], lF: [62, -50], lB: [-36, -66], lean: 26, crouch: 2 },
    { t: 0.6, ...HANDS_CHEST, lF: [-8, -54], lB: [-26, -84], lean: -10, dx: -3, dy: -2 },
    { t: 1, ...HANDS_CHEST, ...CROUCH_LEGS, lean: 6, dx: -3 },
  ]),
  // ───────────── 당한 수비 (M25) ─────────────
  // 한 발 늦음: 속은 쪽으로 몸이 쏠려 다리가 꼬이고 팔만 뻗는다
  [ACT.BEATEN]: A([
    { t: 0, ...STANCE_BASE, lF: [36, -86], lB: [-26, -76], ws: 4 },
    { t: 0.3, lean: 26, aF: [100, 0], wF: 1.4, aB: [40, 30], wB: 0.4, lF: [60, -40], lB: [-50, -20], ws: 2, crouch: 1, eyes: 'focus' },
    { t: 0.7, lean: 20, aF: [80, 10], wF: 1.2, aB: [30, 30], lF: [40, -50], lB: [-40, -30], ws: 3, crouch: 1 },
    { t: 1, ...STANCE_BASE, lF: [30, -70], lB: [-24, -60], ws: 4 },
  ]),
  // 주저앉음 (앵클 브레이커): 다리가 풀려 엉덩방아를 찧는다
  [ACT.ANKLE]: A([
    { t: 0, lean: 20, aF: [100, 20], aB: [80, 30], wF: 1.2, wB: 1.2, lF: [40, -60], lB: [-30, -50], eyes: 'dizzy' },
    { t: 0.25, lean: -14, aF: [150, 30], aB: [140, 30], wF: 1.2, wB: 1.2, lF: [70, -40], lB: [50, -60], crouch: 3, eyes: 'dizzy' },
    { t: 0.45, lean: -24, aF: [-30, 10], aB: [-40, 10], wF: 0.8, wB: 0.8, lF: [92, -14], lB: [84, -30], crouch: 4, eyes: 'dizzy' },
    { t: 1, lean: -20, aF: [-30, 10], aB: [-40, 10], wF: 0.8, wB: 0.8, lF: [92, -14], lB: [84, -30], crouch: 4, eyes: 'sad' },
  ]),
  // 컨택트에 밀려난다: 뒤로 휘청이며 팔을 휘젓는다
  [ACT.SHOVED]: A([
    { t: 0, lean: -10, aF: [120, 30], aB: [110, 30], wF: 1, wB: 1, lF: [30, -40], lB: [-20, -40] },
    { t: 0.35, lean: -28, aF: [160, 40], aB: [140, 50], wF: 1.3, wB: 1.3, lF: [40, -20], lB: [-40, -50], eyes: 'dizzy' },
    { t: 1, lean: -10, aF: [100, 40], aB: [90, 40], wF: 1, wB: 1, lF: [20, -40], lB: [-20, -40] },
  ]),
  // ───────────── 수비·오프볼 움직임 (M25) ─────────────
  [ACT.SLIDE]: A([{ t: 0, aF: [80, 20], aB: [70, 25], wF: 1.3, wB: 1.2, eyes: 'focus' }], { loop: 1, legsFree: true, shuffle: true, base: { crouch: 2, lean: 14 } }),
  // 클로즈아웃: 잔걸음으로 속도를 죽이며 한 손을 높이 든다
  [ACT.CLOSEOUT]: A(
    [
      { t: 0, aF: [168, 6], aB: [60, 30], wB: 0.8, lF: [30, -50], lB: [-16, -30], lean: -4, eyes: 'angry' },
      { t: 0.5, aF: [172, 4], aB: [60, 30], wB: 0.8, lF: [10, -30], lB: [-30, -50], lean: -4, dy: -1 },
      { t: 1, aF: [168, 6], aB: [60, 30], wB: 0.8, lF: [30, -50], lB: [-16, -30], lean: -4 },
    ],
    { loop: 4, base: { crouch: 1 } },
  ),
  // 패스 길 막기: 공 쪽 팔을 길에 뻗고 옆걸음
  [ACT.DENY]: A([{ t: 0, aF: [96, 0], wF: 1.5, aB: [40, 30], wB: 0.4, eyes: 'focus' }], { loop: 1, legsFree: true, shuffle: true, base: { crouch: 1, lean: 8 } }),
  // 컷: 손을 들어 공을 부르며 달린다
  [ACT.CUT]: A(
    [
      { t: 0, aF: [150, 20], aB: [40, 70], eyes: 'focus' },
      { t: 0.5, aF: [160, 14], aB: [-30, 70] },
      { t: 1, aF: [150, 20], aB: [40, 70] },
    ],
    { loop: 2, stepSync: 1, legsFree: true, base: { lean: 12 } },
  ),
  // 펌프 페이크: 슛할 듯 공을 이마까지 올렸다가 (수비가 뜬 사이) 내려와서 진짜로 쏜다
  [ACT.PUMPFAKE]: A(
    [
      { t: 0, ...HANDS_CHEST, ...CROUCH_LEGS, lean: 6, eyes: 'focus' },
      { t: 0.18, ...SET, lF: [12, -24], lB: [4, -18], lean: 0, dy: -2, eyes: 'focus' },
      { t: 0.4, ...SET, lF: [12, -24], lB: [4, -18], lean: 0, dy: -2 },
      { t: 0.55, ...HANDS_CHEST, ...CROUCH_LEGS, lean: 6, eyes: 'focus' },
      { t: 0.72, ...SET, lF: [10, -18], lB: [0, -14], lean: 0, eyes: 'focus' },
      { t: 0.8, ...RELEASE, lF: [6, -16], lB: [-4, -20], lean: -2 },
      { t: 1, aF: [158, 20], aB: [70, 30], lF: [6, -10], lB: [0, -6], lean: 0 },
    ],
    { rel: 0.78 },
  ),
};

/** 벤치 (경기 기록에 없는 화면 전용 동작) */
export const BENCH_SIT = -1;
export const BENCH_UP = -2;
ANIMS[BENCH_SIT] = A([{ t: 0, aF: [30, 60], aB: [30, 60], wF: 0.1, wB: 0.1, lF: [90, -90], lB: [86, -86], ws: 3 }, { t: 1, aF: [32, 64], aB: [30, 60], wF: 0.1, wB: 0.1, lF: [90, -90], lB: [86, -86], ws: 3 }], { loop: 0.3, base: { face: 'front' } });
ANIMS[BENCH_UP] = A(
  [
    { t: 0, aF: [160, 20], aB: [150, 30], wF: 0.9, wB: 0.9, dy: 0 },
    { t: 0.5, aF: [174, 6], aB: [166, 10], wF: 0.9, wB: 0.9, dy: -1 },
    { t: 1, aF: [160, 20], aB: [150, 30], wF: 0.9, wB: 0.9, dy: 0 },
  ],
  { loop: 2.4, base: { face: 'front', eyes: 'happy', mouth: true } },
);

/** 한 번 하는 동작인가 (되풀이가 아니고, 기록에서 시작~끝을 찾아 진행도를 쓴다) */
export function isOneShot(act: number) {
  const a = ANIMS[act];
  return !!a && !a.loop;
}

const RUN: Key[] = [
  { t: 0, lF: [36, -14], lB: [-30, -50], aF: [-36, 70], aB: [40, 70], dy: 0 },
  { t: 0.25, lF: [2, -6], lB: [22, -96], aF: [0, 70], aB: [6, 70], dy: -1 },
  { t: 0.5, lF: [-30, -50], lB: [36, -14], aF: [40, 70], aB: [-36, 70], dy: 0 },
  { t: 0.75, lF: [22, -96], lB: [2, -6], aF: [6, 70], aB: [0, 70], dy: -1 },
  { t: 1, lF: [36, -14], lB: [-30, -50], aF: [-36, 70], aB: [40, 70], dy: 0 },
];

const STAND: Pose = { aF: [10, 18], aB: [-8, 14], lF: [2, 0], lB: [-2, 0], wF: 0.35, wB: 0.35, ws: 2, lean: 0, crouch: 0, dx: 0, dy: 0, rot: 0, eyes: 'open' };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const frac = (x: number) => x - Math.floor(x);
const NUM: (keyof Pose)[] = ['wF', 'wB', 'ws', 'lean', 'crouch', 'dx', 'dy', 'rot'];
const OPT: ('wFe' | 'wBe')[] = ['wFe', 'wBe'];
const PAIR: ('aF' | 'aB' | 'lF' | 'lB')[] = ['aF', 'aB', 'lF', 'lB'];

function sample(keys: Key[], p: number, base: Pose): Pose & { ball2?: [BallAt | undefined, BallAt | undefined, number] } {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= p) i++;
  const a = keys[i];
  const b = keys[Math.min(keys.length - 1, i + 1)];
  const span = b.t - a.t;
  let k = span > 0 ? Math.max(0, Math.min(1, (p - a.t) / span)) : 0;
  k = k * k * (3 - 2 * k); // 부드럽게
  const out: Pose & { ball2?: [BallAt | undefined, BallAt | undefined, number] } = { ...base };
  for (const f of PAIR) {
    const va = a[f] ?? base[f];
    const vb = b[f] ?? base[f];
    out[f] = [lerp(va[0], vb[0], k), lerp(va[1], vb[1], k)];
  }
  for (const f of NUM) (out as unknown as Record<string, number>)[f] = lerp((a[f] as number | undefined) ?? (base[f] as number), (b[f] as number | undefined) ?? (base[f] as number), k);
  for (const f of OPT) {
    const va = a[f] ?? a[f === 'wFe' ? 'wF' : 'wB'] ?? base[f] ?? base[f === 'wFe' ? 'wF' : 'wB'];
    const vb = b[f] ?? b[f === 'wFe' ? 'wF' : 'wB'] ?? base[f] ?? base[f === 'wFe' ? 'wF' : 'wB'];
    if (a[f] !== undefined || b[f] !== undefined || base[f] !== undefined) out[f] = lerp(va, vb, k);
  }
  out.eyes = (k < 0.5 ? a.eyes : b.eyes) ?? a.eyes ?? base.eyes;
  out.face = a.face ?? base.face;
  out.mouth = a.mouth ?? base.mouth;
  // 공은 두 키의 자리를 실제 손 위치로 바꾼 다음 섞는다 (그림 그릴 때)
  out.ball2 = [a.ball ?? (b.ball ? undefined : base.ball), b.ball ?? a.ball ?? base.ball, k];
  return out;
}

export type SampledPose = ReturnType<typeof sample>;

/** 걷기 (M25): 무릎을 조금만 굽히고 팔은 작게 */
const WALK: Key[] = [
  { t: 0, lF: [20, -8], lB: [-18, -22], aF: [-14, 20], aB: [14, 20], dy: 0 },
  { t: 0.25, lF: [4, -4], lB: [10, -44], aF: [0, 20], aB: [0, 20], dy: -1 },
  { t: 0.5, lF: [-18, -22], lB: [20, -8], aF: [14, 20], aB: [-14, 20], dy: 0 },
  { t: 0.75, lF: [10, -44], lB: [4, -4], aF: [0, 20], aB: [0, 20], dy: -1 },
  { t: 1, lF: [20, -8], lB: [-18, -22], aF: [-14, 20], aB: [14, 20], dy: 0 },
];
/** 전력 질주: 무릎을 높이 들고 팔을 크게 흔든다 */
const SPRINT: Key[] = [
  { t: 0, lF: [58, -22], lB: [-42, -74], aF: [-58, 92], aB: [72, 92], dy: 0 },
  { t: 0.25, lF: [10, -10], lB: [44, -124], aF: [0, 92], aB: [10, 92], dy: -2 },
  { t: 0.5, lF: [-42, -74], lB: [58, -22], aF: [72, 92], aB: [-58, 92], dy: 0 },
  { t: 0.75, lF: [44, -124], lB: [10, -10], aF: [10, 92], aB: [0, 92], dy: -2 },
  { t: 1, lF: [58, -22], lB: [-42, -74], aF: [-58, 92], aB: [72, 92], dy: 0 },
];
/** 수비 사이드 스텝: 다리를 벌렸다 모은다 (무릎은 굽힌 채) */
const SHUFFLE: Key[] = [
  { t: 0, lF: [26, -64], lB: [-26, -64], ws: 9, dy: 0 },
  { t: 0.5, lF: [14, -44], lB: [-14, -44], ws: 3, dy: -1 },
  { t: 1, lF: [26, -64], lB: [-26, -64], ws: 9, dy: 0 },
];

/** 두 자세 섞기 */
function mix(a: Pose, b: Pose, k: number): Pose {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const out = { ...a };
  for (const f of PAIR) out[f] = [lerp(a[f][0], b[f][0], k), lerp(a[f][1], b[f][1], k)];
  for (const f of NUM) (out as unknown as Record<string, number>)[f] = lerp(a[f] as number, b[f] as number, k);
  return out;
}

export interface Loco {
  /** 이동 속도 (m/s) */
  speed: number;
  time: number;
  seed: number;
  /** 보폭 주기 (M25): 지나온 거리 / 보폭. 있으면 발이 땅에 맞게 움직인다 (미끄러지지 않게) */
  phase?: number;
  /** 진행 방향 가속 (m/s², +면 치고 나가고 -면 급정지) */
  accel?: number;
  /** 뒷걸음질 (보는 쪽 반대로 움직인다) */
  back?: boolean;
  /** 수비 사이드 스텝 */
  shuffle?: boolean;
}

/** 걷기·조깅·전력 질주 (M25): 속도에 따라 섞고, 보폭 주기에 맞춰 발을 디딘다. 급정지·첫 발·뒷걸음질 */
function locomotion(o: Loco): Pose {
  const { speed } = o;
  if (speed < 0.5) return { ...STAND, dy: Math.sin(o.time * 2.2 + o.seed) > 0.6 ? -1 : 0 };
  let p = frac(o.phase ?? o.time * (1.1 + speed * 0.28) + o.seed * 0.37);
  if (o.back) p = 1 - p;
  let r: Pose;
  if (o.shuffle) {
    r = { ...STAND, ...sample(SHUFFLE, frac(p * 2), STAND), crouch: 2, lean: 12 };
  } else {
    const walk = sample(WALK, p, STAND);
    const run = sample(RUN, p, STAND);
    const sprint = sample(SPRINT, p, STAND);
    r = speed < 2.2 ? mix(walk, run, (speed - 1.2) / 1.0) : speed < 5 ? run : mix(run, sprint, (speed - 5) / 1.6);
    r.lean = speed < 2 ? 2 : speed < 5 ? 7 : 7 + Math.min(1, (speed - 5) / 1.6) * 9;
    if (speed < 2.2) r.dy = 0;
  }
  if (o.back) {
    r.lean = -6;
    r.aF = [20, 30];
    r.aB = [10, 30];
  }
  const a = o.accel ?? 0;
  // 급정지: 몸을 뒤로 젖히고 앞발을 뻗어 버틴다
  if (a < -5 && !o.shuffle) {
    const k = Math.min(1, (-a - 5) / 6);
    r = mix(r, { ...r, lF: [44, -12], lB: [-20, -60], lean: -10, crouch: 1, dy: 0 }, k);
  }
  // 첫 발 폭발: 낮게 앞으로 기운다
  if (a > 5 && speed < 5 && !o.back) r.lean += Math.min(12, (a - 5) * 2);
  return r;
}

/**
 * 이 순간의 자세.
 * prog: 한 번 하는 동작의 진행 (0~1), rel: 기록에서 공이 손을 떠난 진행 (없으면 동작 기본값)
 */
export function poseAt(act: number, o: { prog?: number; rel?: number } & Loco): SampledPose {
  const anim = ANIMS[act];
  const loco = locomotion({ ...o, shuffle: o.shuffle || anim?.shuffle });
  // 그냥 서 있는 동작은 움직이면 걷기·달리기 그대로 (팔 흔들기, 몸 기울기)
  if (!anim || (act === ACT.IDLE && o.speed > 0.5)) return { ...loco };
  let p: number;
  if (anim.stepSync && o.speed > 0.5 && o.phase !== undefined) p = frac(o.phase * anim.stepSync + o.seed * 0.29);
  else if (anim.loop) p = frac(o.time * anim.loop + o.seed * 0.29);
  else {
    p = Math.max(0, Math.min(1, o.prog ?? 0.5));
    // 공이 실제로 손을 떠난 때에 키프레임의 '놓는 순간'을 맞춘다
    if (anim.rel && o.rel !== undefined && o.rel > 0.05 && o.rel < 0.98) p = p < o.rel ? (p / o.rel) * anim.rel : anim.rel + ((p - o.rel) / (1 - o.rel)) * (1 - anim.rel);
  }
  const base: Pose = { ...STAND, ...(anim.legsFree ? { lF: loco.lF, lB: loco.lB, dy: loco.dy } : {}), ...anim.base } as Pose;
  const out = sample(anim.keys.map((k) => ({ ...anim.base, ...k })), p, base);
  if (anim.legsFree) {
    // 다리는 걷기 그대로, 빨리 달리면 몸도 그만큼 기운다
    out.lF = loco.lF;
    out.lB = loco.lB;
    if (anim.shuffle) out.ws = loco.ws;
    if (o.speed > 0.5) {
      out.dy = loco.dy;
      out.lean = Math.max(out.lean, loco.lean);
    }
  }
  return out;
}

export function hasTrail(act: number) {
  return !!ANIMS[act]?.trail;
}
