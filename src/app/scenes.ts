// 훈련 장면 (AN5): 행동마다 다른 작은 장면 + 얻은 포인트가 숫자로 떠오른다
import { Rng } from '../core/rng';
import { generatePlayer, type Player } from '../data/player';
import type { ActionId, FocusId, Points } from '../career/career';
import { ACT } from '../sim/types';
import { drawBenchFigure, drawFigure, type Kit } from '../view/character';
import { isOneShot } from '../view/anims';
import { drawDigits } from '../view/pixel';
import { liveCanvas } from './figure';

export const SCENE_W = 160;
export const SCENE_H = 90;
const PT_COLOR = { P: '#ff8a5a', T: '#5fb4ff', M: '#c98aff' };

export interface SceneOpts {
  scene: ActionId | 'title';
  focus?: FocusId;
  pl: Player;
  kit: Kit;
  gained?: Points;
}

// 장면에 나오는 다른 사람들 (늘 같은 얼굴)
const extras = (() => {
  const rng = new Rng(77);
  const ps = [generatePlayer(rng, 'PG', -10, 4), generatePlayer(rng, 'C', -10, 15), generatePlayer(rng, 'SF', -10, 33), generatePlayer(rng, 'SG', -10, 9)];
  ps[0].look.hair = 0;
  ps[1].look.hair = 3;
  ps[2].look.hair = 2;
  const mentor = generatePlayer(rng, 'SF', 0, 0);
  mentor.look = { skin: 1, hair: 5, hairColor: 0, shoe: 1, headband: false, sleeve: false };
  return { mates: ps, mentor };
})();

function floor(ctx: CanvasRenderingContext2D, wall: string, wood: string) {
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, SCENE_W, 46);
  ctx.fillStyle = wood;
  ctx.fillRect(0, 46, SCENE_W, 44);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 50; y < 90; y += 6) ctx.fillRect(0, y, SCENE_W, 1);
}

function hoop(ctx: CanvasRenderingContext2D, x: number) {
  ctx.fillStyle = '#d9dde6';
  ctx.fillRect(x + 14, 16, 2, 34);
  ctx.fillRect(x, 14, 18, 12);
  ctx.fillStyle = '#ff7a3a';
  ctx.fillRect(x - 6, 25, 8, 1);
}

function ball(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#ff8a2a';
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(Math.round(x) - 6, Math.round(y) - 1, 12, 2);
}

