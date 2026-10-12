// 패널 차트 두 개: 샷차트(위에서 본 코트)와 승리 확률 흐름 (V7).
// 둘 다 지금 재생 중인 시점까지만 그린다. 앞으로 일어날 일은 안 보여준다.
import { COURT, CORNER_U, MID_Y } from '../sim/court';
import { SHOT_LABEL } from '../sim/shooting';
import type { GameEvent, GameResult, ShotKind, Side } from '../sim/types';
import type { WpPoint } from '../sim/winprob';
import type { TeamLook } from './CourtScene';
import { colorDistance } from './pixel';

const NS = 'http://www.w3.org/2000/svg';
const SURFACE = '#1f2533';
const FLOOR = '#262d3d';
const GRID = '#3a445c';
const INK = '#e9ecf3';
const MUTED = '#98a2b9';
const ACCENT = '#ffb545';

type Attrs = Record<string, string | number>;
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

/** 팀 색이 차트 바탕에 묻히면 등번호 색으로 바꾼다 */
export function markColor(look: TeamLook): string {
  return colorDistance(look.fill, SURFACE) < 110 ? look.num : look.fill;
}

/** 공격 골대: 팀0은 전반에 오른쪽 */
function attacksRight(team: Side, quarter: number) {
  const firstHalf = quarter <= 2;
  return team === 0 ? firstHalf : !firstHalf;
}

function timeText(q: number, clock: number) {
  const qt = q <= 4 ? `${q}Q` : `OT${q - 4}`;
  const c = clock >= 60 ? `${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, '0')}` : clock.toFixed(1);
  return `${qt} ${c}`;
}

/** 차트 위에 뜨는 말풍선 하나 (값이 먼저, 이름이 뒤) */
class Tip {
  readonly box: HTMLDivElement;
  constructor(host: HTMLElement) {
    this.box = document.createElement('div');
    this.box.className = 'ctip';
    this.box.hidden = true;
    host.appendChild(this.box);
  }
  show(x: number, y: number, value: string, rows: string[], key?: string) {
    const b = this.box;
    b.replaceChildren();
    const v = document.createElement('b');
    if (key) {
      const k = document.createElement('i');
      k.style.background = key;
      v.appendChild(k);
    }
    v.appendChild(document.createTextNode(value));
    b.appendChild(v);
    for (const r of rows) {
      const s = document.createElement('span');
      s.textContent = r;
      b.appendChild(s);
    }
    b.hidden = false;
    const host = b.parentElement!.getBoundingClientRect();
    const w = b.offsetWidth;
    const left = Math.min(host.width - w - 4, Math.max(4, x + 12));
    const top = Math.max(4, y - b.offsetHeight - 10);
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
  }
  hide() {
    this.box.hidden = true;
  }
}

// ───────────────────────── 샷차트 ─────────────────────────

const ZONES: { label: string; kinds: ShotKind[] }[] = [
  { label: '골밑', kinds: ['dunk', 'layup'] },
  { label: '페인트', kinds: ['floater', 'hook'] },
  { label: '미드', kinds: ['mid'] },
  { label: '3점', kinds: ['three'] },
];

interface ShotDot {
  e: GameEvent;
  x: number;
  y: number;
}

export class ShotChart {
  private svg: SVGSVGElement;
  private dots: SVGGElement;
  private tip: Tip;
  private table: HTMLDivElement;
  private legend: HTMLDivElement;
  private key = '';
  private game: GameResult | null = null;
  private looks: [TeamLook, TeamLook] | null = null;
  private shots: ShotDot[] = [];
  /** 1m = S px */
  private readonly S = 14;

  constructor(host: HTMLElement) {
    host.classList.add('chartbox');
    this.legend = document.createElement('div');
    this.legend.className = 'clegend';
    host.appendChild(this.legend);
    const wrap = document.createElement('div');
    wrap.className = 'cwrap';
    host.appendChild(wrap);
    const W = COURT.length * this.S;
    const H = COURT.width * this.S;
    this.svg = el('svg', { viewBox: `-4 -4 ${W + 8} ${H + 8}`, class: 'shotsvg', role: 'img', 'aria-label': '샷차트' });
    wrap.appendChild(this.svg);
    this.drawCourt();
    this.dots = el('g', {}, this.svg);
    this.tip = new Tip(wrap);
    this.table = document.createElement('div');
    this.table.className = 'ctable';
    host.appendChild(this.table);
    this.svg.addEventListener('pointerleave', () => this.tip.hide());
  }

