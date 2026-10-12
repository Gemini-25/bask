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
