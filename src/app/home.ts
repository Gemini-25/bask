// 홈 화면: 선수 카드 + 이번 주 행동 / 능력치 투자 / 팀 / 기록
import { overall, POSITION_LABEL } from '../data/player';
import { grade, RATING_GROUPS, RATING_LABEL, type RatingKey } from '../data/ratings';
import { backgroundById, GROWTH_TYPES } from '../career/backgrounds';
import {
  ACTIONS,
  canAfford,
  canDo,
  CONDITION_LABEL,
  costOf,
  dateText,
  expectedPoints,
  fatigueGain,
  FOCUS,
  heightForecast,
  injuryRisk,
  invest,
  investCost,
  MAX_RATING,
  myOverall,
  POINT_LABEL,
  POINT_OF,
  weeksToGame,
  type ActionId,
  type Career,
  type FocusId,
  type Points,
} from '../career/career';
import { myTeam } from '../career/match';
import { schoolById } from '../career/schools';
import { minutesText } from '../sim/stats';
import { numberColorFor } from '../view/pixel';
import { $, esc, toast } from './dom';
import { figureCanvas } from './figure';

export interface HomeActions {
  doWeek(id: ActionId, focus?: FocusId): void;
  playGame(): void;
  save(silent?: boolean): void;
  exportFile(): void;
  toTitle(): void;
}

type Tab = 'week' | 'stats' | 'team' | 'records';
const COND_COLOR = ['#ff5a4a', '#ff9a4a', '#c9ced9', '#7bd88f', '#5fe0ff'];

export function fatigueColor(f: number) {
  return f >= 70 ? '#ff5a4a' : f >= 50 ? '#ffc93c' : '#7bd88f';
}

export function pointsHtml(p: Points, signed = false) {
  return (['P', 'T', 'M'] as const)
    .filter((k) => !signed || p[k])
    .map((k) => `<span class="pt pt${k}">${POINT_LABEL[k]} <b>${signed && p[k] > 0 ? '+' : ''}${p[k]}</b></span>`)
    .join('');
}

export class Home {
  private tab: Tab = 'week';
  private pending: Partial<Record<RatingKey, number>> = {};
  private focus: FocusId = 'shoot';
  private c: Career | null = null;

  constructor(private act: HomeActions) {
    const root = $('scr-home');
    root.onclick = (e) => this.click(e as MouseEvent);
  }

  render(c: Career) {
    if (this.c !== c) this.pending = {};
    this.c = c;
    const root = $('scr-home');
    const school = schoolById(c.school);
    root.innerHTML = `
      <div class="homebar">
        <div class="hdate"><b>${dateText(c.week)}</b><span>${esc(school.city)} ${esc(school.name)} 농구부</span></div>
        <div class="hnext">${this.nextText(c)}</div>
        <div class="hbtn"><button type="button" data-a="save">저장</button><button type="button" data-a="export">파일로 내보내기</button><button type="button" data-a="title">타이틀로</button></div>
      </div>
      <div class="home">
        <aside class="pcard" id="pcard"></aside>
        <section class="hmain">
          <nav class="tabs htabs">
            ${(
              [
                ['week', '이번 주'],
                ['stats', '능력치'],
                ['team', '팀'],
                ['records', '기록'],
              ] as [Tab, string][]
            )
              .map(([t, l]) => `<button type="button" data-tab="${t}" class="${this.tab === t ? 'on' : ''}">${l}</button>`)
              .join('')}
          </nav>
          <div class="hbody" id="hbody"></div>
        </section>
      </div>`;
    this.renderCard();
    this.renderTab();
  }

  private nextText(c: Career) {
    const w = weeksToGame(c.week);
    return w === 1 ? '<b class="hot">이번 주말 연습경기!</b>' : `연습경기까지 <b>${w}주</b>`;
  }

