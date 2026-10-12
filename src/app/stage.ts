// 무대 장면 (M10): 덩크 콘테스트, 우승 세리머니, 시상식 단상, 드래프트 악수. 160×90 도트 캔버스.
import { Rng } from '../core/rng';
import { generatePlayer, type Player } from '../data/player';
import { ACT, DUNK_ACT, type DunkStyle } from '../sim/types';
import { drawFigure, reachPx, type Kit } from '../view/character';
import { isOneShot } from '../view/anims';
import { numberColorFor, shade } from '../view/pixel';
import { liveCanvas } from './figure';

const W = 160;
const H = 90;

const people = (() => {
  const rng = new Rng(4242);
  const host = generatePlayer(rng, 'SF', 0, 0);
  host.look = { skin: 0, hair: 5, hairColor: 4, shoe: 0, headband: false, sleeve: false };
  host.body = { ...host.body, heightCm: 178 };
  const judges = [0, 1, 2].map(() => generatePlayer(rng, 'PG', 0, 0));
  return { host, judges };
})();

const SUIT: Kit = { jersey: '#2b2f3a', trim: '#e9ecf3' };

/** 무대 장면의 선수 크기 (M21: 캐릭터가 커져서 줄여 그린다) */
const FIG = 0.82;

function fig(ctx: CanvasRenderingContext2D, pl: Player, kit: Kit, x: number, y: number, act: number, t: number, o: Partial<Parameters<typeof drawFigure>[3]> = {}) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(Math.round(x) - 6, Math.round(y) - 1, 12, 2);
  // 한 번 하는 동작은 되풀이해서 보여 준다
  const prog = o.prog ?? (isOneShot(act) ? (t * 0.9) % 1 : undefined);
  return drawFigure(ctx, Math.round(x), Math.round(y), { pl, kit, facing: 'side', flip: false, act, speed: 0, lift: 0, time: t, seed: 5, tired: false, scale: FIG, ...o, prog });
}

function ballAt(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#6b2a08';
  ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 3);
  ctx.fillStyle = '#ff8a2a';
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 2);
}

