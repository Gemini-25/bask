// 한 주가 끝난 뒤 결과, 연습경기 전 안내, 경기 뒤 성장 결과 화면
import { RATING_LABEL, type RatingKey } from '../data/ratings';
import { addXp, CONDITION_LABEL, dateText, FOCUS, myOverall, type Career, type WeekResult } from '../career/career';
import type { InterviewChoice } from '../career/fans';
import { effectHint, eventById, fill, resolveEvent } from '../career/events';
import { leagueTeam } from '../career/league';
import { moneyText } from '../career/money';
import { contractOffers, signContract, teamName, type Offer } from '../career/pro';
import { myTeam, type GameReport, type MatchSetup } from '../career/match';
import { schoolById } from '../career/schools';
import { minutesText } from '../sim/stats';
import { numberColorFor } from '../view/pixel';
import { $, esc, modal } from './dom';
import { sound } from '../view/sound';
import { trainingScene } from './scenes';
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
  sound.play(r.notes.some((n) => n.startsWith('특수능력') || n.startsWith('덩크 해금')) ? 'fanfare' : 'jingle');
  const school = schoolById(c.school);
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
    ${r.game ? `<p class="note hot">이번 주말은 ${esc(schoolById(r.game.opponent).name)}와(과) ${esc(r.game.label)}!</p>` : ''}
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
  const opp = pro ? { ...leagueTeam(c.league!, pg.opponent).info, blurb: '프로 팀' } : schoolById(pg.opponent);
  const mine = pro ? leagueTeam(c.league!, c.pro!.team).info : schoolById(c.school);
  const { team, meIndex } = myTeam(c, pg.kind === 'official');
  const role = meIndex < 0 ? (c.injury ? '부상으로 결장' : '명단 제외') : meIndex < 5 ? `주전 (${team.players[meIndex].pos})` : meIndex === 5 ? '식스맨' : '벤치 (교체 대기)';
  const home = pg.home;
  const rival = c.rival && c.rival.school === pg.opponent && !pro ? `<p class="note hot center">라이벌 ${esc(c.rival.player.name)}이(가) 나온다! (맞대결 ${c.rival.w}승 ${c.rival.l}패)</p>` : '';
  const box = modal(
    `<h2>${esc(pg.label)}</h2>
    <div class="vs"><span><i class="sw" style="background:${mine.color}"></i>${esc(mine.name)}</span><b>vs</b><span><i class="sw" style="background:${opp.color}"></i>${esc(opp.name)}</span></div>
    <p class="muted center">${pro ? (home ? '홈 경기' : `${esc(opp.city)} 원정`) : pg.kind === 'official' ? '공식전' : home ? '우리 학교 체육관' : `${esc(opp.city)} 원정`} · ${esc(opp.blurb)}</p>
    ${rival}
    <div class="chgs">
      <div class="chg"><span>감독 결정</span><b>${role}</b></div>
      <div class="chg"><span>컨디션</span><b>${CONDITION_LABEL[c.condition]}</b></div>
      <div class="chg"><span>피로</span><b style="color:${fatigueColor(c.fatigue)}">${Math.round(c.fatigue)}</b>${c.fatigue > 20 ? '<small>체력이 덜 찬 채로 시작</small>' : ''}</div>
      ${pg.kind === 'official' ? `<div class="chg"><span>감독 신뢰</span><b>${Math.round(c.trust)}</b><small>공식전은 출전 시간 보장 없음</small></div>` : ''}
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
  if (e.pop) c.popularity = Math.min(100, Math.max(0, (c.popularity ?? 0) + e.pop));
  if (e.trust) c.trust = Math.min(100, Math.max(0, c.trust + e.trust));
  if (e.friends) for (const id of Object.keys(c.friends)) c.friends[id] = Math.min(100, c.friends[id] + e.friends);
  const ups = {};
  if (e.xp) for (const [k, v] of Object.entries(e.xp)) addXp(c, k as RatingKey, v!, ups);
}

export function renderResult(c: Career, m: MatchSetup, rep: GameReport, ovrBefore: number, act: ResultActions) {
  if (rep.abilityNotes.length || rep.tourNote) sound.play('fanfare');
  const pro = m.pro && c.league && c.pro;
  const mine = pro ? { ...leagueTeam(c.league!, c.pro!.team).info, name: teamName(c.league!, c.pro!.team) } : schoolById(c.school);
  const opp = pro ? { ...leagueTeam(c.league!, m.opponent).info, name: teamName(c.league!, m.opponent) } : schoolById(m.opponent);
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
    <p class="muted">고교 3년을 마친 ${esc(c.me.name)}. 오늘 프로 팀이 정해진다.</p>
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
    modal(
      `<h2>${d.myNo}순위 지명!</h2>
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

/** 재계약: 지금 팀 제안을 받거나, 더 달라고 하거나, 다른 팀(FA)으로 */
export function contractModal(c: Career, onDone: () => void) {
  const L = c.league!;
  const { mine, others } = contractOffers(c);
  const row = (o: Offer, label: string, i: number) => {
    const t = leagueTeam(L, o.team).info;
    return `<button type="button" class="choice" data-o="${i}"><b><i class="sw" style="background:${t.color}"></i>${esc(t.city)} ${esc(t.name)} · ${moneyText(o.salary)} × ${o.years}시즌</b><small>${label}</small></button>`;
  };
  const offers = [mine, ...others];
  const box = modal(
    `<h2>계약이 끝났다</h2>
    <p>지금 연봉 ${moneyText(c.pro!.salary)}. 에이전트가 제안을 모아 왔다.</p>
    <div class="choices">${row(mine, '지금 팀과 재계약', 0)}${others.map((o, i) => row(o, 'FA 이적 (감독 신뢰는 처음부터)', i + 1)).join('')}
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
        const t = leagueTeam(L, o.team).info;
        modal(`<h2>계약 완료</h2>${note ? `<p>${esc(note)}</p>` : ''}<p>${esc(t.city)} ${esc(t.name)} · ${moneyText(o.salary)} × ${o.years}시즌</p><div class="mbtn"><button type="button" class="primary" data-close>확인</button></div>`, { onClose: onDone });
      }),
  );
}