  private renderCard() {
    const c = this.c!;
    const school = schoolById(c.school);
    const team = myTeam(c);
    const me = team.meIndex;
    const role = me < 0 ? '부상 결장' : me < 5 ? `주전 ${team.team.players[me].pos}` : me === 5 ? '식스맨' : '벤치';
    const [h0, h1] = heightForecast(c);
    const gt = GROWTH_TYPES.find((g) => g.id === c.growth)!;
    const inj = c.injury ? `<div class="inj">🩹 ${esc(c.injury.name)} · ${c.injury.weeks}주 남음</div>` : '';
    $('pcard').innerHTML = `
      <div class="pfig"><canvas class="px" id="homeFig"></canvas></div>
      <div class="pname"><span class="no">${c.me.number}</span>${esc(c.me.name)}</div>
      <div class="psub">${dateText(c.week).split(' ')[0]} · ${POSITION_LABEL[c.prefPos]} · ${esc(backgroundById(c.background).label)}</div>
      <div class="povr"><span>종합</span><b>${myOverall(c).toFixed(0)}</b><small>감독 평가: ${role}</small></div>
      ${inj}
      <div class="meter"><span>컨디션</span><b style="color:${COND_COLOR[c.condition]}">${CONDITION_LABEL[c.condition]}</b><span class="dots">${[0, 1, 2, 3, 4].map((i) => `<i class="${i <= c.condition ? 'on' : ''}" style="${i <= c.condition ? `background:${COND_COLOR[c.condition]}` : ''}"></i>`).join('')}</span></div>
      <div class="meter"><span>피로</span><b>${Math.round(c.fatigue)}</b><span class="bar"><i style="width:${c.fatigue}%;background:${fatigueColor(c.fatigue)}"></i></span></div>
      <div class="kvs">
        <div><span>키</span><b>${c.me.body.heightCm}cm</b><small>최종 ${h0}~${h1}</small></div>
        <div><span>체중</span><b>${c.me.body.weightKg}kg</b></div>
        <div><span>잠재력</span><b>${c.potential}</b></div>
        <div><span>성장</span><b>${gt.label}</b></div>
      </div>
      <div class="ppts"><h4>가진 포인트</h4>${pointsHtml(c.points)}</div>`;
    figureCanvas($('homeFig') as HTMLCanvasElement, () => ({ pl: c.me, kit: { jersey: school.color, trim: numberColorFor(school.color) } }));
  }

  private renderTab() {
    const body = $('hbody');
    if (this.tab === 'week') body.innerHTML = this.weekHtml();
    else if (this.tab === 'stats') body.innerHTML = this.statsHtml();
    else if (this.tab === 'team') body.innerHTML = this.teamHtml();
    else body.innerHTML = this.recordsHtml();
  }

  private weekHtml() {
    const c = this.c!;
    if (c.pendingGame) {
      const opp = schoolById(c.pendingGame);
      return `<div class="act gamecard"><div class="ah"><b>연습경기</b></div><p>${esc(opp.city)} ${esc(opp.name)} · ${esc(opp.blurb)}</p><button type="button" class="primary big" data-a="game">경기장으로 ▶</button></div>`;
    }
    const cards = ACTIONS.filter((a) => !a.injuredOnly || c.injury)
      .map((a) => {
        const ok = canDo(c, a);
        const ex = expectedPoints(c, a);
        const fg = fatigueGain(c, a);
        const risk = injuryRisk(c, a);
        const focus =
          a.id === 'solo'
            ? `<div class="focus">${FOCUS.map((f) => `<button type="button" class="chipbtn ${this.focus === f.id ? 'on' : ''}" data-focus="${f.id}" title="${f.keys.map((k) => RATING_LABEL[k]).join(', ')}">${f.label}</button>`).join('')}</div>`
            : '';
        return `<div class="act ${ok ? '' : 'off'}">
          <div class="ah"><b>${a.label}</b>${risk >= 0.03 ? `<span class="risk" title="이번 주 부상 확률">부상 ${Math.round(risk * 100)}%</span>` : ''}</div>
          <p>${a.desc}</p>${focus}
          <div class="ap">${pointsHtml(ex, true) || '<span class="muted">포인트 없음</span>'}<span class="fat ${fg > 0 ? 'up' : 'down'}">피로 ${fg > 0 ? '+' : ''}${Math.round(fg)}</span></div>
          <button type="button" class="${ok ? 'primary' : ''}" data-do="${a.id}" ${ok ? '' : 'disabled'}>${ok ? '이걸로 한 주 보내기' : c.injury ? '부상 중엔 못 해' : '지금은 못 해'}</button>
        </div>`;
      })
      .join('');
    const last = c.log.slice(-1)[0];
    return `<div class="acts">${cards}</div>
      <p class="hint">피로가 쌓이면 부상 확률이 오르고 컨디션이 떨어진다. 컨디션이 좋으면 훈련 효율이 오르고 경기에서도 잘한다. 피로는 매주 조금씩 저절로 풀린다.${last ? ` · 지난주: ${esc(ACTIONS.find((x) => x.id === last.action)!.label)}` : ''}</p>`;
  }

