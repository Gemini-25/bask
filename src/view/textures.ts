import { COURT, CORNER_U } from '../sim/court';
import { drawDigits, fillCircle, luminance, shade, strokeArc } from './pixel';

export const PX = 20; // 1m = 20px
export const OX = 32;
export const OY = 34;
export const VIEW_W = COURT.length * PX + OX * 2;
export const VIEW_H = COURT.width * PX + OY * 2;
/** 높이 1m를 화면에서 몇 px 위로 올려 그릴지 (살짝 쿼터뷰 느낌) */
export const ZPX = 5;

export const sx = (x: number) => OX + x * PX;
export const sy = (y: number) => OY + y * PX;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

/** 나무 마루 코트 + 라인 */
export function drawCourt(paint: [string, string]): HTMLCanvasElement {
  const { c, ctx } = canvas(VIEW_W, VIEW_H);
  // 코트 밖 바닥
  ctx.fillStyle = '#2b3140';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let y = 0; y < VIEW_H; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? '#2e3546' : '#293040';
    ctx.fillRect(0, y, VIEW_W, 2);
  }
  // 마루: 세로로 긴 판자
  const L = COURT.length * PX;
  const W = COURT.width * PX;
  const woods = ['#d8a66a', '#d39f62', '#dcab70', '#cf9b5e'];
  for (let x = 0; x < L; x += 6) {
    ctx.fillStyle = woods[(x / 6) % 4];
    ctx.fillRect(OX + x, OY, 6, W);
    // 판자 이음새
    const seam = ((x * 37) % 97) + 10;
    ctx.fillStyle = '#c4905a';
    for (let y = seam; y < W; y += 97) ctx.fillRect(OX + x, OY + y, 6, 1);
  }
  const line = '#f7f2e8';
  const r = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = line;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  // 페인트존 (두 팀 색)
  for (const [side, col] of [[0, paint[0]], [1, paint[1]]] as const) {
    const x0 = side === 0 ? OX : OX + L - COURT.keyLength * PX;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x0, OY + (W - COURT.keyWidth * PX) / 2, COURT.keyLength * PX, COURT.keyWidth * PX);
    ctx.globalAlpha = 1;
  }
  // 외곽선, 하프라인
  r(OX - 1, OY - 1, L + 2, 2);
  r(OX - 1, OY + W - 1, L + 2, 2);
  r(OX - 1, OY - 1, 2, W + 2);
  r(OX + L - 1, OY - 1, 2, W + 2);
  r(OX + L / 2, OY, 1, W);
  // 센터서클
  strokeArc(ctx, OX + L / 2, OY + W / 2, COURT.centerCircleRadius * PX, 0, Math.PI * 2, line);
  for (const side of [0, 1]) {
    const hx = side === 0 ? OX + COURT.hoopFromBaseline * PX : OX + L - COURT.hoopFromBaseline * PX;
    const hy = OY + W / 2;
    const dir = side === 0 ? 1 : -1;
    // 키
    const kx = side === 0 ? OX : OX + L - COURT.keyLength * PX;
    const ky = OY + (W - COURT.keyWidth * PX) / 2;
    r(kx, ky, COURT.keyLength * PX, 1);
    r(kx, ky + COURT.keyWidth * PX, COURT.keyLength * PX, 1);
    r(side === 0 ? OX + COURT.keyLength * PX : kx, ky, 1, COURT.keyWidth * PX);
    // 자유투 원
    const fx = side === 0 ? OX + COURT.keyLength * PX : OX + L - COURT.keyLength * PX;
    strokeArc(ctx, fx, hy, 1.8 * PX, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : (Math.PI * 3) / 2, line);
    // 3점 라인: 코너 직선 + 호
    const cornerLen = CORNER_U * PX;
    const cy0 = OY + COURT.threeCornerFromSide * PX;
    const cy1 = OY + W - COURT.threeCornerFromSide * PX;
    const cx0 = side === 0 ? OX : OX + L - cornerLen;
    r(cx0, cy0, cornerLen, 1);
    r(cx0, cy1, cornerLen, 1);
    const R = COURT.threeRadius * PX;
    const a = Math.asin((W / 2 - COURT.threeCornerFromSide * PX) / R);
    if (side === 0) strokeArc(ctx, hx, hy, R, -a, a, line);
    else strokeArc(ctx, hx, hy, R, Math.PI - a, Math.PI + a, line);
    // 노차지 반원
    if (side === 0) strokeArc(ctx, hx, hy, COURT.restrictedRadius * PX, -Math.PI / 2, Math.PI / 2, line);
    else strokeArc(ctx, hx, hy, COURT.restrictedRadius * PX, Math.PI / 2, (Math.PI * 3) / 2, line);
    // 골대 그림자와 기둥
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(hx - 5, hy + 2, 10, 3);
    const poleX = side === 0 ? OX - 14 : OX + L + 12;
    ctx.fillStyle = '#5b6273';
    ctx.fillRect(poleX, hy - 3, 3, 8);
  }
  return c;
}

