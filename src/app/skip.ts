// 일정 건너뛰기 (M24): 기간·훈련 방식·멈출 곳을 정하고, 한 주씩 돌리며 진행을 보여준 뒤 한눈에 정리한다
import { isBigGame, SKIP_STOP_LABEL, SkipRun, type SkipOpts, type SkipResult } from '../career/autoplay';
import { ACTIONS, dateText, FOCUS, type ActionId, type Career, type CareerSettings, type FocusId } from '../career/career';
import { teamInfoOf } from '../career/match';
import { RATING_LABEL, type RatingKey } from '../data/ratings';
import { closeModal, esc, modal } from './dom';

export type SkipPrefs = NonNullable<CareerSettings['skip']>;
export const DEFAULT_SKIP: SkipPrefs = { routine: 'auto', stopGames: 'big', stopEvents: true, invest: false };

export function skipPrefs(c: Career): SkipPrefs {
  return { ...DEFAULT_SKIP, ...(c.settings?.skip ?? {}) };
}

/** 건너뛰기 막대에 보일 한 줄 */
export function skipSummary(c: Career): string {
  const p = skipPrefs(c);
  const r = p.routine === 'auto' ? '훈련 알아서' : `${ACTIONS.find((a) => a.id === (p.routine as { repeat: ActionId }).repeat)?.label ?? '훈련'} 반복`;
  const g = p.stopGames === 'all' ? '경기마다 멈춤' : p.stopGames === 'big' ? '큰 경기만 멈춤' : '경기는 결과만';
  return `${r} · ${g}${p.stopEvents ? ' · 이벤트는 직접' : ''}${p.invest ? ' · 포인트 자동 투자' : ''}`;
}