  private statsHtml() {
    const c = this.c!;
    const cost = investCost(c, this.pending);
    const any = Object.values(this.pending).some((n) => n);
    const groups = RATING_GROUPS.map((g) => {
      const kind = POINT_OF[g.items[0][0]];
      return `<div class="sg"><h4>${g.label} <small>${POINT_LABEL[kind]} 포인트로</small></h4>${g.items
        .map(([k, label]) => {
          const v = c.me.r[k];
          const p = this.pending[k] ?? 0;
          const nv = v + p;
          const next = costOf(nv, c.potential);
          const trial = { ...this.pending, [k]: p + 1 };
          const can = nv < MAX_RATING && canAfford(c, trial);
          const gr = grade(nv);
          const xp = c.xp[k] ?? 0;
          const over = nv >= c.potential;
          return `<div class="srow${p ? ' up' : ''}">
            <span class="sl">${label}</span><span class="gr g${gr}">${gr}</span>
            <span class="sv">${nv}${p ? `<small>+${p}</small>` : ''}</span>
            <span class="bar"><i style="width:${v}%"></i>${p ? `<i class="pend" style="left:${v}%;width:${p}%"></i>` : ''}<em class="xp" style="width:${Math.round(xp * 100)}%" title="실전·훈련 경험치 ${Math.round(xp * 100)}%"></em></span>
            <span class="sc ${over ? 'over' : ''}" title="${over ? '잠재력을 넘어서 비싸다' : '다음 1 올리는 비용'}">${nv >= MAX_RATING ? 'MAX' : next}</span>
            <button type="button" data-inv="${k}" data-d="-1" ${p ? '' : 'disabled'} aria-label="${label} 내리기">−</button><button type="button" data-inv="${k}" data-d="1" ${can ? '' : 'disabled'} aria-label="${label} 올리기">+</button>
          </div>`;
        })
        .join('')}</div>`;
    }).join('');
    return `<div class="invbar">
        <div class="inv-pts">${(['P', 'T', 'M'] as const).map((k) => `<span class="pt pt${k}">${POINT_LABEL[k]} <b>${c.points[k] - cost[k]}</b><small>/${c.points[k]}</small></span>`).join('')}</div>
        <div class="inv-btn"><span class="muted">종합 ${myOverall(c).toFixed(1)} → <b>${this.previewOvr().toFixed(1)}</b></span><button type="button" data-a="reset" ${any ? '' : 'disabled'}>초기화</button><button type="button" class="primary" data-a="invest" ${any ? '' : 'disabled'}>확정</button></div>
      </div>
      <div class="sgs">${groups}</div>
      <p class="hint">숫자 옆 칸은 다음 1을 올리는 비용. 높을수록, 잠재력(${c.potential})을 넘을수록 비싸다. 막대 아래 가는 선은 경험치: 경기에서 실제로 한 플레이와 개인 훈련으로 차고, 다 차면 저절로 1 오른다. Shift+클릭 = 5씩.</p>`;
  }