  private drawCourt() {
    const S = this.S;
    const W = COURT.length * S;
    const H = COURT.width * S;
    const g = el('g', { fill: 'none', stroke: GRID, 'stroke-width': 1 }, this.svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: FLOOR, stroke: GRID }, g);
    el('line', { x1: W / 2, y1: 0, x2: W / 2, y2: H }, g);
    el('circle', { cx: W / 2, cy: H / 2, r: COURT.centerCircleRadius * S }, g);
    for (const right of [false, true]) {
      const bx = right ? W : 0;
      const dir = right ? -1 : 1;
      const hx = bx + dir * COURT.hoopFromBaseline * S;
      const kw = COURT.keyWidth * S;
      const kl = COURT.keyLength * S;
      el('rect', { x: right ? W - kl : 0, y: H / 2 - kw / 2, width: kl, height: kw }, g);
      // 3점 라인: 코너 직선 + 호
      const cy = (MID_Y - COURT.threeCornerFromSide) * S;
      const cu = CORNER_U * S;
      const r = COURT.threeRadius * S;
      const top = H / 2 - cy;
      const bot = H / 2 + cy;
      const ex = bx + dir * cu;
      el('path', { d: `M${bx} ${top} L${ex} ${top} A${r} ${r} 0 0 ${right ? 0 : 1} ${ex} ${bot} L${bx} ${bot}` }, g);
      el('circle', { cx: hx, cy: H / 2, r: 0.23 * S, stroke: ACCENT }, g);
      el('line', { x1: bx + dir * COURT.backboardFromBaseline * S, y1: H / 2 - 0.9 * S, x2: bx + dir * COURT.backboardFromBaseline * S, y2: H / 2 + 0.9 * S, stroke: MUTED }, g);
    }
  }

  setGame(game: GameResult, looks: [TeamLook, TeamLook]) {
    this.game = game;
    this.looks = looks;
    this.key = '';
    this.shots = [];
    for (const e of game.events) {
      if ((e.type !== 'made' && e.type !== 'miss') || e.x === undefined || e.y === undefined) continue;
      // 팀0은 오른쪽 골대, 팀1은 왼쪽 골대로 모아서 그린다
      const want = e.team === 0;
      const flip = attacksRight(e.team, e.quarter) !== want;
      this.shots.push({ e, x: flip ? COURT.length - e.x : e.x, y: e.y });
    }
    this.legend.replaceChildren();
    for (const team of [1, 0] as const) {
      const s = document.createElement('span');
      const sw = document.createElement('i');
      sw.className = 'sw';
      sw.style.background = markColor(looks[team]);
      s.append(sw, document.createTextNode(`${game.teams[team].short} ${team === 0 ? '→' : '←'}`));
      this.legend.appendChild(s);
    }
    const note = document.createElement('span');
    note.className = 'note';
    note.textContent = '● 성공  ○ 실패';
    this.legend.appendChild(note);
  }

  update(tick: number, focus: number) {
    const game = this.game;
    if (!game) return;
    const visible = this.shots.filter((s) => s.e.tick <= tick);
    const key = `${visible.length}|${focus}`;
    if (key === this.key) return;
    this.key = key;
    const S = this.S;
    this.tip.hide();
    this.dots.replaceChildren();
    const looks = this.looks!;
    const hasFocus = focus >= 0 && visible.some((s) => s.e.player === focus);
    // 실패를 먼저, 성공을 위에, 고른 선수를 맨 위에
    const order = [...visible].sort((a, b) => Number(a.e.player === focus) - Number(b.e.player === focus) || Number(a.e.type === 'made') - Number(b.e.type === 'made'));
    for (const s of order) {
      const made = s.e.type === 'made';
      const c = markColor(looks[s.e.team]);
      const dim = hasFocus && s.e.player !== focus;
      const g = el('g', { class: 'shot', opacity: dim ? 0.18 : 1, tabindex: dim ? -1 : 0 }, this.dots);
      const cx = s.x * S;
      const cy = s.y * S;
      el('circle', { cx, cy, r: 11, fill: 'transparent' }, g);
      if (made) el('circle', { cx, cy, r: 4.5, fill: c, stroke: SURFACE, 'stroke-width': 2 }, g);
      else el('circle', { cx, cy, r: 3.5, fill: 'none', stroke: c, 'stroke-width': 1.5, opacity: 0.85 }, g);
      const show = () => {
        const p = game.players[s.e.player];
        const box = this.svg.getBoundingClientRect();
        const k = box.width / (COURT.length * S + 8);
        const kind = s.e.shot ? SHOT_LABEL[s.e.shot] : '슛';
        const extra = [s.e.blocked ? '블록당함' : '', s.e.alleyOop ? '앨리웁' : '', s.e.andOne ? '앤드원' : ''].filter(Boolean).join(' · ');
        this.tip.show((cx + 4) * k, (cy + 4) * k, `${made ? '성공' : '실패'} · ${kind} ${s.e.dist?.toFixed(1) ?? ''}m`, [`#${p.number} ${p.name} (${game.teams[s.e.team].short})`, timeText(s.e.quarter, s.e.clock) + (extra ? ` · ${extra}` : '')], c);
      };
      g.addEventListener('pointerenter', show);
      g.addEventListener('focus', show);
      g.addEventListener('pointerleave', () => this.tip.hide());
      g.addEventListener('blur', () => this.tip.hide());
    }
    this.renderTable(visible, focus, hasFocus);
  }

  /** 구역별 성공/시도 표 (툴팁 없이도 숫자를 볼 수 있게) */
  private renderTable(visible: ShotDot[], focus: number, hasFocus: boolean) {
    const game = this.game!;
    const rows: { label: string; list: ShotDot[]; color: string }[] = ([0, 1] as const).map((team) => ({ label: game.teams[team].short, list: visible.filter((s) => s.e.team === team), color: markColor(this.looks![team]) }));
    if (hasFocus) {
      const p = game.players[focus];
      rows.push({ label: `#${p.number} ${p.name}`, list: visible.filter((s) => s.e.player === focus), color: markColor(this.looks![game.teamOf[focus]]) });
    }
    const t = document.createElement('table');
    const head = t.insertRow();
    for (const h of ['', ...ZONES.map((z) => z.label), '합계']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    }
    for (const r of rows) {
      const tr = t.insertRow();
      const name = tr.insertCell();
      const sw = document.createElement('i');
      sw.className = 'sw';
      sw.style.background = r.color;
      name.append(sw, document.createTextNode(r.label));
      name.className = 'nm';
      const cell = (list: ShotDot[]) => {
        const m = list.filter((s) => s.e.type === 'made').length;
        const td = tr.insertCell();
        td.textContent = list.length ? `${m}/${list.length}` : '-';
        if (list.length) {
          const pc = document.createElement('small');
          pc.textContent = ` ${Math.round((m / list.length) * 100)}%`;
          td.appendChild(pc);
        }
      };
      for (const z of ZONES) cell(r.list.filter((s) => s.e.shot && z.kinds.includes(s.e.shot)));
      cell(r.list);
    }
    this.table.replaceChildren(t);
  }
}

