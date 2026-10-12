// 개발자 패널 (K9): 능력치 치트, 날짜 점프, 이벤트 강제 발동, 확률 표시, 빠른 배속, 리그 손보기, 스냅샷.
// 백틱(`) 키나 머리글 BASK 로고 5번 클릭으로 연다. 값을 바꾸면 그 커리어에 🔧 표시가 남는다.
import { Rng, randomSeed } from '../core/rng';
import { ABILITIES, type AbilityId } from '../data/abilities';
import { DUNKS, dunkList } from '../data/dunks';
import { overall, type Player } from '../data/player';
import { RATING_GROUPS, RATING_KEYS, type RatingKey } from '../data/ratings';
import { allStarGame, callUp, runAllStar } from '../career/allstar';
import { autoWeek, type AutoPolicy, type StopAt } from '../career/autoplay';
import { ACTIONS, dateText, MAX_RATING, teammates, type ActionId, type Career } from '../career/career';
import { EVENTS, forceEvent } from '../career/events';
import { leagueTeam } from '../career/league';
import { devFlags } from '../career/overseas';
import { seasonBase } from '../career/pro';
import { exportCareer, importCareer } from '../career/save';
import { applyMatch, playMatch, teamInfoOf } from '../career/match';
import { afterGame } from '../career/turn';
import type { Playback } from '../view/playback';
import { DEV } from '../view/devflags';
import type { ScreenId } from './dom';
import { download, esc, toast } from './dom';

export interface DevHost {
  career(): Career | null;
  /** 스냅샷을 되돌렸을 때 */
  setCareer(c: Career): void;
  /** 홈 화면 다시 그리기 */
  refresh(): void;
  save(): void;
  /** 쌓인 화면(드래프트, 이벤트, 경기)을 차례로 보여준다 */
  afterWeek(): void;
  screen(): ScreenId;
  pb(): Playback | null;
  /** 보고 있는 경기를 다른 시드로 다시 (결과를 아직 반영하기 전에만) */
  reroll(seed: number): boolean;
  /** 데모 경기 */
  exhibition(seed: number): void;
  /** 개발자 배속 켜기 */
  fastSpeeds(on: boolean): void;
}

type Tab = 'player' | 'time' | 'event' | 'game' | 'league' | 'save';
const TABS: [Tab, string][] = [
  ['player', '선수'],
  ['time', '시간'],
  ['event', '이벤트'],
  ['game', '경기'],
  ['league', '리그'],
  ['save', '세이브'],
];

const OPEN_KEY = 'bask.dev';
const SNAP_KEY = (n: number) => `bask.dev.snap.${n}`;

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const STOPS: [StopAt, string][] = [
  ['game', '다음 경기 직전'],
  ['draft', '드래프트'],
  ['allstar', '올스타 위크엔드'],
  ['national', '국가대표 경기'],
  ['season', '해 넘김 (시상식)'],
  ['contract', '재계약'],
  ['retire', '은퇴 결정'],
];

export class DevPanel {
  private el: HTMLElement;
  private tab: Tab = 'player';
  private running = false;
  private cancel = false;
  private log: string[] = [];
  private leagueTeam = '';
  private fast = false;
  /** 접으면 머리만 남는다 (경기 화면 볼 때) */
  private mini = false;

