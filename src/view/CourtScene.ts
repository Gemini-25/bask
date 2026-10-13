import Phaser from 'phaser';
import { COURT } from '../sim/court';
import { DEEP_DIST, LOGO_DIST } from '../sim/shooting';
import { ACT, DUNK_LABEL, FLAG_CUT, FLAG_STUN, PLAY_LABEL, type GameEvent } from '../sim/types';
import { shotMove } from '../data/moves';
import { lineupRoles, ROLE_SHORT, type Role } from '../sim/roles';
import { leapOf } from '../sim/leap';
import { LABELS, TACTICS } from './labels';
import { drawArena, drawCheerBanner, drawCrowd, drawHoopBack, drawHoopFront, drawJumbotron, makeCrowd, paintColors, type ArenaDeco, type CrowdMood } from './arena';
import { drawBall, drawBenchFigure, drawFigure, drawFigureRig, reachPx, type Facing, type Kit } from './character';
import { hasTrail, isOneShot } from './anims';
import { sx, sy, szy, VIEW_H, VIEW_W, ZH } from './iso';
import type { Playback } from './playback';
import { colorDistance, drawDigits, luminance, shade } from './pixel';
import { sound } from './sound';
import { DEV } from './devflags';

export interface TeamLook {
  fill: string;
  num: string;
  paint: string;
  label: string;
}

export interface SceneHost {
  pb: Playback | null;
  looks: [TeamLook, TeamLook];
  /** 고른 선수 번호 (GameResult.players 기준), 없으면 -1 */
  focus: number;
  gameId: number;
  onFrame(): void;
  /** 큰 장면 연출 (컷인)이 필요할 때 */
  onBigPlay?(e: GameEvent): void;
  /** 경기장 단계 (0 학교 체육관, 1 대회장, 2 결승 무대) */
  tier?: number;
  /** 체육관 현수막 */
  banner?: string;
  /** 프로 경기장 장식 (배너, 영구결번, 내 응원단) */
  deco?: ArenaDeco;
}

type Emote = 'note' | 'bang' | 'anger' | 'dots';

/** 머리 위 감정 아이콘 (AN4) */
function drawEmote(ctx: CanvasRenderingContext2D, x: number, y: number, k: Emote, t: number) {
  const yy = y - (Math.floor(t * 4) % 2);
  const px = (dx: number, dy: number, w = 1, h = 1) => ctx.fillRect(x + dx, yy + dy, w, h);
  if (k === 'note') {
    ctx.fillStyle = '#1b1f2a';
    px(-2, -9, 7, 10);
    ctx.fillStyle = '#ffe066';
    px(1, -8, 1, 6);
    px(2, -8, 2, 1);
    px(3, -7, 1, 1);
    px(-1, -3, 3, 2);
  } else if (k === 'bang' || k === 'dots') {
    ctx.fillStyle = '#1b1f2a';
    px(-4, -10, 9, 9);
    ctx.fillStyle = '#f7f2e8';
    px(-3, -9, 7, 7);
    px(-1, -2, 2, 1);
    ctx.fillStyle = k === 'bang' ? '#e0473d' : '#1b1f2a';
    if (k === 'bang') {
      px(0, -8, 1, 3);
      px(0, -4, 1, 1);
    } else {
      px(-2, -5, 1, 1);
      px(0, -5, 1, 1);
      px(2, -5, 1, 1);
    }
  } else {
    ctx.fillStyle = '#e0473d';
    for (const [dx, dy] of [
      [-3, -8],
      [-2, -7],
      [2, -7],
      [3, -8],
      [-3, -3],
      [-2, -4],
      [2, -4],
      [3, -3],
    ])
      px(dx, dy);
  }
}

interface Walker {
  slot: number;
  pidIn: number;
  pidOut: number;
  t0: number;
  inFrom: { x: number; y: number };
  outFrom: { x: number; y: number };
  outTo: { x: number; y: number };
}

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  c: string;
  life: number;
}

const WALK_TICKS = 16;

/** 림 쪽을 보고 하는 동작 (슛·레이업·덩크·자유투) */
const FACE_HOOP = new Set<number>([ACT.SHOOT, ACT.DEEP, ACT.STEPBACK, ACT.SIDESTEP, ACT.FADE, ACT.TURNFADE, ACT.ONELEG, ACT.CONTACT, ACT.HOOK, ACT.SKYHOOK, ACT.FLOAT, ACT.LAYUP, ACT.FINGER, ACT.SCOOP, ACT.REVLAY, ACT.EURO, ACT.POWERLAY, ACT.CLUTCH, ACT.FT]);
/** 덩크 동작 (꼭대기에서 손이 림에 닿게 높이를 맞춘다) */
const DUNK_ACTS = new Set<number>([ACT.DUNK, ACT.DUNK2, ACT.CDUNK, ACT.TOMAHAWK, ACT.REVERSE, ACT.WINDMILL, ACT.D360, ACT.DOUBLE, ACT.ELBOW, ACT.BETWEEN, ACT.FTLINE, ACT.CRADLE, ACT.HAMMER, ACT.SUPERMAN, ACT.SCORPION, ACT.SELFOOP, ACT.POSTER, ACT.PUTBACK, ACT.ALLEY]);
const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const FONT = 'Galmuri11, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

interface Drawable {
  depth: number;
  draw: () => void;
}