/** 공중에 있는 골대 (백보드 + 림 + 그물). 땅 위치에서 림 높이만큼 위로 그린다. */
export function drawHoop(side: 0 | 1): HTMLCanvasElement {
  const { c, ctx } = canvas(24, 30);
  const bx = side === 0 ? 3 : 20;
  // 백보드
  ctx.fillStyle = '#f2f4f8';
  ctx.fillRect(bx - 1, 4, 3, 20);
  ctx.fillStyle = '#9aa3b5';
  ctx.fillRect(bx - 1, 23, 3, 1);
  // 림
  const rx = side === 0 ? 10 : 13;
  strokeArc(ctx, rx, 14, 4, 0, Math.PI * 2, '#ff6a1f');
  strokeArc(ctx, rx, 14, 3, 0, Math.PI * 2, '#c84a12');
  // 그물
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = -3; i <= 3; i += 2) ctx.fillRect(rx + i, 18 + (Math.abs(i) > 2 ? 0 : 1), 1, 3);
  ctx.fillRect(rx - 2, 21, 5, 1);
  return c;
}

/** 선수 토큰: 유니폼 색 원 + 등번호 */
export function drawPlayerToken(fill: string, number: number, numColor: string): HTMLCanvasElement {
  const { c, ctx } = canvas(17, 17);
  fillCircle(ctx, 8, 8, 7, shade(fill, -0.45));
  fillCircle(ctx, 8, 8, 6, fill);
  // 위쪽 하이라이트
  ctx.fillStyle = shade(fill, 0.35);
  ctx.fillRect(6, 3, 4, 1);
  ctx.fillRect(5, 4, 2, 1);
  drawDigits(ctx, String(number), 8.5, 6, numColor);
  return c;
}

export function numberColorFor(fill: string): string {
  return luminance(fill) > 0.6 ? '#1b1f2a' : '#ffffff';
}

export function drawBall(): HTMLCanvasElement {
  const { c, ctx } = canvas(7, 7);
  fillCircle(ctx, 3, 3, 3, '#6b2a08');
  fillCircle(ctx, 3, 3, 2, '#f07a24');
  ctx.fillStyle = '#ffb877';
  ctx.fillRect(2, 1, 2, 1);
  ctx.fillStyle = '#7a3410';
  ctx.fillRect(3, 2, 1, 3);
  return c;
}

export function drawShadow(w: number, h: number, alpha: number): HTMLCanvasElement {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = `rgba(20,14,8,${alpha})`;
  for (let y = 0; y < h; y++) {
    const t = (y + 0.5) / h - 0.5;
    const half = Math.round((w / 2) * Math.sqrt(1 - 4 * t * t));
    ctx.fillRect(Math.round(w / 2 - half), y, half * 2, 1);
  }
  return c;
}

/** 주목 선수 표시 (머리 위 화살표) */
export function drawMarker(): HTMLCanvasElement {
  const { c, ctx } = canvas(7, 5);
  ctx.fillStyle = '#1b1f2a';
  ctx.fillRect(0, 0, 7, 1);
  ctx.fillRect(1, 1, 5, 1);
  ctx.fillRect(2, 2, 3, 1);
  ctx.fillRect(3, 3, 1, 1);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(1, 0, 5, 1);
  ctx.fillRect(2, 1, 3, 1);
  ctx.fillRect(3, 2, 1, 1);
  return c;
}

/** 휘청 / 스크린에 걸림 표시 */
export function drawDizzy(): HTMLCanvasElement {
  const { c, ctx } = canvas(9, 5);
  ctx.fillStyle = '#ffe066';
  ctx.fillRect(0, 2, 1, 1);
  ctx.fillRect(1, 1, 1, 1);
  ctx.fillRect(2, 2, 1, 1);
  ctx.fillRect(4, 0, 1, 3);
  ctx.fillRect(4, 4, 1, 1);
  ctx.fillRect(6, 2, 1, 1);
  ctx.fillRect(7, 1, 1, 1);
  ctx.fillRect(8, 2, 1, 1);
  return c;
}
