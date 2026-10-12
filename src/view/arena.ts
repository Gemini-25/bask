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

/** 학교 체육관: 밝은 벽, 높은 창문, 나무 관람석 두 줄, 현수막 */
function drawGymWall(ctx: CanvasRenderingContext2D, look: ArenaLook) {
  ctx.fillStyle = '#b9b2a2';
  ctx.fillRect(0, 0, VIEW_W, 88);
  ctx.fillStyle = '#a49c8b';
  for (let x = 0; x < VIEW_W; x += 32) ctx.fillRect(x, 0, 1, 52);
  // 높은 창문
  for (let x = 18; x < VIEW_W; x += 64) {
    ctx.fillStyle = '#6f8fb0';
    ctx.fillRect(x, 6, 30, 16);
    ctx.fillStyle = '#9fc0de';
    ctx.fillRect(x + 1, 7, 13, 6);
    ctx.fillStyle = '#e9ecf3';
    ctx.fillRect(x + 14, 6, 1, 16);
    ctx.fillRect(x, 14, 30, 1);
  }
  // 현수막
  ctx.fillStyle = shade(look.home, -0.1);
  ctx.fillRect(VIEW_W / 2 - 150, 26, 120, 12);
  ctx.fillRect(VIEW_W / 2 + 30, 26, 120, 12);
  ctx.fillStyle = '#f7f2e8';
  ctx.font = '11px Galmuri11, monospace';
  ctx.textBaseline = 'top';
  const text = look.banner ?? '농구부 파이팅';
  const tw = ctx.measureText(text).width;
  ctx.fillText(text, Math.round(VIEW_W / 2 - 90 - tw / 2), 26);
  const t2 = '투지! 끈기! 승리!';
  ctx.fillText(t2, Math.round(VIEW_W / 2 + 90 - ctx.measureText(t2).width / 2), 26);
  // 나무 관람석 두 줄
  for (let r = 0; r < 2; r++) {
    const y = 54 + r * 13;
    ctx.fillStyle = r === 0 ? '#9a6a3c' : '#8a5c32';
    ctx.fillRect(0, y, VIEW_W, 13);
    ctx.fillStyle = '#6b4526';
    ctx.fillRect(0, y + 11, VIEW_W, 2);
  }
  // 벽 아래 보호대
  ctx.fillStyle = shade(look.home, -0.35);
  ctx.fillRect(0, 80, VIEW_W, 8);
  ctx.fillStyle = shade(look.home, -0.15);
  ctx.fillRect(0, 80, VIEW_W, 1);
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

/** 프로 경기장 장식 (M10): 천장 배너, 영구결번, 내 응원단 */
export interface ArenaDeco {
  /** 홈팀 우승 시즌 (천장 배너) */
  titles: number[];
  /** 홈팀 영구결번 */
  retired: number[];
  /** 내 응원 아이템 (내 홈 경기일 때만) */
  cheer: string[];
  myNumber: number;
  myName: string;
  /** 관중이 얼마나 찼나 (0~1) */
  fill: number;
}

export interface ArenaLook {
  home: string;
  away: string;
  /** 경기장 단계 (0 = 학교 체육관, 1 = 대회장·프로 아레나, 2 = 결승 무대) */
  tier: number;
  /** 체육관 현수막 글 */
  banner?: string;
  deco?: ArenaDeco;
}

/** 움직이지 않는 배경 */
export function drawArena(look: ArenaLook): HTMLCanvasElement {
  const { c, ctx } = canvas(VIEW_W, VIEW_H);
  if (look.tier === 0) drawGymWall(ctx, look);
  else {
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
    // 광고판 띠 (결승 무대는 금색 테두리)
    ctx.fillStyle = look.tier >= 2 ? '#6b4a1a' : '#0c0f16';
    ctx.fillRect(0, 80, VIEW_W, 8);
    for (let x = 0; x < VIEW_W; x += 80) {
      ctx.fillStyle = x % 160 === 0 ? shade(look.home, -0.2) : look.tier >= 2 ? '#3a2f1a' : '#2b3550';
      ctx.fillRect(x + 2, 81, 76, 6);
    }
    if (look.tier >= 2) {
      ctx.fillStyle = '#ffb545';
      ctx.fillRect(0, 80, VIEW_W, 1);
      ctx.fillRect(0, 87, VIEW_W, 1);
    }
    if (look.deco) drawRafters(ctx, look.home, look.deco);
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

/** 천장: 왼쪽엔 우승 배너, 오른쪽엔 영구결번 유니폼 */
function drawRafters(ctx: CanvasRenderingContext2D, home: string, deco: ArenaDeco) {
  deco.titles.slice(-10).forEach((season, i) => {
    const x = 6 + i * 13;
    ctx.fillStyle = '#ffb545';
    ctx.fillRect(x - 1, 0, 12, 15);
    ctx.fillStyle = home;
    ctx.fillRect(x, 0, 10, 13);
    ctx.fillRect(x + 2, 13, 6, 2);
    ledText(ctx, String(season).padStart(2, ' ').slice(-2), x + 1, 4, '#fff6dc', 1);
  });
  deco.retired.slice(-8).forEach((num, i) => {
    const x = VIEW_W - 18 - i * 14;
    ctx.fillStyle = '#f2f4f8';
    ctx.fillRect(x, 2, 12, 11);
    ctx.fillRect(x - 2, 2, 2, 4);
    ctx.fillRect(x + 12, 2, 2, 4);
    ctx.fillStyle = home;
    ctx.fillRect(x + 4, 2, 4, 1);
    ledText(ctx, String(num).padStart(2, ' '), x + 2, 5, home, 1);
  });
}

/** 내 응원단: 관중석 현수막 (관중 위에 그린다) */
export function drawCheerBanner(ctx: CanvasRenderingContext2D, home: string, deco: ArenaDeco, time: number) {
  if (!deco.cheer.includes('cheerBanner')) return;
  const text = `#${deco.myNumber} ${deco.myName}`;
  ctx.font = '8px Galmuri11, monospace';
  const w = Math.ceil(ctx.measureText(text).width) + 10;
  const x = 150;
  const y = 52 + Math.round(Math.sin(time * 2) * 1);
  ctx.fillStyle = '#f7f2e8';
  ctx.fillRect(x, y, w, 11);
  ctx.fillStyle = home;
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y + 9, w, 2);
  ctx.fillStyle = shade(home, -0.35);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 5, y + 2);
}

/** 림 크기 (px, M21에 캐릭터와 같이 키움) */
const RIM_RX = 6;
const RIM_RY = 2.8;

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
  for (let a = Math.PI; a <= Math.PI * 2; a += 0.1) ctx.fillRect(Math.round(rx + Math.cos(a) * RIM_RX), Math.round(ry + Math.sin(a) * RIM_RY), 1, 1);
  // 바닥 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(Math.round(rx) - 4, Math.round(groundY), 9, 2);
}

