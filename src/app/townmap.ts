// 작은 메인 맵 (G10): 학교, 공원 코트, 집, 분식집, 병원. 내 선수가 돌아다니고, 건물을 누르면 그 행동을 고른다.
import type { Player } from '../data/player';
import type { ActionId } from '../career/career';
import { ACT } from '../sim/types';
import { drawFigure, type Kit } from '../view/character';
import { liveCanvas } from './figure';

export const MAP_W = 320;
export const MAP_H = 150;

export type PlaceId = 'school' | 'park' | 'home' | 'snack' | 'hospital';

interface Place {
  id: PlaceId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 문 앞 (걸어가는 곳) */
  door: [number, number];
  actions: ActionId[];
}

export const PLACES: Place[] = [
  { id: 'school', label: '학교 체육관', x: 14, y: 18, w: 108, h: 62, door: [68, 92], actions: ['team', 'solo', 'trainer', 'weight', 'video'] },
  { id: 'park', label: '공원 코트', x: 208, y: 84, w: 100, h: 56, door: [222, 112], actions: ['street', 'mentor'] },
  { id: 'home', label: '집', x: 238, y: 14, w: 52, h: 40, door: [264, 62], actions: ['rest'] },
  { id: 'snack', label: '분식집', x: 128, y: 104, w: 52, h: 34, door: [154, 100], actions: ['friends', 'ad'] },
  { id: 'hospital', label: '병원', x: 150, y: 14, w: 52, h: 40, door: [176, 62], actions: ['rehab'] },
];

export function placeOf(a: ActionId): Place {
  return PLACES.find((p) => p.actions.includes(a)) ?? PLACES[0];
}

interface MapState {
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** 다음에 어슬렁거릴 시각 */
  idleAt: number;
  hover: PlaceId | null;
  onArrive: (() => void) | null;
}

function roof(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, col: string) {
  ctx.fillStyle = col;
  for (let i = 0; i < 6; i++) ctx.fillRect(x - 3 + i, y - 6 + i, w + 6 - i * 2, 1);
}

function drawPlace(ctx: CanvasRenderingContext2D, p: Place, hot: boolean, t: number) {
  const { x, y, w, h } = p;
  if (p.id === 'park') {
    ctx.fillStyle = '#3f7a46';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#c98a4a';
    ctx.fillRect(x + 22, y + 8, w - 30, h - 16);
    ctx.fillStyle = '#e9ecf3';
    ctx.fillRect(x + 22, y + h / 2, w - 30, 1);
    ctx.fillRect(x + w - 16, y + h / 2 - 8, 1, 16);
    // 골대
    ctx.fillStyle = '#d9dde6';
    ctx.fillRect(x + w - 10, y + h / 2 - 14, 2, 18);
    ctx.fillRect(x + w - 14, y + h / 2 - 16, 8, 5);
    ctx.fillStyle = '#ff7a3a';
    ctx.fillRect(x + w - 18, y + h / 2 - 12, 4, 1);
    // 나무
    for (const [tx, ty] of [
      [x + 6, y + 8],
      [x + 8, y + 36],
    ] as const) {
      ctx.fillStyle = '#5a3a26';
      ctx.fillRect(tx + 3, ty + 8, 2, 5);
      ctx.fillStyle = '#2f6a3a';
      ctx.fillRect(tx, ty, 8, 9);
      ctx.fillStyle = '#4c9a56';
      ctx.fillRect(tx + 1, ty + 1, 4, 3);
    }
  } else {
    const body = { school: '#b5523d', home: '#d9c49a', snack: '#e8a040', hospital: '#e9ecf3' }[p.id];
    const top = { school: '#6b2f24', home: '#8a3a2b', snack: '#b33b2e', hospital: '#7a8aa8' }[p.id];
    ctx.fillStyle = body;
    ctx.fillRect(x, y, w, h);
    roof(ctx, x, y, w, top);
    // 창문 (밤처럼 깜빡이는 불빛)
    ctx.fillStyle = '#ffe38a';
    const cols = Math.floor((w - 8) / 12);
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < Math.floor((h - 14) / 12); j++) {
        const on = (Math.sin(t * 0.7 + i * 1.7 + j * 2.3 + x) + 1) / 2 > 0.25;
        ctx.fillStyle = on ? '#ffe38a' : '#6b5a3a';
        ctx.fillRect(x + 6 + i * 12, y + 6 + j * 12, 6, 6);
      }
    // 문
    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(p.door[0] - 3, y + h - 10, 7, 10);
    if (p.id === 'hospital') {
      ctx.fillStyle = '#e0473d';
      ctx.fillRect(x + w - 14, y + 4, 8, 2);
      ctx.fillRect(x + w - 11, y + 1, 2, 8);
    }
    if (p.id === 'school') {
      ctx.fillStyle = '#ffb545';
      ctx.fillRect(x + w / 2 - 14, y - 12, 28, 6);
      ctx.fillStyle = '#1d1406';
      ctx.fillRect(x + w / 2 - 12, y - 10, 24, 2);
    }
  }
  if (hot) {
    ctx.strokeStyle = '#ffb545';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 8.5, w + 5, h + 11);
  }
}

