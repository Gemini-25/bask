// 개발용 (M21): 동작마다 진행 순서대로 찍어 한 장에 (필름 띠). ?acts=SHOOT,DUNK 로 골라 볼 수 있다
import { Rng } from '../core/rng';
import { generatePlayer } from '../data/player';
import { ACT } from '../sim/types';
import { ANIMS, isOneShot } from '../view/anims';
import { drawFigureRig, type Facing } from '../view/character';

const c = document.getElementById('c') as HTMLCanvasElement;
const ctx = c.getContext('2d')!;
const q = new URLSearchParams(location.search);
const pick = q.get('acts')?.split(',');
const facingQ = (q.get('facing') ?? 'side') as Facing;
const rng = new Rng(4);
const players = [generatePlayer(rng, 'PG', 0, 7), generatePlayer(rng, 'C', 0, 34), generatePlayer(rng, 'SF', 0, 23)];
players[0].look.hair = 2;
players[1].look.hair = 6;
const air = new Set<number>([ACT.SHOOT, ACT.DEEP, ACT.LAYUP, ACT.DUNK, ACT.REBOUND, ACT.BLOCK, ACT.DUNK2, ACT.CDUNK, ACT.TOMAHAWK, ACT.REVERSE, ACT.WINDMILL, ACT.D360, ACT.DOUBLE, ACT.ELBOW, ACT.BETWEEN, ACT.FTLINE, ACT.FADE, ACT.TURNFADE, ACT.ONELEG, ACT.SCOOP, ACT.REVLAY, ACT.FINGER, ACT.POWERLAY, ACT.CLUTCH, ACT.POSTER, ACT.CONTACT, ACT.SKYHOOK, ACT.HOOK, ACT.FLOAT, ACT.CRADLE, ACT.HAMMER, ACT.SUPERMAN, ACT.SCORPION, ACT.SELFOOP, ACT.PUTBACK, ACT.ALLEY, ACT.CHASE, ACT.CONTEST]);
const late = new Set<number>([ACT.STEPBACK, ACT.SIDESTEP, ACT.EURO]);
const acts = Object.entries(ACT).filter(([n, a]) => ANIMS[a] && (!pick || pick.includes(n)));
const COLS = 9;
const CW = 40;
const RH = 62;
c.width = 70 + COLS * CW;
c.height = 10 + acts.length * RH;
c.style.width = `${c.width * 2}px`;
ctx.fillStyle = '#d8a66a';
ctx.fillRect(0, 0, c.width, c.height);
acts.forEach(([name, act], row) => {
  const y = 10 + row * RH + 48;
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, y + 3, c.width, 1);
  ctx.fillStyle = '#1b1f2a';
  ctx.font = '8px monospace';
  ctx.fillText(name, 2, y - 20);
  for (let k = 0; k < COLS; k++) {
    const p = k / (COLS - 1);
    const one = isOneShot(act);
    const pl = players[row % 3];
    // 점프: 동작 가운데쯤이 꼭대기
    let lift = 0;
    if (air.has(act)) lift = Math.round(Math.sin(Math.PI * Math.min(1, p * 1.1)) * 16);
    if (late.has(act)) lift = p > 0.45 ? Math.round(Math.sin(Math.PI * ((p - 0.45) / 0.55)) * 12) : 0;
    if (act === ACT.HANG) lift = 18;
    drawFigureRig(ctx, 70 + k * CW + 14, y, { pl, kit: { jersey: row % 2 ? '#3d8fe0' : '#e0473d', trim: '#ffffff' }, facing: facingQ, flip: false, act, speed: 0, lift, time: one ? 0 : p, seed: 0, tired: false, prog: p, carry: true });
  }
});
