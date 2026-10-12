// 부위별 도트 캐릭터 (G4, G6): 머리·머리카락·몸통·등번호·팔·다리·신발을 코드로 찍고,
// 관절 각도로 동작을 만든다. 2.5~3등신 치비, 키 차이가 보이게 다리·몸통 길이가 다르다.

import type { Player } from '../data/player';
import { ACT } from '../sim/types';
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
  /** 애니메이션 시계 (초) */
  time: number;
  /** 같은 동작에서 선수마다 박자가 다르게 */
  seed: number;
  /** 0~1, 지친 정도 표시 (땀) */
  tired: boolean;
}

interface Limb {
  /** 0 = 아래, π/2 = 앞, π = 위 */
  a: number;
  len: number;
}

interface Pose {
  armF: Limb;
  armB: Limb;
  legF: Limb;
  legB: Limb;
  crouch: number;
  lean: number;
  bob: number;
  eyes: 'open' | 'dizzy' | 'happy' | 'focus' | 'sad' | 'angry';
  /** 정면/뒷모습에서 팔을 몸 앞에 모은다 (스크린) */
  crossed?: boolean;
}

function sizes(pl: Player) {
  const h = pl.body.heightCm;
  const leg = Math.round(4 + (h - 178) / 8); // 178cm → 4px, 210cm → 8px
  const torso = h >= 200 ? 7 : 6;
  const w = pl.body.weightKg >= 104 ? 9 : pl.body.weightKg >= 90 ? 8 : 7;
  return { leg: Math.max(4, Math.min(8, leg)), torso, w };
}

