// 개발용: 모든 동작 × 방향을 한 장에 그려서 확인
import { Rng } from '../core/rng';
import { generatePlayer } from '../data/player';
import { ACT } from '../sim/types';
import { drawFigure, type Facing } from '../view/character';

const c = document.getElementById('c') as HTMLCanvasElement;
const ctx = c.getContext('2d')!;
ctx.fillStyle = '#d8a66a';
ctx.fillRect(0, 0, c.width, c.height);
const rng = new Rng(4);
const players = [generatePlayer(rng, 'PG', 0, 7), generatePlayer(rng, 'C', 0, 34), generatePlayer(rng, 'SF', 0, 23)];
players[0].look.hair = 2;
players[1].look.hair = 6;
const acts = Object.entries(ACT);
const facings: [Facing, boolean][] = [
  ['side', false],
  ['side', true],
  ['front', false],
  ['back', false],
];
acts.forEach(([name, act], k) => {
  const col = k % 9;
  const row = Math.floor(k / 9);
  facings.forEach(([facing, flip], fi) => {
    const pl = players[(k + fi) % 3];
    const x = 14 + col * 52 + fi * 11;
    const y = 50 + row * 70 + (fi % 2) * 4;
    const air: number[] = [ACT.SHOOT, ACT.LAYUP, ACT.DUNK, ACT.REBOUND, ACT.BLOCK, ACT.HANG, ACT.DUNK2, ACT.TOMAHAWK, ACT.REVERSE, ACT.WINDMILL, ACT.D360];
    const lift = air.includes(act) ? 8 : 0;
    drawFigure(ctx, x, y, { pl, kit: { jersey: fi % 2 ? '#3d8fe0' : '#e0473d', trim: '#ffffff' }, facing, flip, act, speed: (act === ACT.IDLE && fi === 0) || (act === ACT.STANCE && fi === 1) ? 4 : 0, lift, time: 0.3, seed: k, tired: false });
  });
  ctx.fillStyle = '#1b1f2a';
  ctx.font = '8px monospace';
  ctx.fillText(name, 4 + col * 52, 62 + row * 70);
});
