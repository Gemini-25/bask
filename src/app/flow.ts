// 한 주가 끝난 뒤 결과, 연습경기 전 안내, 경기 뒤 성장 결과 화면
import { RATING_LABEL, type RatingKey } from '../data/ratings';
import { addXp, CONDITION_LABEL, dateText, FOCUS, myOverall, setCalendar, type Career, type WeekResult } from '../career/career';
import { collegeOffers, declareDraft, enterCollege, stayInCollege } from '../career/college';
import { gainPopularity, type InterviewChoice } from '../career/fans';
import { effectHint, eventById, fill, resolveEvent } from '../career/events';
import { leagueTeam } from '../career/league';
import { moneyText } from '../career/money';
import { contractOffers, signContract, type Offer } from '../career/pro';
import { mySideId, myTeam, teamInfoOf, type GameReport, type MatchSetup } from '../career/match';
import { schoolById } from '../career/schools';
import { minutesText } from '../sim/stats';
import { numberColorFor } from '../view/pixel';
import { $, closeModal, esc, modal } from './dom';
import { hofScore, HOF_SCORE, type RetireSummary } from '../career/legacy';
import { ACT, DUNK_LABEL } from '../sim/types';
import { everyone } from '../career/allstar';
import { dunkScene, stageScene } from './stage';
import { sound } from '../view/sound';
import { trainingScene } from './scenes';
import { figureCanvas } from './figure';
import { fatigueColor, pointsHtml } from './home';

function upsHtml(ups: Partial<Record<RatingKey, number>>) {
  const list = Object.entries(ups).filter(([, n]) => n);
  if (!list.length) return '';
  return `<div class="ups">${list.map(([k, n]) => `<span>${RATING_LABEL[k as RatingKey]} <b>+${n}</b></span>`).join('')}</div>`;
}

function xpHtml(xp: Partial<Record<RatingKey, number>>, ups: Partial<Record<RatingKey, number>>, max = 12) {
  const list = Object.entries(xp)
    .filter(([k, n]) => n && n >= 0.01 && !ups[k as RatingKey])
    .sort((a, b) => b[1]! - a[1]!)
    .slice(0, max);
  if (!list.length) return '';
  return `<div class="xps">${list.map(([k, n]) => `<span>${RATING_LABEL[k as RatingKey]} 경험치 <b>+${Math.round(n! * 100)}%</b></span>`).join('')}</div>`;
}

function changeHtml(label: string, before: string, after: string, good: boolean | null) {
  if (before === after) return `<div class="chg"><span>${label}</span><b>${after}</b></div>`;
  return `<div class="chg"><span>${label}</span>${before} → <b class="${good === null ? '' : good ? 'good' : 'bad'}">${after}</b></div>`;
}

export function weekModal(c: Career, r: WeekResult, onOk: () => void) {
  sound.play(r.notes.some((n) => n.startsWith('특수능력') || n.startsWith('덩크 해금') || n.includes('뽑혔다')) ? 'fanfare' : 'jingle');
  const school = teamInfoOf(c, c.pro ? c.pro.team : c.school);
  const focus = r.action.id === 'solo' ? FOCUS.find((f) => f.id === r.focus) : undefined;
  const title = `${r.action.label}${focus ? ` · ${focus.label}` : ''}`;
  modal(
    `<h2>${dateText(c.week - 1)} · ${esc(title)}</h2>
    <canvas class="px train" id="trainCanvas"></canvas>
    <div class="gain">${pointsHtml(r.gained, true) || '<span class="muted">포인트 없음</span>'}</div>
    ${upsHtml(r.ups)}${xpHtml(r.xpGain, r.ups)}
    <div class="chgs">
      ${changeHtml('피로', String(Math.round(r.fatigueBefore)), String(Math.round(r.fatigueAfter)), r.fatigueAfter <= r.fatigueBefore)}
      ${changeHtml('컨디션', CONDITION_LABEL[r.conditionBefore], CONDITION_LABEL[r.conditionAfter], r.conditionAfter > r.conditionBefore)}
    </div>
    ${r.notes.filter((n) => !/ \+\d+$/.test(n)).map((n) => `<p class="note ${r.injured ? 'bad' : ''}">${esc(n)}</p>`).join('')}
    ${r.game ? `<p class="note hot">이번 주말은 ${esc(teamInfoOf(c, r.game.opponent).full)}와(과) ${esc(r.game.label)}!</p>` : ''}
    <div class="mbtn"><button type="button" class="primary" data-close>${r.event ? '다음 ▶' : r.game ? '경기 준비 ▶' : '확인'}</button></div>`,
    { onClose: onOk },
  );
  trainingScene($('trainCanvas') as HTMLCanvasElement, { scene: r.action.id, focus: r.focus, pl: c.me, kit: { jersey: school.color, trim: numberColorFor(school.color) }, gained: r.gained });
}

