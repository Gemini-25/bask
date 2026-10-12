// 부위별 도트 캐릭터 (G4, G6 → M21 다시 그림): 머리·몸통·위팔·아래팔·허벅지·정강이·손·신발을 코드로 찍는다.
// 동작은 anims.ts의 키프레임 (관절 각도). 공을 들고 있으면 손 위치에 공을 그린다.
// 2.5~3등신 치비. 키가 크면 다리·몸통·팔이 길다. scale로 작게 그릴 수 있다 (경기 밖 화면).

import type { Player } from '../data/player';
import { BENCH_SIT, BENCH_UP, poseAt, type BallAt } from './anims';
import { drawDigits, shade } from './pixel';

export const SKIN = ['#f6d2b0', '#e8b48a', '#c98d5f', '#8d5a3b', '#5a3a26'];
export const HAIR = ['#1c1714', '#4a2f1e', '#8a5a2b', '#d9b25a', '#b33b2e'];
export const SHOE = ['#f2f2f2', '#1b1b1b', '#e8473d', '#3d8fe0', '#f2cc2e', '#7a5cd6'];

export type Facing = 'side' | 'front' | 'back';

export interface Kit {
  jersey: string;
  trim: string;
}

/** 캐릭터 한 명을 그리는 데 필요한 정보 */
export interface Figure {
  pl: Player;
  kit: Kit;
  facing: Facing;
  /** side일 때 왼쪽을 보면 true */
  flip: boolean;
  act: number;
  /** 이동 속도 (m/s) */
  speed: number;
  /** 점프 높이 (px) */
  lift: number;
  /** 애니메이션 시계 (초): 되풀이 동작 (달리기, 드리블)에 쓴다 */
  time: number;
  /** 같은 동작에서 선수마다 박자가 다르게 */
  seed: number;
  tired: boolean;
  /** 한 번 하는 동작의 진행 0~1 (M21). 없으면 time으로 짐작 */
  prog?: number;
  /** 공이 손을 떠난 진행 (슛·덩크 키프레임을 맞춘다) */
  rel?: number;
  /** 공을 쥐고 있다: 손 위치에 공을 그린다 */
  carry?: boolean;
  /** 크기 (1 = 경기 화면) */
  scale?: number;
  /** 잔상 (테두리 없이) */
  ghost?: boolean;
}

export interface Rig {
  /** 머리 꼭대기 y */
  top: number;
  /** 그린 공 위치 (carry일 때) */
  ball: { x: number; y: number } | null;
  handF: { x: number; y: number };
  handB: { x: number; y: number };
}

const D = Math.PI / 180;

function sizes(pl: Player, s: number) {
  const h = pl.body.heightCm;
  const L = Math.max(5, Math.round(Math.max(7, Math.min(12, 7 + (h - 178) / 6.4)) * s));
  const T = Math.max(5, Math.round((h >= 200 ? 11 : 10) * s));
  const W = Math.max(6, Math.round((pl.body.weightKg >= 104 ? 13 : pl.body.weightKg >= 90 ? 12 : 11) * s));
  const R = Math.max(3, Math.round(6 * s));
  const arm = Math.max(3, Math.round((h >= 200 ? 6 : 5) * s));
  return { L, thigh: Math.ceil(L / 2), shin: L - Math.ceil(L / 2), T, W, R, Lu: arm, Lf: arm };
}

/** 서서 팔을 위로 뻗었을 때 손끝 높이 (px, 위로 든 팔은 늘어난다): 덩크 때 림에 손이 닿게 화면에서 맞춘다 */
export function reachPx(pl: Player, scale = 1) {
  const z = sizes(pl, scale);
  return z.L + z.T + z.Lu + Math.round(1.5 * scale) + z.Lf + Math.round(4 * scale) - 1;
}

/** 테두리 색 (도트 캐릭터 외곽선) */
export const OUTLINE = '#2a1c15';