function poseFor(f: Figure, leg: number): Pose {
  const t = f.time + f.seed * 0.37;
  const run = f.speed > 0.5;
  const cyc = t * (5 + f.speed * 1.4);
  const sw = run ? Math.sin(cyc) * Math.min(0.8, 0.25 + f.speed * 0.1) : 0;
  // 뒤로 차는 다리는 무릎이 굽어서 짧아 보인다
  const knee = (a: number) => (run && a < -0.2 ? leg - 1 : leg);
  const base: Pose = {
    armF: { a: 0.15 - sw * 0.8, len: 5 },
    armB: { a: 0.1 + sw * 0.8, len: 5 },
    legF: { a: sw, len: knee(sw) },
    legB: { a: -sw, len: knee(-sw) },
    crouch: 0,
    lean: run && f.speed > 3 ? 1 : 0,
    bob: run ? (Math.abs(Math.sin(cyc)) > 0.7 ? 1 : 0) : Math.sin(t * 2.2) > 0.6 ? 1 : 0,
    eyes: 'open',
  };
  const air = f.lift > 1;
  switch (f.act) {
    case ACT.DRIBBLE: {
      const bounce = Math.abs(Math.sin(t * Math.PI * 1.7));
      base.armF = { a: 0.55 + bounce * 0.35, len: 5 };
      base.armB = { a: 0.9, len: 4 };
      base.crouch = 1;
      base.eyes = 'focus';
      break;
    }
    case ACT.HOLD:
    case ACT.POST:
      base.armF = { a: 1.25, len: 4 };
      base.armB = { a: 1.15, len: 4 };
      base.crouch = f.act === ACT.POST ? 2 : 1;
      if (f.act === ACT.POST) base.lean = -1;
      base.eyes = 'focus';
      break;
    case ACT.FT: {
      const bounce = Math.abs(Math.sin(t * Math.PI * 1.2));
      base.armF = { a: 0.4 + bounce * 0.4, len: 5 };
      base.armB = { a: 0.4, len: 5 };
      base.crouch = 1;
      base.eyes = 'focus';
      break;
    }
    case ACT.SHOOT: {
      const up = air ? 3.0 : 2.4;
      base.armF = { a: up, len: 5 };
      base.armB = { a: up - 0.25, len: 4 };
      base.legF = { a: air ? 0.15 : 0, len: leg };
      base.legB = { a: air ? -0.1 : 0, len: leg };
      base.crouch = air ? 0 : 1;
      base.eyes = 'focus';
      break;
    }
    case ACT.LAYUP:
      base.armF = { a: 2.9, len: 5 };
      base.armB = { a: 0.7, len: 4 };
      base.legF = { a: 1.25, len: leg - 1 };
      base.legB = { a: -0.25, len: leg };
      break;
    case ACT.DUNK:
      base.armF = { a: 3.05, len: 6 };
      base.armB = { a: 1.4, len: 4 };
      base.legF = { a: 0.9, len: leg - 1 };
      base.legB = { a: 0.35, len: leg - 1 };
      base.eyes = 'focus';
      break;
    case ACT.HANG:
      base.armF = { a: 3.1, len: 6 };
      base.armB = { a: 3.0, len: 6 };
      base.legF = { a: 0.25, len: leg };
      base.legB = { a: -0.15, len: leg };
      base.eyes = 'happy';
      break;
    case ACT.PASS:
      base.armF = { a: 1.6, len: 6 };
      base.armB = { a: 1.45, len: 5 };
      base.lean = 1;
      break;
    case ACT.REBOUND:
    case ACT.BLOCK:
      base.armF = { a: 3.0, len: 6 };
      base.armB = { a: f.act === ACT.BLOCK ? 2.2 : 2.9, len: 5 };
      base.legF = { a: 0.25, len: leg };
      base.legB = { a: -0.2, len: leg };
      base.eyes = 'focus';
      break;
    case ACT.CONTEST:
      base.armF = { a: 2.85, len: 6 };
      base.armB = { a: 1.3, len: 4 };
      break;
    case ACT.STANCE: {
      base.armF = { a: 1.15, len: 5 };
      base.armB = { a: 0.95, len: 5 };
      // 움직이면 옆걸음 (다리를 벌렸다 모았다)
      const slide = run ? Math.abs(Math.sin(cyc * 0.8)) * 0.35 : 0;
      base.legF = { a: 0.3 + slide, len: leg };
      base.legB = { a: -0.3 - slide, len: leg };
      base.crouch = 2;
      base.lean = 0;
      base.bob = 0;
      base.eyes = 'focus';
      break;
    }
    case ACT.STEAL:
      base.armF = { a: 1.5, len: 7 };
      base.armB = { a: 0.6, len: 4 };
      base.legF = { a: 0.9, len: leg };
      base.legB = { a: -0.5, len: leg };
      base.crouch = 2;
      base.lean = 2;
      base.eyes = 'focus';
      break;
    case ACT.BOXOUT:
      base.armF = { a: 1.0, len: 5 };
      base.armB = { a: 1.0, len: 5 };
      base.legF = { a: 0.5, len: leg };
      base.legB = { a: -0.5, len: leg };
      base.crouch = 2;
      base.lean = -1;
      base.eyes = 'angry';
      break;
    case ACT.FALL:
      base.armF = { a: 2.2, len: 5 };
      base.armB = { a: 1.8, len: 5 };
      base.legF = { a: 1.4, len: leg };
      base.legB = { a: 1.1, len: leg };
      base.crouch = Math.max(2, leg - 1);
      base.lean = -2;
      base.bob = 0;
      base.eyes = 'dizzy';
      break;
    case ACT.HIGHFIVE:
      base.armF = { a: 2.9, len: 6 };
      base.armB = { a: 0.2, len: 5 };
      base.bob = Math.abs(Math.sin(t * 9)) > 0.6 ? 1 : 0;
      base.eyes = 'happy';
      break;
    case ACT.DEJECT:
      base.armF = { a: 0.05, len: 5 };
      base.armB = { a: 0.05, len: 5 };
      base.lean = 1;
      base.bob = 0;
      base.crouch = 0;
      base.eyes = 'sad';
      break;
    case ACT.INJURED:
      base.armF = { a: 0.9, len: 4 };
      base.armB = { a: 0.7, len: 4 };
      base.legF = { a: 1.3, len: leg - 1 };
      base.legB = { a: 0.1, len: leg };
      base.crouch = 2;
      base.lean = 1;
      base.bob = 0;
      base.eyes = 'sad';
      break;
    case ACT.BOUNCE:
      base.armF = { a: 0.9, len: 6 };
      base.armB = { a: 0.8, len: 5 };
      base.lean = 1;
      base.crouch = 1;
      break;
    case ACT.LOB:
      base.armF = { a: 2.4, len: 6 };
      base.armB = { a: 2.2, len: 5 };
      break;
    case ACT.DUNK2:
      base.armF = { a: 3.05, len: 6 };
      base.armB = { a: 3.0, len: 6 };
      base.legF = { a: 0.8, len: leg - 1 };
      base.legB = { a: 0.3, len: leg - 1 };
      base.eyes = 'angry';
      break;
    case ACT.TOMAHAWK:
      // 공을 머리 뒤로 젖혔다가 내리꽂는다
      base.armF = { a: air && f.lift > 6 ? 3.6 : 2.9, len: 6 };
      base.armB = { a: 1.2, len: 4 };
      base.legF = { a: 1.0, len: leg - 1 };
      base.legB = { a: 0.2, len: leg - 1 };
      base.lean = -1;
      base.eyes = 'angry';
      break;
    case ACT.REVERSE:
      base.armF = { a: 3.1, len: 6 };
      base.armB = { a: 3.0, len: 6 };
      base.legF = { a: 0.6, len: leg - 1 };
      base.legB = { a: -0.2, len: leg };
      base.eyes = 'focus';
      break;
    case ACT.WINDMILL: {
      // 팔을 크게 한 바퀴
      const a = (t * 9) % (Math.PI * 2);
      base.armF = { a: 0.2 + Math.abs(Math.sin(a / 2)) * 2.9, len: 6 };
      base.armB = { a: 1.1, len: 4 };
      base.legF = { a: 0.9, len: leg - 1 };
      base.legB = { a: 0.4, len: leg - 1 };
      base.eyes = 'focus';
      break;
    }
    case ACT.D360:
      base.armF = { a: 2.8, len: 6 };
      base.armB = { a: 2.6, len: 5 };
      base.legF = { a: 0.7, len: leg - 1 };
      base.legB = { a: 0.5, len: leg - 1 };
      base.eyes = 'focus';
      break;
    case ACT.SCREEN:
      base.armF = { a: 0.9, len: 3 };
      base.armB = { a: 0.9, len: 3 };
      base.legF = { a: 0.3, len: leg };
      base.legB = { a: -0.3, len: leg };
      base.crossed = true;
      break;
    case ACT.STUN:
      base.armF = { a: 2.3 + Math.sin(t * 14) * 0.4, len: 5 };
      base.armB = { a: 1.9 - Math.sin(t * 14) * 0.4, len: 5 };
      base.legF = { a: 0.45, len: leg };
      base.legB = { a: -0.35, len: leg };
      base.lean = -1;
      base.eyes = 'dizzy';
      break;
    case ACT.CELEBRATE:
      base.armF = { a: 2.75, len: 6 };
      base.armB = { a: 2.75, len: 6 };
      base.bob = Math.abs(Math.sin(t * 11)) > 0.5 ? 2 : 0;
      base.eyes = 'happy';
      break;
    default:
      break;
  }
  return base;
}