/** 이벤트: 선택지를 고르면 결과를 보여주고 onDone */
export function eventModal(c: Career, onDone: () => void) {
  sound.play('pop');
  const ev = c.pendingEvent!;
  const def = eventById(ev.id);
  if (!def) {
    c.pendingEvent = null;
    return onDone();
  }
  const box = modal(
    `<h2>${esc(def.title)}</h2>
    <p class="evtext">${esc(fill(c, def.text, ev.mate))}</p>
    <div class="choices">${def.choices.map((ch, i) => `<button type="button" class="choice" data-ch="${i}"><b>${esc(ch.label)}</b><small>${esc(effectHint(ch.effect))}</small></button>`).join('')}</div>`,
  );
  box.querySelectorAll<HTMLElement>('[data-ch]').forEach(
    (b) =>
      (b.onclick = () => {
        const out = resolveEvent(c, ev, Number(b.dataset.ch));
        modal(
          `<h2>${esc(def.title)}</h2>${out.length ? out.map((t) => `<p class="note">${esc(t)}</p>`).join('') : '<p class="muted">그렇게 한 주가 지나갔다.</p>'}
          <div class="mbtn"><button type="button" class="primary" data-close>${c.pendingGame ? '경기 준비 ▶' : '확인'}</button></div>`,
          { onClose: onDone },
        );
      }),
  );
}

export function preGameModal(c: Career, onWatch: () => void, onSkip: () => void) {
  const pg = c.pendingGame!;
  const pro = c.pro && c.league;
  const opp = { ...teamInfoOf(c, pg.opponent), blurb: pg.special === 'allstar' ? '별들의 잔치' : pg.special === 'national' ? '국가대표 경기' : pro ? (c.overseas ? '해외 리그 · 쿼터 12분 · 6반칙 퇴장' : '프로 팀') : schoolById(pg.opponent).blurb };
  const mine = teamInfoOf(c, mySideId(c, pg.special));
  const { team, meIndex } = myTeam(c, pg.kind === 'official', pg.special);
  const role = meIndex < 0 ? (c.injury ? '부상으로 결장' : '명단 제외') : meIndex < 5 ? `주전 (${team.players[meIndex].pos})` : meIndex === 5 ? '식스맨' : '벤치 (교체 대기)';
  const home = pg.home;
  const rival = c.rival && c.rival.school === pg.opponent && !pro ? `<p class="note hot center">라이벌 ${esc(c.rival.player.name)}이(가) 나온다! (맞대결 ${c.rival.w}승 ${c.rival.l}패)</p>` : '';
  const box = modal(
    `<h2>${esc(pg.label)}</h2>
    <div class="vs"><span><i class="sw" style="background:${mine.color}"></i>${esc(mine.name)}</span><b>vs</b><span><i class="sw" style="background:${opp.color}"></i>${esc(opp.name)}</span></div>
    <p class="muted center">${pg.special ? (pg.special === 'allstar' ? '올스타 위크엔드' : '아시아컵') : pro ? (home ? '홈 경기' : `${esc(opp.city)} 원정`) : pg.kind === 'official' ? '공식전' : home ? '우리 학교 체육관' : `${esc(opp.city)} 원정`} · ${esc(opp.blurb)}</p>
    ${rival}
    <div class="chgs">
      <div class="chg"><span>감독 결정</span><b>${role}</b></div>
      <div class="chg"><span>컨디션</span><b>${CONDITION_LABEL[c.condition]}</b></div>
      <div class="chg"><span>피로</span><b style="color:${fatigueColor(c.fatigue)}">${Math.round(c.fatigue)}</b>${c.fatigue > 20 ? '<small>체력이 덜 찬 채로 시작</small>' : ''}</div>
      ${pg.kind === 'official' && !pg.special ? `<div class="chg"><span>감독 신뢰</span><b>${Math.round(c.trust)}</b><small>공식전은 출전 시간 보장 없음</small></div>` : ''}
    </div>
    <div class="mbtn"><button type="button" id="pgSkip">결과만 보기</button><button type="button" class="primary" id="pgWatch">경기 보기 ▶</button></div>`,
  );
  (box.querySelector('#pgWatch') as HTMLElement).onclick = onWatch;
  (box.querySelector('#pgSkip') as HTMLElement).onclick = onSkip;
}

function rivalHtml(rep: GameReport) {
  const r = rep.rival;
  if (!r) return '';
  const l = r.line;
  return `<div class="rvbox"><h4>라이벌 #${r.number} ${esc(r.name)}</h4>${l ? `<p>${minutesText(l.sec)} 출전 · <b>${l.pts}점</b> ${l.reb}리바 ${l.ast}어시 · 야투 ${l.fgm}/${l.fga}</p>` : '<p class="muted">이번 경기엔 안 나왔다.</p>'}</div>`;
}

export interface ResultActions {
  replay(): void;
  next(): void;
  save?(): void;
}

function applyInterview(c: Career, ch: InterviewChoice) {
  const e = ch.effect;
  if (e.pop) gainPopularity(c, e.pop);
  if (e.trust) c.trust = Math.min(100, Math.max(0, c.trust + e.trust));
  if (e.friends) for (const id of Object.keys(c.friends)) c.friends[id] = Math.min(100, c.friends[id] + e.friends);
  const ups = {};
  if (e.xp) for (const [k, v] of Object.entries(e.xp)) addXp(c, k as RatingKey, v!, ups);
}