/** 건물 이름은 캔버스 위 HTML 글자로 (도트 확대해도 또렷하게) */
function addLabels(wrap: HTMLElement, names: Partial<Record<PlaceId, string>>) {
  wrap.querySelectorAll('.tlabel').forEach((e) => e.remove());
  for (const p of PLACES) {
    const el = document.createElement('span');
    el.className = 'tlabel';
    el.dataset.place = p.id;
    el.textContent = names[p.id] ?? p.label;
    el.style.left = `${((p.x + p.w / 2) / MAP_W) * 100}%`;
    el.style.top = `${((p.y + p.h + 2) / MAP_H) * 100}%`;
    wrap.appendChild(el);
  }
}

export class TownMap {
  private st: MapState;
  constructor(
    canvas: HTMLCanvasElement,
    private get: () => { pl: Player; kit: Kit; injured: boolean },
    onPick: (p: PlaceId) => void,
    names: Partial<Record<PlaceId, string>> = {},
  ) {
    canvas.width = MAP_W;
    canvas.height = MAP_H;
    const start = PLACES[0].door;
    this.st = { x: start[0], y: start[1], tx: start[0], ty: start[1], idleAt: 0, hover: null, onArrive: null };
    const toMap = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * MAP_W, ((e.clientY - r.top) / r.height) * MAP_H];
    };
    const hit = (mx: number, my: number) => PLACES.find((p) => mx >= p.x - 3 && mx <= p.x + p.w + 3 && my >= p.y - 8 && my <= p.y + p.h + 10)?.id ?? null;
    canvas.parentElement?.addEventListener('click', (e) => {
      const l = (e.target as HTMLElement).closest('.tlabel') as HTMLElement | null;
      if (l) onPick(l.dataset.place as PlaceId);
    });
    if (canvas.parentElement) addLabels(canvas.parentElement, names);
    canvas.onmousemove = (e) => {
      const [mx, my] = toMap(e);
      this.st.hover = hit(mx, my);
      canvas.style.cursor = this.st.hover ? 'pointer' : 'default';
      canvas.parentElement?.querySelectorAll<HTMLElement>('.tlabel').forEach((l) => l.classList.toggle('on', l.dataset.place === this.st.hover));
    };
    canvas.onmouseleave = () => (this.st.hover = null);
    canvas.onclick = (e) => {
      const [mx, my] = toMap(e);
      const id = hit(mx, my);
      if (id) onPick(id);
    };
    liveCanvas(canvas, (ctx, t) => this.draw(ctx, t));
  }

  /** 건물 앞으로 걸어간 뒤 done을 부른다 */
  walkTo(id: PlaceId, done: () => void) {
    const p = PLACES.find((x) => x.id === id)!;
    this.st.tx = p.door[0];
    this.st.ty = p.door[1];
    this.st.onArrive = done;
  }

  private last = 0;
  private draw(ctx: CanvasRenderingContext2D, t: number) {
    const dt = Math.min(0.05, this.last ? t - this.last : 0);
    this.last = t;
    const st = this.st;
    // 땅과 길
    ctx.fillStyle = '#2d4a33';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    ctx.fillStyle = '#8a8f9c';
    ctx.fillRect(0, 88, MAP_W, 10);
    ctx.fillRect(150, 58, 10, 32);
    ctx.fillRect(254, 58, 10, 32);
    ctx.fillRect(176, 58, 92, 6);
    ctx.fillStyle = '#e9ecf3';
    for (let x = 4; x < MAP_W; x += 14) ctx.fillRect(x, 92, 6, 1);
    for (const p of PLACES) drawPlace(ctx, p, st.hover === p.id, t);
    // 이동: 길(y=93)을 따라 간다
    const sp = 70 * dt;
    let moving = false;
    const road = 93;
    const goal = (x: number, y: number) => {
      const dx = x - st.x;
      const dy = y - st.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.6) return true;
      st.x += (dx / d) * Math.min(sp, d);
      st.y += (dy / d) * Math.min(sp, d);
      moving = true;
      return false;
    };
    if (Math.abs(st.tx - st.x) > 0.6 || Math.abs(st.ty - st.y) > 0.6) {
      // 길로 나간 뒤 옆으로, 그다음 문으로
      if (Math.abs(st.x - st.tx) > 2 && Math.abs(st.y - road) > 0.6) goal(st.x, road);
      else if (Math.abs(st.x - st.tx) > 0.6) goal(st.tx, road);
      else goal(st.tx, st.ty);
    } else if (st.onArrive) {
      const f = st.onArrive;
      st.onArrive = null;
      f();
    } else if (t > st.idleAt) {
      // 가끔 근처를 어슬렁
      st.idleAt = t + 3 + Math.random() * 4;
      st.tx = Math.max(8, Math.min(MAP_W - 8, st.x + (Math.random() - 0.5) * 30));
      st.ty = road;
    }
    const { pl, kit, injured } = this.get();
    const facing = moving ? 'side' : 'front';
    const flip = st.tx < st.x;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(Math.round(st.x) - 5, Math.round(st.y), 10, 2);
    drawFigure(ctx, st.x, st.y + 1, { pl, kit, facing, flip, act: ACT.IDLE, speed: moving ? (injured ? 1.5 : 3.5) : 0, lift: 0, time: t, seed: 9, tired: injured });
  }
}