export function drawHoopFront(ctx: CanvasRenderingContext2D, side: 0 | 1, swish: number, bend = 0) {
  const d = side === 0 ? 1 : -1;
  const base = side === 0 ? 0 : COURT.length;
  const rx = sx(base + d * COURT.hoopFromBaseline);
  const ry = szy(7.5, COURT.rimHeight) + Math.round(bend);
  // 그물 (공이 들어가면 출렁)
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const sway = swish > 0 ? Math.round(Math.sin(swish * 30) * 1) : 0;
  for (let i = -6; i <= 6; i += 2) {
    const len = 8 - Math.abs(i) * 0.4 + (swish > 0 ? 1 : 0);
    for (let k = 0; k < len; k++) ctx.fillRect(Math.round(rx + i * (1 - k / 14) + (k > 3 ? sway : 0)), Math.round(ry + 1 + k), 1, 1);
  }
  ctx.fillRect(Math.round(rx) - 3 + sway, Math.round(ry) + 8, 7, 1);
  // 림 앞부분 (덩크하면 휘청)
  ctx.fillStyle = '#ff6a1f';
  for (let a = 0; a <= Math.PI; a += 0.08) ctx.fillRect(Math.round(rx + Math.cos(a) * RIM_RX), Math.round(ry + Math.sin(a) * RIM_RY), 1, 1);
  ctx.fillStyle = '#ffa05a';
  ctx.fillRect(Math.round(rx) - 2, Math.round(ry + RIM_RY), 4, 1);
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
  /** 응원 깃발을 들었다 */
  flag?: boolean;
}

export function makeCrowd(home: string, away: string, seed: number, tier = 1, fill = -1, flags = false): Fan[] {
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
  // 학교 체육관은 관람석 두 줄에 친구들 몇 명, 결승은 꽉 찬다
  const rows = tier === 0 ? [3, 4] : [0, 1, 2, 3, 4];
  // 프로 홈 경기는 인기만큼 관중이 찬다
  const empty = tier === 0 ? 0.6 : tier >= 2 ? 0.03 : fill >= 0 ? 0.42 - 0.39 * Math.min(1, fill) : 0.12;
  for (const row of rows) {
    const y = 24 + row * 13 + (tier === 0 ? 3 : 0);
    for (let x = 4 + (row % 2) * 4; x < VIEW_W - 4; x += 8) {
      if (r() < empty) continue; // 빈자리
      const isHome = r() < 0.7;
      const shirt = r() < 0.55 ? (isHome ? home : away) : neutral[Math.floor(r() * neutral.length)];
      fans.push({ x: x + Math.floor(r() * 3), y, shirt, skin: skins[Math.floor(r() * skins.length)], hair: hairs[Math.floor(r() * hairs.length)], home: isHome, phase: r() * 10, front: false, flag: flags && isHome && r() < 0.14 });
    }
  }
  // 코트 앞쪽 (카메라 쪽) 앞줄 관중: 머리만 보인다 (체육관엔 없다)
  for (let x = 2; x < VIEW_W && tier > 0; x += 9) {
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
    if (f.flag) {
      // 깃대와 펄럭이는 깃발
      const wv = Math.round(Math.sin(time * 6 + f.phase) * 1.5);
      ctx.fillStyle = '#d9d4c7';
      ctx.fillRect(f.x + 3, y - 12, 1, 9);
      ctx.fillStyle = f.shirt;
      ctx.fillRect(f.x + 4, y - 12 + (wv > 0 ? 1 : 0), 5, 3);
      ctx.fillStyle = shade(f.shirt, 0.3);
      ctx.fillRect(f.x + 4, y - 12 + (wv > 0 ? 1 : 0), 5, 1);
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
export function drawJumbotron(ctx: CanvasRenderingContext2D, home: string, away: string, score: [number, number], clock: string, q: string, flash?: string) {
  const w = 120;
  const x = (VIEW_W - w) / 2;
  ctx.fillStyle = '#05070b';
  ctx.fillRect(x, 1, w, 21);
  ctx.fillStyle = '#2a3142';
  ctx.fillRect(x, 1, w, 1);
  ctx.fillRect(x, 21, w, 1);
  if (flash) {
    // 전광판에 내 등번호 (응원 아이템)
    ctx.fillStyle = home;
    ctx.fillRect(x + 1, 2, w - 2, 19);
    ledText(ctx, flash, x + w / 2 - flash.length * 6 + 2, 4, '#fff6dc', 3);
    return;
  }
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