export function renderResult(c: Career, m: MatchSetup, rep: GameReport, ovrBefore: number, act: ResultActions) {
  if (rep.abilityNotes.length || rep.tourNote) sound.play('fanfare');
  const mi = teamInfoOf(c, mySideId(c, m.special));
  const oi = teamInfoOf(c, m.opponent);
  const mine = { ...mi, name: mi.full };
  const opp = { ...oi, name: oi.full };
  const l = rep.line;
  const statRow = l
    ? `<table class="ttable rline"><tr><th>출전</th><th>득점</th><th>리바</th><th>어시</th><th>스틸</th><th>블록</th><th>실책</th><th>파울</th><th>야투</th><th>3점</th><th>자유투</th></tr>
       <tr><td>${minutesText(l.sec)}</td><td><b>${l.pts}</b></td><td>${l.reb}</td><td>${l.ast}</td><td>${l.stl}</td><td>${l.blk}</td><td>${l.tov}</td><td>${l.pf}</td><td>${l.fgm}/${l.fga}</td><td>${l.tpm}/${l.tpa}</td><td>${l.ftm}/${l.fta}</td></tr></table>`
    : '<p class="muted">출전하지 않았다.</p>';
  const ovrAfter = myOverall(c);
  $('scr-result').innerHTML = `
    <div class="result">
      <div class="rhead">
        <span class="rteam"><i class="sw" style="background:${mine.color}"></i>${esc(mine.name)}</span>
        <b class="rscore ${rep.won ? 'win' : 'loss'}">${rep.score[0]} : ${rep.score[1]}</b>
        <span class="rteam"><i class="sw" style="background:${opp.color}"></i>${esc(opp.name)}</span>
        <span class="rwl ${rep.won ? 'win' : 'loss'}">${rep.won ? '승리' : '패배'}</span>
        <span class="rlabel">${esc(m.label)}</span>
      </div>
      ${rep.tourNote ? `<div class="banner-note">${esc(rep.tourNote)}</div>` : ''}
      ${rep.won && rep.tourNote && /우승/.test(rep.tourNote) ? '<div class="champ"><canvas class="px stage" id="chCanvas"></canvas></div>' : ''}
      <div class="rgrid">
        <section class="rbox">
          <h3>내 기록 <small>${m.started ? '주전' : '교체'}${m.pos ? ` · ${m.pos}` : ''}</small></h3>
          <div class="tablewrap">${statRow}</div>
          <div class="rgrade"><span class="big g${rep.grade}">${rep.grade}</span><div><b>평가</b><p>"${esc(rep.comment)}"</p><small>게임 스코어 ${rep.gameScore}</small></div></div>
          ${rivalHtml(rep)}
        </section>
        <section class="rbox">
          <h3>성장</h3>
          <div class="gain">${pointsHtml(rep.gained, true)}</div>
          ${upsHtml(rep.ups)}${xpHtml(rep.xpGain, rep.ups, 8) || (upsHtml(rep.ups) ? '' : '<p class="muted">쌓인 경험치가 없다.</p>')}
          <div class="chgs">
            ${changeHtml('종합', ovrBefore.toFixed(1), ovrAfter.toFixed(1), ovrAfter > ovrBefore)}
            ${changeHtml('피로', String(Math.round(rep.fatigueBefore)), String(Math.round(rep.fatigueAfter)), false)}
            <div class="chg"><span>컨디션</span><b>${CONDITION_LABEL[c.condition]}</b></div>
            ${changeHtml('감독 신뢰', String(Math.round(rep.trustBefore)), String(Math.round(rep.trustAfter)), rep.trustAfter >= rep.trustBefore)}
          </div>
          ${rep.abilityNotes.map((n) => `<p class="note hot">✦ ${esc(n)}</p>`).join('')}
          ${rep.dPop ? `<div class="chg"><span>인기</span><b class="${rep.dPop > 0 ? 'good' : 'bad'}">${rep.dPop > 0 ? '+' : ''}${rep.dPop.toFixed(1)}</b><small>지금 ${Math.round(c.popularity)}</small></div>` : ''}
          ${rep.injured ? `<p class="note bad">경기 중 ${esc(rep.injured.name)}! ${rep.injured.weeks}주 쉬어야 한다.</p>` : ''}
          <p class="hint">실전에서 쏜 슛, 잡은 리바운드, 어시스트가 그 능력치 경험치가 된다.</p>
        </section>
      </div>
      ${
        rep.interview
          ? `<section class="rbox iv" id="iv"><h3>경기 후 인터뷰</h3><p>기자: "${esc(rep.interview.q)}"</p><div class="choices">${rep.interview.choices.map((ch, i) => `<button type="button" class="choice" data-iv="${i}"><b>${esc(ch.label)}</b></button>`).join('')}</div></section>`
          : ''
      }
      ${rep.sns.length ? `<section class="rbox"><h3>SNS 반응</h3><ul class="sns">${rep.sns.map((p) => `<li><b>@${esc(p.who)}</b> ${esc(p.text)} <small>♥ ${p.likes}</small></li>`).join('')}</ul></section>` : ''}
      <div class="rbtn"><button type="button" id="rReplay">경기 다시 보기</button><button type="button" class="primary big" id="rNext">다음 주로 ▶</button></div>
    </div>`;
  $('rReplay').onclick = act.replay;
  $('rNext').onclick = act.next;
  const ch = document.getElementById('chCanvas') as HTMLCanvasElement | null;
  if (ch) {
    // 우승 세리머니: 팀원들과 트로피
    const side = m.home ? 0 : 1;
    const mates = m.game.players.filter((p, pid) => m.game.teamOf[pid] === side && p.id !== 'me');
    stageScene(ch, { kind: 'title', pl: c.me, kit: { jersey: mine.color, trim: numberColorFor(mine.color) }, mates });
    sound.play('fanfare');
  }
  const iv = document.getElementById('iv');
  if (iv && rep.interview) {
    iv.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-iv]') as HTMLElement | null;
      if (!b || !rep.interview) return;
      const ch = rep.interview.choices[Number(b.dataset.iv)];
      applyInterview(c, ch);
      rep.interview = null;
      iv.innerHTML = `<h3>경기 후 인터뷰</h3><p>${esc(ch.label)}</p><p class="note">${esc(ch.reply)}</p>`;
      act.save?.();
    };
  }
}

