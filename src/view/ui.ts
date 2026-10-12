import { POSITION_LABEL } from '../data/player';
import { grade, RATING_GROUPS } from '../data/ratings';
import { boxScore } from '../sim/stats';
import type { GameEvent, GameResult } from '../sim/types';
import type { TeamLook } from './CourtScene';
import type { Playback } from './playback';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const SPEEDS = [1, 2, 4, 8, 16];

export function clockText(sec: number): string {
  if (sec < 60) return sec.toFixed(1);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function quarterText(q: number): string {
  return q <= 4 ? `${q}Q` : `OT${q - 4}`;
}

const LOG_TYPES = new Set(['tip', 'quarterStart', 'quarterEnd', 'gameEnd', 'made', 'miss', 'rebound', 'turnover', 'ankle']);

export interface UiActions {
  togglePause(): void;
  setSpeed(s: number): void;
  skipQuarter(): void;
  toEnd(): void;
  restart(): void;
  newGame(): void;
  focus(i: number): void;
}

export class Ui {
  private game: GameResult | null = null;
  private looks: [TeamLook, TeamLook] | null = null;
  private logTick = -1;
  private boxDirty = true;
  private lastBox = 0;
  private cache = new Map<string, string>();
  private focus = -1;

  constructor(act: UiActions) {
    $('btnPlay').onclick = () => act.togglePause();
    $('btnSkip').onclick = () => act.skipQuarter();
    $('btnEnd').onclick = () => act.toEnd();
    $('btnRestart').onclick = () => act.restart();
    $('btnNew').onclick = () => act.newGame();
    const sp = $('speeds');
    sp.innerHTML = SPEEDS.map((s, i) => `<button type="button" data-speed="${s}" title="단축키 ${i + 1}">${s}x</button>`).join('');
    sp.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) act.setSpeed(Number(b.dataset.speed));
    };
    $('tabs').onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      this.showTab(b.dataset.tab!);
    };
    const pick = (e: Event) => {
      const row = (e.target as HTMLElement).closest('[data-p]') as HTMLElement | null;
      if (row) act.focus(Number(row.dataset.p));
    };
    $('tab-box').onclick = pick;
    $('roster').onclick = pick;
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        act.togglePause();
      } else if (e.key >= '1' && e.key <= '5') act.setSpeed(SPEEDS[Number(e.key) - 1]);
      else if (e.key === 'q' || e.key === 'Q') act.skipQuarter();
      else if (e.key === 'n' || e.key === 'N') act.newGame();
    });
  }

  private showTab(tab: string) {
    for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const t of ['log', 'box', 'player']) $(`tab-${t}`).hidden = t !== tab;
  }

  private set(id: string, text: string, html = false) {
    if (this.cache.get(id) === text) return;
    this.cache.set(id, text);
    const el = $(id);
    if (html) el.innerHTML = text;
    else el.textContent = text;
  }

  setGame(game: GameResult, looks: [TeamLook, TeamLook]) {
    this.game = game;
    this.looks = looks;
    this.cache.clear();
    this.logTick = -1;
    this.boxDirty = true;
    for (const side of [0, 1] as const) {
      const t = game.teams[side];
      $(`tname${side}`).textContent = `${t.city} ${t.name}`;
      $(`chip${side}`).style.background = looks[side].fill;
      $(`chip${side}`).style.boxShadow = `0 0 0 2px ${looks[side].num}`;
    }
    $('seed').textContent = String(game.seed);
    $('log').innerHTML = '';
    this.renderRoster();
    this.setFocus(-1);
  }

  setFocus(i: number) {
    this.focus = i;
    this.boxDirty = true;
    for (const el of document.querySelectorAll('[data-p]')) el.classList.toggle('focus', Number((el as HTMLElement).dataset.p) === i);
    this.renderPlayerCard();
    if (i >= 0) this.showTab('player');
  }

  setControls(paused: boolean, speed: number) {
    this.set('btnPlay', paused ? '▶ 재생' : '❚❚ 일시정지');
    for (const b of $('speeds').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.speed) === speed);
  }

  update(pb: Playback) {
    const game = this.game;
    if (!game) return;
    const fr = pb.sample();
    const score = pb.scoreAt(pb.cur);
    this.set('score0', String(score[0]));
    this.set('score1', String(score[1]));
    this.set('quarter', quarterText(fr.quarter));
    this.set('clock', clockText(fr.clock));
    this.set('shotclock', String(Math.ceil(fr.shotClock)));
    $('shotclock').classList.toggle('low', fr.shotClock <= 5 && fr.shotClock > 0);
    const pct = (pb.cur / pb.last) * 100;
    $('progress').style.width = `${pct.toFixed(2)}%`;

    // 문자 중계
    if (pb.cur < this.logTick) {
      $('log').innerHTML = '';
      this.logTick = -1;
      this.boxDirty = true;
    }
    const fresh = pb.eventsBetween(this.logTick, pb.cur);
    if (fresh.length) {
      this.appendLog(fresh);
      if (fresh.some((e) => e.type !== 'screen')) this.boxDirty = true;
    }
    this.logTick = pb.cur;

    const now = performance.now();
    if (this.boxDirty && now - this.lastBox > 250) {
      this.renderBox(pb.cur);
      this.boxDirty = false;
      this.lastBox = now;
    }
  }

  private teamTag(team: 0 | 1) {
    const t = this.game!.teams[team];
    return `<span class="tag" style="background:${this.looks![team].fill};color:${this.looks![team].num}">${esc(t.short)}</span>`;
  }

  private appendLog(evs: GameEvent[]) {
    const ul = $('log');
    const frag = document.createDocumentFragment();
    for (const e of evs) {
      if (!LOG_TYPES.has(e.type)) continue;
      const li = document.createElement('li');
      let cls = e.type;
      if (e.type === 'made' && (e.pts === 3 || e.shot === 'dunk')) cls += ' big';
      li.className = cls;
      const time = `${quarterText(e.quarter)} ${clockText(e.clock)}`;
      const side = e.type === 'quarterStart' || e.type === 'quarterEnd' || e.type === 'gameEnd' ? '' : this.teamTag(e.team);
      const sc = e.type === 'made' ? `<b class="sc">${e.score[0]}:${e.score[1]}</b>` : '';
      li.innerHTML = `<span class="t">${time}</span>${side}<span class="m">${esc(e.text)}</span>${sc}`;
      frag.prepend(li);
    }
    ul.prepend(frag);
    while (ul.children.length > 220) ul.lastElementChild!.remove();
  }

  private renderBox(tick: number) {
    const game = this.game!;
    const box = boxScore(game.events, tick);
    const rows = (team: 0 | 1) =>
      [0, 1, 2, 3, 4]
        .map((k) => {
          const i = team * 5 + k;
          const p = game.onCourt[i];
          const l = box.players[i];
          return `<tr data-p="${i}" class="${i === this.focus ? 'focus' : ''}"><td class="nm"><span class="no">${p.number}</span>${esc(p.name)} <small>${p.pos}</small></td><td>${l.pts}</td><td>${l.oreb + l.dreb}</td><td>${l.ast}</td><td>${l.stl}</td><td>${l.blk}</td><td>${l.tov}</td><td>${l.fgm}/${l.fga}</td><td>${l.tpm}/${l.tpa}</td></tr>`;
        })
        .join('');
    const tot = (team: 0 | 1) => {
      const t = box.teams[team];
      const fg = t.fga ? Math.round((t.fgm / t.fga) * 100) : 0;
      const tp = t.tpa ? Math.round((t.tpm / t.tpa) * 100) : 0;
      return `<tr class="tot"><td class="nm">합계 <small>야투 ${fg}% · 3점 ${tp}%</small></td><td>${t.pts}</td><td>${t.oreb + t.dreb}</td><td>${t.ast}</td><td>${t.stl}</td><td>${t.blk}</td><td>${t.tov}</td><td>${t.fgm}/${t.fga}</td><td>${t.tpm}/${t.tpa}</td></tr>`;
    };
    const head = `<tr><th class="nm">선수</th><th>득점</th><th>리바</th><th>어시</th><th>스틸</th><th>블록</th><th>실책</th><th>야투</th><th>3점</th></tr>`;
    const html = ([0, 1] as const)
      .map((team) => `<h3>${this.teamTag(team)} ${esc(game.teams[team].city)} ${esc(game.teams[team].name)}</h3><div class="tablewrap"><table>${head}${rows(team)}${tot(team)}</table></div>`)
      .join('');
    this.set('tab-box', html + '<p class="hint">선수 이름을 누르면 코트에 표시되고 능력치를 볼 수 있어.</p>', true);
  }

  private renderRoster() {
    const game = this.game!;
    const html = ([0, 1] as const)
      .map(
        (team) =>
          `<div class="rteam">${this.teamTag(team)}${[0, 1, 2, 3, 4]
            .map((k) => {
              const i = team * 5 + k;
              const p = game.onCourt[i];
              return `<button type="button" data-p="${i}"><span class="no">${p.number}</span>${esc(p.name)}</button>`;
            })
            .join('')}</div>`,
      )
      .join('');
    $('roster').innerHTML = html;
  }

  private renderPlayerCard() {
    const el = $('card');
    if (!this.game || this.focus < 0) {
      el.innerHTML = '<p class="hint">위에서 선수를 고르면 능력치 39개를 볼 수 있어.</p>';
      return;
    }
    const p = this.game.onCourt[this.focus];
    const team = this.focus < 5 ? 0 : 1;
    const groups = RATING_GROUPS.map(
      (g) =>
        `<div class="rg"><h4>${g.label}</h4>${g.items
          .map(([k, label]) => {
            const v = p.r[k];
            const gr = grade(v);
            return `<div class="rt"><span class="rl">${label}</span><span class="bar"><i style="width:${v}%"></i></span><span class="gr g${gr}">${gr}</span><span class="rv">${v}</span></div>`;
          })
          .join('')}</div>`,
    ).join('');
    el.innerHTML = `<div class="ph">${this.teamTag(team)}<b>#${p.number} ${esc(p.name)}</b><span>${POSITION_LABEL[p.pos]}</span></div>
      <div class="body">키 ${p.body.heightCm}cm · 윙스팬 ${p.body.wingspanCm}cm · 체중 ${p.body.weightKg}kg</div>${groups}`;
  }
}