/** 굵기 w px 선 */
function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w = 2) {
  ctx.fillStyle = color;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  const o = Math.floor(w / 2);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    ctx.fillRect(x - o, y - o, w, w);
  }
}


/** 돌린 직사각형: 원점 o에서 축 u 방향으로 a0~a1, 옆(n)으로 b0~b1 */
function rotRect(ctx: CanvasRenderingContext2D, ox: number, oy: number, ux: number, uy: number, a0: number, a1: number, b0: number, b1: number, color: (a: number, b: number) => string | null) {
  const nx = -uy;
  const ny = ux;
  const pts = [
    [a0, b0],
    [a0, b1],
    [a1, b0],
    [a1, b1],
  ].map(([a, b]) => [ox + ux * a + nx * b, oy + uy * a + ny * b]);
  const x0 = Math.floor(Math.min(...pts.map((p) => p[0])));
  const x1 = Math.ceil(Math.max(...pts.map((p) => p[0])));
  const y0 = Math.floor(Math.min(...pts.map((p) => p[1])));
  const y1 = Math.ceil(Math.max(...pts.map((p) => p[1])));
  let cur = '';
  for (let py = y0; py <= y1; py++)
    for (let px = x0; px <= x1; px++) {
      const rx = px + 0.5 - ox;
      const ry = py + 0.5 - oy;
      const a = rx * ux + ry * uy;
      const b = rx * nx + ry * ny;
      if (a < a0 || a >= a1 || b < b0 || b >= b1) continue;
      const c = color(a, b);
      if (!c) continue;
      if (c !== cur) {
        ctx.fillStyle = c;
        cur = c;
      }
      ctx.fillRect(px, py, 1, 1);
    }
}

export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, small = false) {
  const bx = Math.round(x);
  const by = Math.round(y);
  if (small) {
    ctx.fillStyle = '#6b2a08';
    ctx.fillRect(bx - 2, by - 1, 4, 3);
    ctx.fillRect(bx - 1, by - 2, 2, 5);
    ctx.fillStyle = '#f07a24';
    ctx.fillRect(bx - 1, by - 1, 2, 2);
    return;
  }
  ctx.fillStyle = '#6b2a08';
  ctx.fillRect(bx - 2, by - 1, 5, 3);
  ctx.fillRect(bx - 1, by - 2, 3, 5);
  ctx.fillStyle = '#f07a24';
  ctx.fillRect(bx - 1, by - 1, 3, 3);
  ctx.fillStyle = '#ffb877';
  ctx.fillRect(bx - 1, by - 1, 1, 1);
}

/** 그림 (발이 땅에 닿는 화면 좌표 x, y). 반환값: 머리 꼭대기 y */
export function drawFigure(ctx: CanvasRenderingContext2D, x: number, y: number, f: Figure): number {
  return drawFigureRig(ctx, x, y, f).top;
}

