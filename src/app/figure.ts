// 경기 밖 화면에서 도트 선수를 그리는 작은 캔버스 (선수 카드, 만들기 미리보기, 훈련 장면)
import type { Player } from '../data/player';
import { ACT } from '../sim/types';
import { drawFigure, type Facing, type Kit } from '../view/character';

interface Live {
  canvas: HTMLCanvasElement;
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
}

const live = new Set<Live>();
let running = false;

function loop(now: number) {
  for (const l of live) {
    if (!l.canvas.isConnected) {
      live.delete(l);
      continue;
    }
    // 숨은 화면의 캔버스는 그리지 않는다
    if (!l.canvas.offsetParent) continue;
    const ctx = l.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, l.canvas.width, l.canvas.height);
    l.draw(ctx, now / 1000);
  }
  if (live.size) requestAnimationFrame(loop);
  else running = false;
}

/** 매 프레임 다시 그리는 캔버스 (화면에서 빠지면 저절로 멈춘다) */
export function liveCanvas(canvas: HTMLCanvasElement, draw: (ctx: CanvasRenderingContext2D, t: number) => void) {
  register({ canvas, draw });
}

function register(l: Live) {
  live.add(l);
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
}

/** 선수 한 명을 제자리에서 움직이게 그린다 */
export function figureCanvas(canvas: HTMLCanvasElement, get: () => { pl: Player; kit: Kit; act?: number; facing?: Facing }) {
  canvas.width = 40;
  canvas.height = 44;
  register({
    canvas,
    draw(ctx, t) {
      const { pl, kit, act = ACT.IDLE, facing = 'front' } = get();
      // 바닥 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(13, 39, 14, 2);
      drawFigure(ctx, 20, 40, { pl, kit, facing, flip: false, act, speed: 0, lift: 0, time: t, seed: 3, tired: false });
    },
  });
}

/** 훈련 장면: 체육관 바닥 위에서 그 행동의 동작을 반복한다 */
export function trainingCanvas(canvas: HTMLCanvasElement, pl: Player, kit: Kit, act: number, label: string) {
  canvas.width = 160;
  canvas.height = 90;
  register({
    canvas,
    draw(ctx, t) {
      // 벽과 바닥
      ctx.fillStyle = '#2a3142';
      ctx.fillRect(0, 0, 160, 46);
      ctx.fillStyle = '#c99a5b';
      ctx.fillRect(0, 46, 160, 44);
      ctx.fillStyle = '#b8894d';
      for (let y = 50; y < 90; y += 6) ctx.fillRect(0, y, 160, 1);
      ctx.fillStyle = '#e9ecf3';
      ctx.fillRect(0, 58, 160, 1);
      // 골대
      ctx.fillStyle = '#d9dde6';
      ctx.fillRect(132, 16, 2, 34);
      ctx.fillRect(118, 14, 18, 12);
      ctx.fillStyle = '#ff7a3a';
      ctx.fillRect(112, 25, 8, 1);
      const cyc = (t * 1.1) % 2;
      let x = 70;
      let lift = 0;
      let a = act;
      let ball: [number, number] | null = null;
      if (act === ACT.SHOOT) {
        // 점프슛 → 공이 림으로
        const p = cyc < 1 ? cyc : 1;
        lift = cyc < 0.5 ? Math.sin(cyc * Math.PI * 2) * 6 : 0;
        a = cyc < 0.5 ? ACT.SHOOT : ACT.IDLE;
        if (cyc < 0.25) ball = [x + 2, 62 - lift - 24];
        else if (p < 1) {
          const q = (p - 0.25) / 0.75;
          ball = [x + 2 + (116 - x - 2) * q, 38 + (25 - 38) * q - Math.sin(q * Math.PI) * 26];
        }
      } else if (act === ACT.DRIBBLE) {
        x = 40 + ((Math.sin(t * 1.6) + 1) / 2) * 70;
        const b = Math.abs(Math.sin(t * 9));
        ball = [x + 5, 60 - b * 8];
      } else if (act === ACT.PASS) {
        const q = cyc / 2;
        ball = [x + 6 + q * 70, 50 - Math.sin(q * Math.PI) * 6];
      } else if (act === ACT.STANCE) {
        x = 70 + Math.sin(t * 5) * 10;
      } else if (act === ACT.CELEBRATE) {
        lift = Math.abs(Math.sin(t * 5)) * 4;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x - 7, 63, 14, 2);
      drawFigure(ctx, x, 64, { pl, kit, facing: 'side', flip: false, act: a, speed: act === ACT.DRIBBLE ? 3 : 0, lift, time: t, seed: 5, tired: false });
      if (ball) {
        ctx.fillStyle = '#ff8a2a';
        ctx.fillRect(Math.round(ball[0]) - 1, Math.round(ball[1]) - 1, 3, 3);
      }
      ctx.fillStyle = '#e9ecf3';
      ctx.font = '8px Galmuri11, monospace';
      ctx.fillText(label, 6, 12);
    },
  });
}
