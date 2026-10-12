// M13 화면: 3x3 길거리 대회, 전지훈련, 포지션 전향 제안, 훈련 미니게임
import { POSITION_LABEL, overall } from '../data/player';
import type { Career } from '../career/career';
import { answerPosition, applyStreet, CAMPS, campCost, canCamp, miniMult, runCamp, runStreet, type MiniKind } from '../career/extras';
export { miniFor } from '../career/extras';
import { moneyText } from '../career/money';
import { sound } from '../view/sound';
import { $, closeModal, esc, modal } from './dom';

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function notesModal(title: string, notes: string[], onDone: () => void) {
  modal(`<h2>${esc(title)}</h2>${notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}<div class="mbtn"><button type="button" class="primary" data-close>확인</button></div>`, { onClose: onDone });
}

// ───────────── 3x3 길거리 대회 (빠르게 진행) ─────────────

export function streetModal(c: Career, onDone: () => void) {
  sound.play('whistle');
  const r = runStreet(c);
  const rounds = ['1회전', '4강', '결승'];
  const box = modal(
    `<h2>🏀 3x3 길거리 대회</h2>
    <p class="muted">우리 팀: <b class="ink">${r.team.map(esc).join(' · ')}</b> · 21점을 먼저 내거나 10분 뒤 앞선 팀이 이긴다 (안쪽 1점, 밖 2점)</p>
    <div class="street" id="stGames"></div>
    <p class="note hot center" id="stFinish" hidden></p>
    <div class="mbtn"><button type="button" id="stSkip">바로 보기</button><button type="button" class="primary" id="stOk" disabled>확인</button></div>`,
    { onClose: () => notesModal('3x3 길거리 대회', applyStreet(c, r), onDone) },
  );
  let fast = false;
  const wait = (ms: number) => (fast ? Promise.resolve() : sleep(ms));
  ($('stSkip') as HTMLButtonElement).onclick = () => (fast = true);
  const ok = $('stOk') as HTMLButtonElement;
  ok.onclick = () => closeModal();
  const list = box.querySelector('#stGames') as HTMLElement;
  const run = async () => {
    for (const [i, g] of r.games.entries()) {
      list.insertAdjacentHTML(
        'beforeend',
        `<div class="sgame"><div class="shead"><span>${rounds[i]}</span><span>vs ${esc(g.opp)}</span></div>
        <div class="sscore"><div class="sbar us"><i></i></div><div><b class="s0">0</b> : <b class="s1">0</b></div><div class="sbar them"><i></i></div></div>
        <div class="smine muted"></div></div>`,
      );
      const el = list.lastElementChild as HTMLElement;
      el.scrollIntoView({ block: 'nearest' });
      const s = [el.querySelector('.s0') as HTMLElement, el.querySelector('.s1') as HTMLElement];
      const bars = [el.querySelector('.us i') as HTMLElement, el.querySelector('.them i') as HTMLElement];
      const sc = [0, 0];
      for (const side of g.log) {
        sc[side] = Math.min(21, sc[side] + 1);
        s[side].textContent = String(sc[side]);
        bars[side].style.width = `${(sc[side] / 21) * 100}%`;
        if (!fast && side === 0) sound.play('swish');
        await wait(70);
      }
      const won = g.score[0] > g.score[1];
      el.classList.add(won ? 'won' : 'lost');
      (el.querySelector('.smine') as HTMLElement).textContent = `${won ? '승리!' : '패배...'} 내 득점 ${g.myPts}점`;
      if (!fast) sound.play(won ? 'cheer' : 'buzzer');
      await wait(700);
    }
    const fin = $('stFinish');
    fin.hidden = false;
    fin.textContent = r.finish === '우승' ? `🏆 우승! 상금 ${moneyText(r.prize)}` : r.finish;
    ok.disabled = false;
    ok.focus();
  };
  void run();
}

// ───────────── 전지훈련 ─────────────

export function campModal(c: Career, onDone: () => void) {
  sound.play('pop');
  const box = modal(
    `<h2>⛰ 비시즌 전지훈련</h2>
    <p class="muted">2주짜리 전지훈련을 하나 고를 수 있다. 다녀오면 피로가 쌓인다. 가진 돈 ${moneyText(c.money ?? 0)}</p>
    <div class="choices">
      ${CAMPS.map((d) => {
        const cost = campCost(c, d);
        const can = canCamp(c, d);
        const why = d.id === 'mentor' && !c.mentor.met ? ' · 은사를 아직 못 만났다' : !can ? ' · 돈이 모자라다' : '';
        return `<button type="button" class="choice" data-camp="${d.id}" ${can ? '' : 'disabled'}><b>${esc(d.label)} <span class="muted">${cost ? moneyText(cost) : '무료'}</span></b><small>${esc(d.desc)}${why}</small></button>`;
      }).join('')}
      <button type="button" class="choice" data-camp=""><b>쉰다</b><small>전지훈련 없이 비시즌을 보낸다</small></button>
    </div>`,
  );
  box.querySelectorAll<HTMLButtonElement>('[data-camp]').forEach(
    (b) =>
      (b.onclick = () => {
        if (b.disabled) return;
        const id = (b.dataset.camp || null) as Parameters<typeof runCamp>[1];
        notesModal('전지훈련', runCamp(c, id), onDone);
      }),
  );
}