/** 굵기 2px 선 */
function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w = 2) {
  ctx.fillStyle = color;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    ctx.fillRect(x - (w > 1 ? 1 : 0), y, w, w > 1 ? 2 : 1);
  }
}

/** 팔다리 끝 위치. side 시점은 앞(+)으로, 정면·뒷모습은 옆으로 벌어진다. */
function end(x: number, y: number, l: Limb, dir: number, facing: Facing, side: number) {
  if (facing === 'side') return { x: x + Math.sin(l.a) * l.len * dir, y: y + Math.cos(l.a) * l.len };
  const spread = Math.abs(Math.sin(l.a)) * l.len * 0.55 + 0.5;
  return { x: x + side * spread, y: y + Math.cos(l.a) * l.len };
}

/**
 * (x, y)는 발이 땅에 닿는 화면 좌표. 점프 높이는 f.lift.
 * 반환값: 머리 꼭대기 y (말풍선, 화살표 위치용)
 */
export function drawFigure(ctx: CanvasRenderingContext2D, x: number, y: number, f0: Figure): number {
  let f = f0;
  // 360 덩크는 공중에서 한 바퀴, 리버스 덩크는 등지고 넣는다
  if (f.act === ACT.D360) {
    const k = Math.floor(f.time * 10) % 4;
    f = { ...f, facing: (['side', 'front', 'side', 'back'] as Facing[])[k], flip: k === 2 ? !f.flip : f.flip };
  } else if (f.act === ACT.REVERSE) f = { ...f, facing: 'back' };
  const pl = f.pl;
  const { leg, torso, w } = sizes(pl);
  const pose = poseFor(f, leg);
  const skin = SKIN[pl.look.skin % SKIN.length];
  const skinD = shade(skin, -0.2);
  const hair = HAIR[pl.look.hairColor % HAIR.length];
  const shoe = SHOE[pl.look.shoe % SHOE.length];
  const jersey = f.kit.jersey;
  const shorts = shade(jersey, -0.28);
  const trim = f.kit.trim;
  const dir = f.facing === 'side' && f.flip ? -1 : 1;

  x = Math.round(x);
  const feet = Math.round(y - f.lift - pose.bob);
  const hipY = feet - leg + pose.crouch;
  const shoulderY = hipY - torso + 1;
  const tx = x + pose.lean * dir;
  const left = Math.round(tx - w / 2);

  // 다리
  const legX = f.facing === 'side' ? [x, x] : [x - 2, x + 1];
  const legs: [Limb, number, string][] = [
    [pose.legB, legX[1], f.facing === 'side' ? skinD : skin],
    [pose.legF, legX[0], skin],
  ];
  const drawLeg = (l: Limb, lx: number, col: string, side: number) => {
    const e = end(lx, hipY, l, dir, f.facing, side);
    line(ctx, lx, hipY, e.x, e.y, col);
    // 양말 + 신발
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(Math.round(e.x) - 1, Math.round(e.y) - 1, 2, 1);
    ctx.fillStyle = shoe;
    const sxp = f.facing === 'side' ? (dir > 0 ? Math.round(e.x) - 1 : Math.round(e.x) - 2) : Math.round(e.x) - 1;
    ctx.fillRect(sxp, Math.round(e.y) + 1, f.facing === 'side' ? 4 : 3, 2);
    ctx.fillStyle = shade(shoe, -0.35);
    ctx.fillRect(sxp, Math.round(e.y) + 2, f.facing === 'side' ? 4 : 3, 1);
  };
  drawLeg(legs[0][0], legs[0][1], legs[0][2], 1);
  if (f.facing !== 'side') drawLeg(legs[1][0], legs[1][1], legs[1][2], -1);

  // 뒷팔 (side 시점에서 몸 뒤)
  const shX = f.facing === 'side' ? tx : tx;
  const armOut = Math.floor(w / 2);
  const armSkin = pl.look.sleeve ? trim : skinD;
  if (f.facing === 'side') {
    const e = end(shX, shoulderY + 1, pose.armB, dir, f.facing, 1);
    line(ctx, shX, shoulderY + 1, e.x, e.y, skinD);
  }

  // 반바지 + 유니폼
  ctx.fillStyle = shorts;
  ctx.fillRect(left, hipY - 2, w, 4);
  ctx.fillStyle = shade(shorts, -0.25);
  ctx.fillRect(left, hipY + 1, w, 1);
  ctx.fillStyle = jersey;
  ctx.fillRect(left, shoulderY, w, torso - 1);
  ctx.fillStyle = shade(jersey, 0.25);
  ctx.fillRect(left, shoulderY, w, 1);
  ctx.fillStyle = trim;
  ctx.fillRect(left, hipY - 2, w, 1);
  if (f.facing !== 'side') {
    // 민소매 라인
    ctx.fillStyle = trim;
    ctx.fillRect(left, shoulderY, 1, 2);
    ctx.fillRect(left + w - 1, shoulderY, 1, 2);
    const num = String(pl.number);
    if (torso >= 6) drawDigits(ctx, num, tx + 0.5, shoulderY + 1, trim);
  } else {
    ctx.fillStyle = trim;
    ctx.fillRect(dir > 0 ? left + w - 2 : left + 1, shoulderY + 1, 1, torso - 3);
  }

  if (f.facing === 'side') drawLeg(legs[1][0], legs[1][1], legs[1][2], 1);

  // 머리 (지름 9px)
  const hx = tx + (f.facing === 'side' ? dir : 0);
  const hy = shoulderY - 5;
  const R = 4;
  ctx.fillStyle = skin;
  for (let dy = -R; dy <= R; dy++) {
    const half = Math.floor(Math.sqrt(R * R - dy * dy + R * 0.9));
    ctx.fillRect(hx - half, hy + dy, half * 2 + 1, 1);
  }
  // 턱 그림자
  ctx.fillStyle = skinD;
  ctx.fillRect(hx - 2, hy + R, 5, 1);
  drawHair(ctx, hx, hy, R, pl.look.hair, hair, f.facing, dir);
  if (pl.look.headband) {
    ctx.fillStyle = trim;
    ctx.fillRect(hx - R, hy - 1, R * 2 + 1, 1);
  }
  // 눈
  if (f.facing !== 'back') {
    ctx.fillStyle = '#1b1410';
    const ey = hy;
    const eyes = f.facing === 'side' ? [hx + dir * 2] : [hx - 2, hx + 2];
    for (const ex of eyes) {
      if (pose.eyes === 'dizzy') {
        ctx.fillRect(ex - 1, ey, 1, 1);
        ctx.fillRect(ex, ey + 1, 1, 1);
        ctx.fillRect(ex + 1, ey, 1, 1);
      } else if (pose.eyes === 'happy') {
        ctx.fillRect(ex - 1, ey + 1, 1, 1);
        ctx.fillRect(ex, ey, 1, 1);
        ctx.fillRect(ex + 1, ey + 1, 1, 1);
      } else if (pose.eyes === 'sad') {
        // 처진 눈
        ctx.fillRect(ex, ey + 1, 1, 1);
        ctx.fillRect(ex + (ex < hx ? -1 : 1), ey, 1, 1);
      } else if (pose.eyes === 'angry') {
        // 치켜 올라간 눈썹
        ctx.fillRect(ex, ey, 1, 2);
        ctx.fillRect(ex + (ex < hx ? -1 : 1), ey - 1, 1, 1);
      } else ctx.fillRect(ex, ey, 1, pose.eyes === 'focus' ? 1 : 2);
    }
    // 볼터치
    if (pose.eyes === 'happy') {
      ctx.fillStyle = '#ff9a8a';
      for (const ex of eyes) ctx.fillRect(ex + (f.facing === 'side' ? dir : 0), ey + 2, 1, 1);
    }
  }
  // 팔: 머리 뒤에 가려지지 않게 머리 다음에 그린다. 올린 팔은 머리 위까지 닿는다.
  const reach = (l: Limb) => (l.a > 2 ? { a: l.a, len: l.len + 4 } : l);
  if (f.facing === 'side') {
    const l = reach(pose.armF);
    const e = end(shX, shoulderY + 1, l, dir, f.facing, 1);
    line(ctx, shX + dir, shoulderY + 1, e.x + dir, e.y, pl.look.sleeve ? shade(trim, 0.1) : skin);
  } else if (pose.crossed) {
    ctx.fillStyle = skin;
    ctx.fillRect(left - 1, shoulderY + 2, w + 2, 2);
  } else {
    for (const [l0, side] of [
      [pose.armF, -1],
      [pose.armB, 1],
    ] as [Limb, number][]) {
      const l = reach(l0);
      const sxp = side < 0 ? left - 1 : left + w;
      if (l.a > 2) {
        // 머리 옆으로 뻗어 올린 팔
        const ex = hx + side * (R + 2);
        line(ctx, sxp, shoulderY + 1, ex, shoulderY + 1 + Math.cos(l.a) * l.len, armSkin === trim ? trim : skin);
      } else {
        const e = end(sxp, shoulderY + 1, l, dir, f.facing, side * (armOut > 3 ? 1.2 : 1));
        line(ctx, sxp, shoulderY + 1, e.x, e.y, armSkin === trim ? trim : skin);
      }
    }
  }
  // 땀방울
  if (f.tired && Math.sin(f.time * 3 + f.seed) > 0.3) {
    ctx.fillStyle = '#9fd8ff';
    ctx.fillRect(hx + (f.facing === 'side' ? -dir * 4 : 4), hy - 3, 1, 2);
  }
  return hy - R - 2;
}

