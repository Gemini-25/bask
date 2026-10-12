import Phaser from 'phaser';
import galmuri11 from 'galmuri/dist/Galmuri11.woff2?url';
import galmuri11Bold from 'galmuri/dist/Galmuri11-Bold.woff2?url';
import { renderCreate } from './app/create';
import { $, closeModal, download, modal, onScreen, pickFile, show, toast } from './app/dom';
import { sound } from './view/sound';
import { contractModal, draftModal, eventModal, preGameModal, renderResult, weekModal } from './app/flow';
import { Home } from './app/home';
import { renderTitle } from './app/title';
import { createCareer, dateOf, dateText, myOverall, type Career } from './career/career';
import { afterGame, ensureSeason, playWeek } from './career/turn';
import { leagueTeamName } from './career/pro';
import { applyMatch, playMatch, type GameReport, type MatchSetup } from './career/match';
import { deleteSlot, exportCareer, importCareer, loadCareer, saveCareer, slotInfo } from './career/save';
import { schoolById } from './career/schools';
import { Rng, randomSeed } from './core/rng';
import { generateTeam, TEAM_INFOS, type Team } from './data/teams';
import { simulateGame } from './sim/engine';
import type { GameResult } from './sim/types';
import { CourtScene, type SceneHost, type TeamLook } from './view/CourtScene';
import { VIEW_H, VIEW_W } from './view/iso';
import { colorDistance, numberColorFor, shade } from './view/pixel';
import { Playback, type PlayMode } from './view/playback';
import { Ui } from './view/ui';
import './view/style.css';
import './app/app.css';

async function loadFonts() {
  const faces = [new FontFace('Galmuri11', `url(${galmuri11})`), new FontFace('Galmuri11', `url(${galmuri11Bold})`, { weight: '700' })];
  for (const f of faces) {
    try {
      await f.load();
      document.fonts.add(f);
    } catch {
      // 폰트가 안 되면 기본 글꼴로 진행
    }
  }
}

/** 두 팀 유니폼 색이 비슷하면 원정팀은 흰 유니폼 */
function teamLooks(a: Team, b: Team): [TeamLook, TeamLook] {
  const home: TeamLook = { fill: a.color, num: numberColorFor(a.color), paint: shade(a.color, -0.1), label: a.short };
  let away: TeamLook = { fill: b.color, num: numberColorFor(b.color), paint: shade(b.color, -0.1), label: b.short };
  if (colorDistance(a.color, b.color) < 140) away = { fill: '#f1f1ee', num: b.color, paint: shade(b.color, -0.1), label: b.short };
  return [home, away];
}

// ───────────────────────── 경기 관람 ─────────────────────────

const host: SceneHost = {
  pb: null,
  looks: [
    { fill: '#888', num: '#fff', paint: '#888', label: '' },
    { fill: '#888', num: '#fff', paint: '#888', label: '' },
  ],
  focus: -1,
  gameId: 0,
  onFrame: () => {
    if (host.pb) ui.update(host.pb);
  },
};

let speed = 4;
let paused = false;
let mode: PlayMode = 'all';
/** 'career'면 경기가 끝나고 결과 화면으로 간다 */
let watching: 'exhibition' | 'career' = 'exhibition';
let onWatchDone: (() => void) | null = null;
let phaser: Phaser.Game | null = null;

const ui = new Ui({
  togglePause() {
    if (!host.pb) return;
    if (host.pb.ended) {
      host.pb.seek(0);
      paused = false;
    } else paused = !paused;
    host.pb.paused = paused;
    ui.setControls(paused, speed);
  },
  setSpeed(s) {
    speed = s;
    if (host.pb) host.pb.speed = s;
    ui.setControls(paused, speed);
  },
  skipQuarter() {
    host.pb?.skipQuarter();
  },
  toEnd() {
    host.pb?.seek(host.pb.last);
  },
  restart() {
    host.pb?.seek(0);
  },
  newGame() {
    if (watching === 'exhibition') startExhibition(randomSeed());
  },
  focus(i) {
    host.focus = host.focus === i ? -1 : i;
    ui.setFocus(host.focus);
    if (host.pb) {
      host.pb.focusPid = host.focus;
      if (mode === 'focus' && host.focus < 0) setMode('all');
      else host.pb.applyMode();
    }
  },
  setMode(m) {
    setMode(m);
  },
});

function setMode(m: PlayMode) {
  if (m === 'focus' && host.focus < 0) {
    ui.setMode(mode, '선수 탭에서 선수를 먼저 골라줘');
    return;
  }
  mode = m;
  const pb = host.pb;
  if (pb) pb.setMode(m);
  const hint = m === 'highlights' && pb ? `${pb.highlights.length}개 장면` : m === 'focus' && pb ? `#${pb.game.players[host.focus].number} ${pb.game.players[host.focus].name} 따라가기` : '';
  ui.setMode(m, hint);
}