export function drawFigureRig(ctx: CanvasRenderingContext2D, x: number, y: number, f: Figure): Rig {
  const s = f.scale ?? 1;
  const pl = f.pl;
  const z = sizes(pl, s);
  const pose = poseAt(f.act, { prog: f.prog, rel: f.rel, time: f.time, speed: f.speed, seed: f.seed });
  // 바라보는 방향: 동작이 정한 게 있으면 그걸로
  let facing: Facing = f.facing;
  let flip = f.flip;
  const fm = pose.face;
  if (fm === 'front' || fm === 'back') facing = fm;
  else if (fm === 'side') facing = 'side';
  else if (fm === 'away') {
    if (facing === 'side') flip = !flip;
    else facing = facing === 'front' ? 'back' : 'front';
  } else if (fm === 'spin') {
    const k = Math.floor((((pose.rot % 1) + 1) % 1) * 4);
    const seq: [Facing, boolean][] = [
      ['side', flip],
      ['front', flip],
      ['side', !flip],
      ['back', flip],
    ];
    [facing, flip] = seq[k];
  }
  const dir = flip ? -1 : 1;
  const side = facing === 'side';

  const skin = SKIN[pl.look.skin % SKIN.length];
  const skinD = shade(skin, -0.2);
  const hairC = HAIR[pl.look.hairColor % HAIR.length];
  const shoe = SHOE[pl.look.shoe % SHOE.length];
  const jersey = f.kit.jersey;
  const shorts = shade(jersey, -0.28);
  const trim = f.kit.trim;
  const sleeve = pl.look.sleeve;

  // 엉덩이 높이: 땅에 있으면 더 펴진 다리가 땅에 닿고, 떠 있으면 다리를 접어도 몸은 그대로
  const ext = (l: readonly [number, number]) => z.thigh * Math.cos(l[0] * D) + z.shin * Math.cos((l[0] + l[1]) * D);
  const stance = Math.max(ext(pose.lF), ext(pose.lB));
  const airK = Math.max(0, Math.min(1, f.lift / (6 * s)));
  const hipH = stance + (z.L - stance) * airK - pose.crouch * s;
  const rootX = Math.round(x + pose.dx * s * dir);
  const groundY = Math.round(y);
  const hipY = groundY - f.lift - hipH + pose.dy * s;
  const lean = pose.lean * D;

  // 몸통 축
  let ux: number;
  let uy: number;
  if (side) {
    ux = Math.sin(lean) * dir;
    uy = -Math.cos(lean);
  } else {
    ux = 0;
    uy = -Math.max(0.55, Math.cos(lean));
  }
  const hipX = rootX;
  const shX = hipX + ux * (z.T - 1);
  const shY = hipY + uy * (z.T - 1);

  // 팔다리 끝 위치 계산
  type V = { x: number; y: number };
  const sgF = side ? 0 : facing === 'front' ? dir : -dir;
  const lat = (a: number, len: number, w: number) => Math.abs(Math.sin(a)) * len * (w >= 0 ? 0.25 + 0.75 * w : 0.25 + 1.6 * w);
  const limb = (o: V, ang: readonly [number, number], l1: number, l2: number, w: number, sg: number, arm = false, w2 = w): [V, V, number] => {
    const a = ang[0] * D;
    const b = (ang[0] + ang[1]) * D;
    if (arm) {
      // 치비라 머리가 커서, 위로 든 팔은 늘려야 머리 위로 손이 나온다
      const upA = Math.max(0, Math.min(1, (-Math.cos(a) - 0.1) / 0.8));
      const upB = Math.max(0, Math.min(1, (-Math.cos(b) - 0.1) / 0.8));
      l1 += Math.round(upA * 1.5 * s);
      l2 += Math.round(upB * 4 * s);
    }
    if (side) {
      const m = { x: o.x + Math.sin(a) * l1 * dir, y: o.y + Math.cos(a) * l1 };
      return [m, { x: m.x + Math.sin(b) * l2 * dir, y: m.y + Math.cos(b) * l2 }, Math.sin(b)];
    }
    const m = { x: o.x + sg * lat(a, l1, w), y: o.y + Math.cos(a) * l1 };
    return [m, { x: m.x + sg * lat(b, l2, w2), y: m.y + Math.cos(b) * l2 }, Math.sin(b)];
  };
  const halfW = Math.floor(z.W / 2);
  const shoulderF: V = side ? { x: shX + dir, y: shY + 2 * s } : { x: shX + sgF * (halfW - 0.5), y: shY + 2 * s };
  const shoulderB: V = side ? { x: shX - dir, y: shY + 2 * s } : { x: shX - sgF * (halfW - 0.5), y: shY + 2 * s };
  const [elF, handF, fwdF] = limb(shoulderF, pose.aF, z.Lu, z.Lf, pose.wF, sgF, true, pose.wFe ?? pose.wF);
  const [elB, handB, fwdB] = limb(shoulderB, pose.aB, z.Lu, z.Lf, pose.wB, -sgF, true, pose.wBe ?? pose.wB);
  const legOff = side ? 0 : Math.max(2, Math.round((pose.ws * s) / 2 + z.W / 5));
  const hipF: V = { x: hipX + (side ? 0 : sgF * legOff), y: hipY };
  const hipB: V = { x: hipX - (side ? 0 : sgF * legOff), y: hipY };
  const [knF, ftF] = limb(hipF, pose.lF, z.thigh, z.shin, 0.2, sgF);
  const [knB, ftB] = limb(hipB, pose.lB, z.thigh, z.shin, 0.2, -sgF);

  // 공 위치
  const anchor = (b: BallAt | undefined): (V & { behind: boolean }) | null => {
    if (!b) return null;
    if (b === 'F' || b === 'B') {
      const h = b === 'F' ? handF : handB;
      const e = b === 'F' ? elF : elB;
      const fwd = b === 'F' ? fwdF : fwdB;
      const dx = h.x - e.x;
      const dy = h.y - e.y;
      const n = Math.hypot(dx, dy) || 1;
      // 옆모습에선 뒷손 공은 몸 뒤, 정면·뒷모습에선 손이 몸 뒤로 가면 몸 뒤
      const behind = side ? b === 'B' : facing === 'front' ? fwd < -0.25 : fwd > 0.25;
      return { x: h.x + (dx / n) * 2 * s, y: h.y + (dy / n) * 2 * s, behind };
    }
    if (b === 'FB') {
      const behind = !side && facing === 'back' && fwdF > 0.25;
      return { x: (handF.x + handB.x) / 2 + (side ? dir * 2 * s : 0), y: (handF.y + handB.y) / 2 + (side ? 0 : 1), behind };
    }
    const [fw, h, l = 0, bh = false] = b;
    const px = side ? rootX + fw * s * dir : rootX + l * s * (facing === 'front' ? dir : -dir);
    return { x: px, y: groundY - h * s - 2, behind: facing === 'back' ? !bh && fw > 0 : bh };
  };
  let ball: (V & { behind: boolean }) | null = null;
  if (f.carry) {
    const [b0, b1, k] = pose.ball2 ?? [pose.ball, pose.ball, 0];
    const p0 = anchor(b0 ?? b1 ?? 'F');
    const p1 = anchor(b1 ?? b0 ?? 'F');
    if (p0 && p1) ball = { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k, behind: k < 0.5 ? p0.behind : p1.behind };
  }
  const small = s < 0.8;
  const drawBallHere = () => ball && drawBall(ctx, ball.x, ball.y, small);

  const thick = small ? 2 : 3;
  const armW = 2;
  const ol = !small && !f.ghost;
  const drawLeg = (hip: V, kn: V, ft: V, col: string) => {
    const fx = Math.round(ft.x);
    const fy = Math.round(ft.y);
    const w = side ? (small ? 4 : 5) : 3;
    const sx0 = side ? (dir > 0 ? fx - 1 : fx - w + 2) : fx - 1;
    if (ol) {
      line(ctx, hip.x, hip.y, kn.x, kn.y, OUTLINE, thick + 2);
      line(ctx, kn.x, kn.y, ft.x, ft.y, OUTLINE, 4);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(sx0 - 1, fy - 1, w + 2, 4);
    }
    line(ctx, hip.x, hip.y, kn.x, kn.y, col, thick);
    line(ctx, kn.x, kn.y, ft.x, ft.y, col, small ? 1 : 2);
    // 양말 + 신발
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(fx - 1, fy - 1, 2, 1);
    ctx.fillStyle = shoe;
    ctx.fillRect(sx0, fy, w, 2);
    ctx.fillStyle = shade(shoe, -0.35);
    ctx.fillRect(sx0, fy + 1, w, 1);
  };
  const drawArm = (sh: V, el: V, hd: V, col: string) => {
    if (ol) {
      line(ctx, sh.x, sh.y, el.x, el.y, OUTLINE, armW + 2);
      line(ctx, el.x, el.y, hd.x, hd.y, OUTLINE, armW + 2);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(Math.round(hd.x) - 2, Math.round(hd.y) - 2, 4, 4);
    }
    line(ctx, sh.x, sh.y, el.x, el.y, sleeve ? trim : col, armW);
    line(ctx, el.x, el.y, hd.x, hd.y, col, armW);
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(hd.x) - 1, Math.round(hd.y) - 1, 2, 2);
  };

  // ── 몸통 그리기 함수
  const drawTorso = () => {
    if (side) {
      const depth = Math.max(4, Math.round(z.W * 0.72));
      const hb = depth / 2;
      if (ol) rotRect(ctx, hipX, hipY, ux, uy, -4 * s - 1, z.T + 1, -hb - 1.5, hb + 1.5, () => OUTLINE);
      // 반바지
      rotRect(ctx, hipX, hipY, ux, uy, -4 * s, 1, -hb - 0.5, hb + 0.5, (a) => (a < -3 * s ? shade(shorts, -0.25) : shorts));
      // 유니폼
      rotRect(ctx, hipX, hipY, ux, uy, 0, z.T, -hb, hb, (a, b) => {
        if (a < 1) return trim;
        if (a >= z.T - 1) return shade(jersey, 0.25);
        if (b * dir > hb - 1.5 && a > 2) return trim;
        return jersey;
      });
    } else {
      const top = Math.round(shY);
      const h = Math.max(3, Math.round(hipY - shY + 1));
      const left = Math.round(hipX - z.W / 2);
      if (ol) {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(left - 1, top - 1, z.W + 2, h + 1);
        ctx.fillRect(left - 2, Math.round(hipY) - 2, z.W + 4, Math.round(5 * s) + 2);
      }
      ctx.fillStyle = shorts;
      ctx.fillRect(left - 1, Math.round(hipY) - 1, z.W + 2, Math.round(5 * s));
      ctx.fillStyle = shade(shorts, -0.25);
      ctx.fillRect(left - 1, Math.round(hipY) - 1 + Math.round(5 * s) - 1, z.W + 2, 1);
      ctx.fillStyle = jersey;
      ctx.fillRect(left, top, z.W, h);
      ctx.fillStyle = shade(jersey, 0.25);
      ctx.fillRect(left, top, z.W, 1);
      ctx.fillStyle = trim;
      ctx.fillRect(left, Math.round(hipY) - 1, z.W, 1);
      ctx.fillRect(left, top, 1, 3);
      ctx.fillRect(left + z.W - 1, top, 1, 3);
      if (h >= 7 && !small) drawDigits(ctx, String(pl.number), hipX + 0.5, top + 2, trim);
    }
  };

  // ── 머리
  const hx = Math.round(shX + ux * (z.R + 1) + (side ? dir : 0));
  const hy = Math.round(shY + uy * (z.R + 1) - (side ? 0 : 0));
  const R = z.R;
  const drawHead = () => {
    if (ol) {
      ctx.fillStyle = OUTLINE;
      const r1 = R + 1;
      for (let dy = -r1; dy <= r1; dy++) {
        const half = Math.floor(Math.sqrt(Math.max(0, r1 * r1 - dy * dy + r1 * 0.9)));
        ctx.fillRect(hx - half, hy + dy, half * 2 + 1, 1);
      }
    }
    ctx.fillStyle = skin;
    for (let dy = -R; dy <= R; dy++) {
      const half = Math.floor(Math.sqrt(R * R - dy * dy + R * 0.9));
      ctx.fillRect(hx - half, hy + dy, half * 2 + 1, 1);
    }
    ctx.fillStyle = skinD;
    ctx.fillRect(hx - Math.floor(R / 2), hy + R, R + 1, 1);
    if (side) {
      // 코
      ctx.fillStyle = skinD;
      ctx.fillRect(hx + dir * (R + 1) - (dir < 0 ? 0 : 0), hy + 1, 1, 1);
    }
    drawHair(ctx, hx, hy, R, pl.look.hair, hairC, facing, dir);
    if (pl.look.headband) {
      ctx.fillStyle = trim;
      ctx.fillRect(hx - R, hy - Math.ceil(R / 3), R * 2 + 1, Math.max(1, Math.round(s * 1.5)));
    }
    if (facing === 'back') return;
    ctx.fillStyle = '#1b1410';
    const ey = hy + (small ? 0 : 1);
    const eyes = side ? [hx + dir * (R - 2)] : [hx - Math.ceil(R / 2), hx + Math.ceil(R / 2)];
    for (const ex of eyes) {
      const e = pose.eyes;
      if (e === 'dizzy') {
        ctx.fillRect(ex - 1, ey, 1, 1);
        ctx.fillRect(ex, ey + 1, 1, 1);
        ctx.fillRect(ex + 1, ey, 1, 1);
      } else if (e === 'happy') {
        ctx.fillRect(ex - 1, ey + 1, 1, 1);
        ctx.fillRect(ex, ey, 1, 1);
        ctx.fillRect(ex + 1, ey + 1, 1, 1);
      } else if (e === 'sad') {
        ctx.fillRect(ex, ey + 1, 1, 1);
        ctx.fillRect(ex + (ex < hx ? -1 : 1), ey, 1, 1);
      } else if (e === 'angry') {
        ctx.fillRect(ex, ey, 1, 2);
        ctx.fillRect(ex + (side ? -dir : ex < hx ? -1 : 1), ey - 1, 1, 1);
      } else ctx.fillRect(ex, ey, 1, e === 'focus' ? 1 : 2);
    }
    if (pose.eyes === 'happy' && !small) {
      ctx.fillStyle = '#ff9a8a';
      for (const ex of eyes) ctx.fillRect(ex + (side ? dir : ex < hx ? -1 : 1), ey + 2, 1, 1);
    }
    if (pose.mouth && !small) {
      const mx = side ? hx + dir * (R - 3) : hx;
      ctx.fillStyle = pose.eyes === 'angry' ? '#7a1f1a' : '#a8423a';
      ctx.fillRect(mx - (side ? 0 : 1), hy + R - 2, side ? 1 : 2, pose.eyes === 'angry' ? 2 : 1);
    }
  };

  // ── 그리는 순서
  const armCol = (back: boolean) => (back && side ? skinD : skin);
  if (side) {
    drawLeg(hipB, knB, ftB, skinD);
    drawArm(shoulderB, elB, handB, armCol(true));
    if (ball?.behind) drawBallHere();
    drawLeg(hipF, knF, ftF, skin);
    drawTorso();
    drawHead();
    drawArm(shoulderF, elF, handF, armCol(false));
    if (ball && !ball.behind) drawBallHere();
  } else {
    const front = facing === 'front';
    // 몸 뒤로 간 팔 (정면: 앞으로 뻗은 정도가 음수, 뒷모습: 양수)
    const behindF = front ? fwdF < -0.25 : fwdF > 0.25;
    const behindB = front ? fwdB < -0.25 : fwdB > 0.25;
    if (ball?.behind) drawBallHere();
    if (behindF) drawArm(shoulderF, elF, handF, skinD);
    if (behindB) drawArm(shoulderB, elB, handB, skinD);
    drawLeg(hipB, knB, ftB, skin);
    drawLeg(hipF, knF, ftF, skin);
    drawTorso();
    drawHead();
    if (!behindF) drawArm(shoulderF, elF, handF, skin);
    if (!behindB) drawArm(shoulderB, elB, handB, skin);
    if (ball && !ball.behind) drawBallHere();
  }
  // 땀방울
  if (f.tired && Math.sin(f.time * 3 + f.seed) > 0.3) {
    ctx.fillStyle = '#9fd8ff';
    ctx.fillRect(hx + (side ? -dir * (R - 1) : R - 1), hy - R + 2, 1, 2);
  }
  return { top: hy - R - 2, ball: ball ? { x: ball.x, y: ball.y } : null, handF, handB };
}