// ───────────── 포지션 전향 제안 ─────────────

export function positionModal(c: Career, onDone: () => void) {
  sound.play('pop');
  const to = c.posOffer!;
  const now = overall(c.me, c.prefPos);
  const then = overall(c.me, to);
  const box = modal(
    `<h2>감독님의 제안</h2>
    <p class="evtext">"${esc(c.me.name)}, 요즘 보니까 ${POSITION_LABEL[to]} 쪽이 더 맞는 것 같다. 한번 바꿔 볼래?"</p>
    <div class="chgs">
      <div class="chg"><span>${POSITION_LABEL[c.prefPos]} (지금)</span><b>${now.toFixed(1)}</b></div>
      <div class="chg"><span>${POSITION_LABEL[to]}</span><b>${then.toFixed(1)}</b><small>${then >= now ? '+' : ''}${(then - now).toFixed(1)}</small></div>
    </div>
    <div class="choices">
      <button type="button" class="choice" data-pos="1"><b>바꾼다</b><small>선호 포지션이 바뀐다 · 감독 신뢰 +3 · 적응 훈련 경험치</small></button>
      <button type="button" class="choice" data-pos="0"><b>지금 자리를 지킨다</b><small>감독 신뢰 -1</small></button>
    </div>`,
  );
  box.querySelectorAll<HTMLElement>('[data-pos]').forEach((b) => (b.onclick = () => notesModal('포지션', answerPosition(c, b.dataset.pos === '1'), onDone)));
}

// ───────────── 훈련 미니게임 (T4) ─────────────

const TITLE: Record<MiniKind, string> = { shoot: '🎯 슈팅 타이밍', drive: '⚡ 드리블 콤보', weight: '💪 웨이트 연타' };
const HELP: Record<MiniKind, string> = {
  shoot: '움직이는 막대가 초록 칸 가운데 올 때 멈춘다. 세 번 (스페이스 또는 클릭)',
  drive: '나오는 방향을 순서대로 누른다. 5초 안에 (방향키 또는 버튼)',
  weight: '5초 동안 최대한 많이 누른다 (스페이스 또는 버튼 연타)',
};