function watch(game: GameResult, looks: [TeamLook, TeamLook], opts: { kind: 'exhibition' | 'career'; focus?: number; banner?: string; done?: () => void; tier?: number; gym?: string }) {
  const pb = new Playback(game);
  host.tier = opts.tier ?? 1;
  host.banner = opts.gym;
  paused = false;
  pb.speed = speed;
  pb.paused = paused;
  host.pb = pb;
  host.looks = looks;
  host.focus = -1;
  host.gameId++;
  watching = opts.kind;
  onWatchDone = opts.done ?? null;
  ui.setGame(game, looks, opts.focus ?? -1);
  ui.setControls(paused, speed);
  if (opts.focus !== undefined && opts.focus >= 0) {
    host.focus = opts.focus;
    pb.focusPid = opts.focus;
    ui.setFocus(opts.focus);
  }
  // 고른 선수는 경기마다 초기화되니 '고른 선수만'은 내 선수가 있을 때만 이어간다
  setMode(mode === 'focus' && host.focus < 0 ? 'all' : mode);
  const career = opts.kind === 'career';
  $('btnNew').hidden = career;
  $('btnBack').hidden = career;
  $('btnDone').hidden = !career;
  $('careerbar').hidden = !opts.banner;
  $('careerbar').innerHTML = opts.banner ?? '';
  show('game', career ? (match?.label ?? '연습경기') : '프로 리그 관람 (데모)');
  phaser?.scale.refresh();
}

function startExhibition(seed: number) {
  const rng = new Rng(seed);
  const ia = rng.int(0, TEAM_INFOS.length - 1);
  let ib = rng.int(0, TEAM_INFOS.length - 2);
  if (ib >= ia) ib++;
  const a = generateTeam(rng.fork(1), TEAM_INFOS[ia]);
  const b = generateTeam(rng.fork(2), TEAM_INFOS[ib]);
  watch(simulateGame(a, b, seed), teamLooks(a, b), { kind: 'exhibition' });
}

$('btnDone').onclick = () => {
  const f = onWatchDone;
  host.pb = null;
  f?.();
};
$('btnBack').onclick = () => {
  host.pb = null;
  toTitle();
};

// ───────────────────────── 커리어 ─────────────────────────

let slot = 0;
let career: Career | null = null;
let match: MatchSetup | null = null;
let report: GameReport | null = null;
let ovrBefore = 0;

function save() {
  if (!career) return;
  if (!saveCareer(slot, career)) toast('저장 실패: 브라우저 저장소를 쓸 수 없어. 파일로 내보내기를 써줘');
}

const home = new Home({
  doWeek(id, focus) {
    const c = career!;
    const r = playWeek(c, id, focus);
    save();
    home.render(c);
    weekModal(c, r, () => afterWeek());
  },
  save(silent) {
    save();
    if (!silent) toast('저장했어');
  },
  exportFile() {
    if (!career) return;
    // 한글 파일 이름은 브라우저에 따라 'download'로 바뀌어서 영문·숫자만 쓴다
    const d = dateOf(career.week);
    download(`bask-save${slot + 1}-y${d.grade}m${d.month}w${d.wk}.json`, exportCareer(career));
  },
  playGame() {
    preGame();
  },
  toTitle() {
    if (home.hasPending() && !confirm('확정하지 않은 능력치 투자가 있어. 그냥 나갈까?')) return;
    toTitle();
  },
});

/** 한 주가 끝난 뒤: 드래프트·계약 → 이벤트 → 주말 경기 */
function afterWeek() {
  const c = career!;
  if (c.draft) {
    draftModal(c, () => {
      save();
      toHome();
    });
    return;
  }
  if (c.contractPending && c.pro) {
    contractModal(c, () => {
      save();
      home.render(c);
      afterWeek();
    });
    return;
  }
  if (c.pendingEvent) {
    eventModal(c, () => {
      save();
      home.render(c);
      afterWeek();
    });
    return;
  }
  if (c.pendingGame) preGame();
}

function toHome() {
  const c = career!;
  if (!c.pro) ensureSeason(c);
  show('home', `${c.me.name} · ${c.pro ? leagueTeamName(c) : schoolById(c.school).name}`);
  home.render(c);
  afterWeek();
}

function preGame() {
  const c = career!;
  // 경기 결과는 미리 정해 두고, 보는 건 재생만 한다
  if (!match || report) {
    ovrBefore = myOverall(c);
    match = playMatch(c);
    report = null;
  }
  preGameModal(
    c,
    () => {
      closeModal();
      watchMatch();
    },
    () => {
      closeModal();
      finishMatch();
    },
  );
}

