import { POSITION_LABEL } from '../data/player';
import { grade, RATING_GROUPS } from '../data/ratings';
import { SCHEME_LABEL } from '../sim/engine';
import { boxScore, minutesText, type BoxScore } from '../sim/stats';
import type { DefScheme, GameEvent, GameResult, Side } from '../sim/types';
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

const LOG_TYPES = new Set(['tip', 'quarterStart', 'quarterEnd', 'gameEnd', 'made', 'miss', 'rebound', 'turnover', 'ankle', 'foul', 'ft', 'sub', 'timeout', 'defense', 'ejected']);
const BANNER_TYPES = new Set(['quarterStart', 'quarterEnd', 'gameEnd', 'timeout']);

export interface UiActions {
  togglePause(): void;
  setSpeed(s: number): void;
  skipQuarter(): void;
  toEnd(): void;
  restart(): void;
  newGame(): void;
  focus(pid: number): void;
}

export class Ui {
  private game: GameResult | null = null;
  private looks: [TeamLook, TeamLook] | null = null;
  private logTick = -1;
  private boxDirty = true;
  private lastBox = 0;
  private box: BoxScore | null = null;
  private cache = new Map<string, string>();
  private focus = -1;
  private lastLineup = '';

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
    this.box = null;
    this.lastLineup = '';
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

  setFocus(pid: number) {
    this.focus = pid;
    this.boxDirty = true;
    for (const el of document.querySelectorAll('[data-p]')) el.classList.toggle('focus', Number((el as HTMLElement).dataset.p) === pid);
    this.cache.delete('card');
    if (pid >= 0) this.showTab('player');
  }