export function trainingScene(canvas: HTMLCanvasElement, o: SceneOpts) {
  canvas.width = SCENE_W;
  canvas.height = SCENE_H;
  const start = performance.now() / 1000;
  const mateKit: Kit = { jersey: '#5b6478', trim: '#e9ecf3' };
  const fig = (ctx: CanvasRenderingContext2D, pl: Player, kit: Kit, x: number, y: number, act: number, t: number, extra: Partial<Parameters<typeof drawFigure>[3]> = {}) => {
    shadow(ctx, x, y);
    const prog = extra.prog ?? (isOneShot(act) ? (t * 1.1) % 1 : undefined);
    return drawFigure(ctx, x, y, { pl, kit, facing: 'side', flip: false, act, speed: 0, lift: 0, time: t, seed: 3, tired: false, scale: 0.82, ...extra, prog });
  };
  let meTop = 40;
  let meX = 70;
  liveCanvas(canvas, (ctx, t) => {
    const cyc = (t * 1.1) % 2;
    switch (o.scene) {
      case 'title':
      case 'solo':
      case 'trainer':
      case 'mentor': {
        floor(ctx, '#2a3142', '#c99a5b');
        ctx.fillStyle = '#e9ecf3';
        ctx.fillRect(0, 58, SCENE_W, 1);
        hoop(ctx, 118);
        const focus = o.scene === 'title' ? 'shoot' : o.focus ?? 'shoot';
        if (o.scene === 'mentor') {
          fig(ctx, extras.mentor, { jersey: '#3a3f52', trim: '#ffb545' }, 28, 66, Math.sin(t * 2) > 0.6 ? ACT.CELEBRATE : ACT.IDLE, t, { facing: 'front' });
          // 호루라기 끈
          ctx.fillStyle = '#ffb545';
          ctx.fillRect(28, 50, 1, 3);
        }
        if (focus === 'shoot') {
          const lift = cyc < 0.5 ? Math.sin(cyc * Math.PI * 2) * 6 : 0;
          meX = 70;
          meTop = fig(ctx, o.pl, o.kit, meX, 64, cyc < 0.5 ? ACT.SHOOT : ACT.IDLE, t, { lift });
          if (cyc < 0.25) ball(ctx, meX + 2, 38 - lift);
          else if (cyc < 1) {
            const q = (cyc - 0.25) / 0.75;
            ball(ctx, meX + 2 + (116 - meX - 2) * q, 38 + (25 - 38) * q - Math.sin(q * Math.PI) * 26);
          }
        } else if (focus === 'drive' || focus === 'defense') {
          // 콘 사이를 지그재그
          for (let i = 0; i < 4; i++) {
            ctx.fillStyle = '#ff7a3a';
            ctx.fillRect(40 + i * 22, 66, 3, 3);
            ctx.fillRect(41 + i * 22, 64, 1, 2);
          }
          meX = 40 + ((Math.sin(t * 1.4) + 1) / 2) * 70;
          const y = 64 + Math.sin(t * 6) * 3;
          meTop = fig(ctx, o.pl, o.kit, meX, y, focus === 'drive' ? ACT.DRIBBLE : ACT.STANCE, t, { speed: 3, flip: Math.cos(t * 1.4) < 0 });
          if (focus === 'drive') ball(ctx, meX + 5, y - 4 - Math.abs(Math.sin(t * 9)) * 8);
        } else if (focus === 'post') {
          // 더미 수비 (패드) 를 등지고 포스트업
          ctx.fillStyle = '#3d6fd6';
          ctx.fillRect(98, 40, 8, 24);
          ctx.fillStyle = '#2a4a9a';
          ctx.fillRect(98, 40, 8, 2);
          meX = 88 + Math.sin(t * 3) * 2;
          meTop = fig(ctx, o.pl, o.kit, meX, 64, cyc < 1.4 ? ACT.POST : ACT.SHOOT, t, { lift: cyc >= 1.4 ? 5 : 0 });
        } else {
          // 벽에 패스
          ctx.fillStyle = '#4a5a7a';
          ctx.fillRect(132, 30, 6, 30);
          meX = 70;
          meTop = fig(ctx, o.pl, o.kit, meX, 64, cyc % 1 < 0.3 ? ACT.PASS : ACT.HOLD, t);
          const q = cyc % 1;
          const bx = q < 0.5 ? meX + 6 + (q / 0.5) * 56 : 132 - ((q - 0.5) / 0.5) * 56;
          ball(ctx, bx, 50);
        }
        break;
      }
      case 'team': {
        floor(ctx, '#2a3142', '#c99a5b');
        hoop(ctx, 118);
        const spots = [
          [40, 70],
          [70, 56],
          [100, 72],
        ];
        const who = Math.floor(t * 1.2) % 3;
        const q = (t * 1.2) % 1;
        const people = [o.pl, extras.mates[0], extras.mates[1]];
        spots.forEach(([x, y], i) => {
          const act = i === who ? (q < 0.3 ? ACT.PASS : ACT.HOLD) : i === (who + 1) % 3 && q > 0.7 ? ACT.HOLD : ACT.IDLE;
          const top = fig(ctx, people[i], i === 0 ? o.kit : mateKit, x, y, act, t, { facing: 'front' });
          if (i === 0) {
            meX = x;
            meTop = top;
          }
        });
        const [ax, ay] = spots[who];
        const [bx2, by2] = spots[(who + 1) % 3];
        ball(ctx, ax + (bx2 - ax) * q, ay - 14 + (by2 - ay) * q - Math.sin(q * Math.PI) * 4);
        // 감독
        fig(ctx, extras.mates[3], { jersey: '#1b1b1b', trim: '#ffb545' }, 140, 60, ACT.IDLE, t, { facing: 'front', flip: true });
        break;
      }
      case 'weight': {
        floor(ctx, '#3a3242', '#4a4a52');
        // 거울과 덤벨 선반
        ctx.fillStyle = '#7a8aa8';
        ctx.fillRect(8, 8, 50, 30);
        ctx.fillStyle = '#9aaac8';
        ctx.fillRect(10, 10, 20, 6);
        ctx.fillStyle = '#222';
        for (let i = 0; i < 5; i++) ctx.fillRect(100 + i * 10, 34, 6, 4);
        const down = Math.sin(t * 3) > 0;
        meX = 74;
        meTop = fig(ctx, o.pl, o.kit, meX, 70, down ? ACT.STANCE : ACT.IDLE, t, { facing: 'front' });
        // 바벨
        const by = meTop + 9;
        ctx.fillStyle = '#c9ced9';
        ctx.fillRect(meX - 16, by, 33, 1);
        ctx.fillStyle = '#222';
        ctx.fillRect(meX - 18, by - 3, 3, 7);
        ctx.fillRect(meX + 16, by - 3, 3, 7);
        break;
      }
      case 'video': {
        ctx.fillStyle = '#14161f';
        ctx.fillRect(0, 0, SCENE_W, SCENE_H);
        // 화면 속 경기
        ctx.fillStyle = '#0a0c12';
        ctx.fillRect(46, 8, 74, 44);
        ctx.fillStyle = '#c99a5b';
        ctx.fillRect(49, 11, 68, 38);
        ctx.fillStyle = '#e9ecf3';
        ctx.fillRect(83, 11, 1, 38);
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i < 3 ? '#e0473d' : '#3d8fe0';
          ctx.fillRect(Math.round(60 + i * 8 + Math.sin(t * 1.5 + i) * 6), Math.round(24 + Math.cos(t * 1.2 + i * 2) * 8), 2, 2);
        }
        ctx.fillStyle = '#ff8a2a';
        ctx.fillRect(Math.round(80 + Math.sin(t * 2) * 14), 30, 2, 2);
        // 화면 빛
        ctx.fillStyle = 'rgba(160,190,255,0.08)';
        ctx.fillRect(30, 52, 100, 38);
        // 앉아서 노트에 적는다
        drawBenchFigure(ctx, 82, 80, o.pl, o.kit, false, t);
        meX = 82;
        meTop = 64;
        ctx.fillStyle = '#f7f2e8';
        ctx.fillRect(88, 73, 6, 4);
        if (Math.sin(t * 6) > 0) {
          ctx.fillStyle = '#1b1f2a';
          ctx.fillRect(90, 74, 2, 1);
        }
        break;
      }
      case 'street': {
        ctx.fillStyle = '#9ac0de';
        ctx.fillRect(0, 0, SCENE_W, 46);
        ctx.fillStyle = '#4c7a46';
        ctx.fillRect(0, 34, SCENE_W, 12);
        // 철조망
        ctx.fillStyle = '#7a8090';
        for (let x = 0; x < SCENE_W; x += 6) ctx.fillRect(x, 22, 1, 24);
        ctx.fillRect(0, 22, SCENE_W, 1);
        ctx.fillStyle = '#b5683a';
        ctx.fillRect(0, 46, SCENE_W, 44);
        ctx.fillStyle = '#e9ecf3';
        ctx.fillRect(0, 60, SCENE_W, 1);
        hoop(ctx, 120);
        meX = 50 + Math.sin(t * 2.2) * 16;
        meTop = fig(ctx, o.pl, o.kit, meX, 70, ACT.DRIBBLE, t, { speed: 2.5, flip: Math.cos(t * 2.2) < 0 });
        ball(ctx, meX + 5, 66 - Math.abs(Math.sin(t * 10)) * 8);
        fig(ctx, extras.mates[2], { jersey: '#e9ecf3', trim: '#3a3f52' }, meX + 14, 70, ACT.STANCE, t, { flip: true });
        fig(ctx, extras.mates[3], { jersey: '#2b2b33', trim: '#ffb545' }, 104, 60, ACT.IDLE, t, { facing: 'front' });
        break;
      }
      case 'ad': {
        // 촬영장: 조명과 카메라
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(0, 0, SCENE_W, SCENE_H);
        ctx.fillStyle = '#e0e4ea';
        ctx.fillRect(0, 60, SCENE_W, 30);
        ctx.fillStyle = '#2b2b33';
        ctx.fillRect(18, 40, 12, 8);
        ctx.fillRect(22, 48, 2, 22);
        ctx.fillStyle = '#ffe9a0';
        if (Math.sin(t * 7) > 0.85) ctx.fillRect(30, 41, 4, 4);
        ctx.fillStyle = '#3a3f52';
        ctx.fillRect(130, 20, 4, 50);
        ctx.fillStyle = '#fff3c4';
        ctx.fillRect(126, 16, 12, 6);
        meX = 80;
        meTop = fig(ctx, o.pl, o.kit, meX, 70, Math.sin(t * 2) > 0 ? ACT.CELEBRATE : ACT.HOLD, t, { facing: 'front' });
        break;
      }
      case 'parttime': {
        // 분식집 카운터에서 일한다
        ctx.fillStyle = '#e8c08a';
        ctx.fillRect(0, 0, SCENE_W, SCENE_H);
        ctx.fillStyle = '#b33b2e';
        ctx.fillRect(0, 0, SCENE_W, 10);
        ctx.fillStyle = '#3a2a1e';
        ctx.fillRect(104, 16, 40, 22);
        ctx.fillStyle = '#f7f2e8';
        for (let i = 0; i < 4; i++) ctx.fillRect(108, 20 + i * 4, 24, 1);
        meX = 60;
        meTop = fig(ctx, o.pl, { jersey: '#f7f2e8', trim: '#b33b2e' }, meX, 64, Math.sin(t * 3) > 0.4 ? ACT.PASS : ACT.HOLD, t, { facing: 'front' });
        // 앞치마
        ctx.fillStyle = '#b33b2e';
        ctx.fillRect(meX - 3, meTop + 12, 7, 6);
        // 카운터
        ctx.fillStyle = '#8a5a3a';
        ctx.fillRect(30, 62, 70, 10);
        ctx.fillStyle = '#e0473d';
        ctx.fillRect(40 + Math.round(((t * 20) % 40)), 59, 8, 3);
        drawBenchFigure(ctx, 120, 72, extras.mates[2], mateKit, Math.sin(t * 2) > 0.6, t);
        break;
      }
      case 'friends': {
        ctx.fillStyle = '#e8c08a';
        ctx.fillRect(0, 0, SCENE_W, SCENE_H);
        ctx.fillStyle = '#b33b2e';
        ctx.fillRect(0, 0, SCENE_W, 10);
        // 메뉴판
        ctx.fillStyle = '#3a2a1e';
        ctx.fillRect(14, 16, 40, 22);
        ctx.fillStyle = '#f7f2e8';
        for (let i = 0; i < 4; i++) ctx.fillRect(18, 20 + i * 4, 24, 1);
        // 테이블과 떡볶이
        ctx.fillStyle = '#8a5a3a';
        ctx.fillRect(48, 64, 64, 6);
        ctx.fillStyle = '#e9ecf3';
        ctx.fillRect(70, 60, 20, 4);
        ctx.fillStyle = '#e0473d';
        ctx.fillRect(72, 59, 16, 3);
        // 김
        if (Math.sin(t * 3) > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(78, 52 + Math.round(Math.sin(t * 2) * 2), 1, 4);
          ctx.fillRect(83, 50 + Math.round(Math.cos(t * 2) * 2), 1, 4);
        }
        drawBenchFigure(ctx, 58, 66, o.pl, o.kit, Math.sin(t * 2) > 0.7, t);
        drawBenchFigure(ctx, 102, 66, extras.mates[0], mateKit, Math.sin(t * 2 + 2) > 0.7, t);
        drawBenchFigure(ctx, 80, 50, extras.mates[1], mateKit, Math.sin(t * 2 + 4) > 0.7, t);
        meX = 58;
        meTop = 52;
        // 하트
        const hy = 40 - ((t * 10) % 20);
        ctx.fillStyle = '#ff6a9a';
        ctx.fillRect(64, Math.round(hy), 1, 1);
        ctx.fillRect(66, Math.round(hy), 1, 1);
        ctx.fillRect(64, Math.round(hy) + 1, 3, 1);
        ctx.fillRect(65, Math.round(hy) + 2, 1, 1);
        break;
      }
      case 'rest': {
        ctx.fillStyle = '#2a3150';
        ctx.fillRect(0, 0, SCENE_W, SCENE_H);
        // 창밖 달
        ctx.fillStyle = '#4a5a8a';
        ctx.fillRect(110, 10, 34, 24);
        ctx.fillStyle = '#ffe9a0';
        ctx.fillRect(130, 14, 6, 6);
        // 침대
        ctx.fillStyle = '#6b4a3a';
        ctx.fillRect(30, 58, 90, 14);
        ctx.fillStyle = '#e9ecf3';
        ctx.fillRect(32, 52, 18, 8);
        ctx.fillStyle = o.kit.jersey;
        ctx.fillRect(48, 54, 70, 8);
        // 자는 얼굴
        ctx.fillStyle = ['#f6d2b0', '#e8b48a', '#c98d5f', '#8d5a3b', '#5a3a26'][o.pl.look.skin % 5];
        ctx.fillRect(38, 50, 7, 6);
        ctx.fillStyle = '#1b1410';
        ctx.fillRect(40, 53, 2, 1);
        meX = 42;
        meTop = 46;
        // Z z z
        ctx.fillStyle = '#e9ecf3';
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.8 + i * 0.33) % 1;
          const zx = 48 + i * 6 + k * 6;
          const zy = 44 - k * 22;
          ctx.fillRect(Math.round(zx), Math.round(zy), 3, 1);
          ctx.fillRect(Math.round(zx) + 1, Math.round(zy) + 1, 1, 1);
          ctx.fillRect(Math.round(zx), Math.round(zy) + 2, 3, 1);
        }
        break;
      }
      case 'rehab': {
        floor(ctx, '#d9dde6', '#9aa8b8');
        ctx.fillStyle = '#e0473d';
        ctx.fillRect(130, 10, 8, 2);
        ctx.fillRect(133, 7, 2, 8);
        // 매트와 얼음 주머니
        ctx.fillStyle = '#3d8fe0';
        ctx.fillRect(40, 66, 70, 4);
        meX = 74;
        const up = Math.sin(t * 2) > 0;
        meTop = fig(ctx, o.pl, o.kit, meX, 66, up ? ACT.INJURED : ACT.STANCE, t);
        ctx.fillStyle = '#bfe6ff';
        ctx.fillRect(meX + 3, 60, 4, 3);
        break;
      }
    }
    // 얻은 포인트가 차례로 떠오른다
    if (o.gained) {
      const age = t - start;
      const items = (['P', 'T', 'M'] as const).filter((k) => o.gained![k] > 0);
      items.forEach((k, i) => {
        const a = age - i * 0.45;
        if (a < 0 || a > 1.6) return;
        const y = meTop - 4 - a * 14;
        ctx.globalAlpha = a > 1.2 ? (1.6 - a) / 0.4 : 1;
        ctx.fillStyle = '#0d1018';
        const text = `+${o.gained![k]}`;
        ctx.fillRect(meX - text.length * 2 - 5, Math.round(y) - 1, text.length * 4 + 7, 7);
        ctx.fillStyle = PT_COLOR[k];
        ctx.fillRect(meX - text.length * 2 - 4, Math.round(y) + 1, 3, 3);
        drawDigits(ctx, text, meX + 1, Math.round(y), PT_COLOR[k]);
        ctx.globalAlpha = 1;
      });
    }
  });
}