function matchLooks(m: MatchSetup): [TeamLook, TeamLook] {
  return teamLooks(m.game.teams[0], m.game.teams[1]);
}

function watchMatch() {
  const c = career!;
  const m = match!;
  const me = m.myPid >= 0 ? m.game.players[m.myPid] : null;
  const banner = `<b>${m.label}</b> · ${dateText(c.week - 1)} · ${me ? `내 선수 <b>#${me.number} ${me.name}</b> (노란 화살표 · 박스스코어 '나')` : '부상으로 결장'}`;
  // 연습경기는 학교 체육관, 공식전은 대회장, 결승·왕중왕전은 큰 무대
  const tier = m.pro ? (m.label.includes('챔피언') || m.label.includes('4강 플레이오프') ? 2 : 1) : m.kind === 'practice' ? 0 : m.label.includes('결승') || m.tour === 'kings' ? 2 : 1;
  const gym = m.pro ? '' : `${schoolById(m.home ? c.school : m.opponent).name} 농구부 파이팅`;
  watch(m.game, matchLooks(m), { kind: 'career', focus: m.myPid, banner, done: finishMatch, tier, gym });
}

function finishMatch() {
  const c = career!;
  const m = match!;
  if (!report) {
    report = applyMatch(c, m);
    // 해가 바뀌는 주에 경기가 있었으면 진급
    const notes = afterGame(c);
    if (notes.length) report.abilityNotes.push(...notes);
    save();
  }
  renderResult(c, m, report, ovrBefore, {
    save,
    replay() {
      watchMatch();
    },
    next() {
      match = null;
      report = null;
      toHome();
    },
  });
  show('result', '경기 결과');
}

function startCareer(s: number) {
  slot = s;
  show('create', '선수 만들기');
  renderCreate(
    (spec, seed) => {
      career = createCareer(spec, seed);
      save();
      toHome();
      modal(
        `<h2>입학을 축하해!</h2>
        <p>${schoolById(career.school).name} 농구부에 들어왔다. 매주 할 일을 하나 고르면 포인트가 쌓이고, 그 포인트로 능력치를 올린다.</p>
        <p>4주마다 연습경기가 있다. 경기에서 실제로 한 플레이는 그 능력치 경험치가 된다.</p>
        <p class="muted">피로가 쌓이면 다치기 쉽다. 가끔은 쉬자.</p>
        <div class="mbtn"><button type="button" class="primary" data-close>시작</button></div>`,
      );
    },
    () => toTitle(),
  );
}

function toTitle() {
  host.pb = null;
  career = null;
  match = null;
  report = null;
  show('title', '농구 선수 키우기');
  renderTitle({
    continueSlot(s) {
      const c = loadCareer(s);
      if (!c) return toast('세이브를 읽을 수 없어');
      slot = s;
      career = c;
      toHome();
    },
    newCareer(s) {
      startCareer(s);
    },
    async importTo(s) {
      const text = await pickFile();
      if (!text) return;
      try {
        const c = importCareer(text);
        if (slotInfo(s) && !confirm(`슬롯 ${s + 1}에 덮어쓸까?`)) return;
        slot = s;
        career = c;
        save();
        toast('불러왔어');
        toHome();
      } catch (e) {
        toast((e as Error).message);
      }
    },
    deleteSlot(s) {
      const info = slotInfo(s);
      if (!info || !confirm(`슬롯 ${s + 1} (${info.name}, ${info.date})을 지울까? 되돌릴 수 없어`)) return;
      deleteSlot(s);
      toTitle();
    },
    exhibition() {
      startExhibition(randomSeed());
    },
  });
}

async function boot() {
  await loadFonts();
  phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VIEW_W,
    height: VIEW_H,
    pixelArt: true,
    backgroundColor: '#1b1f2a',
    banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene: [new CourtScene(host)],
  });
  toTitle();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// 소리: 버튼 누를 때 짧은 소리, 경기 화면 밖에선 칩튠 음악
function soundButtons() {
  $('btnSfx').classList.toggle('on', sound.sfxOn);
  $('btnBgm').classList.toggle('on', sound.bgmOn);
}
$('btnSfx').onclick = () => {
  sound.setSfx(!sound.sfxOn);
  soundButtons();
};
$('btnBgm').onclick = () => {
  sound.setBgm(!sound.bgmOn);
  soundButtons();
};
soundButtons();
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) sound.play('click');
});
onScreen((s) => sound.music(s !== 'game'));

boot();

// 개발·확인용: 콘솔에서 bask.host.pb.seek(틱) 등으로 조작
(window as unknown as { bask: unknown }).bask = {
  host,
  startExhibition,
  get career() {
    return career;
  },
};
