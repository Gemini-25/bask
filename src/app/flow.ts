// 한 주가 끝난 뒤 결과, 연습경기 전 안내, 경기 뒤 성장 결과 화면
import { RATING_LABEL, type RatingKey } from '../data/ratings';
import { CONDITION_LABEL, dateText, FOCUS, myOverall, type Career, type WeekResult } from '../career/career';
import { effectHint, eventById, fill, resolveEvent } from '../career/events';
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
  const opp = schoolById(pg.opponent);
  const mine = schoolById(c.school);
  const { team, meIndex } = myTeam(c, pg.kind === 'official');
  const role = meIndex < 0 ? (c.injury ? '부상으로 결장' : '명단 제외') : meIndex < 5 ? `주전 (${team.players[meIndex].pos})` : meIndex === 5 ? '식스맨' : '벤치 (교체 대기)';
  const home = pg.home;
  const rival = c.rival && c.rival.school === pg.opponent ? `<p class="note hot center">라이벌 ${esc(c.rival.player.name)}이(가) 나온다! (맞대결 ${c.rival.w}승 ${c.rival.l}패)</p>` : '';
  const box = modal(
    `<h2>${esc(pg.label)}</h2>
    <div class="vs"><span><i class="sw" style="background:${mine.color}"></i>${esc(mine.name)}</span><b>vs</b><span><i class="sw" style="background:${opp.color}"></i>${esc(opp.name)}</span></div>
    <p class="muted center">${pg.kind === 'official' ? '공식전' : home ? '우리 학교 체육관' : `${esc(opp.city)} 원정`} · ${esc(opp.blurb)}</p>
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
}

export function renderResult(c: Career, m: MatchSetup, rep: GameReport, ovrBefore: number, act: ResultActions) {
  if (rep.abilityNotes.length || rep.tourNote) sound.play('fanfare');
  const mine = schoolById(c.school);
  const opp = schoolById(m.opponent);
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
          ${rep.injured ? `<p class="note bad">경기 중 ${esc(rep.injured.name)}! ${rep.injured.weeks}주 쉬어야 한다.</p>` : ''}
          <p class="hint">실전에서 쏜 슛, 잡은 리바운드, 어시스트가 그 능력치 경험치가 된다.</p>
        </section>
      </div>
      <div class="rbtn"><button type="button" id="rReplay">경기 다시 보기</button><button type="button" class="primary big" id="rNext">다음 주로 ▶</button></div>
    </div>`;
  $('rReplay').onclick = act.replay;
  $('rNext').onclick = act.next;
}
