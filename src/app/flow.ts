// 한 주가 끝난 뒤 결과, 연습경기 전 안내, 경기 뒤 성장 결과 화면
import { RATING_LABEL, type RatingKey } from '../data/ratings';
import { CONDITION_LABEL, dateText, FOCUS, myOverall, type Career, type WeekResult } from '../career/career';
import { myTeam, type GameReport, type MatchSetup } from '../career/match';
import { schoolById } from '../career/schools';
import { minutesText } from '../sim/stats';
import { numberColorFor } from '../view/pixel';
import { $, esc, modal } from './dom';
import { trainingCanvas } from './figure';
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
  const school = schoolById(c.school);
  const focus = r.action.id === 'solo' ? FOCUS.find((f) => f.id === r.focus) : undefined;
  const pose = focus ? focus.pose : r.action.pose;
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
    ${r.game ? `<p class="note hot">이번 주말은 ${esc(schoolById(r.game).name)}와(과) 연습경기!</p>` : ''}
    <div class="mbtn"><button type="button" class="primary" data-close>${r.game ? '경기 준비 ▶' : '확인'}</button></div>`,
    { onClose: onOk },
  );
  trainingCanvas($('trainCanvas') as HTMLCanvasElement, c.me, { jersey: school.color, trim: numberColorFor(school.color) }, pose, '');
}

export function preGameModal(c: Career, onWatch: () => void, onSkip: () => void) {
  const opp = schoolById(c.pendingGame!);
  const mine = schoolById(c.school);
  const { team, meIndex } = myTeam(c);
  const role = meIndex < 0 ? '부상으로 결장' : meIndex < 5 ? `주전 (${team.players[meIndex].pos})` : '식스맨';
  const home = c.games.length % 2 === 0;
  const box = modal(
    `<h2>연습경기</h2>
    <div class="vs"><span><i class="sw" style="background:${mine.color}"></i>${esc(mine.name)}</span><b>vs</b><span><i class="sw" style="background:${opp.color}"></i>${esc(opp.name)}</span></div>
    <p class="muted center">${home ? '우리 학교 체육관' : `${esc(opp.city)} 원정`} · ${esc(opp.blurb)}</p>
    <div class="chgs">
      <div class="chg"><span>감독 결정</span><b>${role}</b></div>
      <div class="chg"><span>컨디션</span><b>${CONDITION_LABEL[c.condition]}</b></div>
      <div class="chg"><span>피로</span><b style="color:${fatigueColor(c.fatigue)}">${Math.round(c.fatigue)}</b>${c.fatigue > 20 ? '<small>체력이 덜 찬 채로 시작</small>' : ''}</div>
    </div>
    <div class="mbtn"><button type="button" id="pgSkip">결과만 보기</button><button type="button" class="primary" id="pgWatch">경기 보기 ▶</button></div>`,
  );
  (box.querySelector('#pgWatch') as HTMLElement).onclick = onWatch;
  (box.querySelector('#pgSkip') as HTMLElement).onclick = onSkip;
}

export interface ResultActions {
  replay(): void;
  next(): void;
}

export function renderResult(c: Career, m: MatchSetup, rep: GameReport, ovrBefore: number, act: ResultActions) {
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
      </div>
      <div class="rgrid">
        <section class="rbox">
          <h3>내 기록 <small>${m.started ? '주전' : '교체'}${m.pos ? ` · ${m.pos}` : ''}</small></h3>
          <div class="tablewrap">${statRow}</div>
          <div class="rgrade"><span class="big g${rep.grade}">${rep.grade}</span><div><b>평가</b><p>"${esc(rep.comment)}"</p><small>게임 스코어 ${rep.gameScore}</small></div></div>
        </section>
        <section class="rbox">
          <h3>성장</h3>
          <div class="gain">${pointsHtml(rep.gained, true)}</div>
          ${upsHtml(rep.ups)}${xpHtml(rep.xpGain, rep.ups, 8) || (upsHtml(rep.ups) ? '' : '<p class="muted">쌓인 경험치가 없다.</p>')}
          <div class="chgs">
            ${changeHtml('종합', ovrBefore.toFixed(1), ovrAfter.toFixed(1), ovrAfter > ovrBefore)}
            ${changeHtml('피로', String(Math.round(rep.fatigueBefore)), String(Math.round(rep.fatigueAfter)), false)}
            <div class="chg"><span>컨디션</span><b>${CONDITION_LABEL[c.condition]}</b></div>
          </div>
          ${rep.injured ? `<p class="note bad">경기 중 ${esc(rep.injured.name)}! ${rep.injured.weeks}주 쉬어야 한다.</p>` : ''}
          <p class="hint">실전에서 쏜 슛, 잡은 리바운드, 어시스트가 그 능력치 경험치가 된다.</p>
        </section>
      </div>
      <div class="rbtn"><button type="button" id="rReplay">경기 다시 보기</button><button type="button" class="primary big" id="rNext">다음 주로 ▶</button></div>
    </div>`;
  $('rReplay').onclick = act.replay;
  $('rNext').onclick = act.next;
}