  setControls(paused: boolean, speed: number) {
    this.set('btnPlay', paused ? '▶ 재생' : '❚❚ 일시정지');
    for (const b of $('speeds').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.speed) === speed);
  }

  private timeoutsLeft(team: Side, tick: number, quarter: number): number {
    const alloc = quarter <= 2 ? 2 : quarter <= 4 ? 3 : 1;
    let used = 0;
    for (const e of this.game!.events) {
      if (e.tick > tick) break;
      if (e.type !== 'timeout' || e.team !== team) continue;
      const same = quarter <= 2 ? e.quarter <= 2 : quarter <= 4 ? e.quarter >= 3 && e.quarter <= 4 : e.quarter === quarter;
      if (same) used++;
    }
    return Math.max(0, alloc - used);
  }

  private schemeAt(team: Side, tick: number): DefScheme {
    let s: DefScheme = 'man';
    for (const e of this.game!.events) {
      if (e.tick > tick) break;
      if (e.type === 'defense' && e.team === team && e.scheme) s = e.scheme;
    }
    return s;
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
    $('progress').style.width = `${((pb.cur / pb.last) * 100).toFixed(2)}%`;

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

    const lineup = pb.lineupAt(pb.cur);
    const lineupKey = lineup.pids.join(',');
    if (lineupKey !== this.lastLineup) {
      this.lastLineup = lineupKey;
      this.boxDirty = true;
      for (const el of $('roster').querySelectorAll('[data-p]')) el.classList.toggle('oncourt', lineup.pids.includes(Number((el as HTMLElement).dataset.p)));
    }

    const now = performance.now();
    if (this.boxDirty && now - this.lastBox > 250) {
      this.box = boxScore(game, pb.cur);
      this.renderBox(lineup.pids);
      this.renderTeamInfo(pb.cur, fr.quarter);
      this.boxDirty = false;
      this.lastBox = now;
    }
    this.renderPlayerCard(lineup.pids, fr.energy);
  }

  private renderTeamInfo(tick: number, quarter: number) {
    const box = this.box!;
    for (const team of [0, 1] as const) {
      const tf = box.teamFouls[team];
      const left = this.timeoutsLeft(team, tick, quarter);
      const alloc = quarter <= 2 ? 2 : quarter <= 4 ? 3 : 1;
      const pips = '●'.repeat(left) + '○'.repeat(Math.max(0, alloc - left));
      this.set(`tf${team}`, `<span class="${tf >= 4 ? 'bonus' : ''}">팀파울 ${tf}${tf >= 4 ? ' 보너스' : ''}</span><span class="to" title="남은 타임아웃">${pips}</span>`, true);
      const s = this.schemeAt(team, tick);
      this.set(`def${team}`, `${this.teamTag(team)} 수비 <b>${SCHEME_LABEL[s]}</b>`, true);
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
      if (e.type === 'made' && (e.pts === 3 || e.shot === 'dunk' || e.andOne || e.alleyOop)) cls += ' big';
      if (e.type === 'ft' && !e.made) cls += ' missed';
      li.className = cls;
      const time = `${quarterText(e.quarter)} ${clockText(e.clock)}`;
      const side = BANNER_TYPES.has(e.type) && e.type !== 'timeout' ? '' : this.teamTag(e.team);
      const sc = e.type === 'made' || (e.type === 'ft' && e.made) ? `<b class="sc">${e.score[0]}:${e.score[1]}</b>` : '';
      li.innerHTML = `<span class="t">${time}</span>${side}<span class="m">${esc(e.text)}</span>${sc}`;
      frag.prepend(li);
    }
    ul.prepend(frag);
    while (ul.children.length > 260) ul.lastElementChild!.remove();
  }

  private renderBox(onCourt: number[]) {
    const game = this.game!;
    const box = this.box!;
    const rows = (team: 0 | 1) =>
      game.players
        .map((p, pid) => ({ p, pid }))
        .filter(({ pid }) => game.teamOf[pid] === team)
        .map(({ p, pid }) => {
          const l = box.players[pid];
          const on = onCourt.includes(pid);
          const cls = [pid === this.focus ? 'focus' : '', on ? 'on' : '', l.played ? '' : 'dnp'].join(' ');
          const pm = l.pm > 0 ? `+${l.pm}` : String(l.pm);
          if (!l.played) return `<tr data-p="${pid}" class="${cls}"><td class="nm"><span class="no">${p.number}</span>${esc(p.name)} <small>${p.pos}</small></td><td colspan="12" class="dnpc">출전 안 함</td></tr>`;
          return `<tr data-p="${pid}" class="${cls}"><td class="nm"><span class="no">${p.number}</span>${esc(p.name)} <small>${p.pos}</small></td><td>${minutesText(l.sec)}</td><td>${l.pts}</td><td>${l.oreb + l.dreb}</td><td>${l.ast}</td><td>${l.stl}</td><td>${l.blk}</td><td>${l.tov}</td><td class="${l.pf >= 4 ? 'warn' : ''}">${l.pf}</td><td>${l.fgm}/${l.fga}</td><td>${l.tpm}/${l.tpa}</td><td>${l.ftm}/${l.fta}</td><td>${pm}</td></tr>`;
        })
        .join('');
    const tot = (team: 0 | 1) => {
      const t = box.teams[team];
      const fg = t.fga ? Math.round((t.fgm / t.fga) * 100) : 0;
      const tp = t.tpa ? Math.round((t.tpm / t.tpa) * 100) : 0;
      const ft = t.fta ? Math.round((t.ftm / t.fta) * 100) : 0;
      return `<tr class="tot"><td class="nm">합계 <small>야투 ${fg}% · 3점 ${tp}% · 자유투 ${ft}%</small></td><td></td><td>${t.pts}</td><td>${t.oreb + t.dreb}</td><td>${t.ast}</td><td>${t.stl}</td><td>${t.blk}</td><td>${t.tov}</td><td>${t.pf}</td><td>${t.fgm}/${t.fga}</td><td>${t.tpm}/${t.tpa}</td><td>${t.ftm}/${t.fta}</td><td></td></tr>`;
    };
    const head = `<tr><th class="nm">선수</th><th>출전</th><th>득점</th><th>리바</th><th>어시</th><th>스틸</th><th>블록</th><th>실책</th><th>파울</th><th>야투</th><th>3점</th><th>자유투</th><th>±</th></tr>`;
    const html = ([0, 1] as const)
      .map((team) => `<h3>${this.teamTag(team)} ${esc(game.teams[team].city)} ${esc(game.teams[team].name)}</h3><div class="tablewrap"><table>${head}${rows(team)}${tot(team)}</table></div>`)
      .join('');
    this.set('tab-box', html + '<p class="hint">● 표시가 지금 코트에 있는 선수. 이름을 누르면 코트에 노란 화살표가 뜨고 능력치를 볼 수 있어.</p>', true);
  }

  private renderRoster() {
    const game = this.game!;
    const html = ([0, 1] as const)
      .map(
        (team) =>
          `<div class="rteam">${this.teamTag(team)}${game.players
            .map((p, pid) => ({ p, pid }))
            .filter(({ pid }) => game.teamOf[pid] === team)
            .map(({ p, pid }) => `<button type="button" data-p="${pid}"><span class="no">${p.number}</span>${esc(p.name)}</button>`)
            .join('')}</div>`,
      )
      .join('');
    $('roster').innerHTML = html;
  }

  private renderPlayerCard(onCourt: number[], energy: Uint8Array) {
    const game = this.game!;
    if (this.focus < 0) {
      this.set('card', '<p class="hint">위에서 선수를 고르면 능력치 39개와 체력을 볼 수 있어. 테두리가 밝은 선수가 지금 코트에 있는 선수야.</p>', true);
      return;
    }
    const pid = this.focus;
    const p = game.players[pid];
    const team = game.teamOf[pid];
    const slot = onCourt.indexOf(pid);
    const l = this.box?.players[pid];
    const e = slot >= 0 ? energy[slot] : -1;
    const energyHtml =
      e >= 0
        ? `<div class="energy"><span>체력</span><span class="bar"><i style="width:${e}%;background:${e < 45 ? '#ff5a4a' : e < 70 ? '#ffc93c' : '#7bd88f'}"></i></span><b>${e}</b></div>`
        : `<div class="energy off"><span>벤치</span></div>`;
    const line = l ? `<div class="body">${minutesText(l.sec)} 출전 · ${l.pts}점 ${l.oreb + l.dreb}리바 ${l.ast}어시 · 파울 ${l.pf}</div>` : '';
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
    // 체력은 매 프레임 바뀌니 숫자를 5 단위로 끊어 다시 그리는 횟수를 줄인다
    const key = `${pid}|${Math.round(e / 5)}|${l?.pts}|${l?.pf}|${Math.floor((l?.sec ?? 0) / 30)}`;
    if (this.cache.get('cardKey') === key) return;
    this.cache.set('cardKey', key);
    this.set(
      'card',
      `<div class="ph">${this.teamTag(team)}<b>#${p.number} ${esc(p.name)}</b><span>${POSITION_LABEL[p.pos]}</span></div>
      <div class="body">키 ${p.body.heightCm}cm · 윙스팬 ${p.body.wingspanCm}cm · 체중 ${p.body.weightKg}kg</div>${line}${energyHtml}${groups}`,
      true,
    );
  }
}