// ───────────── 드래프트와 계약 (M7) ─────────────

/** 드래프트 날: 1순위부터 한 명씩 불리다가 내 이름이 나온다 */
export function draftModal(c: Career, onDone: () => void) {
  const d = c.draft!;
  const L = c.league!;
  sound.play('pop');
  const box = modal(
    `<h2>BASK 리그 신인 드래프트</h2>
    <p class="muted">${c.college ? `대학 ${c.college.year}학년` : '고교 3년'}을 마친 ${esc(c.me.name)}. 오늘 프로 팀이 정해진다.</p>
    <ol class="picks" id="picks"></ol>
    <div class="mbtn"><button type="button" id="dSkip">바로 보기</button></div>`,
    { wide: true },
  );
  const list = box.querySelector('#picks') as HTMLElement;
  let i = 0;
  let timer = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearInterval(timer);
    const t = leagueTeam(L, d.team).info;
    sound.play('fanfare');
    const dbox = modal(
      `<h2>${d.myNo}순위 지명!</h2>
      <canvas class="px stage" id="drCanvas"></canvas>
      <div class="vs"><span><i class="sw" style="background:${t.color}"></i>${esc(t.city)} ${esc(t.name)}</span></div>
      <p class="center">"${esc(c.me.name)} 선수, ${esc(t.name)}에 오신 걸 환영합니다!"</p>
      <div class="chgs">
        <div class="chg"><span>신인 계약</span><b>${moneyText(d.salary)} · 2시즌</b></div>
        <div class="chg"><span>등번호</span><b>${c.me.number}</b></div>
        <div class="chg"><span>감독</span><b>${esc(c.coach)}</b></div>
        ${c.rival ? `<div class="chg"><span>라이벌</span><b>${esc(c.rival.player.name)} → ${esc(leagueTeam(L, c.rival.school).info.name)}</b></div>` : ''}
      </div>
      <p class="hint">프로는 공식전마다 감독 신뢰도로 출전 시간이 정해진다. 연봉은 매주 들어오고, 생활 탭에서 장비와 집을 꾸밀 수 있다.</p>
      <div class="mbtn"><button type="button" class="primary" data-close>입단식 끝! ▶</button></div>`,
      { onClose: onDone },
    );
    stageScene(dbox.querySelector('#drCanvas') as HTMLCanvasElement, { kind: 'draft', pl: c.me, kit: { jersey: t.color, trim: numberColorFor(t.color) }, label: `${t.city} ${t.name}` });
  };
  const step = () => {
    if (finished) return;
    if (i >= d.picks.length) return finish();
    const p = d.picks[i++];
    const t = leagueTeam(L, p.team).info;
    const li = document.createElement('li');
    li.className = p.me ? 'me' : p.rival ? 'rv' : '';
    li.innerHTML = `<span class="no">${p.round}R ${p.no}</span><i class="sw" style="background:${t.color}"></i><span>${esc(t.name)}</span><b>${esc(p.name)}</b><small>${p.pos} · 종합 ${p.ovr}</small>${p.me ? ' <b class="tagme">나</b>' : p.rival ? ' <b class="tagrv">라이벌</b>' : ''}`;
    list.appendChild(li);
    li.scrollIntoView({ block: 'nearest' });
    if (p.me) {
      window.clearInterval(timer);
      window.setTimeout(finish, 1200);
    }
  };
  timer = window.setInterval(step, 450);
  (box.querySelector('#dSkip') as HTMLElement).onclick = () => {
    window.clearInterval(timer);
    while (i < d.picks.length && !d.picks[i - 1]?.me) step();
    finish();
  };
  c.draft = null;
}