/** 건너뛰기 설정 */
export function skipSettingsModal(c: Career, onSave: () => void) {
  const p = skipPrefs(c);
  const acts = ACTIONS.filter((a) => !a.injuredOnly && !a.injuredOk && (!a.proOnly || c.pro) && (!a.amateurOnly || !c.pro) && a.id !== 'mentor');
  const cur = p.routine === 'auto' ? 'auto' : p.routine.repeat;
  const focus = p.routine === 'auto' ? 'shoot' : (p.routine.focus ?? 'shoot');
  const box = modal(
    `<h2>⏩ 일정 건너뛰기 설정</h2>
    <div class="skipset">
      <label>훈련 <select id="skRoutine">
        <option value="auto" ${cur === 'auto' ? 'selected' : ''}>알아서 (피로·컨디션을 보며 개인 훈련·팀 훈련·휴식, 돈은 안 쓴다)</option>
        ${acts.map((a) => `<option value="${a.id}" ${cur === a.id ? 'selected' : ''}>${esc(a.label)} 반복 (지치면 쉰다)${a.cost ? ` · 주마다 돈이 든다` : ''}</option>`).join('')}
      </select></label>
      <label>개인 훈련 분야 <select id="skFocus">${FOCUS.map((f) => `<option value="${f.id}" ${focus === f.id ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></label>
      <label>경기 <select id="skGames">
        <option value="big" ${p.stopGames === 'big' ? 'selected' : ''}>결승·플레이오프·올스타·국가대표 경기 앞에서는 멈춘다</option>
        <option value="all" ${p.stopGames === 'all' ? 'selected' : ''}>모든 경기 앞에서 멈춘다</option>
        <option value="none" ${p.stopGames === 'none' ? 'selected' : ''}>멈추지 않고 결과만 본다</option>
      </select></label>
      <label class="chk"><input type="checkbox" id="skEvents" ${p.stopEvents ? 'checked' : ''}> 이벤트가 생기면 멈춰서 직접 고른다 <small class="muted">끄면 첫 번째 선택지</small></label>
      <label class="chk"><input type="checkbox" id="skInvest" ${p.invest ? 'checked' : ''}> 포인트를 종합 능력치가 많이 오르는 곳에 자동 투자</label>
      <p class="hint">드래프트·계약·진로·올스타 위크엔드·시상식·전지훈련·포지션 제안은 언제나 멈춰서 직접 본다.</p>
    </div>
    <div class="mbtn"><button type="button" data-close>취소</button><button type="button" class="primary" id="skSave">저장</button></div>`,
  );
  box.querySelector<HTMLButtonElement>('#skSave')!.onclick = () => {
    const v = (id: string) => (box.querySelector(`#${id}`) as HTMLSelectElement).value;
    const ck = (id: string) => (box.querySelector(`#${id}`) as HTMLInputElement).checked;
    const r = v('skRoutine');
    c.settings ??= { romance: true, minigame: true };
    c.settings.skip = {
      routine: r === 'auto' ? 'auto' : { repeat: r as ActionId, focus: v('skFocus') as FocusId },
      stopGames: v('skGames') as SkipPrefs['stopGames'],
      stopEvents: ck('skEvents'),
      invest: ck('skInvest'),
    };
    closeModal();
    onSave();
  };
}

/**
 * 한 주씩 돌리며 진행을 보여주고, 끝나면 정리 화면.
 * 이벤트에서 멈추게 했으면 그 자리에서 이벤트 창을 띄우고 (askEvent), 고르면 이어서 건너뛴다
 */
export function runSkip(c: Career, span: SkipOpts['span'], onDone: (res: SkipResult) => void, askEvent: (done: () => void) => void) {
  const run = new SkipRun(c, { ...skipPrefs(c), span });
  if (run.finished) return onDone(run.res);
  let stop = false;
  let box: HTMLElement;
  const open = () => {
    box = modal(`<h2>⏩ 건너뛰는 중</h2><p class="skipprog" id="skProg">시작...</p><div class="skipbar2"><i id="skBar"></i></div><div class="mbtn"><button type="button" id="skStop">여기서 멈추기</button></div>`);
    box.querySelector<HTMLButtonElement>('#skStop')!.onclick = () => (stop = true);
  };
  open();
  const total = typeof span === 'number' ? span : 0;
  const tick = () => {
    const end = run.step() || stop;
    const r = run.res;
    const w = r.games.filter((g) => g.won).length;
    const prog = box.querySelector('#skProg');
    if (prog) prog.textContent = `${dateText(c.week)} · ${r.weeks}주 지남 · 경기 ${r.games.length} (${w}승 ${r.games.length - w}패)`;
    const bar = box.querySelector<HTMLElement>('#skBar');
    if (bar) bar.style.width = `${total ? Math.min(100, (r.weeks / total) * 100) : (r.weeks % 20) * 5}%`;
    if (!end) return void window.setTimeout(tick, 0);
    // 이벤트: 직접 고르고 이어서
    if (run.finished && r.stopped === 'event' && !stop && c.pendingEvent) {
      return askEvent(() => {
        run.resume();
        open();
        window.setTimeout(tick, 30);
      });
    }
    // 사람이 멈췄으면 지금까지로 정리
    if (!run.finished) run.stopNow();
    onDone(run.res);
  };
  window.setTimeout(tick, 30);
}

function upsHtml(ups: Partial<Record<RatingKey, number>>) {
  const e = Object.entries(ups).filter(([, n]) => n);
  if (!e.length) return '';
  return `<div class="ups">${e.map(([k, n]) => `<span class="up">${RATING_LABEL[k as RatingKey]} <b>+${n}</b></span>`).join('')}</div>`;
}

/** 건너뛴 결과 정리 */
export function skipResultModal(c: Career, r: SkipResult, onOk: () => void) {
  const w = r.games.filter((g) => g.won).length;
  const played = r.games.filter((g) => g.played);
  const avg = (k: 'pts' | 'reb' | 'ast') => (played.length ? (played.reduce((s, g) => s + g[k], 0) / played.length).toFixed(1) : '-');
  const rows = r.games
    .slice(-14)
    .map((g) => `<tr class="${g.won ? 'win' : 'loss'}"><td>${esc(g.label)}</td><td class="nm">${esc(teamInfoOf(c, g.opponent).full)}</td><td><b>${g.won ? '승' : '패'}</b> ${g.score[0]}:${g.score[1]}</td><td>${g.played ? `${g.pts}점 ${g.reb}리 ${g.ast}어` : '<span class="muted">결장</span>'}</td></tr>`)
    .join('');
  // 같은 말이 여러 번이면 한 번만, 너무 길면 줄인다
  const notes = [...new Set(r.notes.filter((n) => n && !/ \+\d+$/.test(n)))];
  const shown = notes.slice(0, 18);
  const next = c.pendingGame && r.stopped === 'game' ? `<p class="note hot">${isBigGame(c.pendingGame) ? '큰 경기다! ' : ''}${esc(c.pendingGame.label)} · ${esc(teamInfoOf(c, c.pendingGame.opponent).full)}</p>` : '';
  modal(
    `<h2>⏩ ${r.weeks}주 건너뜀</h2>
    <p class="muted">${dateText(r.from)} → ${dateText(r.to)}${r.stopped ? ` · 멈춘 이유: <b class="ink">${SKIP_STOP_LABEL[r.stopped]}</b>` : ''}</p>
    <div class="chgs"><div class="chg"><span>종합</span><b>${r.ovr[0].toFixed(0)} → ${r.ovr[1].toFixed(0)}</b></div>${r.games.length ? `<div class="chg"><span>경기</span><b>${r.games.length}경기 ${w}승 ${r.games.length - w}패</b></div>` : ''}${played.length ? `<div class="chg"><span>내 평균</span><b>${avg('pts')}점 ${avg('reb')}리바 ${avg('ast')}어시</b></div>` : ''}</div>
    ${upsHtml(r.ups)}
    ${rows ? `<div class="tablewrap"><table class="ttable skipg">${r.games.length > 14 ? `<tr><td colspan="4" class="muted">최근 14경기만</td></tr>` : ''}${rows}</table></div>` : ''}
    ${shown.map((n) => `<p class="note">${esc(n)}</p>`).join('')}${notes.length > shown.length ? `<p class="muted">… 외 ${notes.length - shown.length}개</p>` : ''}
    ${next}
    <div class="mbtn"><button type="button" class="primary" data-close>확인</button></div>`,
    { onClose: onOk, wide: true },
  );
}