  constructor(private host: DevHost) {
    this.el = document.createElement('aside');
    this.el.className = 'devpanel';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.click(e));
    this.el.addEventListener('change', (e) => this.change(e));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        this.toggle();
      }
    });
    // 로고 5번 클릭 (3초 안에)
    let clicks: number[] = [];
    document.querySelector('.brand')?.addEventListener('click', () => {
      const now = Date.now();
      clicks = [...clicks.filter((t) => now - t < 3000), now];
      if (clicks.length >= 5) {
        clicks = [];
        this.toggle();
      }
    });
    if (store()?.getItem(OPEN_KEY) === '1') this.addButton();
  }

  toggle(force?: boolean) {
    const open = force ?? this.el.hidden;
    this.el.hidden = !open;
    this.layout();
    if (open) {
      store()?.setItem(OPEN_KEY, '1');
      this.addButton();
      this.render();
    }
  }

  /** 넓은 화면에선 게임 화면을 왼쪽으로 비켜서 안 겹치게 */
  private layout() {
    const side = this.isOpen() && !this.mini;
    if (document.body.classList.contains('devopen') === side) return;
    document.body.classList.toggle('devopen', side);
    window.dispatchEvent(new Event('resize'));
  }

  isOpen() {
    return !this.el.hidden;
  }

  /** 머리글 🔧 버튼 (한 번 열면 계속 보인다) */
  private addButton() {
    if (document.getElementById('btnDev')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'btnDev';
    b.title = '개발자 패널 (` 키)';
    b.textContent = '🔧';
    b.onclick = () => this.toggle();
    document.querySelector('.snd')?.prepend(b);
  }

  /** 홈·경기가 바뀌면 다시 그린다 */
  update() {
    if (this.isOpen() && !this.running) this.render();
  }

  private mark(c: Career) {
    c.dev = true;
  }

  render() {
    const c = this.host.career();
    const body = (() => {
      switch (this.tab) {
        case 'player':
          return c ? this.playerHtml(c) : this.noCareer();
        case 'time':
          return c ? this.timeHtml(c) : this.noCareer();
        case 'event':
          return c ? this.eventHtml(c) : this.noCareer();
        case 'game':
          return this.gameHtml();
        case 'league':
          return c ? this.leagueHtml(c) : this.noCareer();
        case 'save':
          return this.saveHtml(c);
      }
    })();
    this.el.classList.toggle('mini', this.mini);
    this.layout();
    this.el.innerHTML = `
      <div class="dvhead"><b>🔧 개발자 패널</b>${c?.dev ? '<small>이 커리어엔 🔧 표시가 남는다</small>' : '<small></small>'}<button type="button" data-dv="mini" title="접기/펴기">${this.mini ? '▼' : '▲'}</button><button type="button" data-dv="close" aria-label="닫기">✕</button></div>
      <nav class="dvtabs">${TABS.map(([t, l]) => `<button type="button" data-dvtab="${t}" class="${t === this.tab ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <div class="dvbody">${body}</div>`;
  }

  private noCareer() {
    return '<p class="muted">커리어를 불러오면 쓸 수 있다. (경기·세이브 탭은 지금도 된다)</p>';
  }

  // ───────────── 선수 ─────────────

  private playerHtml(c: Career) {
    const me = c.me;
    const num = (f: string, label: string, v: number, min: number, max: number) => `<label class="dvf"><span>${label}</span><input type="number" data-f="${f}" value="${Math.round(v)}" min="${min}" max="${max}" /></label>`;
    const ratings = RATING_GROUPS.map(
      (g) =>
        `<div class="dvgrp"><h5>${g.label}</h5>${g.items
          .map(([k, label]) => `<label class="dvf"><span>${label}</span><input type="number" data-r="${k}" value="${me.r[k]}" min="1" max="${MAX_RATING}" /></label>`)
          .join('')}</div>`,
    ).join('');
    const abil = ABILITIES.map((a) => {
      const n = me.abilities?.[a.id] ?? 0;
      const opts = (a.bad ? [0, 1] : [0, 1, 2, 3]).map((v) => `<option value="${v}" ${v === n ? 'selected' : ''}>${v === 0 ? '-' : a.bad ? '있음' : '★'.repeat(v)}</option>`).join('');
      return `<label class="dvf"><span>${a.label}</span><select data-ab="${a.id}">${opts}</select></label>`;
    }).join('');
    return `
      <p class="dvsum">종합 <b>${overall(me, c.prefPos).toFixed(1)}</b> · ${esc(dateText(c.week))} · 포인트 P${c.points.P} T${c.points.T} M${c.points.M}</p>
      <div class="dvrow"><button type="button" data-dv="all+5">전부 +5</button><button type="button" data-dv="all-5">전부 -5</button><input type="number" id="dvAllN" value="80" min="1" max="99" class="sm" /><button type="button" data-dv="allN">전부 이 값</button></div>
      <div class="dvrow"><button type="button" data-dv="pts">포인트 +20씩</button><button type="button" data-dv="money">돈 +1억</button><button type="button" data-dv="heal">부상 치료</button><button type="button" data-dv="rested">피로 0</button><button type="button" data-dv="friends">친밀도 100</button><button type="button" data-dv="dunks">덩크 전부 열기</button></div>
      <div class="dvgrp"><h5>몸과 상태</h5>
        ${num('height', '키 cm', me.body.heightCm, 150, 230)}${num('weight', '체중 kg', me.body.weightKg, 45, 150)}${num('potential', '잠재력', c.potential, 40, 99)}${num('age', '나이', me.age ?? 16, 15, 45)}
        ${num('fatigue', '피로', c.fatigue, 0, 100)}${num('condition', '컨디션 0~4', c.condition, 0, 4)}${num('trust', '감독 신뢰', c.trust, 0, 100)}${num('popularity', '인기', c.popularity ?? 0, 0, 100)}${num('money', '돈 (만원)', c.money ?? 0, 0, 99999999)}
      </div>
      ${ratings}
      <div class="dvgrp"><h5>특수능력</h5>${abil}</div>`;
  }

  private setRating(c: Career, k: RatingKey, v: number) {
    c.me.r[k] = Math.max(1, Math.min(MAX_RATING, Math.round(v)));
  }

  // ───────────── 시간 ─────────────

  private timeHtml(c: Career) {
    const acts = ACTIONS.filter((a) => !a.injuredOnly).map((a) => `<option value="${a.id}">${a.label} 반복</option>`).join('');
    return `
      <p class="dvsum">지금 ${esc(dateText(c.week))}${c.pendingGame ? ' · 이번 주 경기 대기 중 (먼저 결과만 치른다)' : ''}</p>
      <div class="dvgrp"><h5>진행 방법</h5>
        <label class="dvf wide"><span>행동</span><select id="dvPolicy"><option value="simple">자동 (팀·개인·웨이트·영상 돌려 쓰기, 지치면 휴식)</option>${acts}</select></label>
        <label class="dvf wide"><span>포인트 자동 투자</span><input type="checkbox" id="dvInvest" checked /></label>
        <p class="hint">경기는 결과만, 이벤트는 첫 번째 선택지, 재계약은 지금 팀. 은퇴를 물으면 멈춘다.</p>
      </div>
      <div class="dvrow"><input type="number" id="dvWeeks" value="4" min="1" max="1000" class="sm" /><button type="button" data-dv="weeks">주 진행</button></div>
      <div class="dvgrp"><h5>이정표까지 점프</h5><div class="dvrow">${STOPS.map(([s, l]) => `<button type="button" data-stop="${s}">${l}</button>`).join('')}</div></div>
      <div class="dvrow"><button type="button" data-dv="stop" ${this.running ? '' : 'disabled'}>멈추기</button><span id="dvProg" class="muted">${this.running ? '진행 중…' : ''}</span></div>
      <ul class="dvlog">${this.log
        .slice(-30)
        .reverse()
        .map((l) => `<li>${esc(l)}</li>`)
        .join('')}</ul>`;
  }

  private policy(): AutoPolicy {
    const v = (this.el.querySelector('#dvPolicy') as HTMLSelectElement | null)?.value ?? 'simple';
    return v === 'simple' ? 'simple' : { repeat: v as ActionId, focus: 'shoot' };
  }

  private async run(weeks: number, stop: StopAt) {
    const c = this.host.career();
    if (!c || this.running) return;
    const policy = this.policy();
    const invest = (this.el.querySelector('#dvInvest') as HTMLInputElement | null)?.checked ?? true;
    this.running = true;
    this.cancel = false;
    this.log = [];
    this.render();
    // 이번 주에 남은 경기가 있으면 먼저 결과만
    while (c.pendingGame) {
      applyMatch(c, playMatch(c));
      this.log.push(...afterGame(c));
    }
    let reason: string | null = null;
    const start = c.week;
    for (let i = 0; i < weeks && !this.cancel; i++) {
      const r = autoWeek(c, policy, { invest, stop });
      for (const n of r.notes) this.log.push(`${dateText(c.week - 1)} ${n}`);
      if (r.stopped) {
        reason = STOPS.find(([s]) => s === r.stopped)?.[1] ?? r.stopped;
        break;
      }
      if (i % 3 === 2) {
        const p = this.el.querySelector('#dvProg');
        if (p) p.textContent = `${c.week - start}주 진행 · ${dateText(c.week)}`;
        await new Promise((res) => window.setTimeout(res, 0));
      }
    }
    this.running = false;
    this.log.push(`— ${c.week - start}주 진행해서 ${dateText(c.week)}${reason ? ` (${reason}에서 멈춤)` : ''}`);
    this.host.save();
    this.host.refresh();
    this.render();
    this.host.afterWeek();
  }

  // ───────────── 이벤트 ─────────────

  private eventHtml(c: Career) {
    const pro = !!c.pro && !!c.league;
    const list = EVENTS.map((e) => `<li><button type="button" data-ev="${e.id}">발생</button><b>${esc(e.title)}</b><small class="muted">${e.id}</small></li>`).join('');
    return `
      <div class="dvgrp"><h5>프로 이벤트</h5><div class="dvrow">
        <button type="button" data-dv="allstar" ${pro ? '' : 'disabled'}>올스타 위크엔드 지금</button>
        <button type="button" data-dv="national" ${pro ? '' : 'disabled'}>국가대표 소집 지금</button>
        <button type="button" data-dv="contract" ${pro ? '' : 'disabled'}>재계약 지금</button>
        <button type="button" data-dv="abroad" ${pro && !c.overseas ? '' : 'disabled'}>해외 제안 받기 + 재계약</button>
        <button type="button" data-dv="ceremony" ${pro && c.league?.awards?.length ? '' : 'disabled'}>지난 시상식 다시</button>
        <button type="button" data-dv="retire" ${pro ? '' : 'disabled'}>은퇴 결정 지금</button>
      </div></div>
      <div class="dvgrp"><h5>이벤트 ${EVENTS.length}개 (조건 무시)</h5><ul class="dvevents">${list}</ul></div>`;
  }

  // ───────────── 경기 ─────────────

  private gameHtml() {
    const pb = this.host.pb();
    const seed = pb?.game.seed;
    const onGame = this.host.screen() === 'game';
    return `
      <div class="dvgrp"><h5>보기 (결과는 안 바뀐다)</h5>
        <label class="dvf wide"><span>슛·자유투 성공 확률 표시</span><input type="checkbox" data-flag="prob" ${DEV.prob ? 'checked' : ''} /></label>
        <label class="dvf wide"><span>선수 발밑 체력 숫자</span><input type="checkbox" data-flag="stamina" ${DEV.stamina ? 'checked' : ''} /></label>
        <label class="dvf wide"><span>배속 32x · 64x · 100x</span><input type="checkbox" data-flag="fast" ${this.fast ? 'checked' : ''} /></label>
      </div>
      <div class="dvgrp"><h5>경기 다시 뽑기</h5>
        <p class="dvsum">${onGame && seed !== undefined ? `지금 경기 시드 <b>${seed}</b>` : '경기 화면에서 쓸 수 있다'}</p>
        <div class="dvrow"><button type="button" data-dv="reroll" ${onGame ? '' : 'disabled'}>다른 시드로 다시</button><input type="number" id="dvSeed" value="${seed ?? 1}" class="md" /><button type="button" data-dv="seed" ${onGame ? '' : 'disabled'}>이 시드로</button></div>
        <p class="hint">커리어 경기는 결과를 반영하기 전(경기를 보는 중)에만 바꿀 수 있다. 바꾸면 🔧 표시.</p>
        <div class="dvrow"><button type="button" data-dv="exhibition">데모 경기 (시드)</button></div>
      </div>`;
  }

  // ───────────── 리그 ─────────────

  private leagueHtml(c: Career) {
    const L = c.league;
    const rows = (players: Player[], teamId: string) =>
      players
        .map((p) => {
          const s = L?.stats?.[p.id];
          const ppg = s ? (s.pts / Math.max(1, s.g)).toFixed(1) : '-';
          return `<tr class="${p.id === 'me' ? 'me' : ''}"><td>${p.number}</td><td class="nm">${esc(p.name)}</td><td>${p.pos}</td><td>${p.age ?? ''}</td><td>${overall(p).toFixed(0)}</td><td>${ppg}</td><td>${p.id === 'me' ? '' : `<button type="button" data-pl="${p.id}" data-t="${teamId}" data-d="5">+5</button><button type="button" data-pl="${p.id}" data-t="${teamId}" data-d="-5">-5</button>`}</td></tr>`;
        })
        .join('');
    let table = '';
    if (L && c.pro) {
      this.leagueTeam ||= c.pro.team;
      const t = L.teams.find((x) => x.info.id === this.leagueTeam) ?? L.teams[0];
      table = `<label class="dvf wide"><span>팀</span><select id="dvTeam">${L.teams.map((x) => `<option value="${x.info.id}" ${x === t ? 'selected' : ''}>${esc(x.info.city)} ${esc(x.info.name)}</option>`).join('')}</select></label>
        <table class="ttable dvt"><tr><th>#</th><th class="nm">이름</th><th>포</th><th>나이</th><th>종합</th><th>득점</th><th></th></tr>${rows(t.players, t.info.id)}</table>`;
    } else {
      table = `<h5>우리 학교 선수단</h5><table class="ttable dvt"><tr><th>#</th><th class="nm">이름</th><th>포</th><th>나이</th><th>종합</th><th>득점</th><th></th></tr>${rows(
        teammates(c).map((e) => e.player),
        'school',
      )}</table>`;
    }
    const rv = c.rival;
    const rival = rv
      ? `<div class="dvgrp"><h5>라이벌</h5><p class="dvsum">${esc(rv.player.name)} · ${esc(teamInfoOf(c, rv.school).full)} · 종합 ${overall(rv.player).toFixed(0)}</p><div class="dvrow"><button type="button" data-dv="rival+5">라이벌 +5</button><button type="button" data-dv="rival-5">라이벌 -5</button></div></div>`
      : '';
    return `${rival}<div class="dvgrp">${table}</div>`;
  }

  private findPlayer(c: Career, id: string, team: string): Player | undefined {
    if (team === 'school') return teammates(c).find((e) => e.player.id === id)?.player;
    return c.league ? leagueTeam(c.league, team)?.players.find((p) => p.id === id) : undefined;
  }

  // ───────────── 세이브 ─────────────

  private saveHtml(c: Career | null) {
    const snaps = [0, 1, 2].map((n) => {
      const raw = store()?.getItem(SNAP_KEY(n));
      let label = '비어 있음';
      if (raw) {
        try {
          const s = JSON.parse(raw) as { at: number; label: string };
          label = `${s.label} · ${new Date(s.at).toLocaleString()}`;
        } catch {
          label = '읽을 수 없음';
        }
      }
      return `<div class="dvrow"><span class="snap">${n + 1}. ${esc(label)}</span><button type="button" data-snap="${n}" data-op="take" ${c ? '' : 'disabled'}>찍기</button><button type="button" data-snap="${n}" data-op="load" ${raw ? '' : 'disabled'}>되돌리기</button></div>`;
    });
    const size = c ? (exportCareer(c).length / 1024).toFixed(0) : '-';
    return `
      <div class="dvgrp"><h5>지금 상태</h5><p class="dvsum">세이브 크기 ${size}KB</p>
        <div class="dvrow"><button type="button" data-dv="copy" ${c ? '' : 'disabled'}>JSON 복사</button><button type="button" data-dv="dump" ${c ? '' : 'disabled'}>JSON 파일로</button></div></div>
      <div class="dvgrp"><h5>빠른 스냅샷 (이 브라우저에만)</h5>${snaps.join('')}</div>
      <div class="dvgrp"><h5>브라우저 전체 기록</h5><div class="dvrow"><button type="button" data-dv="resetAch">업적 지우기</button><button type="button" data-dv="resetHall">명예의 전당 지우기</button></div></div>`;
  }

  // ───────────── 입력 ─────────────

  private change(e: Event) {
    const c = this.host.career();
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.dataset.flag) {
      const on = (t as HTMLInputElement).checked;
      if (t.dataset.flag === 'prob') DEV.prob = on;
      else if (t.dataset.flag === 'stamina') DEV.stamina = on;
      else {
        this.fast = on;
        this.host.fastSpeeds(on);
      }
      return;
    }
    if (t.id === 'dvTeam') {
      this.leagueTeam = t.value;
      return this.render();
    }
    if (!c) return;
    const v = Number(t.value);
    if (t.dataset.r) {
      this.setRating(c, t.dataset.r as RatingKey, v);
    } else if (t.dataset.ab) {
      const ab = (c.me.abilities ??= {});
      if (v > 0) ab[t.dataset.ab as AbilityId] = v;
      else delete ab[t.dataset.ab as AbilityId];
    } else if (t.dataset.f) {
      if (!Number.isFinite(v)) return;
      const f = t.dataset.f;
      if (f === 'height') c.me.body = { ...c.me.body, heightCm: v, wingspanCm: v + (c.me.body.wingspanCm - c.me.body.heightCm) };
      else if (f === 'weight') c.me.body = { ...c.me.body, weightKg: v };
      else if (f === 'potential') c.potential = v;
      else if (f === 'age') c.me.age = v;
      else if (f === 'fatigue') c.fatigue = Math.max(0, Math.min(100, v));
      else if (f === 'condition') c.condition = Math.max(0, Math.min(4, Math.round(v)));
      else if (f === 'trust') c.trust = Math.max(0, Math.min(100, v));
      else if (f === 'popularity') c.popularity = Math.max(0, Math.min(100, v));
      else if (f === 'money') c.money = Math.max(0, Math.round(v));
    } else return;
    this.mark(c);
    c.dunks = dunkList(c.me);
    this.host.save();
    this.host.refresh();
    this.render();
  }

  private click(e: Event) {
    const t = e.target as HTMLElement;
    const tab = t.closest('[data-dvtab]') as HTMLElement | null;
    if (tab) {
      this.tab = tab.dataset.dvtab as Tab;
      return this.render();
    }
    const b = t.closest('button') as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    const c = this.host.career();
    if (b.dataset.stop) return void this.run(48 * 40, b.dataset.stop as StopAt);
    if (b.dataset.ev && c) {
      c.pendingEvent = forceEvent(c, b.dataset.ev, Rng.fromState(c.rng));
      this.mark(c);
      this.host.save();
      toast('이벤트를 걸었다');
      return this.host.afterWeek();
    }
    if (b.dataset.pl && c) {
      const p = this.findPlayer(c, b.dataset.pl, b.dataset.t!);
      if (!p) return;
      const d = Number(b.dataset.d);
      for (const k of RATING_KEYS) p.r[k] = Math.max(1, Math.min(MAX_RATING, p.r[k] + d));
      this.mark(c);
      this.host.save();
      return this.render();
    }
    if (b.dataset.snap) return this.snapshot(Number(b.dataset.snap), b.dataset.op as 'take' | 'load');
    const act = b.dataset.dv;
    if (!act) return;
    if (act === 'close') return this.toggle(false);
    if (act === 'mini') {
      this.mini = !this.mini;
      return this.render();
    }
    if (act === 'stop') {
      this.cancel = true;
      return;
    }
    if (act === 'exhibition') {
      const s = Number((this.el.querySelector('#dvSeed') as HTMLInputElement | null)?.value) || randomSeed();
      return this.host.exhibition(s);
    }
    if (act === 'reroll' || act === 'seed') {
      const s = act === 'reroll' ? randomSeed() : Number((this.el.querySelector('#dvSeed') as HTMLInputElement).value);
      if (!this.host.reroll(s)) toast('이 경기는 이미 결과가 반영돼서 바꿀 수 없어');
      else if (c) this.mark(c);
      return this.render();
    }
    if (act === 'resetAch' || act === 'resetHall') {
      if (!confirm(act === 'resetAch' ? '업적을 전부 지울까?' : '명예의 전당을 비울까?')) return;
      store()?.removeItem(act === 'resetAch' ? 'bask.ach' : 'bask.hall');
      return toast('지웠어');
    }
    if (!c) return;
    switch (act) {
      case 'all+5':
      case 'all-5':
        for (const k of RATING_KEYS) this.setRating(c, k, c.me.r[k] + (act === 'all+5' ? 5 : -5));
        break;
      case 'allN': {
        const n = Number((this.el.querySelector('#dvAllN') as HTMLInputElement).value);
        for (const k of RATING_KEYS) this.setRating(c, k, n);
        break;
      }
      case 'pts':
        for (const k of ['P', 'T', 'M'] as const) c.points[k] += 20;
        break;
      case 'money':
        c.money = (c.money ?? 0) + 10000;
        break;
      case 'heal':
        c.injury = null;
        break;
      case 'rested':
        c.fatigue = 0;
        break;
      case 'friends':
        for (const id of Object.keys(c.friends)) c.friends[id] = 100;
        break;
      case 'dunks':
        for (const d of DUNKS) for (const [k, v] of Object.entries(d.need)) this.setRating(c, k as RatingKey, Math.max(c.me.r[k as RatingKey], v!));
        break;
      case 'rival+5':
      case 'rival-5':
        if (c.rival) for (const k of RATING_KEYS) c.rival.player.r[k] = Math.max(1, Math.min(MAX_RATING, c.rival.player.r[k] + (act === 'rival+5' ? 5 : -5)));
        break;
      case 'allstar': {
        const rng = Rng.fromState(c.rng);
        c.allStar = runAllStar(c, rng);
        c.rng = rng.state;
        const g = allStarGame(c);
        if (g) {
          if (c.pendingGame) c.gameQueue.unshift(c.pendingGame);
          c.pendingGame = g;
        }
        break;
      }
      case 'national': {
        const rng = Rng.fromState(c.rng);
        const camp = callUp(c, seasonBase(c), rng);
        c.rng = rng.state;
        if (!camp) {
          toast('국가대표에 못 뽑혔어 (능력치를 올려 봐)');
          return;
        }
        // 이번 주부터 한 주에 한 경기씩 당긴다
        camp.games.forEach((g, i) => (g.week = c.week - 1 + i));
        c.national = camp;
        if (c.pendingGame) c.gameQueue.unshift(c.pendingGame);
        c.pendingGame = { kind: 'official', pro: true, special: 'national', opponent: camp.games[0].opp, label: '아시아컵 조별리그', home: true };
        break;
      }
      case 'contract':
        c.contractPending = true;
        break;
      case 'abroad':
        devFlags.forceAbroad = true;
        c.contractPending = true;
        break;
      case 'ceremony':
        c.ceremony = c.league!.awards![c.league!.awards!.length - 1];
        break;
      case 'retire':
        c.retirePending = 'choice';
        break;
      case 'copy':
        void navigator.clipboard?.writeText(exportCareer(c)).then(
          () => toast('복사했어'),
          () => toast('복사 실패'),
        );
        return;
      case 'dump':
        return download(`bask-dev-${c.week}.json`, exportCareer(c));
      case 'weeks': {
        const n = Math.max(1, Math.min(1000, Number((this.el.querySelector('#dvWeeks') as HTMLInputElement).value) || 1));
        return void this.run(n, 'none');
      }
      default:
        return;
    }
    if (!['contract', 'ceremony'].includes(act)) this.mark(c);
    c.dunks = dunkList(c.me);
    this.host.save();
    this.host.refresh();
    this.render();
    if (['allstar', 'national', 'contract', 'abroad', 'ceremony', 'retire'].includes(act)) this.host.afterWeek();
  }

  private snapshot(n: number, op: 'take' | 'load') {
    const s = store();
    if (!s) return toast('브라우저 저장소를 쓸 수 없어');
    const c = this.host.career();
    if (op === 'take') {
      if (!c) return;
      try {
        s.setItem(SNAP_KEY(n), JSON.stringify({ at: Date.now(), label: `${c.me.name} ${dateText(c.week)}`, save: exportCareer(c) }));
        toast(`스냅샷 ${n + 1} 찍었어`);
      } catch {
        toast('저장 공간이 모자라');
      }
      return this.render();
    }
    const raw = s.getItem(SNAP_KEY(n));
    if (!raw) return;
    try {
      const snap = JSON.parse(raw) as { save: string };
      this.host.setCareer(importCareer(snap.save));
      toast(`스냅샷 ${n + 1}로 되돌렸어`);
    } catch (err) {
      toast((err as Error).message);
    }
    this.render();
  }
}