function drawHair(ctx: CanvasRenderingContext2D, hx: number, hy: number, R: number, style: number, color: string, facing: Facing, dir: number) {
  ctx.fillStyle = color;
  const back = facing === 'back';
  const top = (rows: number) => {
    for (let dy = -R; dy < -R + rows; dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, R * R - dy * dy + R * 0.9)));
      ctx.fillRect(hx - half, hy + dy, half * 2 + 1, 1);
    }
  };
  const backFill = (rows: number) => {
    for (let dy = -R; dy < -R + rows; dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, R * R - dy * dy + R * 0.9)));
      ctx.fillRect(hx - half, hy + dy, half * 2 + 1, 1);
    }
  };
  const sideBack = (rows: number) => {
    // 옆모습: 뒤통수 쪽 절반
    for (let dy = -R; dy < -R + rows; dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, R * R - dy * dy + R * 0.9)));
      if (dir > 0) ctx.fillRect(hx - half, hy + dy, half, 1);
      else ctx.fillRect(hx + 1, hy + dy, half, 1);
    }
  };
  switch (style % 7) {
    case 0: // 짧은 머리
      top(Math.ceil(R * 0.55));
      if (back) backFill(R + 3);
      else if (facing === 'side') sideBack(R + 2);
      else {
        ctx.fillRect(hx - R, hy - R + 2, 1, 3);
        ctx.fillRect(hx + R, hy - R + 2, 1, 3);
      }
      break;
    case 1: // 삭발에 가까운 짧은 머리
      ctx.globalAlpha = 0.85;
      top(2);
      if (back) backFill(R + 1);
      else if (facing === 'side') sideBack(R);
      ctx.globalAlpha = 1;
      break;
    case 2: {
      // 아프로
      const rr = R + 2;
      for (let dy = -rr; dy <= 0; dy++) {
        const half = Math.floor(Math.sqrt(rr * rr - dy * dy + rr));
        ctx.fillRect(hx - half, hy + dy - 1, half * 2 + 1, 1);
      }
      if (back) backFill(R * 2);
      else if (facing === 'side') sideBack(R + 3);
      break;
    }
    case 3: // 뾰족 머리
      top(Math.ceil(R * 0.5));
      for (let k = -2; k <= 2; k++) ctx.fillRect(hx + k * Math.ceil(R / 2.5), hy - R - 2, 1, 2);
      if (back) backFill(R + 2);
      else if (facing === 'side') sideBack(R + 1);
      break;
    case 4: {
      // 묶은 머리
      top(Math.ceil(R * 0.55));
      if (back) backFill(R + 3);
      else if (facing === 'side') sideBack(R + 2);
      const px = facing === 'side' ? hx - dir * (R + 1) : hx;
      ctx.fillRect(px - 1, hy - 1, 3, R);
      break;
    }
    case 5: // 대머리 (반짝)
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(hx - 2, hy - R + 1, 3, 1);
      break;
    case 6: // 모히칸
      ctx.fillRect(hx - 1, hy - R - 3, 3, R + 2);
      break;
  }
}

/** 벤치 선수. cheer면 일어나서 팔을 든다 */
export function drawBenchFigure(ctx: CanvasRenderingContext2D, x: number, y: number, pl: Player, kit: Kit, cheer: boolean, time: number, scale = 0.8) {
  drawFigureRig(ctx, x, y, { pl, kit, facing: 'front', flip: false, act: cheer ? BENCH_UP : BENCH_SIT, speed: 0, lift: 0, time: time + pl.number * 0.13, seed: pl.number, tired: false, scale });
}
