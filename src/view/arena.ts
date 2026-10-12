// 경기장 (G9): 쿼터뷰 코트, 관중석, 벤치, 기록석, 전광판, 골대.
import { COURT, CORNER_U } from '../sim/court';
import { colorDistance, shade } from './pixel';
import { OX, OY, PXX, PXY, sx, sy, szy, VIEW_H, VIEW_W, ZH } from './iso';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

/** 코트 위 점들을 이어 찍는다 (원, 호를 쿼터뷰로) */
function plotWorld(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string) {
  ctx.fillStyle = color;
  let lx = NaN;
  let ly = NaN;
  for (const [x, y] of pts) {
    const px = Math.round(sx(x));
    const py = Math.round(sy(y));
    if (px === lx && py === ly) continue;
    // 빈틈 메우기
    if (!Number.isNaN(lx)) {
      const steps = Math.max(Math.abs(px - lx), Math.abs(py - ly));
      for (let k = 1; k < steps; k++) ctx.fillRect(Math.round(lx + ((px - lx) * k) / steps), Math.round(ly + ((py - ly) * k) / steps), 1, 1);
    }
    ctx.fillRect(px, py, 1, 1);
    lx = px;
    ly = py;
  }
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): [number, number][] {
  const n = Math.ceil(Math.abs(a1 - a0) * r * 12);
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

export interface ArenaLook {
  home: string;
  away: string;
  /** 경기장 크기 단계 (0 = 고교 체육관, 1 = 프로 아레나) */
  tier: number;
}

/** 움직이지 않는 배경 */
export function drawArena(look: ArenaLook): HTMLCanvasElement {
  const { c, ctx } = canvas(VIEW_W, VIEW_H);
  // 벽과 관중석 바탕
  ctx.fillStyle = '#151a26';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let r = 0; r < 5; r++) {
    const y = 14 + r * 13;
    ctx.fillStyle = r % 2 === 0 ? '#232a3b' : '#1e2433';
    ctx.fillRect(0, y, VIEW_W, 13);
    ctx.fillStyle = '#2c3448';
    ctx.fillRect(0, y + 11, VIEW_W, 1);
  }
  // 광고판 띠
  ctx.fillStyle = '#0c0f16';
  ctx.fillRect(0, 80, VIEW_W, 8);
  for (let x = 0; x < VIEW_W; x += 80) {
    ctx.fillStyle = x % 160 === 0 ? shade(look.home, -0.2) : '#2b3550';
    ctx.fillRect(x + 2, 81, 76, 6);
  }
  // 바닥 (코트 바깥)
  ctx.fillStyle = '#3a2f2a';
  ctx.fillRect(0, 88, VIEW_W, VIEW_H - 88);
  const L = COURT.length * PXX;
  const W = COURT.width * PXY;
  // 코트 밖 마루 (조금 어둡게)
  ctx.fillStyle = '#b98a57';
  ctx.fillRect(OX - 24, OY - 10, L + 48, W + 26);
  // 마루: 가로 판자
  const woods = ['#d8a66a', '#d39f62', '#dcab70', '#cf9b5e'];
  for (let y = 0; y < W; y += 3) {
    ctx.fillStyle = woods[(y / 3) % 4];
    ctx.fillRect(OX, OY + y, L, 3);
    const seam = ((y * 53) % 113) + 20;
    ctx.fillStyle = '#c4905a';
    for (let x = seam; x < L; x += 113) ctx.fillRect(OX + x, OY + y, 1, 3);
  }
  // 페인트존
  for (const [side, col] of [
    [0, look.home],
    [1, look.away],
  ] as const) {
    const x0 = side === 0 ? 0 : COURT.length - COURT.keyLength;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(Math.round(sx(x0)), Math.round(sy((COURT.width - COURT.keyWidth) / 2)), COURT.keyLength * PXX, Math.round(COURT.keyWidth * PXY));
    ctx.globalAlpha = 1;
  }
  // 센터 로고
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = look.home;
  for (let dy = -COURT.centerCircleRadius; dy <= COURT.centerCircleRadius; dy += 1 / PXY) {
    const half = Math.sqrt(Math.max(0, COURT.centerCircleRadius ** 2 - dy * dy));
    ctx.fillRect(Math.round(sx(14 - half)), Math.round(sy(7.5 + dy)), Math.round(half * 2 * PXX), 1);
  }
  ctx.globalAlpha = 1;

  const line = '#f7f2e8';
  const seg = (pts: [number, number][]) => plotWorld(ctx, pts, line);
  // 외곽선
  seg([
    [0, 0],
    [28, 0],
  ]);
  seg([
    [0, 15],
    [28, 15],
  ]);
  seg([
    [0, 0],
    [0, 15],
  ]);
  seg([
    [28, 0],
    [28, 15],
  ]);
  ctx.fillStyle = line;
  ctx.fillRect(OX, OY + W, L + 1, 1);
  seg([
    [14, 0],
    [14, 15],
  ]);
  seg(arc(14, 7.5, COURT.centerCircleRadius, 0, Math.PI * 2));
  for (const side of [0, 1]) {
    const hx = side === 0 ? COURT.hoopFromBaseline : COURT.length - COURT.hoopFromBaseline;
    const d = side === 0 ? 1 : -1;
    const base = side === 0 ? 0 : COURT.length;
    const kx = base + d * COURT.keyLength;
    const ky0 = (COURT.width - COURT.keyWidth) / 2;
    const ky1 = ky0 + COURT.keyWidth;
    seg([
      [base, ky0],
      [kx, ky0],
      [kx, ky1],
      [base, ky1],
    ]);
    // 자유투 원
    seg(arc(kx, 7.5, 1.8, side === 0 ? -Math.PI / 2 : Math.PI / 2, side === 0 ? Math.PI / 2 : (Math.PI * 3) / 2));
    // 3점 라인
    const cv = COURT.width / 2 - COURT.threeCornerFromSide;
    seg([
      [base, 7.5 - cv],
      [base + d * CORNER_U, 7.5 - cv],
    ]);
    seg([
      [base, 7.5 + cv],
      [base + d * CORNER_U, 7.5 + cv],
    ]);
    const a = Math.asin(cv / COURT.threeRadius);
    seg(side === 0 ? arc(hx, 7.5, COURT.threeRadius, -a, a) : arc(hx, 7.5, COURT.threeRadius, Math.PI - a, Math.PI + a));
    seg(side === 0 ? arc(hx, 7.5, COURT.restrictedRadius, -Math.PI / 2, Math.PI / 2) : arc(hx, 7.5, COURT.restrictedRadius, Math.PI / 2, (Math.PI * 3) / 2));
  }
  // 벤치 (먼 쪽 사이드라인 바깥)
  for (const [x0, x1, col] of [
    [7.6, 13.0, look.home],
    [15.0, 20.4, look.away],
  ] as const) {
    const y = sy(-0.55);
    ctx.fillStyle = shade(col, -0.45);
    ctx.fillRect(Math.round(sx(x0)), Math.round(y) - 3, Math.round((x1 - x0) * PXX), 3);
    ctx.fillStyle = shade(col, -0.2);
    ctx.fillRect(Math.round(sx(x0)), Math.round(y) - 4, Math.round((x1 - x0) * PXX), 1);
    ctx.fillStyle = '#20232d';
    ctx.fillRect(Math.round(sx(x0)), Math.round(y), Math.round((x1 - x0) * PXX), 2);
  }
  // 기록석
  ctx.fillStyle = '#20263a';
  ctx.fillRect(Math.round(sx(13.1)), Math.round(sy(-0.9)) - 2, Math.round(1.8 * PXX), 8);
  ctx.fillStyle = '#f2cc2e';
  ctx.fillRect(Math.round(sx(13.1)), Math.round(sy(-0.9)) - 2, Math.round(1.8 * PXX), 1);
  // 골대 기둥 (바닥 부분)
  for (const side of [0, 1]) {
    const px = side === 0 ? sx(-1.1) : sx(COURT.length + 1.1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(Math.round(px) - 6, Math.round(sy(7.5)) - 1, 12, 4);
    ctx.fillStyle = '#2f5aa8';
    ctx.fillRect(Math.round(px) - 4, Math.round(sy(7.5)) - 6, 8, 7);
  }
  return c;
}

/** 골대: 뒤쪽(백보드, 림 뒷부분)과 앞쪽(림 앞부분, 그물)을 나눠 그려서 공이 림을 통과하는 것처럼 */
export function drawHoopBack(ctx: CanvasRenderingContext2D, side: 0 | 1) {
  const d = side === 0 ? 1 : -1;
  const base = side === 0 ? 0 : COURT.length;
  const poleX = Math.round(sx(base - d * 1.1));
  const boardX = Math.round(sx(base + d * COURT.backboardFromBaseline));
  const groundY = sy(7.5);
  // 기둥과 팔
  ctx.fillStyle = '#50586c';
  ctx.fillRect(poleX - 1, Math.round(szy(7.5, 3.7)), 3, Math.round(3.7 * ZH) - 5);
  const armY = Math.round(szy(7.5, 3.6));
  ctx.fillRect(Math.min(poleX, boardX), armY, Math.abs(boardX - poleX), 2);
  // 백보드: 옆에서 본 두꺼운 판
  const top = Math.round(szy(6.6, 3.95));
  const bot = Math.round(szy(8.4, 2.9));
  ctx.fillStyle = 'rgba(220,235,255,0.75)';
  ctx.fillRect(boardX - 1, top, 3, bot - top);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(boardX - 1, top, 1, bot - top);
  ctx.fillStyle = '#e8473d';
  ctx.fillRect(boardX - 1, Math.round(szy(7.5, 3.3)), 3, 4);
  // 림 뒷부분
  const rx = sx(base + d * COURT.hoopFromBaseline);
  const ry = szy(7.5, COURT.rimHeight);
  ctx.fillStyle = '#c84a12';
  for (let a = Math.PI; a <= Math.PI * 2; a += 0.12) ctx.fillRect(Math.round(rx + Math.cos(a) * 4.5), Math.round(ry + Math.sin(a) * 2.2), 1, 1);
  // 바닥 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(Math.round(rx) - 4, Math.round(groundY), 9, 2);
}

export function drawHoopFront(ctx: CanvasRenderingContext2D, side: 0 | 1, swish: number) {
  const d = side === 0 ? 1 : -1;
  const base = side === 0 ? 0 : COURT.length;
  const rx = sx(base + d * COURT.hoopFromBaseline);
  const ry = szy(7.5, COURT.rimHeight);
  // 그물 (공이 들어가면 출렁)
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const sway = swish > 0 ? Math.round(Math.sin(swish * 30) * 1) : 0;
  for (let i = -4; i <= 4; i += 2) {
    const len = 6 - Math.abs(i) * 0.4 + (swish > 0 ? 1 : 0);
    for (let k = 0; k < len; k++) ctx.fillRect(Math.round(rx + i * (1 - k / 12) + (k > 2 ? sway : 0)), Math.round(ry + 1 + k), 1, 1);
  }
  ctx.fillRect(Math.round(rx) - 2 + sway, Math.round(ry) + 6, 5, 1);
  // 림 앞부분
  ctx.fillStyle = '#ff6a1f';
  for (let a = 0; a <= Math.PI; a += 0.1) ctx.fillRect(Math.round(rx + Math.cos(a) * 4.5), Math.round(ry + Math.sin(a) * 2.2), 1, 1);
}

// ---------------------------------------------------------------- 관중

interface Fan {
  x: number;
  y: number;
  shirt: string;
  skin: string;
  hair: string;
  home: boolean;
  phase: number;
  /** 앞줄(코트 가까운 쪽) 관중 */
  front: boolean;
}

export function makeCrowd(home: string, away: string, seed: number): Fan[] {
  let h = seed >>> 0 || 1;
  const r = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const skins = ['#f6d2b0', '#e8b48a', '#c98d5f', '#8d5a3b'];
  const hairs = ['#1c1714', '#4a2f1e', '#8a5a2b', '#d9b25a', '#6b6b6b'];
  const neutral = ['#d9d4c7', '#5b6478', '#8b4a4a', '#4a7a5b', '#c9b48a', '#3e4a66'];
  const fans: Fan[] = [];
  for (let row = 0; row < 5; row++) {
    const y = 24 + row * 13;
    for (let x = 4 + (row % 2) * 4; x < VIEW_W - 4; x += 8) {
      if (r() < 0.12) continue; // 빈자리
      const isHome = r() < 0.7;
      const shirt = r() < 0.55 ? (isHome ? home : away) : neutral[Math.floor(r() * neutral.length)];
      fans.push({ x: x + Math.floor(r() * 3), y, shirt, skin: skins[Math.floor(r() * skins.length)], hair: hairs[Math.floor(r() * hairs.length)], home: isHome, phase: r() * 10, front: false });
    }
  }
  // 코트 앞쪽 (카메라 쪽) 앞줄 관중: 머리만 보인다
  for (let x = 2; x < VIEW_W; x += 9) {
    if (r() < 0.25) continue;
    const isHome = r() < 0.7;
    fans.push({ x: x + Math.floor(r() * 3), y: VIEW_H - 4, shirt: isHome ? home : neutral[Math.floor(r() * neutral.length)], skin: skins[Math.floor(r() * skins.length)], hair: hairs[Math.floor(r() * hairs.length)], home: isHome, phase: r() * 10, front: true });
  }
  return fans;
}

export interface CrowdMood {
  /** 홈 관중 환호 (0~1) */
  homeCheer: number;
  awayCheer: number;
  /** 파도타기 진행 위치 (px), 없으면 -1 */
  wave: number;
}

export function drawCrowd(ctx: CanvasRenderingContext2D, fans: Fan[], mood: CrowdMood, time: number) {
  for (const f of fans) {
    const cheer = f.home ? mood.homeCheer : mood.awayCheer;
    let up = 0;
    let arms = false;
    if (cheer > 0 && Math.sin(time * 14 + f.phase * 3) > -0.2) {
      up = cheer > 0.5 ? 2 : 1;
      arms = true;
    } else if (Math.sin(time * 1.3 + f.phase) > 0.97) up = 1;
    if (mood.wave >= 0 && Math.abs(f.x - mood.wave) < 18 && !f.front) {
      up = 3;
      arms = true;
    }
    const y = f.y - up;
    if (f.front) {
      ctx.fillStyle = shade(f.shirt, -0.5);
      ctx.fillRect(f.x - 3, y - 1, 7, 6);
      ctx.fillStyle = '#0d0d12';
      ctx.fillRect(f.x - 2, y - 6, 5, 5);
      ctx.fillStyle = shade(f.hair, -0.3);
      ctx.fillRect(f.x - 2, y - 6, 5, 2);
      if (arms) {
        ctx.fillStyle = '#0d0d12';
        ctx.fillRect(f.x - 4, y - 9, 1, 4);
        ctx.fillRect(f.x + 4, y - 9, 1, 4);
      }
      continue;
    }
    ctx.fillStyle = f.shirt;
    ctx.fillRect(f.x - 2, y - 3, 5, 4);
    ctx.fillStyle = f.skin;
    ctx.fillRect(f.x - 1, y - 6, 3, 3);
    ctx.fillStyle = f.hair;
    ctx.fillRect(f.x - 1, y - 6, 3, 1);
    if (arms) {
      ctx.fillStyle = f.skin;
      ctx.fillRect(f.x - 3, y - 7, 1, 3);
      ctx.fillRect(f.x + 3, y - 7, 1, 3);
    }
  }
}

/** 전광판: 점수와 시계를 LED 숫자로 */
export function drawJumbotron(ctx: CanvasRenderingContext2D, home: string, away: string, score: [number, number], clock: string, q: string) {
  const w = 120;
  const x = (VIEW_W - w) / 2;
  ctx.fillStyle = '#05070b';
  ctx.fillRect(x, 1, w, 21);
  ctx.fillStyle = '#2a3142';
  ctx.fillRect(x, 1, w, 1);
  ctx.fillRect(x, 21, w, 1);
  ctx.fillStyle = home;
  ctx.fillRect(x + 3, 4, 3, 15);
  ctx.fillStyle = away;
  ctx.fillRect(x + w - 6, 4, 3, 15);
  ledText(ctx, String(score[0]).padStart(3, ' '), x + 10, 6, '#ffb545');
  ledText(ctx, String(score[1]).padStart(3, ' '), x + w - 36, 6, '#ffb545');
  ledText(ctx, clock, x + w / 2 - clock.length * 2.5 + 1, 4, '#ff6a4a', 1);
  ledText(ctx, q, x + w / 2 - q.length * 2.5 + 1, 13, '#98a2b9', 1);
}

const LED: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  Q: ['###', '#.#', '#.#', '##.', '.##'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  ' ': ['...', '...', '...', '...', '...'],
};

function ledText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 2) {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  for (const ch of text) {
    const g = LED[ch] ?? LED[' '];
    g.forEach((row, ry) => [...row].forEach((c, rx) => c === '#' && ctx.fillRect(cx + rx * scale, y + ry * scale, scale, scale)));
    cx += 4 * scale;
  }
}

/** 원정팀 페인트 색이 홈팀과 너무 비슷하면 회색으로 */
export function paintColors(home: string, away: string): [string, string] {
  return [home, colorDistance(home, away) < 140 ? '#8a93a6' : away];
}

export { OX, OY };