/** 재계약: 지금 팀 제안을 받거나, 더 달라고 하거나, 다른 팀(FA)으로, 해외로 */
export function contractModal(c: Career, onDone: () => void) {
  const { mine, others, abroad } = contractOffers(c);
  const row = (o: Offer, label: string, i: number) => {
    const t = teamInfoOf(c, o.team);
    return `<button type="button" class="choice${o.abroad ? ' abroad' : ''}" data-o="${i}"><b><i class="sw" style="background:${t.color}"></i>${esc(t.full)} · ${moneyText(o.salary)} × ${o.years}시즌</b><small>${label}</small></button>`;
  };
  const offers = [mine, ...others, ...abroad];
  const age = c.me.age ?? 0;
  const box = modal(
    `<h2>계약이 끝났다</h2>
    <p>지금 연봉 ${moneyText(c.pro!.salary)}. 에이전트가 제안을 모아 왔다.${age >= 30 ? ` <span class="muted">(${age}살, 계약 기간이 짧아졌다)</span>` : ''}</p>
    <div class="choices">${row(mine, '지금 팀과 재계약', 0)}${others.map((o, i) => row(o, 'FA 이적 (감독 신뢰는 처음부터)', i + 1)).join('')}
      ${abroad.map((o, i) => row(o, o.abroad ? '✈ 해외 진출! 더 센 리그 · 쿼터 12분 · 6반칙 퇴장 · 연봉 대폭 상승' : '국내 복귀 (팬들이 기다린다)', i + 1 + others.length)).join('')}
      <button type="button" class="choice" data-o="more"><b>지금 팀에 더 달라고 한다</b><small>성공하면 +20%, 실패하면 제안 그대로에 감독 신뢰 -5</small></button></div>`,
  );
  box.querySelectorAll<HTMLElement>('[data-o]').forEach(
    (b) =>
      (b.onclick = () => {
        let o = mine;
        let note = '';
        if (b.dataset.o === 'more') {
          const ok = Math.random() < 0.3 + (c.popularity ?? 0) / 250;
          if (ok) {
            o = { ...mine, salary: Math.round((mine.salary * 1.2) / 100) * 100 };
            note = '구단이 요구를 받아들였다!';
          } else {
            c.trust = Math.max(0, c.trust - 5);
            note = '구단은 처음 제안에서 물러서지 않았다.';
          }
        } else o = offers[Number(b.dataset.o)];
        signContract(c, o);
        if (o.abroad) note = '해외 리그로 간다! 새 동료들은 말이 잘 안 통하지만, 농구는 똑같다.';
        if (o.home) note = '고향 리그로 돌아왔다!';
        const t = teamInfoOf(c, o.team);
        if (o.abroad || o.home) sound.play('fanfare');
        modal(`<h2>계약 완료</h2>${note ? `<p>${esc(note)}</p>` : ''}<p>${esc(t.full)} · ${moneyText(o.salary)} × ${o.years}시즌</p><div class="mbtn"><button type="button" class="primary" data-close>확인</button></div>`, { onClose: onDone });
      }),
  );
}

/** 시즌 시상식 (L6) */
export function awardsModal(c: Career, onDone: () => void) {
  const a = c.ceremony!;
  c.ceremony = null;
  const L = c.league!;
  const mine = a.awards.filter((x) => x.id === 'me');
  sound.play(mine.length ? 'fanfare' : 'jingle');
  const team = (id: string) => (L.teams.some((t) => t.info.id === id) ? teamInfoOf(c, id).name : id);
  const main = a.awards.filter((x) => x.key !== 'best5');
  const best = a.awards.filter((x) => x.key === 'best5');
  const box = modal(
    `<h2>${esc(a.league)} ${a.season + 1}시즌 시상식</h2>
    ${mine.length ? `<canvas class="px stage" id="awCanvas"></canvas><p class="note hot center">🏆 ${mine.map((x) => esc(x.label)).join(' · ')} 수상!</p>` : ''}
    <table class="ttable aw">${main.map((x) => `<tr class="${x.id === 'me' ? 'me' : ''}"><td class="nm"><b>${esc(x.label)}</b></td><td class="nm">${esc(x.name)} <small class="muted">${esc(team(x.team))}</small></td><td>${esc(x.value)}</td></tr>`).join('')}</table>
    <h4 class="sub">베스트 5</h4><div class="b5">${best.map((x) => `<span class="${x.id === 'me' ? 'me' : ''}">${esc(x.name)} <small>${esc(team(x.team))}</small></span>`).join('')}</div>
    <div class="mbtn"><button type="button" class="primary" data-close>새 시즌으로 ▶</button></div>`,
    { onClose: onDone, wide: true },
  );
  const cv = box.querySelector('#awCanvas') as HTMLCanvasElement | null;
  if (cv && c.pro) {
    const col = teamInfoOf(c, c.pro.team).color;
    stageScene(cv, { kind: 'award', pl: c.me, kit: { jersey: col, trim: numberColorFor(col) }, label: mine[0].label });
  }
}