export function minigameModal(kind: MiniKind, onDone: (mult: number) => void) {
  sound.play('pop');
  let mult = 1;
  let stop: () => void = () => {};
  let keys: ((e: KeyboardEvent) => void) | null = null;
  const cleanup = () => {
    stop();
    if (keys) window.removeEventListener('keydown', keys);
    keys = null;
  };
  const box = modal(
    `<h2>${TITLE[kind]}</h2><div class="mg" id="mgBody"><p class="muted">${HELP[kind]}</p></div>
    <p class="mgres center" id="mgRes"></p>
    <div class="mbtn"><button type="button" id="mgSkip">건너뛰기 (×1.0)</button><button type="button" class="primary" id="mgOk" hidden>훈련 결과 보기 ▶</button></div>`,
    // 닫으면 (Esc 포함) 그때까지 결과로 한 주를 보낸다. 끝내기 전이면 ×1.0
    { onClose: () => (cleanup(), onDone(mult)) },
  );
  const body = box.querySelector('#mgBody') as HTMLElement;
  // 키보드로 할 때 버튼이 같이 눌리지 않게
  (document.activeElement as HTMLElement | null)?.blur();
  const res = $('mgRes');
  const okBtn = $('mgOk') as HTMLButtonElement;
  const finish = (score: number) => {
    cleanup();
    mult = miniMult(score);
    res.textContent = `${score >= 0.85 ? '완벽해!' : score >= 0.55 ? '좋아!' : score >= 0.3 ? '그럭저럭' : '아쉽다...'} 포인트 ×${mult.toFixed(2)}`;
    sound.play(score >= 0.55 ? 'swish' : 'clank');
    ($('mgSkip') as HTMLElement).hidden = true;
    okBtn.hidden = false;
    window.setTimeout(() => okBtn.focus(), 300);
  };
  const done = () => closeModal();
  ($('mgSkip') as HTMLElement).onclick = () => {
    mult = 1;
    done();
  };
  okBtn.onclick = done;
  const onKey = (f: (e: KeyboardEvent) => void) => {
    keys = (e) => {
      if ($('modal').hidden) return cleanup();
      f(e);
    };
    window.addEventListener('keydown', keys);
  };

  if (kind === 'shoot') {
    body.insertAdjacentHTML('beforeend', `<div class="mgbar" id="mgBar"><div class="mgzone" style="left:38%;width:24%"></div><div class="mgzone best" style="left:46%;width:8%"></div><div class="mgmark" id="mgMark"></div></div><p class="mgbig" id="mgShots">○ ○ ○</p><button type="button" id="mgHit" class="primary">멈춰!</button>`);
    const mark = $('mgMark');
    const shotsEl = $('mgShots');
    const scores: number[] = [];
    let t0 = performance.now();
    let raf = 0;
    let x = 0;
    const speed = () => 0.9 + scores.length * 0.35;
    const tick = (t: number) => {
      // 0~1 왕복
      const ph = (((t - t0) / 1000) * speed()) % 2;
      x = ph < 1 ? ph : 2 - ph;
      mark.style.left = `${x * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    stop = () => cancelAnimationFrame(raf);
    const hit = () => {
      if (scores.length >= 3) return;
      const d = Math.abs(x - 0.5);
      scores.push(d <= 0.04 ? 1 : d <= 0.12 ? 0.7 - (d - 0.04) * 3 : Math.max(0, 0.3 - (d - 0.12) * 1.5));
      shotsEl.textContent = [0, 1, 2].map((i) => (i < scores.length ? (scores[i] >= 0.7 ? '●' : scores[i] >= 0.3 ? '◐' : '×') : '○')).join(' ');
      sound.play(scores[scores.length - 1] >= 0.5 ? 'swish' : 'clank');
      t0 = performance.now() - Math.random() * 800;
      if (scores.length >= 3) finish(scores.reduce((a, b) => a + b, 0) / 3);
    };
    ($('mgHit') as HTMLElement).onclick = hit;
    onKey((e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        hit();
      }
    });
    return;
  }

  if (kind === 'drive') {
    const DIRS = ['←', '↑', '↓', '→'];
    const KEY: Record<string, number> = { ArrowLeft: 0, ArrowUp: 1, ArrowDown: 2, ArrowRight: 3, KeyA: 0, KeyW: 1, KeyS: 2, KeyD: 3 };
    const seq = Array.from({ length: 7 }, () => Math.floor(Math.random() * 4));
    body.insertAdjacentHTML(
      'beforeend',
      `<div class="mgarrows" id="mgSeq">${seq.map((d, i) => `<span class="${i === 0 ? 'cur' : ''}">${DIRS[d]}</span>`).join('')}</div>
      <div class="mgbar" style="height:8px"><div class="mgzone best" id="mgTime" style="left:0;width:100%"></div></div>
      <div class="mgpad">${DIRS.map((d, i) => `<button type="button" data-dir="${i}">${d}</button>`).join('')}</div>`,
    );
    const spans = [...body.querySelectorAll<HTMLElement>('#mgSeq span')];
    const bar = $('mgTime');
    let i = 0;
    let miss = 0;
    const T = 5000;
    const start = performance.now();
    let raf = 0;
    const end = () => finish(Math.max(0, i - miss * 0.5) / seq.length);
    const tick = (t: number) => {
      const left = 1 - (t - start) / T;
      bar.style.width = `${Math.max(0, left) * 100}%`;
      if (left <= 0) return end();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    stop = () => cancelAnimationFrame(raf);
    const press = (d: number) => {
      if (i >= seq.length) return;
      if (d === seq[i]) {
        spans[i].className = 'ok';
        i++;
        sound.play('bounce');
        if (spans[i]) spans[i].className = 'cur';
        if (i >= seq.length) end();
      } else {
        miss++;
        spans[i].classList.add('bad');
        window.setTimeout(() => spans[i]?.classList.remove('bad'), 150);
      }
    };
    body.querySelectorAll<HTMLElement>('[data-dir]').forEach((b) => (b.onclick = () => press(Number(b.dataset.dir))));
    onKey((e) => {
      const d = KEY[e.code];
      if (d === undefined) return;
      e.preventDefault();
      press(d);
    });
    return;
  }

  // 웨이트 연타
  body.insertAdjacentHTML('beforeend', `<p class="mgbig" id="mgCount">0</p><div class="mgbar" style="height:8px"><div class="mgzone best" id="mgTime" style="left:0;width:100%"></div></div><button type="button" class="primary mgmash" id="mgMash">들어 올려!</button>`);
  const count = $('mgCount');
  const bar = $('mgTime');
  const TARGET = 38;
  let n = 0;
  let start = 0;
  let raf = 0;
  const tick = (t: number) => {
    const left = 1 - (t - start) / 5000;
    bar.style.width = `${Math.max(0, left) * 100}%`;
    if (left <= 0) return finish(n / TARGET);
    raf = requestAnimationFrame(tick);
  };
  stop = () => cancelAnimationFrame(raf);
  const mash = () => {
    if (!start) {
      start = performance.now();
      raf = requestAnimationFrame(tick);
    }
    if (start && performance.now() - start > 5000) return;
    n++;
    count.textContent = String(n);
  };
  ($('mgMash') as HTMLElement).onclick = mash;
  onKey((e) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      mash();
    }
  });
}