export class CourtScene extends Phaser.Scene {
  private host: SceneHost;
  private builtFor = -1;
  private bg?: Phaser.GameObjects.Image;
  private layer!: Phaser.Textures.CanvasTexture;
  private ctx!: CanvasRenderingContext2D;
  private banner!: Phaser.GameObjects.Container;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerUntil = 0;
  private lastTick = 0;
  private facing: { f: Facing; flip: boolean }[] = Array.from({ length: 10 }, () => ({ f: 'side' as Facing, flip: false }));
  private fans: ReturnType<typeof makeCrowd> = [];
  private mood: CrowdMood = { homeCheer: 0, awayCheer: 0, wave: -1 };
  private benchCheer: [number, number] = [0, 0];
  private swish: [number, number] = [0, 0];
  /** 덩크로 림이 휘청이는 남은 시간, 매달린 선수가 있는 림 */
  private rimShake: [number, number] = [0, 0];
  private hanging: [boolean, boolean] = [false, false];
  /** 동작 시작~끝 (기록 칸), 공이 손을 떠난 칸 (M21) */
  private runCache: { f0: number; act: number; start: number; end: number; rel: number }[] = [];
  /** 마지막으로 손에 쥐고 있던 공 위치 (놓은 뒤 잠깐 이어 붙인다) */
  private lastCarry: { x: number; y: number; cur: number } | null = null;
  /** 슛 이벤트 (틱 순서): 날아가는 공이 딥쓰리인지 알려고 */
  private shotEvents: GameEvent[] = [];
  /** 작전 (M22): 작전 시작 이벤트, 공격이 끝나는 틱 (득점·실책·수비 리바운드·쿼터 끝) */
  private playEvents: GameEvent[] = [];
  private endTicks: number[] = [];
  private playTag?: Phaser.GameObjects.Text;
  /** 겹친 선수를 화면에서 민 정도 (작전 표시가 같은 자리에 그리게) */
  private lastSpread: number[] = new Array(10).fill(0);
  private zoomUntil = 0;
  private clock = 0;
  private lastCutIn = -9999;
  private slowLabel!: Phaser.GameObjects.Text;
  private modeLabel!: Phaser.GameObjects.Text;
  private emotes = new Map<number, { k: Emote; until: number }>();
  /** ON FIRE (M19): 연속 득점 수, 불붙은 선수 */
  private streak = new Map<number, number>();
  private fireStart: GameEvent | null = null;
  private onFire = new Set<number>();
  /** 이름표 (이름 모드는 선명하게 보이게 글자 객체로) */
  private nameTags: Phaser.GameObjects.Text[] = [];
  private walkers: Walker[] = [];
  private prevLineup: number[] | null = null;
  private confetti: Confetto[] = [];
  /** 전광판에 내 등번호를 띄우는 시각까지 */
  private jumboUntil = 0;
  private nextChant = 0;
  private seenCuts = 0;
  /** 확대되지 않는 화면 연출용 카메라 (배너, 컷인) */
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  /** 경기장 오브젝트: 화면 연출용 카메라에는 안 보인다 */
  private world<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.uiCam?.ignore(o);
    return o;
  }
  /** 화면 연출 오브젝트: 확대되는 메인 카메라에는 안 보인다 */
  private ui<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.cameras.main.ignore(o);
    return o;
  }

  constructor(host: SceneHost) {
    super('court');
    this.host = host;
  }

  create() {
    this.layer = this.textures.createCanvas('layer', VIEW_W, VIEW_H)!;
    this.ctx = this.layer.getContext();
    this.ctx.imageSmoothingEnabled = false;
    this.uiCam = this.cameras.add(0, 0, VIEW_W, VIEW_H);
    this.world(this.add.image(0, 0, 'layer').setOrigin(0).setDepth(10));
    const band = this.add.rectangle(0, 0, VIEW_W, 30, 0x0d1018, 0.85);
    this.bannerText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '22px', color: '#ffe9b0', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
    this.banner = this.ui(this.add.container(VIEW_W / 2, VIEW_H / 2, [band, this.bannerText]).setDepth(300).setVisible(false));
    this.slowLabel = this.add
      .text(8, VIEW_H - 8, 'SLOW', { fontFamily: FONT, fontSize: '12px', color: '#ffe9b0', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0, 1)
      .setDepth(310)
      .setVisible(false);
    this.ui(this.slowLabel);
    this.modeLabel = this.add
      .text(VIEW_W - 8, VIEW_H - 8, '', { fontFamily: FONT, fontSize: '12px', color: '#ffe9b0', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(1, 1)
      .setDepth(310);
    this.ui(this.modeLabel);
  }

  private drawFire(ctx: CanvasRenderingContext2D, x: number, foot: number, top: number) {
    const cols = ['#ff4b1f', '#ff8a1f', '#ffd23f'];
    for (let k = 0; k < 7; k++) {
      const ph = this.clock * 9 + k * 1.7;
      const dx = Math.round(Math.sin(ph) * 4 + (k - 3) * 1.4);
      const rise = (ph * 1.3) % 7;
      ctx.fillStyle = cols[k % 3];
      ctx.fillRect(x + dx, Math.round(top + 2 - rise), 1, Math.max(1, 3 - Math.floor(rise / 3)));
    }
    for (let k = 0; k < 4; k++) {
      const ph = this.clock * 11 + k * 2.1;
      ctx.fillStyle = cols[(k + 1) % 3];
      ctx.fillRect(x - 4 + k * 3, foot - 1 - Math.round(Math.abs(Math.sin(ph)) * 2), 1, 2);
    }
  }

  /** 등번호 이름표: 팀 색 바탕에 도트 숫자 */
  private numberTag(ctx: CanvasRenderingContext2D, x: number, top: number, num: number, team: number) {
    const t = String(num);
    const w = t.length * 4 - 1;
    const l = this.host.looks[team as 0 | 1];
    const x0 = Math.round(x - w / 2) - 2;
    ctx.fillStyle = 'rgba(11,13,18,0.85)';
    ctx.fillRect(x0 - 1, top - 2, w + 6, 9);
    ctx.fillStyle = l.fill;
    ctx.fillRect(x0, top - 1, w + 4, 7);
    drawDigits(ctx, t, x, top, l.num);
  }

  private updateNameTags(tags: ({ x: number; y: number; name: string; team: number } | null)[]) {
    if (!this.nameTags.length && tags.every((t) => !t)) return;
    while (this.nameTags.length < 10)
      this.nameTags.push(this.world(this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '9px', color: '#ffffff', stroke: '#0b0d12', strokeThickness: 3, resolution: 3 }).setOrigin(0.5, 1).setDepth(150)));
    tags.forEach((t, i) => {
      const o = this.nameTags[i];
      if (!t) {
        o.setVisible(false);
        return;
      }
      if (o.text !== t.name) o.setText(t.name);
      o.setColor(shade(this.host.looks[t.team as 0 | 1].fill, 0.55));
      o.setPosition(t.x, t.y).setVisible(true);
    });
  }

  /** 지금 다섯 명씩의 역할 (M24, 라인업마다 한 번) */
  private roleCache = new WeakMap<object, Role[]>();
  private rolesOf(lineup: { pids: number[] }): Role[] {
    let r = this.roleCache.get(lineup);
    if (!r) {
      const ps = this.host.pb!.game.players;
      const a = lineup.pids.slice(0, 5).map((p) => ps[p]);
      const b = lineup.pids.slice(5, 10).map((p) => ps[p]);
      r = [...lineupRoles(a, b), ...lineupRoles(b, a)];
      this.roleCache.set(lineup, r);
    }
    return r;
  }

  private kit(team: 0 | 1): Kit {
    const l = this.host.looks[team];
    return { jersey: l.fill, trim: l.num };
  }

  /** 새 경기: 팀 색으로 경기장과 관중을 다시 만든다 */
  private build() {
    const pb = this.host.pb!;
    const id = this.host.gameId;
    const looks = this.host.looks;
    const key = `arena${id}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    const [ph, pa] = paintColors(looks[0].fill, looks[1].fill);
    const tier = this.host.tier ?? 1;
    const deco = this.host.deco;
    this.textures.addCanvas(key, drawArena({ home: ph, away: pa, tier, banner: this.host.banner, deco }));
    if (this.bg) this.bg.setTexture(key);
    else this.bg = this.world(this.add.image(0, 0, key).setOrigin(0).setDepth(0));
    this.fans = makeCrowd(looks[0].fill, looks[1].fill, pb.game.seed, tier, deco ? deco.fill : -1, !!deco?.cheer.includes('cheerFlags'));
    this.jumboUntil = 0;
    this.nextChant = 0;
    this.emotes.clear();
    this.streak.clear();
    this.onFire.clear();
    this.walkers = [];
    this.prevLineup = null;
    this.confetti = [];
    this.shotEvents = pb.game.events.filter((e) => e.type === 'made' || e.type === 'miss');
    this.playEvents = pb.game.events.filter((e) => e.type === 'play');
    this.endTicks = pb.game.events.filter((e) => e.type === 'made' || e.type === 'turnover' || (e.type === 'rebound' && !e.offensive) || e.type === 'quarterEnd').map((e) => e.tick);
    this.lastCarry = null;
    this.mood = { homeCheer: 0, awayCheer: 0, wave: -1 };
    this.lastTick = pb.cur;
    this.seenCuts = pb.cuts;
    this.banner.setVisible(false);
    this.cameras.main.setZoom(1).centerOn(VIEW_W / 2, VIEW_H / 2);
    this.builtFor = id;
  }

  update(time: number, delta: number) {
    const pb = this.host.pb;
    if (!pb) return;
    if (this.builtFor !== this.host.gameId) this.build();
    const dt = Math.min(delta, 100) / 1000;
    pb.advance(dt);
    this.clock = time / 1000;
    const fr = pb.sample();
    const lineup = pb.lineupAt(pb.cur);
    const roles = this.rolesOf(lineup);
    const rec = pb.game.rec;
    const f0 = Math.floor(pb.cur);
    const f1 = Math.min(rec.n - 1, f0 + 1);

    // 관중·벤치 분위기는 실제 시간으로 식는다
    this.mood.homeCheer = Math.max(0, this.mood.homeCheer - dt * 0.7);
    this.mood.awayCheer = Math.max(0, this.mood.awayCheer - dt * 0.7);
    if (this.mood.wave >= 0) this.mood.wave = this.mood.wave > VIEW_W + 30 ? -1 : this.mood.wave + dt * 320;
    this.benchCheer = [Math.max(0, this.benchCheer[0] - dt), Math.max(0, this.benchCheer[1] - dt)];
    this.swish = [Math.max(0, this.swish[0] - dt), Math.max(0, this.swish[1] - dt)];
    this.rimShake = [Math.max(0, this.rimShake[0] - dt), Math.max(0, this.rimShake[1] - dt)];

    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    drawCrowd(ctx, this.fans, this.mood, this.clock);
    const deco = this.host.deco;
    if (deco) {
      drawCheerBanner(ctx, this.host.looks[0].fill, deco, this.clock);
      this.drawCheerSquad(ctx, deco);
      // 내가 코트에 있으면 관중이 이름을 외친다
      if (deco.cheer.includes('cheerChant') && (pb.mode === 'highlights' ? pb.effSpeed : pb.speed) <= 4 && !pb.paused && this.clock > this.nextChant && this.host.focus >= 0 && lineup.pids.includes(this.host.focus)) {
        this.nextChant = this.clock + 7 + Math.random() * 5;
        const fans = this.fans.filter((f) => f.home && !f.front);
        const f = fans[Math.floor(Math.random() * fans.length)];
        if (f) this.bubble(f.x, f.y - 6, `${deco.myName}! ${deco.myName}!`);
      }
    }

    // 교체: 들어오는 선수는 벤치에서 걸어 나오고, 나가는 선수는 벤치로 간다
    const benchSpot = (pid: number, pids: number[]) => {
      const team = pb.game.teamOf[pid];
      const list = pb.game.players.map((_, q) => q).filter((q) => pb.game.teamOf[q] === team && !pids.includes(q));
      const k = Math.max(0, list.indexOf(pid));
      return { x: (team === 0 ? 7.9 : 15.3) + k * 0.72, y: -0.55 };
    };
    const jumpT = pb.cur - this.lastTick;
    if (this.prevLineup && jumpT > 0 && jumpT < 30) {
      for (let i = 0; i < 10; i++) {
        const pin = lineup.pids[i];
        const pout = this.prevLineup[i];
        if (pin === pout) continue;
        this.walkers = this.walkers.filter((w) => w.slot !== i);
        this.walkers.push({ slot: i, pidIn: pin, pidOut: pout, t0: pb.cur, inFrom: benchSpot(pin, this.prevLineup), outFrom: { x: fr.px[i * 2], y: fr.px[i * 2 + 1] }, outTo: benchSpot(pout, lineup.pids) });
      }
    }
    if (jumpT < 0 || jumpT >= 30) this.walkers = [];
    this.walkers = this.walkers.filter((w) => pb.cur - w.t0 < WALK_TICKS);
    this.prevLineup = [...lineup.pids];
    const walking = new Set(this.walkers.flatMap((w) => [w.pidIn, w.pidOut]));

    // 벤치 선수
    const onCourt = new Set(lineup.pids);
    for (const team of [0, 1] as const) {
      const bench = pb.game.players.map((p, pid) => ({ p, pid })).filter(({ pid }) => pb.game.teamOf[pid] === team && !onCourt.has(pid));
      const x0 = team === 0 ? 7.9 : 15.3;
      bench.forEach(({ p, pid }, k) => {
        if (walking.has(pid)) return;
        drawBenchFigure(ctx, Math.round(sx(x0 + k * 0.72)), Math.round(sy(-0.55)) - 1, p, this.kit(team), this.benchCheer[team] > 0, this.clock);
      });
    }
    // 결승 무대 조명
    if ((this.host.tier ?? 1) >= 2) {
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#fff3c4';
      for (const ph of [0, 2.2]) {
        const cx = VIEW_W / 2 + Math.sin(this.clock * 0.5 + ph) * 220;
        ctx.beginPath();
        ctx.moveTo(VIEW_W / 2 + (ph ? 140 : -140), 0);
        ctx.lineTo(cx - 40, VIEW_H);
        ctx.lineTo(cx + 40, VIEW_H);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // 작전 표시 (M22): 지금 돌리는 작전의 스크린·롤·컷 경로
    this.drawTactics(ctx, fr, pb.cur);
    // 덩크 도약 (M24): 뛴 자리 발자국, 날아간 길, 꽂은 뒤엔 도약 거리 자
    if (pb.speed <= 8) this.drawLeaps(ctx, pb.cur);

    const items: Drawable[] = [];
    for (const side of [0, 1] as const) {
      items.push({ depth: 7.5 - 0.05, draw: () => drawHoopBack(ctx, side) });
      items.push({
        depth: 7.5 + 0.05,
        draw: () => {
          const sh = this.rimShake[side];
          const bend = Math.max(this.hanging[side] ? 2 : 0, sh > 0 ? 1 + Math.round(Math.abs(Math.sin(sh * 40)) * 2) : 0);
          drawHoopFront(ctx, side, this.swish[side], bend);
        },
      });
    }

    const focusRef: { v: { x: number; y: number } | null } = { v: null };
    // 공을 손에 쥔 자리 (M21: 그 선수 그림이 손 위치에 공을 그린다)
    const carrySlot = rec.carry ? rec.carry[f0] : rec.holder[f0];
    this.hanging = [false, false];
    const rimY = szy(7.5, COURT.rimHeight);
    const tags: ({ x: number; y: number; name: string; team: number } | null)[] = new Array(10).fill(null);
    const labelMode = LABELS.mode;
    // 화면 정리 (M23): 공 가진 선수·슛 쏘는 선수는 맨 위에, 너무 붙은 선수는 화면에서만 살짝 떼어 그린다
    const keyOf = (i: number) => {
      const a = rec.act[f0 * 10 + i];
      if (carrySlot === i || FACE_HOOP.has(a) || DUNK_ACTS.has(a) || a === ACT.HANG) return 2;
      if (a === ACT.BLOCK || a === ACT.CHASE || a === ACT.CONTEST || a === ACT.STEAL) return 1;
      return 0;
    };
    const key = Array.from({ length: 10 }, (_, i) => keyOf(i));
    const ox = this.spread(fr, key);
    this.lastSpread = ox;
    for (let i = 0; i < 10; i++) {
      const pid = lineup.pids[i];
      const pl = pb.game.players[pid];
      const team = pb.game.teamOf[pid];
      let x = fr.px[i * 2];
      let y = fr.px[i * 2 + 1];
      let vx = (rec.pos[f1 * 20 + i * 2] - rec.pos[f0 * 20 + i * 2]) / pb.game.dt;
      let vy = (rec.pos[f1 * 20 + i * 2 + 1] - rec.pos[f0 * 20 + i * 2 + 1]) / pb.game.dt;
      const wk = this.walkers.find((w) => w.slot === i);
      if (wk) {
        const k = Math.min(1, (pb.cur - wk.t0) / WALK_TICKS);
        const e = k * k * (3 - 2 * k);
        vx = x - wk.inFrom.x;
        vy = y - wk.inFrom.y;
        x = wk.inFrom.x + (x - wk.inFrom.x) * e;
        y = wk.inFrom.y + (y - wk.inFrom.y) * e;
        if (k < 1) {
          const n = Math.hypot(vx, vy) || 1;
          vx = (vx / n) * 3;
          vy = (vy / n) * 3;
        }
      }
      const speed = Math.hypot(vx, vy);
      const act = rec.act[f0 * 10 + i];
      const lift = ((rec.pz[f0 * 10 + i] * (1 - (pb.cur - f0)) + rec.pz[f1 * 10 + i] * (pb.cur - f0)) / 50) * ZH;
      // 바라보는 방향: 움직이면 진행 방향, 서 있으면 공 쪽
      let dx = vx;
      let dy = vy;
      if (speed < 0.5) {
        dx = fr.ball[0] - x;
        dy = fr.ball[1] - y;
      }
      const face = this.facing[i];
      if (Math.hypot(dx, dy) > 0.05) {
        if (Math.abs(dx) > Math.abs(dy) * 0.9) {
          face.f = 'side';
          face.flip = dx < 0;
        } else face.f = dy > 0 ? 'front' : 'back';
      }
      // 슛·덩크는 림을 본다, 쏘고 돌아서는 세리머니는 림을 등진다
      const hs = this.hoopSide(team, fr.quarter);
      const hoopX = hs ? COURT.length - COURT.hoopFromBaseline : COURT.hoopFromBaseline;
      if (FACE_HOOP.has(act) || DUNK_ACTS.has(act) || act === ACT.HANG) {
        face.f = 'side';
        face.flip = hoopX < x;
      } else if (act === ACT.TURNAWAY) {
        face.f = 'side';
        face.flip = hoopX > x;
      }
      // 한 번 하는 동작의 진행도
      const run = isOneShot(act) ? this.actRun(i, f0, act) : null;
      const len = run ? run.end + 1 - run.start : 1;
      const prog = run ? Math.max(0, Math.min(1, (pb.cur - run.start) / len)) : undefined;
      const rel = run && run.rel >= run.start ? (run.rel + 1 - run.start) / len : undefined;
      const stunned = (fr.flags[i] & FLAG_STUN) !== 0;
      const energy = fr.energy[i];
      const px = Math.round(sx(x)) + (wk ? 0 : ox[i]);
      const py = Math.round(sy(y));
      // 덩크·매달리기: 손이 림에 닿게 높이를 맞춘다
      let lift2 = lift;
      if (act === ACT.HANG || DUNK_ACTS.has(act)) {
        const need = py - rimY - reachPx(pl) + 1;
        if (act === ACT.HANG) {
          lift2 = Math.max(lift, need);
          if (Math.abs(x - hoopX) < 1.6) this.hanging[hs] = true;
        } else {
          // 피지컬 (M24): 림 위로 손이 올라가는 만큼 더 솟았다가 (동작 0.72), 꽂으면서 림으로 내려온다 (0.9)
          const p0 = prog ?? 0.5;
          const pr = rel !== undefined && rel > 0 ? (p0 <= rel ? (p0 / rel) * 0.9 : 0.9 + ((p0 - rel) / Math.max(0.01, 1 - rel)) * 0.1) : p0;
          const hump = pr < 0.72 ? smooth(0.2, 0.72, pr) : 1 - smooth(0.72, 0.9, pr);
          lift2 = Math.max(lift, need * smooth(0.3, 0.8, pr) + leapOf(pl).clear * ZH * 1.6 * hump);
        }
      }
      const carry = carrySlot === i;
      const ghosts = run && hasTrail(act) && pb.speed <= 8 ? [2, 1] : [];
      items.push({
        depth: y + (key[i] === 2 ? 0.8 : key[i] === 1 ? 0.4 : 0),
        draw: () => {
          // 그림자 (점프하면 작아진다)
          const sw = Math.max(4, 10 - Math.round(lift / 3));
          ctx.fillStyle = 'rgba(30,18,8,0.32)';
          ctx.fillRect(px - Math.floor(sw / 2), py, sw, 2);
          ctx.fillRect(px - Math.floor(sw / 2) + 1, py + 2, sw - 2, 1);
          // 잔상: 조금 전 자리와 자세를 흐리게
          for (const k of ghosts) {
            const gc = pb.cur - k * 0.7;
            const g0 = Math.max(0, Math.floor(gc));
            const gx = rec.pos[g0 * 20 + i * 2];
            const gy = rec.pos[g0 * 20 + i * 2 + 1];
            const glift = (rec.pz[g0 * 10 + i] / 50) * ZH;
            ctx.globalAlpha = k === 2 ? 0.14 : 0.26;
            drawFigureRig(ctx, Math.round(sx(gx)), Math.round(sy(gy)), { pl, kit: this.kit(team), facing: face.f, flip: face.flip, act, speed, lift: Math.max(glift, lift2 - k * 3), time: this.clock, seed: i, tired: false, prog: Math.max(0, (gc - run!.start) / len), rel, ghost: true });
            ctx.globalAlpha = 1;
          }
          if (carry) {
            // 공 그림자 (드리블하면 발 앞에)
            ctx.fillStyle = 'rgba(30,18,8,0.3)';
            ctx.fillRect(px + (face.f === 'side' ? (face.flip ? -6 : 4) : 3), py, 5, 2);
          }
          const rig = drawFigureRig(ctx, px, py, {
            pl,
            kit: this.kit(team),
            facing: face.f,
            flip: face.flip,
            act: stunned ? ACT.STUN : act,
            speed,
            lift: lift2,
            time: pb.cur * pb.game.dt,
            seed: i,
            tired: energy < 45,
            prog,
            rel,
            carry,
          });
          const top = rig.top;
          if (carry && rig.ball) this.lastCarry = { x: rig.ball.x, y: rig.ball.y, cur: pb.cur };
          if (stunned) {
            const k = Math.floor(this.clock * 8) % 4;
            ctx.fillStyle = '#ffe066';
            for (let s = 0; s < 3; s++) {
              const a = (s / 3) * Math.PI * 2 + k * 0.5;
              ctx.fillRect(px + Math.round(Math.cos(a) * 5), top - 2 + Math.round(Math.sin(a) * 2), 1, 1);
            }
          }
          // ON FIRE: 머리 위와 발밑에 불꽃이 일렁인다
          if (this.onFire.has(pid)) this.drawFire(ctx, px, py, top);
          const em = this.emotes.get(pid);
          const emoting = !!em && this.clock < em.until;
          if (emoting) drawEmote(ctx, px, top - 3, em!.k, this.clock);
          // 머리 위 이름표: 등번호는 도트 숫자, 이름은 글자 객체 (아래에서)
          if (labelMode === 'number' && !emoting) this.numberTag(ctx, px, top - 8, pl.number, team);
          if (labelMode === 'name') tags[i] = { x: px, y: top - (emoting ? 13 : 2), name: pl.name, team };
          if (labelMode === 'role') tags[i] = { x: px, y: top - (emoting ? 13 : 2), name: `${pl.number} ${ROLE_SHORT[roles[i].key]}`, team };
          if (DEV.stamina) {
            ctx.font = '7px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#0b0d12';
            ctx.fillText(String(Math.round(energy)), px + 1, py + 13);
            ctx.fillStyle = energy < 45 ? '#ff8a7a' : energy < 70 ? '#ffd76a' : '#bff7c4';
            ctx.fillText(String(Math.round(energy)), px, py + 12);
          }
          if (energy < 70) {
            ctx.fillStyle = 'rgba(11,13,18,0.85)';
            ctx.fillRect(px - 6, py + 4, 13, 3);
            ctx.fillStyle = energy < 45 ? '#ff5a4a' : '#ffc93c';
            ctx.fillRect(px - 5, py + 5, Math.max(1, Math.round((11 * energy) / 100)), 1);
          }
          if (pid === this.host.focus) focusRef.v = { x: px, y: top };
        },
      });
    }

    // 벤치로 나가는 선수
    for (const w of this.walkers) {
      const k = Math.min(1, (pb.cur - w.t0) / WALK_TICKS);
      const e = k * k * (3 - 2 * k);
      const wx = w.outFrom.x + (w.outTo.x - w.outFrom.x) * e;
      const wy = w.outFrom.y + (w.outTo.y - w.outFrom.y) * e;
      const pl = pb.game.players[w.pidOut];
      const team = pb.game.teamOf[w.pidOut];
      const dx = w.outTo.x - w.outFrom.x;
      items.push({
        depth: wy,
        draw: () => {
          const px = Math.round(sx(wx));
          const py = Math.round(sy(wy));
          ctx.fillStyle = 'rgba(30,18,8,0.32)';
          ctx.fillRect(px - 4, py, 8, 2);
          drawFigure(ctx, px, py, { pl, kit: this.kit(team), facing: Math.abs(dx) > Math.abs(w.outTo.y - w.outFrom.y) ? 'side' : 'back', flip: dx < 0, act: ACT.IDLE, speed: 2.4, lift: 0, time: this.clock, seed: w.slot, tired: true });
        },
      });
    }

    // 공 (손에 쥐고 있으면 그 선수 그림이 그린다)
    const [bx, by, bz] = fr.ball;
    let bpx = Math.round(sx(bx));
    let bpy = Math.round(szy(by, bz)) - 2;
    const lc = this.lastCarry;
    if (carrySlot < 0 && lc && pb.cur >= lc.cur && pb.cur - lc.cur < 1.5) {
      // 손을 떠난 직후: 손 위치에서 실제 공 자리로 이어 준다
      const k = (pb.cur - lc.cur) / 1.5;
      bpx = Math.round(lc.x + (bpx - lc.x) * k);
      bpy = Math.round(lc.y + (bpy - lc.y) * k);
    }
    // 딥쓰리 궤적 (M21): 날아가는 공 뒤로 잔상
    let trail = 0;
    if (carrySlot < 0 && bz > 2.2) {
      const se = this.shotEvents.find((e) => e.tick >= f0);
      if (se && se.tick - f0 < 16 && se.pts === 3 && (se.dist ?? 0) >= DEEP_DIST) trail = (se.dist ?? 0) >= LOGO_DIST ? 2 : 1;
    }
    if (trail) {
      for (let k = 1; k <= 6; k++) {
        const g = Math.max(0, pb.cur - k * 0.35);
        const g0 = Math.floor(g);
        const gx = sx(rec.ball[g0 * 3]);
        const gy = szy(rec.ball[g0 * 3 + 1], rec.ball[g0 * 3 + 2]) - 2;
        ctx.globalAlpha = 0.5 - k * 0.07;
        ctx.fillStyle = trail === 2 ? (k % 2 ? '#fff3a0' : '#ff9a3a') : '#ffb46a';
        ctx.fillRect(Math.round(gx) - 1, Math.round(gy) - 1, 3 - (k > 3 ? 1 : 0), 3 - (k > 3 ? 1 : 0));
      }
      ctx.globalAlpha = 1;
    }
    if (carrySlot < 0)
      items.push({
        depth: by + 0.02,
        draw: () => {
          ctx.fillStyle = 'rgba(30,18,8,0.3)';
          ctx.fillRect(Math.round(sx(bx)) - 2, Math.round(sy(by)), 5, 2);
          drawBall(ctx, bpx, bpy);
        },
      });
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();

    // 꽃가루
    if (this.confetti.length) {
      for (const c of this.confetti) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vx += Math.sin(this.clock * 3 + c.y * 0.05) * 4 * dt;
        c.life -= dt;
        ctx.fillStyle = c.c;
        ctx.fillRect(Math.round(c.x), Math.round(c.y), Math.sin(this.clock * 12 + c.x) > 0 ? 2 : 1, 2);
      }
      this.confetti = this.confetti.filter((c) => c.life > 0 && c.y < VIEW_H);
    }

    this.updateNameTags(tags);
    if (focusRef.v) {
      const { x, y } = focusRef.v;
      // 이름표가 있으면 그 위에
      const lift = labelMode === 'number' ? 8 : labelMode === 'name' || labelMode === 'role' ? 12 : 0;
      const yy = y - 4 - lift - (Math.floor(this.clock * 4) % 2);
      ctx.fillStyle = '#1b1f2a';
      ctx.fillRect(x - 3, yy - 1, 7, 1);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(x - 2, yy - 1, 5, 1);
      ctx.fillRect(x - 1, yy, 3, 1);
      ctx.fillRect(x, yy + 1, 1, 1);
    }

    const score = pb.scoreAt(pb.cur);
    const q = fr.quarter <= 4 ? `Q${fr.quarter}` : `OT${fr.quarter - 4}`;
    const c = fr.clock;
    const clockText = c >= 60 ? `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}` : c.toFixed(1);
    drawJumbotron(ctx, this.host.looks[0].fill, this.host.looks[1].fill, score, clockText, q, this.clock < this.jumboUntil && deco ? String(deco.myNumber) : undefined);
    this.layer.refresh();

    // 이벤트 연출: 크게 건너뛴 경우엔 생략
    const jump = pb.cur - this.lastTick;
    if (jump > 0 && jump < 30) for (const ev of pb.eventsBetween(this.lastTick, pb.cur)) this.popEvent(ev, pb.mode === 'highlights' ? pb.effSpeed : pb.speed);
    if (jump < 0 || jump >= 30) {
      this.banner.setVisible(false);
      this.resetZoom();
    }
    this.lastTick = pb.cur;
    if (pb.ended) {
      const w = pb.game.final[0] > pb.game.final[1] ? 0 : 1;
      this.showBanner(`경기 종료 · ${pb.game.teams[w].name} 승리!`, Infinity, VIEW_H * 0.24);
    }
    else if (time > this.bannerUntil) this.banner.setVisible(false);
    if (this.zoomUntil && time > this.zoomUntil) this.resetZoom();
    this.slowLabel.setVisible(pb.slowNow && Math.floor(time / 400) % 2 === 0);
    // 모드 때문에 건너뛰면 장면 전환처럼 어둡게 했다가 밝힌다
    if (pb.cuts !== this.seenCuts) {
      this.seenCuts = pb.cuts;
      this.cameras.main.fadeIn(280, 8, 10, 16);
    }
    let mode = '';
    if (pb.mode === 'highlights') {
      const i = pb.highlightIndex();
      mode = pb.fastForward ? `▶▶ 빨리 감기 · 다음 하이라이트 ${pb.highlights.filter(([, b]) => b < pb.cur).length + 1}/${pb.highlights.length}` : `HIGHLIGHT ${i || '-'}/${pb.highlights.length}`;
    } else if (pb.mode === 'focus' && pb.focusPid >= 0) mode = `FOLLOW #${pb.game.players[pb.focusPid].number}`;
    if (this.modeLabel.text !== mode) this.modeLabel.setText(mode);

    this.host.onFrame();
  }

  private resetZoom() {
    if (!this.zoomUntil) return;
    this.zoomUntil = 0;
    const cam = this.cameras.main;
    cam.zoomTo(1, 300);
    cam.pan(VIEW_W / 2, VIEW_H / 2, 300);
  }

  /** 큰 장면은 잠깐 확대해서 보여준다 (V3) */
  private zoomAt(x: number, y: number) {
    const cam = this.cameras.main;
    cam.zoomTo(1.8, 220);
    cam.pan(Math.max(180, Math.min(VIEW_W - 180, x)), Math.max(100, Math.min(VIEW_H - 100, y)), 220);
    this.zoomUntil = this.time.now + 1300;
  }

  private showBanner(text: string, ms: number, y = VIEW_H / 2) {
    if (this.bannerText.text !== text) this.bannerText.setText(text);
    this.banner.setY(y);
    this.banner.setVisible(true);
    this.bannerUntil = this.time.now + ms;
  }

  private popText(x: number, y: number, text: string, color: string, big = false) {
    const t = this.world(
      this.add
        .text(Math.round(x), Math.round(y), text, { fontFamily: FONT, fontSize: big ? '16px' : '12px', color, stroke: '#14100c', strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setDepth(200),
    );
    this.tweens.add({ targets: t, y: y - 16, duration: 700, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 650, duration: 350, onComplete: () => t.destroy() });
  }

  /** 말풍선 (V6) */
  private bubble(x: number, y: number, text: string) {
    const t = this.add.text(0, 0, text, { fontFamily: FONT, fontSize: '10px', color: '#1b1f2a' }).setOrigin(0.5);
    const w = Math.ceil(t.width) + 8;
    const h = 13;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1).fillRect(-w / 2, -h / 2, w, h);
    g.fillRect(-w / 2 + 1, -h / 2 - 1, w - 2, h + 2);
    g.fillStyle(0x1b1f2a, 1).fillRect(-w / 2, -h / 2 - 1, 1, 1);
    g.fillStyle(0xffffff, 1).fillRect(-2, h / 2 + 1, 3, 2).fillRect(-1, h / 2 + 3, 1, 1);
    const c = this.world(this.add.container(Math.round(x), Math.round(y - 8), [g, t]).setDepth(210));
    this.tweens.add({ targets: c, y: c.y - 3, duration: 160, yoyo: true });
    this.tweens.add({ targets: c, alpha: 0, delay: 900, duration: 250, onComplete: () => c.destroy() });
  }

  /** 컷인: 결정적인 장면에 선수를 크게 (V6) */
  private cutIn(e: GameEvent, label: string) {
    const pb = this.host.pb!;
    const pl = pb.game.players[e.player];
    const team = pb.game.teamOf[e.player];
    const key = `cut${this.host.gameId}-${e.player}-${e.tick}`;
    const cv = document.createElement('canvas');
    cv.width = 56;
    cv.height = 62;
    const cctx = cv.getContext('2d')!;
    cctx.imageSmoothingEnabled = false;
    drawFigure(cctx, 28, 58, { pl, kit: this.kit(team as 0 | 1), facing: 'front', flip: false, act: e.shot === 'dunk' ? ACT.FLEX : e.pts === 3 ? ACT.GOGGLES : ACT.CELEBRATE, speed: 0, lift: 0, time: 0.2, seed: 1, tired: false });
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, cv);
    const col = Phaser.Display.Color.HexStringToColor(this.host.looks[team].fill).color;
    const band = this.add.rectangle(0, 0, VIEW_W + 40, 120, 0x0b0d14, 0.92);
    const stripe = this.add.rectangle(0, -58, VIEW_W + 40, 6, col, 1);
    const stripe2 = this.add.rectangle(0, 58, VIEW_W + 40, 6, col, 1);
    const lines = this.add.graphics();
    lines.lineStyle(1, 0xffffff, 0.18);
    for (let k = 0; k < 18; k++) {
      const yy = -50 + k * 6;
      lines.lineBetween(-VIEW_W / 2 - 20 + ((k * 53) % 120), yy, VIEW_W / 2 + 20, yy);
    }
    const img = this.add.image(-150, 4, key).setScale(1.9);
    const name = this.add.text(-60, -26, `#${pl.number} ${pl.name}`, { fontFamily: FONT, fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0, 0.5);
    const big = this.add.text(-60, 10, label, { fontFamily: FONT, fontSize: '30px', color: '#ffe066', stroke: '#000000', strokeThickness: 5 }).setOrigin(0, 0.5);
    const c = this.ui(this.add.container(VIEW_W / 2 - VIEW_W, VIEW_H / 2, [band, stripe, stripe2, lines, img, name, big]).setDepth(400));
    this.tweens.add({ targets: c, x: VIEW_W / 2, duration: 180, ease: 'Cubic.Out' });
    this.tweens.add({ targets: lines, x: -60, duration: 1200 });
    this.tweens.add({ targets: c, x: VIEW_W * 1.5, delay: 1050, duration: 200, ease: 'Cubic.In', onComplete: () => c.destroy() });
    pb.holdUntil = performance.now() + 1250;
  }

  /** 치어리더와 마스코트 (코트 앞, 홈 쪽) */
  private drawCheerSquad(ctx: CanvasRenderingContext2D, deco: ArenaDeco) {
    const home = this.host.looks[0].fill;
    const hype = this.mood.homeCheer;
    if (deco.cheer.includes('cheerLeaders')) {
      for (let k = 0; k < 4; k++) {
        const x = 52 + k * 13;
        const y = 330;
        const ph = this.clock * (hype > 0.3 ? 9 : 4) + k * 1.3;
        const up = Math.sin(ph) > 0;
        const hop = hype > 0.3 && Math.sin(ph * 0.5) > 0.6 ? 2 : 0;
        ctx.fillStyle = '#f6d2b0';
        ctx.fillRect(x - 1, y - 3 - hop, 1, 3);
        ctx.fillRect(x + 1, y - 3 - hop, 1, 3);
        ctx.fillStyle = home;
        ctx.fillRect(x - 2, y - 6 - hop, 5, 3);
        ctx.fillStyle = '#f7f2e8';
        ctx.fillRect(x - 2, y - 9 - hop, 5, 3);
        ctx.fillStyle = '#f6d2b0';
        ctx.fillRect(x - 1, y - 12 - hop, 3, 3);
        ctx.fillStyle = k % 2 ? '#4a2f1e' : '#d9b25a';
        ctx.fillRect(x - 1, y - 13 - hop, 3, 1);
        ctx.fillRect(x + 2, y - 12 - hop, 1, 3);
        // 폼폼
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(x - 4, y - (up ? 14 : 8) - hop, 2, 2);
        ctx.fillRect(x + 3, y - (up ? 8 : 14) - hop, 2, 2);
      }
    }
    if (deco.cheer.includes('cheerMascot')) {
      // 앞줄 앞을 왔다 갔다
      const span = 360;
      const p = (this.clock * 22) % (span * 2);
      const x = Math.round(140 + (p < span ? p : span * 2 - p));
      const y = 336;
      const step = Math.floor(this.clock * 6) % 2;
      const jump = hype > 0.5 ? Math.round(Math.abs(Math.sin(this.clock * 10)) * 3) : 0;
      ctx.fillStyle = '#20232d';
      ctx.fillRect(x - 3, y - 2 - jump + step, 2, 3);
      ctx.fillRect(x + 1, y - 2 - jump + (1 - step), 2, 3);
      ctx.fillStyle = home;
      ctx.fillRect(x - 4, y - 9 - jump, 8, 7);
      ctx.fillRect(x - 5, y - 19 - jump, 10, 10);
      ctx.fillStyle = shade(home, 0.45);
      ctx.fillRect(x - 3, y - 15 - jump, 6, 4);
      ctx.fillStyle = '#14100c';
      ctx.fillRect(x - 2, y - 16 - jump, 1, 2);
      ctx.fillRect(x + 1, y - 16 - jump, 1, 2);
      ctx.fillRect(x - 1, y - 13 - jump, 2, 1);
      ctx.fillStyle = shade(home, -0.3);
      ctx.fillRect(x - 5, y - 20 - jump, 2, 2);
      ctx.fillRect(x + 3, y - 20 - jump, 2, 2);
    }
  }

  private cheer(team: 0 | 1, power: number) {
    if (team === 0) this.mood.homeCheer = Math.max(this.mood.homeCheer, power);
    else this.mood.awayCheer = Math.max(this.mood.awayCheer, power * 0.8);
    this.benchCheer[team] = Math.max(this.benchCheer[team], 1.2 * power);
  }

  private popEvent(e: GameEvent, speed: number) {
    const pb = this.host.pb!;
    // ON FIRE (M19): 3번 연속 넣으면 불이 붙고, 놓치면 꺼진다
    if ((e.type === 'made' || e.type === 'miss') && e.player >= 0) {
      const n = e.type === 'made' ? (this.streak.get(e.player) ?? 0) + 1 : 0;
      this.streak.set(e.player, n);
      if (n === 0) this.onFire.delete(e.player);
      else if (n >= 3 && !this.onFire.has(e.player)) {
        this.onFire.add(e.player);
        this.fireStart = e;
      }
    }
    const looks = this.host.looks;
    const teams = pb.game.teams;
    /** 선수 머리 위 위치 (벤치에 있으면 코트 가운데) */
    const at = (pid: number) => {
      const slot = pid >= 0 ? pb.slotOf(pid, e.tick) : -1;
      if (slot < 0) return { x: VIEW_W / 2, y: VIEW_H / 2 };
      const fr = pb.sample();
      return { x: sx(fr.px[slot * 2]), y: sy(fr.px[slot * 2 + 1]) - 30 };
    };
    const calm = speed <= 4;
    const loud = speed <= 8;
    if (DEV.prob && e.prob !== undefined && e.player >= 0 && speed <= 16) {
      const p = at(e.player);
      const pct = `${Math.round(e.prob * 100)}%${e.contest !== undefined ? ` 견제 ${Math.round(e.contest * 100)}` : ''}`;
      this.popText(p.x, p.y + 22, pct, '#7df9ff');
    }
    switch (e.type) {
      case 'made': {
        const p = at(e.player);
        const col = shade(looks[e.team].fill, 0.4);
        const dunkName = e.dunk && e.dunk !== 'one' ? `${DUNK_LABEL[e.dunk]}!` : '덩크!';
        // 슛 동작 (M16): 흔한 캐치앤슛·풀업은 빼고 이름을 띄운다
        const mv = e.move && e.move !== 'catchShoot' && e.move !== 'pullup' ? (e.move === 'putback' ? '풋백 덩크!' : `${shotMove(e.move)?.label ?? ''}!`) : null;
        const flashy = !!e.move && (e.move === 'putback' || !!shotMove(e.move)?.flashy);
        const d = e.dist ?? 0;
        const deep = e.pts === 3 && d >= DEEP_DIST;
        const logo = deep && d >= LOGO_DIST;
        const threeName = logo ? `로고샷!! ${d.toFixed(1)}m` : deep ? `딥쓰리! ${d.toFixed(1)}m` : '3점!';
        const label = e.combo ? '콤비!' : e.poster ? '인유어페이스!!' : e.alleyOop ? '앨리웁!' : e.andOne ? (mv ? `${mv.replace('!', '')} 앤드원!` : '앤드원!') : deep ? threeName : mv ?? (e.shot === 'dunk' ? dunkName : e.pts === 3 ? '3점!' : '+2');
        const big = e.combo || e.poster || e.alleyOop || e.andOne || e.shot === 'dunk' || e.pts === 3 || flashy;
        if (big) this.emote(e.player, 'note');
        if (loud) sound.play(e.shot === 'dunk' ? 'dunk' : 'swish');
        if (loud && big && calm) sound.play('cheer');
        this.popText(p.x, p.y, label, col, big);
        // 덩크 도약 (M24): 몇 m 밖에서 뛰어 얼마나 높이 떴나
        if (e.leap && e.shot === 'dunk' && speed <= 8) this.popText(p.x, p.y + 14, `도약 ${e.leap.d.toFixed(1)}m · 점프 ${Math.round(e.leap.h * 100)}cm`, e.leap.d >= 3 ? '#ffd23f' : '#ffe9a8');
        if (this.fireStart === e) {
          this.fireStart = null;
          this.popText(p.x, p.y - 16, 'ON FIRE!', '#ff8a1f', true);
          if (loud) sound.play('cheer');
        }
        const side = this.hoopSide(e.team, e.quarter);
        this.swish[side] = 0.5;
        if (e.shot === 'dunk') this.rimShake[side] = 0.45;
        this.cheer(e.team as 0 | 1, big ? 1 : 0.6);
        if (e.team === 0 && e.pts === 3 && this.mood.wave < 0 && Math.random() < 0.25) this.mood.wave = 0;
        if ((e.shot === 'dunk' || e.alleyOop) && calm) {
          this.cameras.main.shake(e.poster ? 260 : 140, e.poster ? 0.012 : 0.006);
          if (speed <= 2) this.zoomAt(sx(COURT.length / 2 + (side === 0 ? -12.4 : 12.4)), szy(7.5, 2));
        }
        if (big) this.host.onBigPlay?.(e);
        if (e.player === this.host.focus && e.team === 0 && this.host.deco?.cheer.includes('cheerJumbo')) this.jumboUntil = this.clock + 2.5;
        // 컷인: 앨리웁, 버저비터, 막판 접전의 3점·덩크, 고른 선수의 덩크·3점
        const clutch = e.quarter >= 4 && e.clock < 180 && Math.abs(e.score[0] - e.score[1]) <= 5;
        const buzzer = e.clock < 0.6;
        const mine = e.player === this.host.focus && (e.shot === 'dunk' || e.pts === 3);
        const worth = e.alleyOop || e.poster || (buzzer && e.pts >= 2) || (clutch && big) || mine || (flashy && e.player === this.host.focus) || (e.combo && (e.player === this.host.focus || e.other === this.host.focus));
        // 화려한 패스를 받아 넣었다 (M21)
        if (e.fancy && e.other >= 0 && calm) {
          const pp = at(e.other);
          this.popText(pp.x, pp.y - 4, '쇼타임 패스!', '#9ff0ff');
        }
        if (logo && loud) {
          this.cheer(e.team as 0 | 1, 1);
          this.mood.wave = 0;
        }
        // 위닝 버저비터: 마지막 쿼터 막판에 이 슛으로 이기게 됐다
        const before = e.team === 0 ? e.score[0] - e.pts - e.score[1] : e.score[1] - e.pts - e.score[0];
        const after = before + e.pts;
        const winner = e.quarter >= 4 && e.clock < 1.0 && before <= 0 && after > 0;
        if (winner) {
          this.showBanner(`위닝 버저비터!! ${pb.game.players[e.player].name}`, 2600, VIEW_H * 0.24);
          if (loud) sound.play('cheer');
          const cols = [looks[e.team].fill, looks[e.team].num, '#ffd23f', '#f7f2e8'];
          for (let i = 0; i < 70; i++) this.confetti.push({ x: Math.random() * VIEW_W, y: -Math.random() * 100, vx: (Math.random() - 0.5) * 20, vy: 30 + Math.random() * 40, c: cols[i % cols.length], life: 5 });
          const lu = pb.lineupAt(e.tick).pids;
          lu.forEach((pid, k) => this.emote(pid, (k < 5 ? 0 : 1) === e.team ? 'note' : 'dots', 3));
        }
        if (worth && calm && e.tick - this.lastCutIn > 300) {
          this.lastCutIn = e.tick;
          this.cutIn(e, winner ? '위닝 버저비터!!' : buzzer ? '버저비터!' : label.replace('+2', '득점!'));
        } else if (calm && big && Math.random() < 0.5) {
          const mate = pb.lineupAt(e.tick).pids.find((q, k) => q !== e.player && (k < 5 ? 0 : 1) === e.team);
          if (mate !== undefined) {
            const m = at(mate);
            this.bubble(m.x, m.y, Math.random() < 0.5 ? '나이스!' : '좋아!');
          }
        }
        break;
      }
      case 'miss':
        if (loud) sound.play(e.blocked ? 'block' : 'clank');
        if (e.blocked && e.other >= 0) {
          this.emote(e.other, 'bang');
          this.emote(e.player, 'dots');
          const p = at(e.other);
          this.popText(p.x, p.y, e.chase ? '체이스다운!!' : '블록!', '#9fd8ff', true);
          if (e.chase && calm) this.cameras.main.shake(160, 0.007);
          this.cheer((1 - e.team) as 0 | 1, 0.8);
          if (calm && Math.random() < 0.5) this.bubble(p.x, p.y - 14, '어림없지!');
          if (calm) this.cameras.main.shake(100, 0.004);
        }
        break;
      case 'loose': {
        const p = at(e.player);
        if (loud) sound.play('bounce');
        if (e.offensive) {
          if (calm) this.popText(p.x, p.y, '다시 잡았다', '#ffe08a');
        } else {
          this.emote(e.player, 'bang');
          if (e.other >= 0) this.emote(e.other, 'dots');
          this.popText(p.x, p.y, '쳐냈다!', '#b9f6a4', true);
        }
        break;
      }
      case 'turnover':
        if (e.tov === 'offFoul') break; // 파울 팝업이 대신한다
        if (e.player >= 0) this.emote(e.player, 'dots');
        if (e.other >= 0) this.emote(e.other, 'bang');
        if (e.other >= 0) {
          const p = at(e.other);
          this.popText(p.x, p.y, '스틸!', '#b9f6a4', true);
          this.cheer((1 - e.team) as 0 | 1, 0.6);
          if (calm && Math.random() < 0.4) this.bubble(p.x, p.y - 14, '내 거야!');
        } else if (speed <= 8) {
          const p = at(e.player);
          this.popText(p.x, p.y, e.tov === 'shotClock' ? '24초!' : e.tov === 'eightSec' ? '8초!' : '실책', '#ffb3a8');
        }
        break;
      case 'foul': {
        if (loud) sound.play('whistle');
        this.emote(e.player, 'anger', e.foul === 'technical' ? 2.2 : 1.2);
        const p = at(e.player);
        if (e.foul === 'technical') {
          this.popText(p.x, p.y, '테크니컬!', '#ff6a5a', true);
          break;
        }
        const label = e.foul === 'charge' ? '차징!' : e.fta ? `파울 · 자유투 ${e.fta}` : '파울';
        this.popText(p.x, p.y, label, '#ffb36b', e.foul === 'charge');
        break;
      }
      case 'ft':
        if (e.made) {
          this.swish[this.hoopSide(e.team, e.quarter)] = 0.4;
          if (e.team === 0) this.mood.homeCheer = Math.max(this.mood.homeCheer, 0.4);
        }
        if (calm) {
          const p = at(e.player);
          this.popText(p.x, p.y, e.made ? '+1' : '실패', e.made ? shade(looks[e.team].fill, 0.4) : '#aab2c4');
        }
        break;
      case 'ankle': {
        this.emote(e.player, 'note');
        const p = at(e.other);
        this.popText(p.x, p.y, '휘청!', '#ffe066', true);
        this.cheer(e.team as 0 | 1, 0.7);
        break;
      }
      case 'rebound':
        if (e.offensive && calm) {
          const p = at(e.player);
          this.popText(p.x, p.y, '공격 리바운드', '#e8e8e8');
          if (Math.random() < 0.3) this.bubble(p.x, p.y - 14, '한 번 더!');
        }
        break;
      case 'screen':
        if (calm && Math.random() < (e.switched ? 0.6 : 0.25)) {
          const p = at(e.player);
          this.bubble(p.x, p.y, e.switched ? '스위치!' : '스크린!');
        }
        break;
      case 'sub':
        if (calm) {
          const p = at(e.player);
          this.popText(p.x, p.y, '교체', '#cfd6e6');
        }
        break;
      case 'ejected': {
        this.emote(e.player, 'anger', 2.5);
        const p = at(e.player);
        this.popText(p.x, p.y, '퇴장', '#ff6a5a', true);
        break;
      }
      case 'timeout':
        if (loud) sound.play('whistle');
        this.showBanner(`타임아웃 · ${teams[e.team].city} ${teams[e.team].name}`, 1600);
        break;
      case 'gameEnd': {
        sound.play('buzzer');
        sound.play('cheer');
        this.showBanner(`경기 종료 · ${teams[e.team].name} 승리!`, 3800, VIEW_H * 0.24);
        this.cheer(e.team as 0 | 1, 1);
        const lu = pb.lineupAt(e.tick).pids;
        lu.forEach((pid, k) => this.emote(pid, (k < 5 ? 0 : 1) === e.team ? 'note' : 'dots', 3.5));
        // 이긴 팀 색 꽃가루 (체육관은 조금, 결승은 잔뜩)
        const n = [30, 90, 180][this.host.tier ?? 1];
        const cols = [looks[e.team].fill, looks[e.team].num, '#ffd23f', '#f7f2e8'];
        for (let i = 0; i < n; i++) this.confetti.push({ x: Math.random() * VIEW_W, y: -Math.random() * 120, vx: (Math.random() - 0.5) * 20, vy: 30 + Math.random() * 40, c: cols[i % cols.length], life: 6 });
        break;
      }
      case 'quarterEnd': {
        if (!(e.quarter >= 4 && e.score[0] !== e.score[1])) sound.play('buzzer');
        const q = e.quarter;
        const label = q === 2 ? '전반 종료' : q <= 4 ? `${q}쿼터 종료` : `연장 ${q - 4}차 종료`;
        this.showBanner(label, 1800);
        break;
      }
      default:
        break;
    }
  }

  /** 화면에서만 겹친 선수를 옆으로 조금 민다 (px). 중요한 선수 (key 2)는 안 움직이고 남이 비킨다 */
  private spread(fr: ReturnType<Playback['sample']>, key: number[]): number[] {
    const bx = Array.from({ length: 10 }, (_, i) => sx(fr.px[i * 2]));
    const by = Array.from({ length: 10 }, (_, i) => sy(fr.px[i * 2 + 1]));
    const ox = new Array(10).fill(0);
    for (let it = 0; it < 3; it++)
      for (let i = 0; i < 10; i++)
        for (let j = i + 1; j < 10; j++) {
          const dy = Math.abs(by[j] - by[i]);
          if (dy > 12) continue;
          const dx = bx[j] + ox[j] - (bx[i] + ox[i]);
          const gap = 11 - Math.abs(dx);
          if (gap <= 0) continue;
          const push = gap * Math.min(1, (12 - dy) / 8) * 0.5;
          const sg = dx > 0 || (dx === 0 && i < j) ? 1 : -1;
          const wi = key[i] > key[j] ? 0 : key[i] < key[j] ? 1 : 0.5;
          ox[i] -= sg * push * wi;
          ox[j] += sg * push * (1 - wi);
        }
    return ox.map((v) => Math.round(Math.max(-5, Math.min(5, v))));
  }

  /** 지금 돌리는 작전 (공격이 끝나면 없다) */
  private activePlay(cur: number): GameEvent | null {
    let e: GameEvent | null = null;
    for (const p of this.playEvents) {
      if (p.tick > cur) break;
      e = p;
    }
    if (!e || cur - e.tick > 90) return null;
    const end = this.endTicks.find((t) => t > e!.tick);
    return end !== undefined && end <= cur ? null : e;
  }

  private drawLeaps(ctx: CanvasRenderingContext2D, cur: number) {
    const pb = this.host.pb!;
    const rec = pb.game.rec;
    for (const e of this.shotEvents) {
      const L = e.leap;
      if (!L || cur < L.t || cur > e.tick + 22) continue;
      if (e.tick - L.t > 16) continue;
      const slot = pb.slotOf(e.player, L.t);
      if (slot < 0) continue;
      const team = pb.game.teamOf[e.player] as 0 | 1;
      const col = shade(this.host.looks[team].fill, 0.35);
      const fade = cur > e.tick ? Math.max(0, 1 - (cur - e.tick) / 22) : 1;
      ctx.globalAlpha = 0.9 * fade;
      // 날아간 길 (바닥 그림자 점선)
      const end = Math.min(cur, e.tick);
      for (let f = L.t; f <= end; f += 0.5) {
        const f0 = Math.floor(f);
        const k = f - f0;
        const x = rec.pos[f0 * 20 + slot * 2] * (1 - k) + rec.pos[(f0 + 1) * 20 + slot * 2] * k;
        const y = rec.pos[f0 * 20 + slot * 2 + 1] * (1 - k) + rec.pos[(f0 + 1) * 20 + slot * 2 + 1] * k;
        if ((f * 2) % 2 === 0) {
          ctx.fillStyle = 'rgba(20,14,8,0.55)';
          ctx.fillRect(Math.round(sx(x)) - 1, Math.round(sy(y)), 2, 1);
        }
      }
      // 뛴 자리: 두 발자국
      const fx = Math.round(sx(L.x));
      const fy = Math.round(sy(L.y));
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(fx - 4, fy - 2, 4, 3);
      ctx.fillRect(fx + 1, fy - 1, 4, 3);
      ctx.fillStyle = col;
      ctx.fillRect(fx - 3, fy - 1, 2, 1);
      ctx.fillRect(fx + 2, fy, 2, 1);
      // 꽂은 뒤: 뛴 자리에서 림 밑까지 자 (눈금 1m마다)
      if (cur >= e.tick) {
        const side = this.hoopSide(e.team, e.quarter);
        const hx = side ? COURT.length - COURT.hoopFromBaseline : COURT.hoopFromBaseline;
        const hy = COURT.width / 2;
        const dd = Math.hypot(hx - L.x, hy - L.y) || 1;
        ctx.fillStyle = '#ffe9a8';
        for (let m = 0; m <= dd; m += 0.25) {
          const x = L.x + ((hx - L.x) * m) / dd;
          const y = L.y + ((hy - L.y) * m) / dd;
          const tick = Math.abs(m - Math.round(m)) < 0.01;
          ctx.fillRect(Math.round(sx(x)), Math.round(sy(y)) + 2, 1, tick ? 3 : 1);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawTactics(ctx: CanvasRenderingContext2D, fr: ReturnType<Playback['sample']>, cur: number) {
    const pb = this.host.pb!;
    const e = TACTICS.on ? this.activePlay(cur) : null;
    if (!e) {
      this.playTag?.setVisible(false);
      return;
    }
    // 팀 색이 바닥색과 비슷하면 노란색으로
    const fill = this.host.looks[e.team].fill;
    const col = luminance(fill) > 0.6 || colorDistance(fill, '#c99a5b') < 90 ? '#ffd23f' : shade(fill, 0.25);
    const slot = (pid: number) => (pid >= 0 ? pb.slotOf(pid, cur) : -1);
    const at = (k: number) => ({ x: sx(fr.px[k * 2]) + (this.lastSpread[k] ?? 0), y: sy(fr.px[k * 2 + 1]), wx: fr.px[k * 2], wy: fr.px[k * 2 + 1] });
    const side = this.hoopSide(e.team, e.quarter);
    const hx = side ? COURT.length - COURT.hoopFromBaseline : COURT.hoopFromBaseline;
    const rim = { x: sx(hx), y: sy(7.5) };
    // 바닥 위에서도 보이게 진한 그림자를 먼저 깔고 그린다
    const SHADOW = 'rgba(20,12,6,0.7)';
    const dash = (a: { x: number; y: number }, b: { x: number; y: number }, c: string, arrow = true) => {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 4) return;
      const ux = (b.x - a.x) / d;
      const uy = (b.y - a.y) / d;
      for (const [col, oy] of [
        [SHADOW, 1],
        [c, 0],
      ] as [string, number][]) {
        ctx.fillStyle = col;
        for (let k = 0; k < d - 4; k += 5) {
          const t = k / d;
          ctx.fillRect(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t) + oy, 3, 2);
        }
        if (!arrow) continue;
        for (let k = 0; k < 6; k++) {
          ctx.fillRect(Math.round(b.x - ux * k - uy * k * 0.6), Math.round(b.y - uy * k + ux * k * 0.6) + oy, 2, 2);
          ctx.fillRect(Math.round(b.x - ux * k + uy * k * 0.6), Math.round(b.y - uy * k - ux * k * 0.6) + oy, 2, 2);
        }
      }
    };
    const ring = (p: { x: number; y: number }, c: string) => {
      for (const [col, oy] of [
        [SHADOW, 1],
        [c, 0],
      ] as [string, number][]) {
        ctx.fillStyle = col;
        for (let a = 0; a < Math.PI * 2; a += 0.13) ctx.fillRect(Math.round(p.x + Math.cos(a) * 12), Math.round(p.y + 1 + Math.sin(a) * 4.5) + oy, 2, 2);
      }
    };
    const hs = slot(e.player);
    const os = slot(e.other);
    const h = hs >= 0 ? at(hs) : null;
    const o = os >= 0 ? at(os) : null;
    // 바닥에 그리는 거라 살짝 투명하게
    ctx.globalAlpha = 0.85;
    if (h) ring(h, col);
    switch (e.play) {
      case 'pnr':
        if (o && h) {
          dash(o, h, col, false);
          // 롤 (골밑으로) 또는 팝 (3점 라인 쪽으로)
          const to = e.pop ? { x: sx(hx + (side ? -1 : 1) * 6.4), y: sy(7.5 + Math.sign(o.wy - 7.5 || 1) * 2.5) } : rim;
          dash(o, to, '#ffffff');
        }
        break;
      case 'pindown':
        if (o && h) {
          dash(o, h, col, false);
          const wing = { x: sx(hx + (side ? -1 : 1) * 5.2), y: sy(7.5 + Math.sign(h.wy - 7.5 || 1) * 5.0) };
          dash(h, wing, '#ffffff');
        }
        break;
      case 'dho':
        if (o && h) dash(o, h, '#ffffff');
        break;
      case 'post':
        if (o) {
          ring(o, '#ffffff');
          dash(o, rim, col);
        }
        break;
      default:
        break;
    }
    // 컷하는 선수는 골밑으로 화살표 (어느 작전이든)
    for (let k = e.team === 0 ? 0 : 5, n = k + 5; k < n; k++) if (fr.flags[k] & FLAG_CUT) dash(at(k), rim, '#9ff0ff');
    ctx.globalAlpha = 1;
    // 작전 이름표
    if (!this.playTag) this.playTag = this.world(this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', color: '#ffffff', padding: { x: 4, y: 2 }, resolution: 3 }).setOrigin(0.5, 1).setDepth(160));
    const label = `${PLAY_LABEL[e.play!]}${e.play === 'pnr' ? (e.pop ? ' · 팝' : ' · 롤') : ''}`;
    if (this.playTag.text !== label) this.playTag.setText(label);
    const anchor = e.play === 'post' && o ? o : h;
    // 팀 색 바탕에 등번호 색 글자 (작전 칩)
    const look = this.host.looks[e.team];
    // 어두운 바탕에 팀 색 (어두운 팀 색이면 밝게)
    const txt = luminance(look.fill) > 0.35 ? look.fill : shade(look.fill, 0.5);
    if (anchor) this.playTag.setColor(txt).setBackgroundColor('#11151dcc').setPosition(anchor.x, anchor.y - (LABELS.mode === 'off' ? 46 : 56)).setVisible(true);
    else this.playTag.setVisible(false);
  }

  /** 이 자리의 동작이 시작한 칸과 끝나는 칸, 공이 마지막으로 손에 있던 칸 (M21) */
  private actRun(slot: number, f0: number, act: number) {
    const c = this.runCache[slot];
    if (c && c.f0 === f0 && c.act === act) return c;
    const rec = this.host.pb!.game.rec;
    let start = f0;
    while (start > 0 && f0 - start < 60 && rec.act[(start - 1) * 10 + slot] === act) start--;
    let end = f0;
    while (end < rec.n - 1 && end - f0 < 60 && rec.act[(end + 1) * 10 + slot] === act) end++;
    let rel = -1;
    if (rec.carry) for (let f = start; f <= end; f++) if (rec.carry[f] === slot) rel = f;
    const r = { f0, act, start, end, rel };
    this.runCache[slot] = r;
    return r;
  }

  private emote(pid: number, k: Emote, dur = 1.3) {
    if (pid < 0) return;
    this.emotes.set(pid, { k, until: this.clock + dur });
  }

  /** 그 쿼터에 이 팀이 공격하는 골대 (0 = 왼쪽, 1 = 오른쪽) */
  private hoopSide(team: number, quarter: number): 0 | 1 {
    const firstHalf = quarter <= 2;
    const right = team === 0 ? firstHalf : !firstHalf;
    return right ? 1 : 0;
  }
}