/** 관중석 (깜빡이는 카메라 플래시) */
function crowd(ctx: CanvasRenderingContext2D, t: number, flash: number, tint = '#1e2433') {
  ctx.fillStyle = '#121620';
  ctx.fillRect(0, 0, W, 48);
  for (let r = 0; r < 4; r++) {
    ctx.fillStyle = r % 2 ? tint : shade(tint, 0.08);
    ctx.fillRect(0, 6 + r * 9, W, 9);
    for (let x = 3 + (r % 2) * 3; x < W; x += 6) {
      const k = (x * 7 + r * 13) % 5;
      ctx.fillStyle = ['#d9d4c7', '#8b4a4a', '#5b6478', '#c9b48a', '#4a7a5b'][k];
      const up = Math.sin(t * 9 + x) > 0.6 ? 1 : 0;
      ctx.fillRect(x, 9 + r * 9 - up, 3, 3);
    }
  }
  if (flash > 0) {
    for (let i = 0; i < 14; i++) {
      const x = (i * 37 + Math.floor(t * 20) * 11) % W;
      const y = 8 + ((i * 23 + Math.floor(t * 20) * 7) % 34);
      if (Math.random() < flash) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
}

function court(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#c99a5b';
  ctx.fillRect(0, 48, W, 42);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 52; y < 90; y += 6) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = '#f7f2e8';
  ctx.fillRect(0, 74, W, 1);
}

/** 오른쪽 골대. 림 높이 y=28, 림 앞 x=130 */
function hoop(ctx: CanvasRenderingContext2D, swish: number) {
  ctx.fillStyle = '#5b6478';
  ctx.fillRect(150, 18, 3, 58);
  ctx.fillStyle = '#e9ecf3';
  ctx.fillRect(138, 14, 14, 16);
  ctx.fillStyle = '#ff5a3a';
  ctx.fillRect(140, 20, 8, 1);
  ctx.fillRect(140, 20, 1, 6);
  ctx.fillRect(147, 20, 1, 6);
  ctx.fillStyle = '#ff7a3a';
  ctx.fillRect(128, 28, 11, 2);
  ctx.fillStyle = swish > 0 ? '#ffffff' : '#d9dde6';
  for (let i = 0; i < 4; i++) ctx.fillRect(129 + i * 3, 30 + (swish > 0 ? 1 : 0), 1, 6 - (i % 2));
}

// ───────────── 덩크 콘테스트 ─────────────

export interface DunkShow {
  pl: Player;
  kit: Kit;
  style: DunkStyle;
}

/** 덩크 한 번 (2.4초를 되풀이). show()로 다음 선수·덩크를 바꾼다 */
export function dunkScene(canvas: HTMLCanvasElement) {
  canvas.width = W;
  canvas.height = H;
  let cur: DunkShow | null = null;
  let start = 0;
  const judgesKit: Kit = { jersey: '#3a3f52', trim: '#ffb545' };
  liveCanvas(canvas, (ctx, t) => {
    if (!start) start = t;
    const k = ((t - start) % 2.6) / 2.6;
    const slam = k > 0.56 && k < 0.7 ? 1 : 0;
    crowd(ctx, t, k > 0.5 && k < 0.85 ? 0.5 : 0.02);
    court(ctx);
    hoop(ctx, slam);
    // 심사위원석
    ctx.fillStyle = '#20263a';
    ctx.fillRect(4, 66, 46, 12);
    people.judges.forEach((j, i) => fig(ctx, j, judgesKit, 12 + i * 14, 70, k > 0.7 ? ACT.CELEBRATE : ACT.IDLE, t, { facing: 'front' }));
    ctx.fillStyle = '#20263a';
    ctx.fillRect(4, 66, 46, 8);
    if (!cur) return;
    const ft = cur.style === 'ftline';
    const runEnd = ft ? 0.3 : 0.36;
    const land = 0.72;
    // 림 (y=28)에 손이 닿는 높이
    const need = 74 - 28 - reachPx(cur.pl, FIG) + 2;
    let x: number;
    let lift = 0;
    let act: number = ACT.DRIBBLE;
    let prog: number | undefined;
    let carry = true;
    let speed = 0;
    let bx = 0;
    let by = 0;
    if (k < runEnd) {
      // 도움닫기 (드리블)
      const q = k / runEnd;
      x = 30 + q * ((ft ? 88 : 104) - 30);
      speed = 4;
    } else if (k < land) {
      // 날아올라 림에 (그 덩크 동작 그대로, 0.9에서 꽂는다)
      const q = (k - runEnd) / (land - runEnd);
      const x0 = ft ? 88 : 104;
      x = x0 + q * (122 - x0);
      lift = Math.sin(Math.min(1, q * 1.12) * Math.PI * 0.5) * need;
      act = DUNK_ACT[cur.style];
      prog = q;
      if (q > 0.92) {
        carry = false;
        bx = 133;
        by = 30 + (q - 0.92) * 60;
      }
    } else if (k < 0.84) {
      // 림에 매달림
      x = 122;
      lift = need - 1 - ((k - land) / 0.12) * 3;
      act = ACT.HANG;
      carry = false;
      bx = 134;
      by = 40 + ((k - land) / 0.12) * 30;
    } else {
      x = 118;
      act = ACT.FLEX;
      carry = false;
      bx = 136;
      by = 72;
    }
    fig(ctx, cur.pl, cur.kit, x, 74, act, t, { lift, flip: false, prog, carry, speed, facing: act === ACT.FLEX ? 'front' : 'side' });
    if (!carry) ballAt(ctx, bx, by);
  });
  return {
    show(s: DunkShow) {
      cur = s;
      start = 0;
    },
  };
}

// ───────────── 우승·시상·드래프트 ─────────────

function trophy(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(x - 3, y, 7, 4);
  ctx.fillRect(x - 1, y + 4, 3, 3);
  ctx.fillRect(x - 3, y + 7, 7, 2);
  ctx.fillStyle = '#fff6b0';
  ctx.fillRect(x - 2, y + 1, 1, 2);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(x - 5, y + 1, 2, 1);
  ctx.fillRect(x + 4, y + 1, 2, 1);
}

interface Confetto {
  x: number;
  y: number;
  v: number;
  c: string;
}

export type StageKind = 'title' | 'award' | 'draft';

export interface StageOpts {
  kind: StageKind;
  pl: Player;
  kit: Kit;
  /** 우승: 함께 뛰는 팀원 */
  mates?: Player[];
  /** 시상 이름, 드래프트 팀 이름 */
  label?: string;
}

export function stageScene(canvas: HTMLCanvasElement, o: StageOpts) {
  canvas.width = W;
  canvas.height = H;
  const conf: Confetto[] = [];
  const colors = [o.kit.jersey, '#ffd23f', '#f7f2e8', '#5fb4ff', '#ff8ac0'];
  let last = 0;
  liveCanvas(canvas, (ctx, t) => {
    const dt = last ? Math.min(0.1, t - last) : 0;
    last = t;
    if (o.kind === 'title') {
      crowd(ctx, t, 0.25, shade(o.kit.jersey, -0.55));
      court(ctx);
      // 팀원들이 둘러싸고 뛴다
      (o.mates ?? []).slice(0, 4).forEach((m, i) => {
        const x = [44, 62, 98, 116][i];
        const hop = Math.abs(Math.sin(t * 7 + i)) * 4;
        fig(ctx, m, o.kit, x, 78, ACT.CELEBRATE, t + i, { lift: hop, facing: i < 2 ? 'side' : 'side', flip: i >= 2 });
      });
      // 나는 가운데서 트로피를 들어 올린다
      const top = fig(ctx, o.pl, o.kit, 80, 80, ACT.CELEBRATE, t, { facing: 'front', lift: Math.abs(Math.sin(t * 3)) * 2 });
      trophy(ctx, 80, top - 11 - Math.round(Math.abs(Math.sin(t * 3)) * 2));
      // 꽃가루
      if (conf.length < 70) conf.push({ x: Math.random() * W, y: -2, v: 14 + Math.random() * 18, c: colors[Math.floor(Math.random() * colors.length)] });
      label(ctx, 'CHAMPIONS', '#ffd23f');
    } else if (o.kind === 'award') {
      ctx.fillStyle = '#0d1018';
      ctx.fillRect(0, 0, W, H);
      // 조명
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.moveTo(70, 0);
      ctx.lineTo(90, 0);
      ctx.lineTo(108, 80);
      ctx.lineTo(52, 80);
      ctx.fill();
      ctx.restore();
      // 단상
      ctx.fillStyle = '#6b4a1a';
      ctx.fillRect(48, 70, 64, 20);
      ctx.fillStyle = '#ffb545';
      ctx.fillRect(48, 70, 64, 2);
      ctx.fillStyle = '#3a2f1a';
      ctx.fillRect(130, 58, 14, 32);
      fig(ctx, people.host, SUIT, 122, 72, Math.sin(t * 2) > 0.3 ? ACT.PASS : ACT.IDLE, t, { flip: true });
      const top = fig(ctx, o.pl, o.kit, 80, 72, ACT.CELEBRATE, t, { facing: 'front' });
      trophy(ctx, 80, top - 11);
      if (conf.length < 30) conf.push({ x: 50 + Math.random() * 60, y: -2, v: 10 + Math.random() * 10, c: colors[Math.floor(Math.random() * colors.length)] });
      label(ctx, o.label ?? 'AWARD', '#ffb545');
    } else {
      // 드래프트: 구단 색 무대, 커미셔너와 악수, 모자
      ctx.fillStyle = shade(o.kit.jersey, -0.6);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = shade(o.kit.jersey, -0.35);
      ctx.fillRect(20, 6, 120, 44);
      ctx.fillStyle = o.kit.jersey;
      ctx.fillRect(66, 14, 28, 28);
      ctx.fillStyle = numberColorFor(o.kit.jersey);
      ctx.fillRect(72, 22, 16, 2);
      ctx.fillRect(72, 30, 16, 2);
      ctx.fillStyle = '#2a2f3a';
      ctx.fillRect(0, 70, W, 20);
      ctx.fillStyle = '#ffb545';
      ctx.fillRect(0, 70, W, 1);
      const meet = Math.min(1, ((t * 0.6) % 3) / 1.2);
      const mx = 40 + meet * 30;
      fig(ctx, people.host, SUIT, 92, 74, meet >= 1 ? ACT.PASS : ACT.IDLE, t, { flip: true });
      const top = fig(ctx, o.pl, o.kit, mx, 74, meet >= 1 ? ACT.PASS : ACT.IDLE, t, { speed: meet < 1 ? 2 : 0 });
      // 구단 모자
      ctx.fillStyle = o.kit.jersey;
      ctx.fillRect(Math.round(mx) - 3, top - 1, 7, 3);
      ctx.fillRect(Math.round(mx) + 3, top + 1, 3, 1);
      if (meet >= 1 && Math.sin(t * 20) > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(10 + ((t * 53) % 140), 12 + ((t * 31) % 30), 2, 2);
      }
      label(ctx, o.label ?? 'DRAFT', '#ffffff');
    }
    for (const c of conf) {
      c.y += c.v * dt;
      c.x += Math.sin(t * 3 + c.y * 0.1) * 6 * dt;
      ctx.fillStyle = c.c;
      ctx.fillRect(Math.round(c.x), Math.round(c.y), Math.sin(t * 10 + c.x) > 0 ? 2 : 1, 2);
    }
    for (let i = conf.length - 1; i >= 0; i--) if (conf[i].y > H) conf.splice(i, 1);
  });
}

function label(ctx: CanvasRenderingContext2D, text: string, color: string) {
  ctx.font = '8px Galmuri11, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#05070b';
  ctx.fillText(text, W / 2 + 1, 3);
  ctx.fillStyle = color;
  ctx.fillText(text, W / 2, 2);
}