// ───────────── 올스타 위크엔드 (L6, L8) ─────────────

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** 3점 콘테스트와 덩크 콘테스트를 한 명씩 보여준다 */
export function allStarModal(c: Career, onDone: () => void) {
  const w = c.allStar!;
  w.unseen = false;
  sound.play('jingle');
  const team = (id: string) => teamInfoOf(c, id);
  const box = modal(
    `<h2>${c.overseas ? '해외 리그' : 'BASK'} 올스타 위크엔드</h2>
    ${w.mySide >= 0 ? `<p class="note hot center">${esc(w.notes[0])}</p>` : '<p class="muted center">이번엔 올스타에 못 뽑혔다. 관중석에서 본다. 내년엔 저 무대에!</p>'}
    <div class="contest" id="cst3"><h4>🏀 3점 슛 콘테스트</h4><div class="crows"></div></div>
    <div class="contest" id="cstD"><h4>💥 덩크 콘테스트</h4><canvas class="px stage" id="dkCanvas"></canvas><div class="crows"></div></div>
    <div class="mbtn"><button type="button" id="asSkip">바로 보기</button><button type="button" class="primary" id="asOk" disabled>${w.mySide >= 0 ? '올스타전으로 ▶' : '확인'}</button></div>`,
    { wide: true, onClose: onDone },
  );
  let fast = false;
  const wait = (ms: number) => (fast ? Promise.resolve() : sleep(ms));
  const okBtn = box.querySelector('#asOk') as HTMLButtonElement;
  const show = dunkScene(box.querySelector('#dkCanvas') as HTMLCanvasElement);
  const players = new Map(everyone(c).map((x) => [x.p.id, x.p]));
  okBtn.onclick = () => closeModal();
  (box.querySelector('#asSkip') as HTMLElement).onclick = () => (fast = true);
  const rowHtml = (r: { id: string; name: string; team: string }) => `<div class="crow${r.id === 'me' ? ' me' : ''}"><span class="cn"><i class="sw" style="background:${team(r.team).color}"></i>${esc(r.name)}</span><span class="cv"></span><b class="cs"></b></div>`;
  const run = async () => {
    // 3점: 예선 6명 → 결승 3명
    const t3 = box.querySelector('#cst3 .crows') as HTMLElement;
    for (const [round, label] of [
      [0, '예선'],
      [1, '결승'],
    ] as const) {
      const rows = w.three.filter((r) => r.rounds[round]);
      t3.insertAdjacentHTML('beforeend', `<div class="cround">${label}</div>`);
      for (const r of rows) {
        t3.insertAdjacentHTML('beforeend', rowHtml(r));
        const el = t3.lastElementChild as HTMLElement;
        el.scrollIntoView({ block: 'nearest' });
        const v = el.querySelector('.cv') as HTMLElement;
        const sc = el.querySelector('.cs') as HTMLElement;
        let total = 0;
        for (const ch of r.rounds[round].shots ?? '') {
          v.insertAdjacentHTML('beforeend', `<i class="ball b${ch}"></i>`);
          if (ch !== '0') {
            total += ch === '2' ? 2 : 1;
            if (!fast) sound.play('swish');
          }
          sc.textContent = String(total);
          await wait(r.id === 'me' ? 120 : 45);
        }
        await wait(250);
      }
    }
    const win3 = w.three.find((r) => r.name === w.threeWinner && r.rounds.length === 2);
    t3.insertAdjacentHTML('beforeend', `<p class="cwin">우승 ${esc(w.threeWinner)}${win3?.id === 'me' ? ' 🏆' : ''}</p>`);
    // 덩크: 1·2차 → 결승
    const td = box.querySelector('#cstD .crows') as HTMLElement;
    for (const [round, label] of [
      [0, '1차 시기'],
      [1, '2차 시기'],
      [2, '결승'],
    ] as const) {
      const rows = w.dunk.filter((r) => r.rounds[round]);
      td.insertAdjacentHTML('beforeend', `<div class="cround">${label}</div>`);
      for (const r of rows) {
        const d = r.rounds[round];
        td.insertAdjacentHTML('beforeend', rowHtml(r));
        const el = td.lastElementChild as HTMLElement;
        el.scrollIntoView({ block: 'nearest' });
        const v = el.querySelector('.cv') as HTMLElement;
        v.innerHTML = `<em>${esc(DUNK_LABEL[d.dunk!])}</em>`;
        // 코트에서 덩크를 보여준다
        const pl = players.get(r.id);
        if (pl) {
          const col = team(r.team).color;
          show.show({ pl, kit: { jersey: col, trim: numberColorFor(col) }, style: d.dunk! });
        }
        await wait(r.id === 'me' ? 2600 : 1700);
        if (!fast) sound.play(d.score >= 45 ? 'dunk' : 'clank');
        for (const j of d.judges ?? []) {
          v.insertAdjacentHTML('beforeend', `<i class="card j${j >= 9 ? 'hi' : j <= 6 ? 'lo' : ''}">${j}</i>`);
          await wait(110);
        }
        (el.querySelector('.cs') as HTMLElement).textContent = String(d.score);
        await wait(300);
      }
    }
    const winD = w.dunk.find((r) => r.name === w.dunkWinner && r.rounds.length === 3);
    td.insertAdjacentHTML('beforeend', `<p class="cwin">우승 ${esc(w.dunkWinner)}${winD?.id === 'me' ? ' 🏆' : ''}</p>`);
    if (win3?.id === 'me' || winD?.id === 'me') sound.play('fanfare');
    // 결과는 다 보여준 뒤에
    for (const n of w.notes.filter((x) => x.includes('콘테스트'))) box.querySelector('.mbtn')!.insertAdjacentHTML('beforebegin', `<p class="note hot center">${esc(n)}</p>`);
    okBtn.disabled = false;
    okBtn.focus();
  };
  void run();
}

// ───────────── 은퇴 (L10~L12) ─────────────

export interface RetireActions {
  /** 은퇴하고 요약을 본다 */
  retire(): RetireSummary;
  /** 1년 더 뛴다 (선택 은퇴일 때만) */
  keepGoing(): void;
  /** 2세 커리어 */
  legacy(s: RetireSummary): void;
  /** 타이틀로 */
  toTitle(): void;
}