  private previewOvr() {
    const c = this.c!;
    const r = { ...c.me.r };
    for (const [k, n] of Object.entries(this.pending)) r[k as RatingKey] += n ?? 0;
    return overall({ ...c.me, r }, c.prefPos);
  }

  private teamHtml() {
    const c = this.c!;
    const { team } = myTeam(c);
    const gradeOf = new Map(c.roster.map((e) => [e.player.id, e.grade]));
    const inTeam = new Set(team.players.map((p) => p.id));
    const rows = team.players
      .map((p, i) => {
        const role = i < 5 ? '주전' : i === 5 ? '식스맨' : '벤치';
        const me = p.id === 'me';
        const g = me ? Math.floor(c.week / 48) + 1 : gradeOf.get(p.id);
        return `<tr class="${me ? 'me' : ''}"><td>${role}</td><td>${p.pos}</td><td>${g}학년</td><td class="nm"><span class="no">${p.number}</span>${esc(p.name)}${me ? ' <b class="tagme">나</b>' : ''}</td><td>${p.body.heightCm}</td><td><b>${overall(p, p.pos).toFixed(0)}</b></td></tr>`;
      })
      .join('');
    const out = c.roster
      .filter((e) => !inTeam.has(e.player.id))
      .map((e) => `<tr class="dim"><td>명단 외</td><td>${e.player.pos}</td><td>${e.grade}학년</td><td class="nm"><span class="no">${e.player.number}</span>${esc(e.player.name)}</td><td>${e.player.body.heightCm}</td><td>${overall(e.player).toFixed(0)}</td></tr>`)
      .join('');
    const meOut = c.injury ? `<tr class="me dim"><td>부상</td><td>${c.prefPos}</td><td></td><td class="nm"><span class="no">${c.me.number}</span>${esc(c.me.name)} <b class="tagme">나</b></td><td>${c.me.body.heightCm}</td><td>${myOverall(c).toFixed(0)}</td></tr>` : '';
    return `<div class="tablewrap"><table class="ttable"><tr><th>역할</th><th>포지션</th><th>학년</th><th class="nm">선수</th><th>키</th><th>종합</th></tr>${rows}${meOut}${out}</table></div>
      <p class="hint">감독은 포지션마다 종합 능력치가 가장 높은 선수를 주전으로 쓴다. 선호 포지션이 아니어도 팀 사정에 따라 다른 자리에 설 수 있다. 연습경기에선 신입생도 식스맨으로 기회를 받는다.</p>`;
  }