// ───────────────────────── 승리 확률 ─────────────────────────

export class WinChart {
  private svg: SVGSVGElement;
  private plot: SVGGElement;
  private cross: SVGLineElement;
  private dot: SVGCircleElement;
  private tip: Tip;
  private stats: HTMLDivElement;
  private game: GameResult | null = null;
  private looks: [TeamLook, TeamLook] | null = null;
  private series: WpPoint[] = [];
  private shown: WpPoint[] = [];
  private key = '';
  private readonly W = 400;
  private readonly H = 190;
  private readonly M = { l: 30, r: 40, t: 14, b: 22 };
  private tMax = 2400;

  constructor(host: HTMLElement) {
    host.classList.add('chartbox');
    const wrap = document.createElement('div');
    wrap.className = 'cwrap';
    host.appendChild(wrap);
    this.svg = el('svg', { viewBox: `0 0 ${this.W} ${this.H}`, class: 'wpsvg', role: 'img', 'aria-label': '승리 확률 흐름' });
    wrap.appendChild(this.svg);
    this.plot = el('g', {}, this.svg);
    this.cross = el('line', { stroke: MUTED, 'stroke-width': 1, visibility: 'hidden' }, this.svg);
    this.dot = el('circle', { r: 4, fill: ACCENT, stroke: SURFACE, 'stroke-width': 2, visibility: 'hidden' }, this.svg);
    this.tip = new Tip(wrap);
    this.stats = document.createElement('div');
    this.stats.className = 'cstats';
    host.appendChild(this.stats);
    this.svg.addEventListener('pointermove', (ev) => this.hover(ev));
    this.svg.addEventListener('pointerleave', () => this.unhover());
  }

