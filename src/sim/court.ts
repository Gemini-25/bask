// FIBA 코트 규격 (미터). 1칸 = 1m 로 생각하면 28 × 15 칸.
export const COURT = {
  length: 28,
  width: 15,
  hoopFromBaseline: 1.575,
  threeRadius: 6.75,
  threeCornerFromSide: 0.9,
  keyWidth: 4.9,
  keyLength: 5.8,
  ftLineFromBaseline: 5.8,
  restrictedRadius: 1.25,
  centerCircleRadius: 1.8,
  rimHeight: 3.05,
  backboardFromBaseline: 1.2,
} as const;

export const MID_Y = COURT.width / 2;
const CORNER_V = MID_Y - COURT.threeCornerFromSide; // 6.6
/** 코너 3점 직선 구간이 끝나는 지점 (베이스라인에서 거리) */
export const CORNER_U = COURT.hoopFromBaseline + Math.sqrt(COURT.threeRadius ** 2 - CORNER_V ** 2);

/**
 * 공격 방향 기준 좌표.
 * u: 공격하는 골대 쪽 베이스라인에서의 거리 (0 = 베이스라인, 14 = 하프라인)
 * v: 코트 가운데 선에서 옆으로 (-7.5 ~ 7.5)
 */
export function toWorld(attackRight: boolean, u: number, v: number): { x: number; y: number } {
  return { x: attackRight ? COURT.length - u : u, y: MID_Y + v };
}

export function toLocal(attackRight: boolean, x: number, y: number): { u: number; v: number } {
  return { u: attackRight ? COURT.length - x : x, v: y - MID_Y };
}

export function hoopXY(attackRight: boolean): { x: number; y: number } {
  return toWorld(attackRight, COURT.hoopFromBaseline, 0);
}

/** 3점 라인 밖인가 (u, v는 공격 방향 기준) */
export function isThreeLocal(u: number, v: number): boolean {
  if (u <= CORNER_U) return Math.abs(v) >= CORNER_V;
  return Math.hypot(u - COURT.hoopFromBaseline, v) >= COURT.threeRadius;
}

export function inBounds(x: number, y: number, margin = 0): boolean {
  return x >= margin && x <= COURT.length - margin && y >= margin && y <= COURT.width - margin;
}