  private recordsHtml() {
    const c = this.c!;
    const played = c.games.filter((g) => g.line);
    const sum = (f: (l: NonNullable<(typeof played)[number]['line']>) => number) => played.reduce((a, g) => a + f(g.line!), 0);
    const n = Math.max(1, played.length);
    const avg = played.length
      ? `<div class="avgs">${[
          ['경기', String(played.length)],
          ['출전', minutesText(sum((l) => l.sec) / n)],
          ['득점', (sum((l) => l.pts) / n).toFixed(1)],
          ['리바운드', (sum((l) => l.reb) / n).toFixed(1)],
          ['어시스트', (sum((l) => l.ast) / n).toFixed(1)],
          ['야투', `${sum((l) => l.fga) ? Math.round((sum((l) => l.fgm) / sum((l) => l.fga)) * 100) : 0}%`],
          ['3점', `${sum((l) => l.tpa) ? Math.round((sum((l) => l.tpm) / sum((l) => l.tpa)) * 100) : 0}%`],
        ]
          .map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`)
          .join('')}</div>`
      : '<p class="hint">아직 치른 경기가 없다. 4주마다 연습경기가 있다.</p>';
    const rows = c.games
      .slice()
      .reverse()
      .map((g) => {
        const opp = schoolById(g.opponent);
        const l = g.line;
        return `<tr><td>${dateText(g.week)}</td><td class="nm">${g.home ? 'vs' : '@'} ${esc(opp.name)}</td><td class="${g.won ? 'win' : 'loss'}">${g.won ? '승' : '패'} ${g.score[0]}:${g.score[1]}</td>${
          l
            ? `<td>${minutesText(l.sec)}</td><td>${l.pts}</td><td>${l.reb}</td><td>${l.ast}</td><td>${l.fgm}/${l.fga}</td><td>${l.tpm}/${l.tpa}</td><td class="grd g${g.grade}">${g.grade}</td>`
            : '<td colspan="7" class="muted">결장</td>'
        }</tr>`;
      })
      .join('');
    const log = c.log
      .slice(-10)
      .reverse()
      .map((w) => `<li><span class="t">${dateText(w.week)}</span><b>${esc(ACTIONS.find((a) => a.id === w.action)!.label)}${w.focus && w.action === 'solo' ? ` (${FOCUS.find((f) => f.id === w.focus)!.label})` : ''}</b>${pointsHtml(w.gained, true)}${w.notes.length ? `<small>${w.notes.map(esc).join(' · ')}</small>` : ''}</li>`)
      .join('');
    return `${avg}${rows ? `<div class="tablewrap"><table class="ttable"><tr><th>날짜</th><th class="nm">상대</th><th>결과</th><th>출전</th><th>득점</th><th>리바</th><th>어시</th><th>야투</th><th>3점</th><th>평가</th></tr>${rows}</table></div>` : ''}
      <h4 class="sub">최근 훈련</h4><ul class="wlog">${log || '<li class="muted">아직 없다</li>'}</ul>`;
  }

  private click(e: MouseEvent) {
    const c = this.c;
    if (!c) return;
    const t = e.target as HTMLElement;
    const tab = t.closest('[data-tab]') as HTMLElement | null;
    if (tab) {
      this.tab = tab.dataset.tab as Tab;
      for (const b of $('scr-home').querySelectorAll('.htabs button')) b.classList.toggle('on', (b as HTMLElement).dataset.tab === this.tab);
      return this.renderTab();
    }
    const f = t.closest('[data-focus]') as HTMLElement | null;
    if (f) {
      this.focus = f.dataset.focus as FocusId;
      return this.renderTab();
    }
    const d = t.closest('[data-do]') as HTMLButtonElement | null;
    if (d && !d.disabled) {
      if (Object.values(this.pending).some((n) => n)) {
        toast('능력치 투자를 먼저 확정하거나 초기화해줘');
        this.tab = 'stats';
        return this.render(c);
      }
      return this.act.doWeek(d.dataset.do as ActionId, this.focus);
    }
    const inv = t.closest('[data-inv]') as HTMLButtonElement | null;
    if (inv && !inv.disabled) {
      const k = inv.dataset.inv as RatingKey;
      const step = Number(inv.dataset.d);
      const times = e.shiftKey ? 5 : 1;
      for (let i = 0; i < times; i++) {
        const cur = this.pending[k] ?? 0;
        if (step < 0) {
          if (cur > 0) this.pending[k] = cur - 1;
        } else {
          const trial = { ...this.pending, [k]: cur + 1 };
          if (c.me.r[k] + cur < MAX_RATING && canAfford(c, trial)) this.pending = trial;
        }
      }
      return this.renderTab();
    }
    const a = t.closest('[data-a]') as HTMLButtonElement | null;
    if (!a || a.disabled) return;
    switch (a.dataset.a) {
      case 'save':
        return this.act.save();
      case 'game':
        return this.act.playGame();
      case 'export':
        return this.act.exportFile();
      case 'title':
        return this.act.toTitle();
      case 'reset':
        this.pending = {};
        return this.renderTab();
      case 'invest': {
        const ups = Object.entries(this.pending).filter(([, n]) => n);
        if (invest(c, this.pending)) {
          toast(ups.map(([k, n]) => `${RATING_LABEL[k as RatingKey]} +${n}`).join(' · '));
          this.pending = {};
          this.act.save(true);
          return this.render(c);
        }
        return;
      }
    }
  }

  /** 투자 중인 게 있는지 (화면을 떠날 때 확인용) */
  hasPending() {
    return Object.values(this.pending).some((n) => n);
  }
}
