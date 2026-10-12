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
  setCalendar,
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
  type ActionId,
  type Career,
  type FocusId,
  type Points,
} from '../career/career';
import { ABILITIES, abilityDef, FX, stars, type AbilityId } from '../data/abilities';
import { DUNKS, dunkUnlocked } from '../data/dunks';
import { DUNK_LABEL } from '../sim/types';
import { abilityProgress } from '../career/abilities';
import { myTeam, teamInfoOf, trustBonus } from '../career/match';
import { avgFriendship } from '../career/people';
import { schoolById } from '../career/schools';
import { groupStandings, nextGame, PRACTICE_WEEKS, roundLabel, type Tour } from '../career/season';
import { placeOf, TownMap, type PlaceId } from './townmap';
import { leagueTeam, PRO_WEEKS, standings } from '../career/league';
import { buy, has, itemDef, ITEMS, moneyText } from '../career/money';
import { leagueTeamName, nextProGame, teamName } from '../career/pro';
import { canRetire, hofScore, HOF_SCORE, RETIRE_FORCE_AGE, RETIRE_MIN_AGE } from '../career/legacy';
import { yearLabel } from '../career/college';
import { traitDef } from '../career/personality';
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
  /** 은퇴 선언 */
  retire(): void;
}

type Tab = 'week' | 'stats' | 'team' | 'schedule' | 'abilities' | 'life' | 'records';
const TABS: [Tab, string][] = [
  ['week', '행동'],
  ['stats', '능력치'],
  ['team', '팀'],
  ['schedule', '일정'],
  ['abilities', '특수능력'],
  ['life', '생활'],
  ['records', '기록'],
];
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
  private map: TownMap | null = null;
  /** 맵에서 고른 건물의 행동 강조 */
  private hl: PlaceId | null = null;
  private busy = false;

  constructor(private act: HomeActions) {
    const root = $('scr-home');
    root.onclick = (e) => this.click(e as MouseEvent);
  }

  render(c: Career) {
    if (this.c !== c) this.pending = {};
    this.c = c;
    setCalendar(c);
    const root = $('scr-home');
    const school = schoolById(c.school);
    const where = c.pro && c.league ? `${esc(leagueTeamName(c))} · 연봉 ${moneyText(c.pro.salary)}` : `${esc(school.city)} ${esc(school.name)} 농구부`;
    root.innerHTML = `
      <div class="homebar">
        <div class="hdate"><b>${dateText(c.week)}</b><span>${where}</span></div>
        <div class="hnext">${this.nextText(c)}</div>
        <div class="hbtn"><button type="button" data-a="save">저장</button><button type="button" data-a="export">파일로 내보내기</button><button type="button" data-a="title">타이틀로</button></div>
      </div>
      <div class="home">
        <aside class="pcard" id="pcard"></aside>
        <section class="hmain">
          <div class="townwrap"><canvas class="px town" id="townMap" aria-label="마을 지도: 건물을 누르면 그곳에서 할 수 있는 행동을 보여준다"></canvas></div>
          <nav class="menu" id="hmenu">
            ${TABS.map(([t, l]) => `<button type="button" data-tab="${t}" class="${this.tab === t ? 'on' : ''}">${l}</button>`).join('')}
          </nav>
          <div class="hbody" id="hbody"></div>
        </section>
      </div>`;
    this.renderCard();
    this.renderTab();
    const col = c.pro && c.league ? leagueTeam(c.league, c.pro.team).info.color : school.color;
    const kit = { jersey: col, trim: numberColorFor(col) };
    this.map = new TownMap($('townMap') as HTMLCanvasElement, () => ({ pl: c.me, kit, injured: !!c.injury }), (id) => {
      this.hl = id;
      this.tab = 'week';
      this.syncTabs();
      this.renderTab();
    }, c.pro ? { school: '구단 훈련장', snack: '시내 (촬영장·카페)' } : c.college ? { school: '대학 체육관', snack: '분식집 (아르바이트)' } : { snack: '분식집 (아르바이트)' });
    this.busy = false;
  }

  private syncTabs() {
    for (const b of $('scr-home').querySelectorAll('#hmenu button')) b.classList.toggle('on', (b as HTMLElement).dataset.tab === this.tab);
  }

  private nextText(c: Career) {
    if (c.pendingGame) return `<b class="hot">이번 주말 ${esc(c.pendingGame.label)}!</b>`;
    const n = c.pro ? nextProGame(c) : nextGame(c);
    const nameOf = (id: string) => teamInfoOf(c, id).full;
    if (!n) return '<span class="muted">남은 경기 없음</span>';
    const w = n.week - c.week + 1;
    const opp = n.opponent ? ` vs ${esc(nameOf(n.opponent))}` : '';
    return w === 1 ? `<b class="hot">이번 주말 ${esc(n.label)}${opp}</b>` : `다음 경기: <b>${esc(n.label)}</b>${opp} · ${w}주 뒤`;
  }

  private renderCard() {
    const c = this.c!;
    const school = teamInfoOf(c, c.pro ? c.pro.team : c.school);
    const team = myTeam(c);
    const me = team.meIndex;
    const role = me < 0 ? '부상 결장' : me < 5 ? `주전 ${team.team.players[me].pos}` : me === 5 ? '식스맨' : '벤치';
    const [h0, h1] = heightForecast(c);
    const gt = GROWTH_TYPES.find((g) => g.id === c.growth)!;
    const inj = c.injury ? `<div class="inj">🩹 ${esc(c.injury.name)} · ${c.injury.weeks}주 남음</div>` : '';
    $('pcard').innerHTML = `
      <div class="pfig"><canvas class="px" id="homeFig"></canvas></div>
      <div class="pname"><span class="no">${c.me.number}</span>${esc(c.me.name)}</div>
      <div class="psub">${c.pro ? `${c.me.age ?? ''}살 · ${c.pro.pickNo}순위 출신` : dateText(c.week).split(' ')[0]} · ${POSITION_LABEL[c.prefPos]} · ${esc(backgroundById(c.background).label)}</div>
      <div class="povr"><span>종합</span><b>${myOverall(c).toFixed(0)}</b><small>감독 평가: ${role}</small></div>
      ${inj}
      <div class="meter"><span>컨디션</span><b style="color:${COND_COLOR[c.condition]}">${CONDITION_LABEL[c.condition]}</b><span class="dots">${[0, 1, 2, 3, 4].map((i) => `<i class="${i <= c.condition ? 'on' : ''}" style="${i <= c.condition ? `background:${COND_COLOR[c.condition]}` : ''}"></i>`).join('')}</span></div>
      <div class="meter"><span>피로</span><b>${Math.round(c.fatigue)}</b><span class="bar"><i style="width:${c.fatigue}%;background:${fatigueColor(c.fatigue)}"></i></span></div>
      <div class="meter"><span>감독 신뢰</span><b>${Math.round(c.trust)}</b><span class="bar"><i style="width:${c.trust}%;background:#5fb4ff"></i></span></div>
      <div class="meter"><span>팀 친밀도</span><b>${Math.round(avgFriendship(c))}</b><span class="bar"><i style="width:${avgFriendship(c)}%;background:#ff8ac0"></i></span></div>
      ${this.abilityChips()}
      <div class="kvs">
        <div><span>키</span><b>${c.me.body.heightCm}cm</b><small>최종 ${h0}~${h1}</small></div>
        <div><span>체중</span><b>${c.me.body.weightKg}kg</b></div>
        <div><span>잠재력</span><b>${c.potential}</b></div>
        <div><span>성장</span><b>${gt.label}</b></div>
      </div>
      <div class="ppts"><h4>가진 포인트</h4>${pointsHtml(c.points)}</div>
      ${this.rivalHtml()}`;
    figureCanvas($('homeFig') as HTMLCanvasElement, () => ({ pl: c.me, kit: { jersey: school.color, trim: numberColorFor(school.color) } }));
  }

  private abilityChips() {
    const ab = this.c!.me.abilities ?? {};
    const list = (Object.entries(ab) as [AbilityId, number][]).filter(([, n]) => n);
    const traits = (this.c!.traits ?? []).map((t) => `<span class="ab trait" title="${esc(traitDef(t).desc)}">성격 · ${traitDef(t).label}</span>`).join('');
    if (!list.length) return traits ? `<div class="abs">${traits}</div>` : '';
    return `<div class="abs">${traits}${list.map(([id, n]) => `<span class="ab ${abilityDef(id).bad ? 'bad' : ''}" title="${esc(abilityDef(id).desc)}">${abilityDef(id).label}${abilityDef(id).bad ? '' : ` <b>${stars(n)}</b>`}</span>`).join('')}</div>`;
  }

  private rivalHtml() {
    const r = this.c!.rival;
    if (!r) return '';
    const where = teamInfoOf(this.c!, r.school).full;
    return `<div class="rival"><h4>라이벌</h4><div><b>${esc(r.player.name)}</b> <span class="muted">${esc(where)} · ${r.player.pos}</span></div>
      <div class="muted">종합 <b class="ink">${overall(r.player, r.player.pos).toFixed(0)}</b> · 맞대결 ${r.w}승 ${r.l}패</div></div>`;
  }

  private renderTab() {
    const body = $('hbody');
    if (this.tab === 'week') body.innerHTML = this.weekHtml();
    else if (this.tab === 'stats') body.innerHTML = this.statsHtml();
    else if (this.tab === 'team') body.innerHTML = this.teamHtml();
    else if (this.tab === 'schedule') body.innerHTML = this.scheduleHtml();
    else if (this.tab === 'abilities') body.innerHTML = this.abilitiesHtml();
    else if (this.tab === 'life') body.innerHTML = this.lifeHtml();
    else body.innerHTML = this.recordsHtml();
  }

  private proScheduleHtml() {
    const c = this.c!;
    const L = c.league!;
    const me = c.pro!.team;
    const rows = standings(L)
      .map((r, i) => `<tr class="${r.id === me ? 'me' : ''}"><td>${i + 1}</td><td class="nm"><i class="sw" style="background:${leagueTeam(L, r.id).info.color}"></i>${esc(teamName(L, r.id))}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf - r.pa > 0 ? '+' : ''}${r.pf - r.pa}</td></tr>`)
      .join('');
    const upcoming = L.games
      .filter((g) => !g.score && g.week >= c.week && (g.a === me || g.b === me))
      .sort((a, b) => a.week - b.week)
      .slice(0, 6)
      .map((g) => `<li><span>${dateText(g.week)}</span>${g.a === me ? 'vs' : '@'} ${esc(teamName(L, g.a === me ? g.b : g.a))}${g.series !== undefined ? ' <b class="fin">PO</b>' : ''}</li>`)
      .join('');
    const series = L.series.length
      ? `<div class="rnds">${[0, 1, 2]
          .map((r) => {
            const ss = L.series.filter((x) => x.round === r);
            if (!ss.length) return '';
            return `<div class="rnd"><h5>${PRO_WEEKS.playoffs[r].name}</h5>${ss.map((x) => `<div class="mt${x.a === me || x.b === me ? ' my' : ''}"><span class="${x.winner === x.a ? 'w' : ''}">${esc(leagueTeam(L, x.a).info.name)}</span><b>${x.winsA}:${x.winsB}</b><span class="${x.winner === x.b ? 'w' : ''}">${esc(leagueTeam(L, x.b).info.name)}</span></div>`).join('')}</div>`;
          })
          .join('')}</div>`
      : '<p class="muted">정규시즌 상위 6팀이 플레이오프에 나간다 (1·2위는 4강 직행).</p>';
    const hist = L.history.map((h) => `<li><span>${h.season + 1}시즌</span>우승 ${esc(teamInfoOf(c, h.champion).full)} · 내 팀 <b>${esc(h.myFinish)}</b></li>`).join('');
    const camp = c.national;
    const nat = camp
      ? `<h4 class="sub">국가대표 · 아시아컵 ${camp.result ? `<b class="fin">${esc(camp.result)}</b>` : ''}</h4><ul class="plist one">${camp.games
          .map((g) => `<li><span>${dateText(g.week)}</span>${g.final ? '결승' : '조별'} vs ${esc(teamInfoOf(c, g.opp).full)} ${g.score ? `<b class="${g.score[0] > g.score[1] ? 'win' : 'loss'}">${g.score[0]}:${g.score[1]}</b>` : '<span class="muted">예정</span>'}</li>`)
          .join('')}</ul>`
      : '';
    const as = c.allStar;
    const star = as ? `<h4 class="sub">올스타 위크엔드</h4><ul class="plist one"><li>${as.mySide >= 0 ? '<b class="fin">올스타 선정</b>' : '<span class="muted">선정 안 됨</span>'}${as.game ? ` · 올스타전 ${as.game.score[0]}:${as.game.score[1]} · MVP ${esc(as.game.mvp)}` : ''}</li><li>3점 콘테스트 우승 ${esc(as.threeWinner)}</li><li>덩크 콘테스트 우승 ${esc(as.dunkWinner)}</li></ul>` : '';
    return `<div class="grps"><div><h4 class="sub">정규시즌 순위</h4><table class="ttable"><tr><th></th><th class="nm">팀</th><th>승</th><th>패</th><th>득실</th></tr>${rows}</table></div>
      <div><h4 class="sub">다음 경기</h4><ul class="plist one">${upcoming || '<li class="muted">남은 경기 없음</li>'}</ul><h4 class="sub">플레이오프</h4>${series}${nat}${star}${hist ? `<h4 class="sub">역대 시즌</h4><ul class="plist one">${hist}</ul>` : ''}</div></div>
      <p class="hint">정규시즌 27경기 (9팀과 3번씩, 중간에 올스타 주간) → 6강 (3전 2선승) → 4강 (5전 3선승) → 챔피언 결정전 (7전 4선승). 플레이오프는 한 주에 경기가 여러 번.${c.overseas ? ' 해외 리그는 쿼터 12분, 6반칙 퇴장.' : ''} 비시즌 4월엔 국가대표 아시아컵.</p>`;
  }

  private lifeHtml() {
    const c = this.c!;
    const shop = (kind: 'gear' | 'house' | 'cheer') =>
      ITEMS.filter((i) => i.kind === kind)
        .map((i) => {
          const own = has(c, i.id);
          // 고교·대학 때도 장비는 살 수 있다 (아르바이트로)
          const can = (!!c.pro || i.kind === 'gear') && !own && c.money >= i.price;
          return `<div class="item ${own ? 'own' : ''}"><b>${esc(i.label)}</b><small>${esc(i.desc)}</small><div class="ib"><span>${moneyText(i.price)}</span><button type="button" data-buy="${i.id}" ${can ? '' : 'disabled'}>${own ? '가지고 있음' : '사기'}</button></div></div>`;
        })
        .join('');
    const sns = (c.sns ?? [])
      .slice(0, 12)
      .map((p) => `<li><b>@${esc(p.who)}</b> ${esc(p.text)} <small>♥ ${p.likes} · ${dateText(p.week)}</small></li>`)
      .join('');
    const contract = c.pro ? `<div class="kvs"><div><span>연봉</span><b>${moneyText(c.pro.salary)}</b></div><div><span>남은 계약</span><b>${c.pro.years}시즌</b></div><div><span>가진 돈</span><b>${moneyText(c.money)}</b></div><div><span>인기</span><b>${Math.round(c.popularity)}</b></div></div>` : `<p class="hint">고교생이라 돈이 없다. 프로가 되면 연봉으로 장비와 집을 꾸밀 수 있다. (인기 ${Math.round(c.popularity)})</p>`;
    return `${contract}
      <h4 class="sub">장비 <small class="muted">경기 중 능력치 보너스</small></h4><div class="items">${shop('gear')}</div>
      <h4 class="sub">집 꾸미기 <small class="muted">훈련·휴식 효과</small></h4><div class="items">${shop('house')}</div>
      <h4 class="sub">응원단 <small class="muted">홈 경기장이 바뀌고, 홈 경기 인기가 하나에 5%씩 더 오른다</small></h4><div class="items">${shop('cheer')}</div>
      <h4 class="sub">SNS 반응</h4><ul class="sns">${sns || '<li class="muted">아직 조용하다. 경기에서 활약하면 반응이 생긴다.</li>'}</ul>
      ${c.pro ? `<h4 class="sub">은퇴</h4>${canRetire(c) ? `<p class="hint">명예의 전당 점수 ${hofScore(c)} / ${HOF_SCORE}. 은퇴하면 이 커리어는 끝나고 2세로 이어 할 수 있다.</p><button type="button" data-retire>은퇴 선언</button>` : `<p class="hint">${RETIRE_MIN_AGE}살부터 스스로 은퇴할 수 있다. ${RETIRE_FORCE_AGE}살이 되면 무조건 은퇴. (지금 명예의 전당 점수 ${hofScore(c)} / ${HOF_SCORE})</p>`}` : ''}`;
  }

  private scheduleHtml() {
    const c = this.c!;
    if (c.pro && c.league) return this.proScheduleHtml();
    const s = c.season;
    if (!s) return '<p class="hint">고교 대회 일정이 끝났다.</p>';
    const name = (id: string) => `<span class="${id === c.school ? 'mine' : ''}">${esc(schoolById(id).name)}</span>`;
    const tourHtml = (t: Tour) => {
      const first = t.weeks[0];
      const last = t.weeks[t.weeks.length - 1];
      const status = t.done ? `우승 ${name(t.champion!)}` : c.week > first ? '진행 중' : `${first - c.week + 1}주 뒤`;
      const mine = t.myFinish ? `<b class="fin">${esc(t.myFinish)}</b>` : t.kind === 'finals' && !t.teams.length ? '<span class="muted">시즌 성적 4위까지</span>' : t.teams.includes(c.school) ? '<span class="muted">출전</span>' : '<span class="muted">출전 못 함</span>';
      const rounds = t.weeks
        .map((w, r) => {
          const ms = t.matches.filter((m) => m.round === r);
          if (!ms.length) return '';
          return `<div class="rnd"><h5>${roundLabel(t, r)} <small>${dateText(w)}</small></h5>${ms
            .map((m) => {
              const sc = m.score ? `<b>${m.score[0]}:${m.score[1]}</b>` : '<span class="muted">-</span>';
              const mineCls = m.a === c.school || m.b === c.school ? ' my' : '';
              return `<div class="mt${mineCls}"><span class="${m.winner === m.a ? 'w' : ''}">${name(m.a)}</span>${sc}<span class="${m.winner === m.b ? 'w' : ''}">${name(m.b)}</span></div>`;
            })
            .join('')}</div>`;
        })
        .join('');
      const groups = t.groups
        ? `<div class="grps">${t.groups
            .map(
              (_, gi) =>
                `<table class="ttable gt"><tr><th class="nm">${gi === 0 ? 'A' : 'B'}조</th><th>승</th><th>패</th><th>득실</th></tr>${groupStandings(t, gi)
                  .map((st) => `<tr class="${st.id === c.school ? 'me' : ''}"><td class="nm">${esc(schoolById(st.id).name)}</td><td>${st.w}</td><td>${st.l}</td><td>${st.pf - st.pa > 0 ? '+' : ''}${st.pf - st.pa}</td></tr>`)
                  .join('')}</table>`,
            )
            .join('')}</div>`
        : '';
      return `<details class="tour" ${c.week >= first - 4 && c.week <= last + 1 ? 'open' : ''}><summary><b>${esc(t.name)}</b><span class="muted">${dateText(first)} ~ ${dateText(last)}</span><span>${mine}</span><span class="st">${status}</span></summary>${groups}<div class="rnds">${rounds || '<p class="muted">대진 발표 전</p>'}</div></details>`;
    };
    const practice = PRACTICE_WEEKS.map((w) => s.year * 48 + w)
      .map((w) => {
        const g = c.games.find((x) => x.week === w && x.kind === 'practice');
        return `<li class="${w < c.week ? 'past' : ''}"><span>${dateText(w)}</span>${g ? `<b class="${g.won ? 'win' : 'loss'}">${g.won ? '승' : '패'} ${g.score[0]}:${g.score[1]}</b> vs ${esc(schoolById(g.opponent).name)}` : w < c.week ? '' : '<span class="muted">예정</span>'}</li>`;
      })
      .join('');
    return `<div class="tours">${s.tours.map(tourHtml).join('')}</div>
      <h4 class="sub">연습경기</h4><ul class="plist">${practice}</ul>
      <p class="hint">공식 대회에선 연습경기처럼 출전 시간을 보장해 주지 않는다. 감독 신뢰도가 높을수록 기회를 더 받는다 (지금 보정 ${trustBonus(c) >= 0 ? '+' : ''}${trustBonus(c).toFixed(1)}).</p>`;
  }

  private abilitiesHtml() {
    const c = this.c!;
    const ab = c.me.abilities ?? {};
    const prog = abilityProgress(c);
    const good = ABILITIES.filter((a) => !a.bad).map((a) => {
      const p = prog.find((x) => x.id === a.id)!;
      const n = ab[a.id] ?? 0;
      const fx = (FX as Record<string, number[]>)[a.id];
      const need = p.need
        ? `<small>다음 ${stars(n + 1)}: ${esc(p.how.split(' + ')[0])} <b>${p.stat}</b>/${p.need[0]} · ${esc(p.how.split(' + ')[1])} <b>${p.rating}</b>/${p.need[1]}</small>`
        : '<small class="good">최고 단계</small>';
      return `<div class="abrow ${n ? 'have' : ''}"><div><b>${a.label}</b> <span class="st">${n ? stars(n) : '☆'}</span>${fx && n ? ` <small class="muted">효과 ${fx[n] < 1 ? `${Math.round(fx[n] * 100)}%` : `×${fx[n]}`}</small>` : ''}</div><p>${esc(a.desc)}</p>${need}</div>`;
    });
    const bad = ABILITIES.filter((a) => a.bad && ab[a.id]).map((a) => `<div class="abrow bad"><div><b>${a.label}</b></div><p>${esc(a.desc)}</p></div>`);
    const dunks = DUNKS.map((d) => {
      const ok = dunkUnlocked(c.me, d);
      const need = Object.entries(d.need)
        .map(([k, v]) => `${RATING_LABEL[k as RatingKey]} ${c.me.r[k as RatingKey]}/${v}`)
        .join(' · ');
      return `<div class="dk ${ok ? 'have' : ''}"><b>${DUNK_LABEL[d.id]}</b><small>${ok ? '열림' : need}</small></div>`;
    }).join('');
    return `<h4 class="sub">덩크 레퍼토리</h4><div class="dks">${dunks}</div><p class="hint">열린 덩크 중에서 노마크·속공일수록 화려한 덩크를 한다.</p><h4 class="sub">특수능력</h4><div class="abgrid">${good.join('')}</div>${bad.length ? `<h4 class="sub">나쁜 버릇</h4><div class="abgrid">${bad.join('')}</div><p class="hint">관련 능력치를 올리고 기록이 좋아지면 사라진다.</p>` : ''}
      <p class="hint">특수능력은 경기 기록과 능력치가 조건을 채우면 저절로 생기고, ★3까지 진화한다.</p>`;
  }

  private weekHtml() {
    const c = this.c!;
    if (c.pendingGame) {
      const opp = teamInfoOf(c, c.pendingGame.opponent);
      return `<div class="act gamecard"><div class="ah"><b>${esc(c.pendingGame.label)}</b></div><p>vs ${esc(opp.full)}</p><button type="button" class="primary big" data-a="game">경기장으로 ▶</button></div>`;
    }
    const cards = ACTIONS.filter((a) => (!a.injuredOnly || c.injury) && (a.id !== 'mentor' || c.mentor.met) && (!a.proOnly || c.pro) && (!a.amateurOnly || !c.pro))
      .map((a) => {
        const ok = canDo(c, a);
        const ex = expectedPoints(c, a);
        const fg = fatigueGain(c, a);
        const risk = injuryRisk(c, a);
        const focus =
          a.id === 'solo' || a.id === 'mentor' || a.id === 'trainer'
            ? `<div class="focus">${FOCUS.map((f) => `<button type="button" class="chipbtn ${this.focus === f.id ? 'on' : ''}" data-focus="${f.id}" title="${f.keys.map((k) => RATING_LABEL[k]).join(', ')}">${f.label}</button>`).join('')}</div>`
            : '';
        const place = placeOf(a.id);
        const placeName = c.pro && place.id === 'school' ? '구단 훈련장' : c.pro && place.id === 'snack' ? '시내' : place.label;
        return `<div class="act ${ok ? '' : 'off'} ${this.hl === place.id ? 'pulse' : ''}">
          <div class="ah"><b>${a.label}</b><small class="muted">${placeName}</small>${risk >= 0.03 ? `<span class="risk" title="이번 주 부상 확률">부상 ${Math.round(risk * 100)}%</span>` : ''}</div>
          <p>${a.desc}</p>${focus}
          <div class="ap">${pointsHtml(ex, true) || '<span class="muted">포인트 없음</span>'}<span class="fat ${fg > 0 ? 'up' : 'down'}">피로 ${fg > 0 ? '+' : ''}${Math.round(fg)}</span></div>
          <button type="button" class="${ok ? 'primary' : ''}" data-do="${a.id}" ${ok ? '' : 'disabled'}>${ok ? '이걸로 한 주 보내기' : c.injury ? '부상 중엔 못 해' : a.id === 'mentor' ? '다음 달에 다시' : '지금은 못 해'}</button>
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
    const ageCol = (p: { id: string; age?: number }) => (c.pro ? `${p.id === 'me' ? c.me.age : p.age}살` : `${p.id === 'me' ? Math.floor(c.week / 48) + 1 : gradeOf.get(p.id)}학년`);
    const inTeam = new Set(team.players.map((p) => p.id));
    const rows = team.players
      .map((p, i) => {
        const role = i < 5 ? '주전' : i === 5 ? '식스맨' : '벤치';
        const me = p.id === 'me';
        const fr = me ? '' : this.heart(c.friends[p.id] ?? 0);
        return `<tr class="${me ? 'me' : ''}"><td>${role}</td><td>${p.pos}</td><td>${ageCol(p)}</td><td class="nm"><span class="no">${p.number}</span>${esc(p.name)}${me ? ' <b class="tagme">나</b>' : ''}</td><td>${p.body.heightCm}</td><td><b>${overall(p, p.pos).toFixed(0)}</b></td><td class="hrt">${fr}</td></tr>`;
      })
      .join('');
    const out = c.roster
      .filter((e) => !inTeam.has(e.player.id))
      .map((e) => `<tr class="dim"><td>명단 외</td><td>${e.player.pos}</td><td>${e.grade}학년</td><td class="nm"><span class="no">${e.player.number}</span>${esc(e.player.name)}</td><td>${e.player.body.heightCm}</td><td>${overall(e.player).toFixed(0)}</td><td class="hrt">${this.heart(c.friends[e.player.id] ?? 0)}</td></tr>`)
      .join('');
    const meOut = c.injury ? `<tr class="me dim"><td>부상</td><td>${c.prefPos}</td><td></td><td class="nm"><span class="no">${c.me.number}</span>${esc(c.me.name)} <b class="tagme">나</b></td><td>${c.me.body.heightCm}</td><td>${myOverall(c).toFixed(0)}</td><td></td></tr>` : '';
    return `<p class="muted coach">감독 <b class="ink">${esc(c.coach)}</b> · 신뢰도 ${Math.round(c.trust)}</p><div class="tablewrap"><table class="ttable"><tr><th>역할</th><th>포지션</th><th>${c.pro ? '나이' : '학년'}</th><th class="nm">선수</th><th>키</th><th>종합</th><th>친밀도</th></tr>${rows}${meOut}${out}</table></div>
      <p class="hint">감독은 포지션마다 종합 능력치가 가장 높은 선수를 주전으로 쓴다. 선호 포지션이 아니어도 팀 사정에 따라 다른 자리에 설 수 있다. 연습경기에선 신입생도 식스맨으로 기회를 받는다.</p>`;
  }

  private heart(v: number) {
    const n = Math.round(v / 20);
    return `<span title="친밀도 ${Math.round(v)}">${'♥'.repeat(n)}<span class="dimh">${'♥'.repeat(5 - n)}</span></span>`;
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
        const opp = teamInfoOf(c, g.opponent);
        const l = g.line;
        return `<tr><td>${dateText(g.week)}</td><td class="nm">${esc(g.label ?? '연습경기')}</td><td class="nm">${g.home ? 'vs' : '@'} ${esc(opp.full)}</td><td class="${g.won ? 'win' : 'loss'}">${g.won ? '승' : '패'} ${g.score[0]}:${g.score[1]}</td>${
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
    // 해마다 (고교 1~3학년, 프로 시즌)
    const years = new Map<number, typeof played>();
    for (const g of played) {
      const y = Math.floor(g.week / 48);
      years.set(y, [...(years.get(y) ?? []), g]);
    }
    const yrows = [...years.entries()]
      .map(([y, gs]) => {
        const s = (f: (l: NonNullable<(typeof gs)[number]['line']>) => number) => gs.reduce((a, g) => a + f(g.line!), 0) / gs.length;
        const label = yearLabel(c, y);
        return `<tr><td class="nm">${label}</td><td>${gs.length}</td><td>${minutesText(s((l) => l.sec))}</td><td>${s((l) => l.pts).toFixed(1)}</td><td>${s((l) => l.reb).toFixed(1)}</td><td>${s((l) => l.ast).toFixed(1)}</td><td>${s((l) => l.stl).toFixed(1)}</td><td>${s((l) => l.blk).toFixed(1)}</td></tr>`;
      })
      .join('');
    const trophies = (c.trophies ?? []).length ? `<div class="troph">${c.trophies.map((t) => `<span>🏆 ${esc(t)}</span>`).join('')}</div>` : '<p class="muted">아직 트로피가 없다.</p>';
    return `<h4 class="sub">트로피</h4>${trophies}
      ${yrows ? `<h4 class="sub">시즌별 기록</h4><div class="tablewrap"><table class="ttable"><tr><th class="nm">시즌</th><th>경기</th><th>출전</th><th>득점</th><th>리바</th><th>어시</th><th>스틸</th><th>블록</th></tr>${yrows}</table></div>` : ''}
      <h4 class="sub">경기</h4>${avg}${rows ? `<div class="tablewrap"><table class="ttable"><tr><th>날짜</th><th class="nm">경기</th><th class="nm">상대</th><th>결과</th><th>출전</th><th>득점</th><th>리바</th><th>어시</th><th>야투</th><th>3점</th><th>평가</th></tr>${rows}</table></div>` : ''}
      <h4 class="sub">최근 훈련</h4><ul class="wlog">${log || '<li class="muted">아직 없다</li>'}</ul>`;
  }

  private click(e: MouseEvent) {
    const c = this.c;
    if (!c) return;
    const t = e.target as HTMLElement;
    const tab = t.closest('[data-tab]') as HTMLElement | null;
    if (tab) {
      this.tab = tab.dataset.tab as Tab;
      this.hl = null;
      this.syncTabs();
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
      if (this.busy) return;
      // 그 건물까지 걸어간 다음 한 주를 보낸다
      const id = d.dataset.do as ActionId;
      this.busy = true;
      d.textContent = '가는 중...';
      const go = () => this.act.doWeek(id, this.focus);
      if (this.map) this.map.walkTo(placeOf(id).id, go);
      else go();
      return;
    }
    if (t.closest('[data-retire]')) {
      if (confirm('정말 은퇴할까? 은퇴식을 하면 되돌릴 수 없어')) this.act.retire();
      return;
    }
    const by = t.closest('[data-buy]') as HTMLButtonElement | null;
    if (by && !by.disabled) {
      if (buy(c, by.dataset.buy!)) {
        toast(`${itemDef(by.dataset.buy!)!.label} 샀다!`);
        this.act.save(true);
        return this.render(c);
      }
      return;
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