  private xOf(t: number) {
    return this.M.l + (t / this.tMax) * (this.W - this.M.l - this.M.r);
  }
  private yOf(p: number) {
    return this.M.t + (1 - p) * (this.H - this.M.t - this.M.b);
  }

  setGame(game: GameResult, looks: [TeamLook, TeamLook], series: WpPoint[]) {
    this.game = game;
    this.looks = looks;
    this.series = series;
    this.key = '';
  }

  update(tick: number) {
    const game = this.game;
    if (!game) return;
    const elapsed = game.rec.elapsed[Math.min(game.rec.n - 1, Math.floor(tick))];
    const q = game.rec.quarter[Math.min(game.rec.n - 1, Math.floor(tick))];
    const key = `${Math.floor(elapsed / 5)}|${q}|${tick >= game.rec.n - 1}`;
    if (key === this.key) return;
    this.key = key;
    const ended = tick >= game.rec.n - 1;
    this.shown = this.series.filter((p) => p.t <= elapsed + 0.01);
    if (ended) this.shown = this.series;
    // 연장에 들어가야 x축이 늘어난다 (미리 알려주지 않기)
    this.tMax = 2400 + Math.max(0, q - 4) * 300;
    this.draw(q);
    this.renderStats();
  }

  private draw(q: number) {
    const g = this.plot;
    g.replaceChildren();
    const looks = this.looks!;
    const game = this.game!;
    const x0 = this.xOf(0);
    const x1 = this.xOf(this.tMax);
    const y50 = this.yOf(0.5);
    // 바탕 격자 (25/50/75%)
    for (const p of [0, 0.25, 0.5, 0.75, 1]) el('line', { x1: x0, x2: x1, y1: this.yOf(p), y2: this.yOf(p), stroke: GRID, 'stroke-width': 1, opacity: p === 0.5 ? 1 : 0.55 }, g);
    // 쿼터 구분선과 이름
    for (let i = 1; i <= Math.max(4, q); i++) {
      const a = i <= 4 ? (i - 1) * 600 : 2400 + (i - 5) * 300;
      const b = i <= 4 ? i * 600 : 2400 + (i - 4) * 300;
      if (i > 1) el('line', { x1: this.xOf(a), x2: this.xOf(a), y1: this.M.t, y2: this.H - this.M.b, stroke: GRID, 'stroke-width': 1 }, g);
      const t = el('text', { x: (this.xOf(a) + this.xOf(b)) / 2, y: this.H - 6, fill: MUTED, 'font-size': 10, 'text-anchor': 'middle' }, g);
      t.textContent = i <= 4 ? `${i}Q` : `OT${i - 4}`;
    }
    // 위 = 팀0 승리, 아래 = 팀1 승리
    const yl = (p: number, text: string) => {
      const t = el('text', { x: x0 - 4, y: this.yOf(p) + 3.5, fill: MUTED, 'font-size': 9.5, 'text-anchor': 'end' }, g);
      t.textContent = text;
    };
    yl(1, '100');
    yl(0.75, '75');
    yl(0.5, '50');
    yl(0.25, '75');
    yl(0, '100');
    const teamLabel = (team: Side, y: number) => {
      const c = markColor(looks[team]);
      el('rect', { x: x0 + 6, y: y - 7, width: 8, height: 8, fill: c, rx: 1 }, g);
      const t = el('text', { x: x0 + 18, y, fill: INK, 'font-size': 10 }, g);
      t.textContent = `${game.teams[team].short} 승리 쪽`;
    };
    teamLabel(0, this.M.t + 12);
    teamLabel(1, this.H - this.M.b - 5);

    const pts = this.shown;
    if (pts.length < 1) return;
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${this.xOf(p.t).toFixed(1)} ${this.yOf(p.p).toFixed(1)}`).join('');
    const last = pts[pts.length - 1];
    const area = `${line}L${this.xOf(last.t).toFixed(1)} ${y50}L${this.xOf(pts[0].t).toFixed(1)} ${y50}Z`;
    // 50% 위는 팀0 색, 아래는 팀1 색을 옅게 깐다
    const id = `wpc${game.seed}`;
    const defs = el('defs', {}, g);
    const cTop = el('clipPath', { id: `${id}t` }, defs);
    el('rect', { x: 0, y: 0, width: this.W, height: y50 }, cTop);
    const cBot = el('clipPath', { id: `${id}b` }, defs);
    el('rect', { x: 0, y: y50, width: this.W, height: this.H - y50 }, cBot);
    el('path', { d: area, fill: markColor(looks[0]), opacity: 0.16, 'clip-path': `url(#${id}t)` }, g);
    el('path', { d: area, fill: markColor(looks[1]), opacity: 0.16, 'clip-path': `url(#${id}b)` }, g);
    el('path', { d: line, fill: 'none', stroke: ACCENT, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
    // 끝점과 값
    const lx = this.xOf(last.t);
    const ly = this.yOf(last.p);
    el('circle', { cx: lx, cy: ly, r: 4, fill: ACCENT, stroke: SURFACE, 'stroke-width': 2 }, g);
    const lead: Side = last.p >= 0.5 ? 0 : 1;
    const pct = Math.round((lead === 0 ? last.p : 1 - last.p) * 100);
    const t = el('text', { x: Math.min(lx + 7, this.W - 2), y: Math.max(this.M.t + 4, Math.min(this.H - this.M.b - 2, ly + 3.5)), fill: INK, 'font-size': 10.5, 'text-anchor': lx + 7 > this.W - this.M.r ? 'end' : 'start' }, g);
    if (lx + 7 > this.W - this.M.r) t.setAttribute('x', String(this.W - 2));
    t.textContent = `${game.teams[lead].short} ${pct}%`;
  }

  private hover(ev: PointerEvent) {
    if (!this.shown.length) return;
    const box = this.svg.getBoundingClientRect();
    const k = this.W / box.width;
    const mx = (ev.clientX - box.left) * k;
    const t = ((mx - this.M.l) / (this.W - this.M.l - this.M.r)) * this.tMax;
    // 가장 가까운 기록 지점으로 맞춘다
    let best = this.shown[0];
    for (const p of this.shown) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    const x = this.xOf(best.t);
    const y = this.yOf(best.p);
    this.cross.setAttribute('x1', String(x));
    this.cross.setAttribute('x2', String(x));
    this.cross.setAttribute('y1', String(this.M.t));
    this.cross.setAttribute('y2', String(this.H - this.M.b));
    this.cross.setAttribute('visibility', 'visible');
    this.dot.setAttribute('cx', String(x));
    this.dot.setAttribute('cy', String(y));
    this.dot.setAttribute('visibility', 'visible');
    const game = this.game!;
    const lead: Side = best.p >= 0.5 ? 0 : 1;
    const pct = Math.round((lead === 0 ? best.p : 1 - best.p) * 100);
    const clock = best.quarter <= 4 ? best.quarter * 600 - best.t : 2400 + (best.quarter - 4) * 300 - best.t;
    this.tip.show(x / k, y / k, `${game.teams[lead].short} ${pct}%`, [`${game.teams[0].short} ${best.score[0]} : ${best.score[1]} ${game.teams[1].short}`, timeText(best.quarter, Math.max(0, clock))], markColor(this.looks![lead]));
  }

  private unhover() {
    this.cross.setAttribute('visibility', 'hidden');
    this.dot.setAttribute('visibility', 'hidden');
    this.tip.hide();
  }

  /** 최대 리드, 역전, 동점 횟수 (지금까지) */
  private renderStats() {
    const game = this.game!;
    const pts = this.shown;
    const maxLead: [number, number] = [0, 0];
    let swaps = 0;
    let ties = 0;
    let prevSign = 0;
    let prevScore = '0:0';
    for (const p of pts) {
      const key = p.score.join(':');
      if (key === prevScore) continue;
      prevScore = key;
      const m = p.score[0] - p.score[1];
      if (m > maxLead[0]) maxLead[0] = m;
      if (-m > maxLead[1]) maxLead[1] = -m;
      const sign = Math.sign(m);
      if (sign === 0) ties++;
      else if (prevSign !== 0 && sign !== prevSign) swaps++;
      if (sign !== 0) prevSign = sign;
    }
    const tile = (label: string, value: string) => {
      const d = document.createElement('div');
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('b');
      v.textContent = value;
      d.append(l, v);
      return d;
    };
    this.stats.replaceChildren(
      tile(`${game.teams[0].short} 최대 리드`, maxLead[0] ? `+${maxLead[0]}` : '-'),
      tile(`${game.teams[1].short} 최대 리드`, maxLead[1] ? `+${maxLead[1]}` : '-'),
      tile('역전', `${swaps}번`),
      tile('동점', `${ties}번`),
    );
  }
}
