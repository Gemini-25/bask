// 공 물리 (M26): 중력, 림 (고리)·백보드·바닥에 부딪혀 튀고, 바닥에선 구른다.
// 슛이 빗나가면 어디에 어떻게 맞았는지 (앞 림, 뒤 림, 옆 림, 백보드, 에어볼)에 따라 튀는 방향과 세기가 정해지고,
// 그 뒤는 이 물리로 날아간다. 엔진은 0.1초 틱마다 잘게 나눠 (0.02초) 돌린다
import { COURT, MID_Y } from './court';

export const G = 9.8;
export const BALL_R = 0.12;
/** 림 고리 반지름 (안쪽 지름 45cm) */
export const RIM_R = 0.23;
const RIM_E = 0.55;
const BOARD_E = 0.6;
const FLOOR_E = 0.58;
const BOARD_HALF = 0.9;
const BOARD_LO = 2.9;
const BOARD_HI = 3.95;

export interface BallBody {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface Hits {
  rim: number;
  board: number;
  floor: number;
  /** 가장 세게 맞은 속도 (m/s, 림 흔들림·소리용) */
  hard: number;
}

/** 양쪽 골대: 림 가운데 x, 백보드 면 x, 코트 안쪽 방향 */
const HOOPS = [
  { x: COURT.hoopFromBaseline, board: COURT.backboardFromBaseline, dir: 1 },
  { x: COURT.length - COURT.hoopFromBaseline, board: COURT.length - COURT.backboardFromBaseline, dir: -1 },
];

/**
 * dt초 동안 공을 움직인다 (substeps로 잘게). noScore면 빗나간 공이라 림 안으로 떨어지지 않게 고리 쪽으로 튕겨 낸다
 */
export function stepBall(b: BallBody, dt: number, noScore: boolean, hits: Hits, substeps = 5): void {
  const h = dt / substeps;
  for (let s = 0; s < substeps; s++) {
    const pz = b.z;
    b.vz -= G * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
    for (const H of HOOPS) {
      // 백보드: 코트 쪽에서 베이스라인 쪽으로 가다가 면에 닿으면 튕긴다
      const towardBase = H.dir > 0 ? b.vx < 0 : b.vx > 0;
      const past = H.dir > 0 ? b.x - BALL_R < H.board : b.x + BALL_R > H.board;
      if (towardBase && past && Math.abs(b.x - H.board) < 0.35 && Math.abs(b.y - MID_Y) < BOARD_HALF && b.z > BOARD_LO && b.z < BOARD_HI) {
        b.x = H.board + H.dir * BALL_R;
        hits.hard = Math.max(hits.hard, Math.abs(b.vx));
        b.vx = -b.vx * BOARD_E;
        b.vy *= 0.85;
        b.vz *= 0.85;
        hits.board++;
      }
      // 림 고리: 공 가운데에서 가장 가까운 고리 위 점과 부딪힌다
      const dx = b.x - H.x;
      const dy = b.y - MID_Y;
      const dl = Math.hypot(dx, dy);
      if (dl > RIM_R + 0.4 || Math.abs(b.z - COURT.rimHeight) > 0.4) continue;
      const ux = dl > 1e-6 ? dx / dl : 1;
      const uy = dl > 1e-6 ? dy / dl : 0;
      const px = H.x + ux * RIM_R;
      const py = MID_Y + uy * RIM_R;
      const nx = b.x - px;
      const ny = b.y - py;
      const nz = b.z - COURT.rimHeight;
      const nl = Math.hypot(nx, ny, nz);
      if (nl < BALL_R && nl > 1e-6) {
        const kx = nx / nl;
        const ky = ny / nl;
        const kz = nz / nl;
        const vn = b.vx * kx + b.vy * ky + b.vz * kz;
        if (vn < 0) {
          hits.hard = Math.max(hits.hard, -vn);
          b.vx -= (1 + RIM_E) * vn * kx;
          b.vy -= (1 + RIM_E) * vn * ky;
          b.vz -= (1 + RIM_E) * vn * kz;
          // 고리는 둥글어서 옆으로 미끄러지는 힘도 좀 잃는다
          b.vx *= 0.9;
          b.vy *= 0.9;
          hits.rim++;
        }
        b.x = px + kx * BALL_R;
        b.y = py + ky * BALL_R;
        b.z = COURT.rimHeight + kz * BALL_R;
      }
      // 빗나간 공이 고리 안으로 떨어지려 하면 반대편 고리에 맞고 튀어 나온다 (인앤아웃)
      if (noScore && pz >= COURT.rimHeight && b.z < COURT.rimHeight && dl < RIM_R - BALL_R * 0.4) {
        const sp = Math.max(1.3, Math.hypot(b.vx, b.vy));
        const ox = dl > 0.02 ? ux : H.dir;
        const oy = dl > 0.02 ? uy : 0;
        b.vx = ox * sp;
        b.vy = oy * sp;
        b.vz = Math.abs(b.vz) * 0.45 + 0.6;
        b.z = COURT.rimHeight + 0.02;
        hits.rim++;
      }
    }
    // 바닥: 튀다가 힘이 빠지면 구른다
    if (b.z < BALL_R) {
      b.z = BALL_R;
      if (b.vz < 0) {
        if (-b.vz > 0.8) {
          b.vz = -b.vz * FLOOR_E;
          b.vx *= 0.82;
          b.vy *= 0.82;
          hits.floor++;
        } else b.vz = 0;
      }
    }
    if (b.z <= BALL_R + 1e-4 && b.vz === 0) {
      const f = Math.exp(-1.1 * h);
      b.vx *= f;
      b.vy *= f;
    }
  }
}

/** 공이 날아가다 높이 zCatch 아래로 처음 내려오는 자리와 시간 (선수가 그 자리로 간다). 림·백보드도 감안 */
export function predictCatch(b: BallBody, noScore: boolean, zCatch = 2.6, maxT = 3): { x: number; y: number; t: number } {
  const c = { ...b };
  const hits: Hits = { rim: 0, board: 0, floor: 0, hard: 0 };
  let t = 0;
  while (t < maxT) {
    const prevZ = c.z;
    stepBall(c, 0.05, noScore, hits, 3);
    t += 0.05;
    if (c.vz <= 0 && prevZ >= zCatch && c.z < zCatch) return { x: c.x, y: c.y, t };
    if (c.z < zCatch && c.vz <= 0 && t > 0.15) return { x: c.x, y: c.y, t };
  }
  return { x: c.x, y: c.y, t };
}

export type MissKind = 'front' | 'back' | 'side' | 'board' | 'air' | 'hard';
export const MISS_LABEL: Record<MissKind, string> = { front: '앞 림', back: '뒤 림', side: '옆 림', board: '백보드', air: '에어볼', hard: '림을 세게' };

/**
 * 빗나간 슛이 림에 맞은 직후 (M26): 맞은 자리와 튀는 속도.
 * f = 쏜 쪽에서 골대 쪽 단위 벡터, dist = 슛 거리, r = 난수 (0~1 반환 함수)
 */
export function missBounce(kind: MissKind, H: { x: number; y: number }, f: { x: number; y: number }, dist: number, r: () => number): BallBody {
  const lx = -f.y;
  const ly = f.x;
  const side = r() < 0.5 ? -1 : 1;
  // 멀리서 쏜 공일수록 세게 맞아 멀리 튄다
  const pow = 0.8 + Math.min(1.6, dist / 6);
  const at = (fo: number, lo: number, z: number) => ({ x: H.x + f.x * fo + lx * lo, y: H.y + f.y * fo + ly * lo, z });
  const vel = (fv: number, lv: number, vz: number) => ({ vx: f.x * fv + lx * lv, vy: f.y * fv + ly * lv, vz });
  switch (kind) {
    case 'front':
      // 앞 림: 쏜 쪽으로 튀어 나온다
      return { ...at(-RIM_R - BALL_R * 0.6, (r() - 0.5) * 0.2, COURT.rimHeight + 0.08), ...vel(-(1.2 + r() * 1.4) * pow, (r() - 0.5) * 1.6, 1.4 + r() * 1.8) };
    case 'back':
      // 뒤 림: 높이 솟아 앞으로 넘어오거나 백보드 쪽
      return { ...at(RIM_R + BALL_R * 0.6, (r() - 0.5) * 0.2, COURT.rimHeight + 0.08), ...vel((r() < 0.55 ? -1 : 0.4) * (0.6 + r() * 1.1) * pow, (r() - 0.5) * 1.8, 2.4 + r() * 2.0) };
    case 'side':
      return { ...at(0, side * (RIM_R + BALL_R * 0.6), COURT.rimHeight + 0.08), ...vel(-(0.3 + r() * 0.8) * pow, side * (1.0 + r() * 1.6) * pow, 1.2 + r() * 1.8) };
    case 'board':
      // 백보드를 맞고 쏜 쪽으로 길게
      return { ...at(-0.1, (r() - 0.5) * 0.5, COURT.rimHeight + 0.35), ...vel(-(1.6 + r() * 1.4) * pow, (r() - 0.5) * 2.0, 0.6 + r() * 1.2) };
    case 'hard':
      // 덩크·림을 세게: 위로 크게 튄다
      return { ...at(RIM_R * 0.5, (r() - 0.5) * 0.3, COURT.rimHeight + 0.15), ...vel(-(0.8 + r() * 1.6), (r() - 0.5) * 2.4, 3.2 + r() * 1.8) };
    case 'air':
    default:
      // 에어볼: 림에 닿지도 않고 지나가거나 못 미친다
      return { ...at((r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), (r() - 0.5) * 1.2, COURT.rimHeight - 0.2), ...vel(1.5 + r(), (r() - 0.5) * 1.2, -2.5) };
  }
}

/** 빗나간 슛의 종류 고르기: 먼 슛은 앞뒤 림, 골밑 슛은 백보드·옆 림, 덩크는 세게, 견제가 심한 먼 슛은 가끔 에어볼 */
export function pickMiss(shot: 'dunk' | 'layup' | 'floater' | 'hook' | 'mid' | 'three', dist: number, contest: number, angle: number, r: () => number): MissKind {
  if (shot === 'dunk') return r() < 0.7 ? 'hard' : 'back';
  const air = shot === 'three' || shot === 'mid' ? Math.min(0.08, 0.005 + contest * 0.05 + Math.max(0, dist - 8) * 0.01) : 0.004;
  // 비스듬한 각도 (옆에서)일수록 백보드
  const board = shot === 'layup' || shot === 'hook' || shot === 'floater' ? 0.3 + angle * 0.15 : 0.04 + angle * 0.08;
  const w: [MissKind, number][] = [
    ['air', air],
    ['board', board],
    ['front', shot === 'layup' ? 0.22 : 0.36],
    ['back', shot === 'layup' ? 0.18 : 0.34],
    ['side', 0.22],
  ];
  const sum = w.reduce((a, [, v]) => a + v, 0);
  let x = r() * sum;
  for (const [k, v] of w) {
    x -= v;
    if (x <= 0) return k;
  }
  return 'front';
}