function drawHair(ctx: CanvasRenderingContext2D, hx: number, hy: number, R: number, style: number, color: string, facing: Facing, dir: number) {
  ctx.fillStyle = color;
  const back = facing === 'back';
  switch (style % 7) {
    case 0: // 짧은 머리
      ctx.fillRect(hx - R, hy - R, R * 2 + 1, 2);
      ctx.fillRect(hx - R - 0, hy - R + 2, 1, 2);
      ctx.fillRect(hx + R, hy - R + 2, 1, 2);
      if (back) ctx.fillRect(hx - R, hy - R, R * 2 + 1, R + 2);
      else if (facing === 'side') ctx.fillRect(dir > 0 ? hx - R : hx + 1, hy - R, R, R + 1);
      break;
    case 1: // 삭발에 가까운 짧은 머리
      ctx.globalAlpha = 0.85;
      ctx.fillRect(hx - R + 1, hy - R, R * 2 - 1, 1);
      ctx.fillRect(hx - R, hy - R + 1, R * 2 + 1, 1);
      if (back) ctx.fillRect(hx - R, hy - R, R * 2 + 1, R + 1);
      ctx.globalAlpha = 1;
      break;
    case 2: // 아프로
      for (let dy = -R - 2; dy <= 0; dy++) {
        const rr = R + 2;
        const half = Math.floor(Math.sqrt(rr * rr - dy * dy + rr));
        ctx.fillRect(hx - half, hy + dy, half * 2 + 1, 1);
      }
      if (back) ctx.fillRect(hx - R - 1, hy - 1, R * 2 + 3, R);
      break;
    case 3: // 뾰족 머리
      ctx.fillRect(hx - R, hy - R, R * 2 + 1, 2);
      ctx.fillRect(hx - 3, hy - R - 2, 1, 2);
      ctx.fillRect(hx, hy - R - 2, 1, 2);
      ctx.fillRect(hx + 3, hy - R - 2, 1, 2);
      if (back) ctx.fillRect(hx - R, hy - R, R * 2 + 1, R + 1);
      break;
    case 4: // 묶은 머리
      ctx.fillRect(hx - R, hy - R, R * 2 + 1, 2);
      ctx.fillRect(hx - R, hy - R + 2, 1, 3);
      ctx.fillRect(hx + R, hy - R + 2, 1, 3);
      if (back) ctx.fillRect(hx - R, hy - R, R * 2 + 1, R + 2);
      {
        const px = facing === 'side' ? hx - dir * (R + 1) : hx;
        ctx.fillRect(px - 1, hy - 1, 2, 4);
      }
      break;
    case 5: // 대머리 (반짝)
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(hx - 2, hy - R + 1, 2, 1);
      break;
    case 6: // 모히칸
      ctx.fillRect(hx - 1, hy - R - 2, 3, R + 1);
      break;
  }
}

/** 벤치에 앉은 선수 (작게). cheer면 일어나서 팔을 든다. */
export function drawBenchFigure(ctx: CanvasRenderingContext2D, x: number, y: number, pl: Player, kit: Kit, cheer: boolean, time: number) {
  const skin = SKIN[pl.look.skin % SKIN.length];
  const hair = HAIR[pl.look.hairColor % HAIR.length];
  const up = cheer ? 3 + (Math.sin(time * 12 + pl.number) > 0 ? 1 : 0) : 0;
  const top = y - 9 - up;
  ctx.fillStyle = kit.jersey;
  ctx.fillRect(x - 3, top + 5, 7, 5);
  ctx.fillStyle = kit.trim;
  ctx.fillRect(x - 3, top + 9, 7, 1);
  ctx.fillStyle = skin;
  ctx.fillRect(x - 2, top, 5, 5);
  ctx.fillStyle = hair;
  ctx.fillRect(x - 2, top, 5, 2);
  if (cheer) {
    ctx.fillStyle = skin;
    ctx.fillRect(x - 5, top - 1, 1, 5);
    ctx.fillRect(x + 5, top - 1, 1, 5);
  }
}