export function retireModal(c: Career, act: RetireActions) {
  const forced = c.retirePending === 'forced';
  const box = modal(
    `<h2>${forced ? '이제 코트를 떠날 때' : '은퇴를 결심할까?'}</h2>
    <p>${c.me.age}살. ${forced ? '몸이 더는 따라 주지 않는다. 마지막 시즌이 끝났다.' : '아직 뛸 수는 있다. 하지만 박수 칠 때 떠나는 것도 멋지다.'}</p>
    <div class="chgs">
      <div class="chg"><span>명예의 전당 점수</span><b>${hofScore(c)}</b><small>${HOF_SCORE}점 이상이면 헌액</small></div>
      <div class="chg"><span>트로피</span><b>${c.trophies.length}개</b></div>
    </div>
    <div class="mbtn">${forced ? '' : '<button type="button" id="rtKeep">한 시즌 더!</button>'}<button type="button" class="primary" id="rtGo">은퇴식 ▶</button></div>`,
  );
  box.querySelector<HTMLElement>('#rtKeep')?.addEventListener('click', () => {
    c.retirePending = null;
    closeModal();
    act.keepGoing();
  });
  (box.querySelector('#rtGo') as HTMLElement).onclick = () => retireSummaryModal(act.retire(), act);
}

export function retireSummaryModal(s: RetireSummary, act: Pick<RetireActions, 'legacy' | 'toTitle'>) {
  sound.play('fanfare');
  const ppg = (v: number) => (s.games ? (v / s.games).toFixed(1) : '0.0');
  const box = modal(
    `<h2>${esc(s.name)} 은퇴식</h2>
    <canvas class="px train" id="rtCanvas"></canvas>
    ${s.hof ? '<p class="note hot center">🏛 명예의 전당 헌액!</p>' : ''}
    ${s.retiredBy ? `<p class="note hot center">#${s.number} 영구결번 · ${esc(s.retiredBy)}</p>` : ''}
    <div class="chgs">
      <div class="chg"><span>프로</span><b>${s.seasons}시즌 · ${s.games}경기</b><small>${esc(s.teams.join(' → '))}</small></div>
      <div class="chg"><span>통산</span><b>${s.pts.toLocaleString()}점 ${s.reb.toLocaleString()}리바 ${s.ast.toLocaleString()}어시</b></div>
      <div class="chg"><span>경기당</span><b>${ppg(s.pts)}점 ${ppg(s.reb)}리바 ${ppg(s.ast)}어시</b></div>
      <div class="chg"><span>최고 종합</span><b>${s.peakOvr}</b></div>
      <div class="chg"><span>명예의 전당 점수</span><b>${s.hofScore}</b></div>
      <div class="chg"><span>모은 돈</span><b>${moneyText(s.money)}</b></div>
    </div>
    ${s.trophies.length ? `<div class="troph scroll">${s.trophies.map((t) => `<span>🏆 ${esc(t)}</span>`).join('')}</div>` : '<p class="muted">트로피는 없지만, 끝까지 코트에 섰다.</p>'}
    <div class="mbtn"><button type="button" id="rtTitle">타이틀로</button><button type="button" class="primary" id="rtLegacy">2세로 이어 하기 ▶</button></div>`,
    { wide: true },
  );
  trainingScene($('rtCanvas') as HTMLCanvasElement, { scene: 'title', pl: s.player, kit: { jersey: s.color, trim: numberColorFor(s.color) } });
  (box.querySelector('#rtTitle') as HTMLElement).onclick = act.toTitle;
  (box.querySelector('#rtLegacy') as HTMLElement).onclick = () => act.legacy(s);
}

// ───────────── 시즌 요약 카드 (M10) ─────────────

/** 시즌이 끝나면 내 시즌을 카드 한 장으로 */
export function seasonCardModal(c: Career, onDone: () => void) {
  const a = c.ceremony;
  const L = c.league;
  if (!a || !L || !c.pro) return onDone();
  const from = c.week - 48;
  const games = c.games.filter((g) => g.week >= from && g.week < c.week && g.kind === 'official' && !g.label.startsWith('아시아컵') && g.line);
  const n = Math.max(1, games.length);
  const sum = (k: 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'sec' | 'fgm' | 'fga' | 'tpm' | 'tpa') => games.reduce((s, g) => s + (g.line?.[k] ?? 0), 0);
  const pct = (m: number, t: number) => (t ? `${Math.round((m / t) * 100)}%` : '-');
  const best = games.reduce<(typeof games)[number] | null>((b, g) => (!b || g.line!.pts > b.line!.pts ? g : b), null);
  const tag = `${a.season + 1}시즌`;
  const prizes = c.trophies.filter((t) => t.includes(`${tag} `) || t.endsWith(tag));
  const finish = L.history[L.history.length - 1]?.myFinish ?? '-';
  const col = teamInfoOf(c, c.pro.team).color;
  sound.play('jingle');
  const box = modal(
    `<div class="scard" style="--tc:${col}">
      <div class="sctop"><canvas class="px" id="scFig"></canvas><div><b class="scno">#${c.me.number}</b><h2>${esc(c.me.name)}</h2><span>${esc(teamInfoOf(c, c.pro.team).full)} · ${esc(tag)}${c.overseas ? ' · 해외' : ''}</span></div></div>
      <div class="scstats">
        <div><small>경기</small><b>${games.length}</b></div>
        <div><small>득점</small><b>${(sum('pts') / n).toFixed(1)}</b></div>
        <div><small>리바</small><b>${(sum('reb') / n).toFixed(1)}</b></div>
        <div><small>어시</small><b>${(sum('ast') / n).toFixed(1)}</b></div>
        <div><small>스틸</small><b>${(sum('stl') / n).toFixed(1)}</b></div>
        <div><small>블록</small><b>${(sum('blk') / n).toFixed(1)}</b></div>
        <div><small>출전</small><b>${(sum('sec') / n / 60).toFixed(1)}분</b></div>
        <div><small>야투</small><b>${pct(sum('fgm'), sum('fga'))}</b></div>
        <div><small>3점</small><b>${pct(sum('tpm'), sum('tpa'))}</b></div>
      </div>
      ${best ? `<p class="scbest">최고 경기 <b>${best.line!.pts}점</b> ${best.line!.reb}리바 ${best.line!.ast}어시 · vs ${esc(teamInfoOf(c, best.opponent).full)} (${esc(best.label)})</p>` : ''}
      <p class="scfin">팀 성적 <b>${esc(finish)}</b></p>
      ${prizes.length ? `<div class="troph">${prizes.map((t) => `<span>🏆 ${esc(t.replace(`${tag} `, ''))}</span>`).join('')}</div>` : '<p class="muted">이번 시즌 상은 없다. 다음 시즌에!</p>'}
    </div>
    <div class="mbtn"><button type="button" class="primary" data-close>시상식 보기 ▶</button></div>`,
    { onClose: onDone },
  );
  figureCanvas(box.querySelector('#scFig') as HTMLCanvasElement, () => ({ pl: c.me, kit: { jersey: col, trim: numberColorFor(col) }, act: ACT.CELEBRATE }));
}

// ───────────── 진로: 드래프트 or 대학 (W2, M12) ─────────────

function stars5(strength: number) {
  const n = Math.max(1, Math.min(5, Math.round((strength + 13) / 1.4)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/** 고3이 끝났거나 대학 학년이 끝났을 때 */
export function pathModal(c: Career, onDone: () => void) {
  sound.play('pop');
  const ovr = myOverall(c);
  const wins = c.games.filter((g) => g.kind === 'official' && g.won).length;
  const titles = c.trophies.filter((t) => /(고교|대학) .*우승/.test(t)).length;
  const forecast = ovr >= 58 ? '1라운드 상위' : ovr >= 52 ? '1라운드' : ovr >= 46 ? '1라운드 후반~2라운드' : '2라운드';
  const head = `<div class="chgs">
      <div class="chg"><span>종합</span><b>${ovr.toFixed(1)}</b><small>예상 지명: ${forecast}</small></div>
      <div class="chg"><span>공식전 승리</span><b>${wins}</b><small>우승 ${titles}번</small></div>
      <div class="chg"><span>나이</span><b>${c.me.age}살</b></div>
    </div>`;
  const done = (notes: string[]) => {
    modal(`<h2>진로 결정</h2>${notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}<div class="mbtn"><button type="button" class="primary" data-close>확인</button></div>`, { onClose: onDone });
  };
  if (c.pathPending === 'hs') {
    const offers = collegeOffers(c);
    const box = modal(
      `<h2>고교 3년이 끝났다. 진로를 정하자</h2>${head}
      <div class="choices">
        <button type="button" class="choice" data-path="draft"><b>🏀 드래프트 신청 (고졸 프로)</b><small>바로 프로 리그로. 연봉을 일찍 받고 프로에서 큰다</small></button>
        ${offers.map((u) => `<button type="button" class="choice" data-path="${u.id}"><b><i class="sw" style="background:${u.color}"></i>🎓 ${esc(u.name)} 진학 <span class="muted">${stars5(u.strength)}</span></b><small>${esc(u.blurb)} · 대학 4년 동안 크고, 해마다 드래프트에 나갈 수 있다</small></button>`).join('')}
      </div>
      <p class="hint">대학에 가면 고교처럼 대회를 뛰면서 더 클 시간이 생긴다. 대신 프로 데뷔가 늦어지고 그동안 연봉이 없다.</p>`,
    );
    box.querySelectorAll<HTMLElement>('[data-path]').forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.path!;
          if (id === 'draft') {
            declareDraft(c);
            setCalendar(c);
            closeModal();
            onDone();
            return;
          }
          const notes = enterCollege(c, id);
          setCalendar(c);
          done(notes);
        }),
    );
    return;
  }
  const y = c.college!.year;
  const box = modal(
    `<h2>대학 ${y - 1}학년이 끝났다</h2>${head}
    <div class="choices">
      <button type="button" class="choice" data-path="draft"><b>🏀 드래프트 신청 (얼리 엔트리)</b><small>${y - 1}학년을 마치고 프로로</small></button>
      <button type="button" class="choice" data-path="stay"><b>🎓 ${y}학년도 다닌다</b><small>${y === 4 ? '마지막 학년. 졸업하면 드래프트' : '1년 더 크고 나간다'}</small></button>
    </div>`,
  );
  box.querySelectorAll<HTMLElement>('[data-path]').forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.path === 'draft') declareDraft(c);
        else stayInCollege(c);
        setCalendar(c);
        closeModal();
        onDone();
      }),
  );
}
