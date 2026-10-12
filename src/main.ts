import Phaser from 'phaser';
import galmuri11 from 'galmuri/dist/Galmuri11.woff2?url';
import galmuri11Bold from 'galmuri/dist/Galmuri11-Bold.woff2?url';
import { Rng, randomSeed } from './core/rng';
import { generateTeam, TEAM_INFOS, type Team } from './data/teams';
import { simulateGame } from './sim/engine';
import { CourtScene, type SceneHost, type TeamLook } from './view/CourtScene';
import { VIEW_H, VIEW_W } from './view/iso';
import { colorDistance, numberColorFor, shade } from './view/pixel';
import { Playback, type PlayMode } from './view/playback';
import { Ui } from './view/ui';
import './view/style.css';

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
    startGame(randomSeed());
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

let mode: PlayMode = 'all';
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

function startGame(seed: number) {
  const rng = new Rng(seed);
  const ia = rng.int(0, TEAM_INFOS.length - 1);
  let ib = rng.int(0, TEAM_INFOS.length - 2);
  if (ib >= ia) ib++;
  const a = generateTeam(rng.fork(1), TEAM_INFOS[ia]);
  const b = generateTeam(rng.fork(2), TEAM_INFOS[ib]);
  const game = simulateGame(a, b, seed);
  const pb = new Playback(game);
  pb.speed = speed;
  pb.paused = paused;
  host.pb = pb;
  host.looks = teamLooks(a, b);
  host.focus = -1;
  host.gameId++;
  ui.setGame(game, host.looks);
  ui.setControls(paused, speed);
  // 고른 선수는 경기마다 초기화되니 '고른 선수만'은 전체로 돌린다
  setMode(mode === 'focus' ? 'all' : mode);
}

async function boot() {
  await loadFonts();
  startGame(randomSeed());
  new Phaser.Game({
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
}

boot();

// 개발·확인용: 콘솔에서 bask.host.pb.seek(틱) 등으로 조작
(window as unknown as { bask: unknown }).bask = { host, startGame };
