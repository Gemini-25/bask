import Phaser from 'phaser';
import { COURT } from '../sim/court';
import { ACT, DUNK_LABEL, FLAG_STUN, type GameEvent } from '../sim/types';
import { drawArena, drawCrowd, drawHoopBack, drawHoopFront, drawJumbotron, makeCrowd, paintColors, type CrowdMood } from './arena';
import { drawBenchFigure, drawFigure, type Facing, type Kit } from './character';
import { sx, sy, szy, VIEW_H, VIEW_W, ZH } from './iso';
import type { Playback } from './playback';
import { shade } from './pixel';
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
  private zoomUntil = 0;
  private clock = 0;
  private lastCutIn = -9999;
  private slowLabel!: Phaser.GameObjects.Text;
  private modeLabel!: Phaser.GameObjects.Text;
  private emotes = new Map<number, { k: Emote; until: number }>();
  private walkers: Walker[] = [];
  private prevLineup: number[] | null = null;
  private confetti: Confetto[] = [];
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
    this.textures.addCanvas(key, drawArena({ home: ph, away: pa, tier, banner: this.host.banner }));
    if (this.bg) this.bg.setTexture(key);
    else this.bg = this.world(this.add.image(0, 0, key).setOrigin(0).setDepth(0));
    this.fans = makeCrowd(looks[0].fill, looks[1].fill, pb.game.seed, tier);
    this.emotes.clear();
    this.walkers = [];
    this.prevLineup = null;
    this.confetti = [];
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
    const rec = pb.game.rec;
    const f0 = Math.floor(pb.cur);
    const f1 = Math.min(rec.n - 1, f0 + 1);

    // 관중·벤치 분위기는 실제 시간으로 식는다
    this.mood.homeCheer = Math.max(0, this.mood.homeCheer - dt * 0.7);
    this.mood.awayCheer = Math.max(0, this.mood.awayCheer - dt * 0.7);
    if (this.mood.wave >= 0) this.mood.wave = this.mood.wave > VIEW_W + 30 ? -1 : this.mood.wave + dt * 320;
    this.benchCheer = [Math.max(0, this.benchCheer[0] - dt), Math.max(0, this.benchCheer[1] - dt)];
    this.swish = [Math.max(0, this.swish[0] - dt), Math.max(0, this.swish[1] - dt)];

    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    drawCrowd(ctx, this.fans, this.mood, this.clock);

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

    const items: Drawable[] = [];
    for (const side of [0, 1] as const) {
      items.push({ depth: 7.5 - 0.05, draw: () => drawHoopBack(ctx, side) });
      items.push({ depth: 7.5 + 0.05, draw: () => drawHoopFront(ctx, side, this.swish[side]) });
    }

    const focusRef: { v: { x: number; y: number } | null } = { v: null };
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
      const stunned = (fr.flags[i] & FLAG_STUN) !== 0;
      const energy = fr.energy[i];
      const px = Math.round(sx(x));
      const py = Math.round(sy(y));
      items.push({
        depth: y,
        draw: () => {
          // 그림자 (점프하면 작아진다)
          const sw = Math.max(4, 10 - Math.round(lift / 3));
          ctx.fillStyle = 'rgba(30,18,8,0.32)';
          ctx.fillRect(px - Math.floor(sw / 2), py, sw, 2);
          ctx.fillRect(px - Math.floor(sw / 2) + 1, py + 2, sw - 2, 1);
          const top = drawFigure(ctx, px, py, {
            pl,
            kit: this.kit(team),
            facing: face.f,
            flip: face.flip,
            act: stunned ? ACT.STUN : act,
            speed,
            lift,
            time: this.clock,
            seed: i,
            tired: energy < 45,
          });
          if (stunned) {
            const k = Math.floor(this.clock * 8) % 4;
            ctx.fillStyle = '#ffe066';
            for (let s = 0; s < 3; s++) {
              const a = (s / 3) * Math.PI * 2 + k * 0.5;
              ctx.fillRect(px + Math.round(Math.cos(a) * 5), top - 2 + Math.round(Math.sin(a) * 2), 1, 1);
            }
          }
          const em = this.emotes.get(pid);
          if (em && this.clock < em.until) drawEmote(ctx, px, top - 3, em.k, this.clock);
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

    // 공
    const [bx, by, bz] = fr.ball;
    const bpx = Math.round(sx(bx));
    const bpy = Math.round(szy(by, bz)) - 2;
    items.push({
      depth: by + 0.02,
      draw: () => {
        ctx.fillStyle = 'rgba(30,18,8,0.3)';
        ctx.fillRect(Math.round(sx(bx)) - 2, Math.round(sy(by)), 5, 2);
        ctx.fillStyle = '#6b2a08';
        ctx.fillRect(bpx - 2, bpy - 1, 5, 3);
        ctx.fillRect(bpx - 1, bpy - 2, 3, 5);
        ctx.fillStyle = '#f07a24';
        ctx.fillRect(bpx - 1, bpy - 1, 3, 3);
        ctx.fillStyle = '#ffb877';
        ctx.fillRect(bpx - 1, bpy - 1, 1, 1);
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

    if (focusRef.v) {
      const { x, y } = focusRef.v;
      const yy = y - 4 - (Math.floor(this.clock * 4) % 2);
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
    drawJumbotron(ctx, this.host.looks[0].fill, this.host.looks[1].fill, score, clockText, q);
    this.layer.refresh();

    // 이벤트 연출: 크게 건너뛴 경우엔 생략
    const jump = pb.cur - this.lastTick;
    if (jump > 0 && jump < 30) for (const ev of pb.eventsBetween(this.lastTick, pb.cur)) this.popEvent(ev, pb.speed);
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
      mode = `HIGHLIGHT ${i || '-'}/${pb.highlights.length}`;
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
    cv.width = 40;
    cv.height = 44;
    const cctx = cv.getContext('2d')!;
    cctx.imageSmoothingEnabled = false;
    drawFigure(cctx, 20, 42, { pl, kit: this.kit(team as 0 | 1), facing: 'front', flip: false, act: e.shot === 'dunk' ? ACT.HANG : ACT.CELEBRATE, speed: 0, lift: 0, time: 0.2, seed: 1, tired: false });
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
    const img = this.add.image(-150, 6, key).setScale(3);
    const name = this.add.text(-60, -26, `#${pl.number} ${pl.name}`, { fontFamily: FONT, fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0, 0.5);
    const big = this.add.text(-60, 10, label, { fontFamily: FONT, fontSize: '30px', color: '#ffe066', stroke: '#000000', strokeThickness: 5 }).setOrigin(0, 0.5);
    const c = this.ui(this.add.container(VIEW_W / 2 - VIEW_W, VIEW_H / 2, [band, stripe, stripe2, lines, img, name, big]).setDepth(400));
    this.tweens.add({ targets: c, x: VIEW_W / 2, duration: 180, ease: 'Cubic.Out' });
    this.tweens.add({ targets: lines, x: -60, duration: 1200 });
    this.tweens.add({ targets: c, x: VIEW_W * 1.5, delay: 1050, duration: 200, ease: 'Cubic.In', onComplete: () => c.destroy() });
    pb.holdUntil = performance.now() + 1250;
  }

  private cheer(team: 0 | 1, power: number) {
    if (team === 0) this.mood.homeCheer = Math.max(this.mood.homeCheer, power);
    else this.mood.awayCheer = Math.max(this.mood.awayCheer, power * 0.8);
    this.benchCheer[team] = Math.max(this.benchCheer[team], 1.2 * power);
  }

  private popEvent(e: GameEvent, speed: number) {
    const pb = this.host.pb!;
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
        const label = e.alleyOop ? '앨리웁!' : e.andOne ? '앤드원!' : e.shot === 'dunk' ? dunkName : e.pts === 3 ? '3점!' : '+2';
        const big = e.alleyOop || e.andOne || e.shot === 'dunk' || e.pts === 3;
        if (big) this.emote(e.player, 'note');
        if (loud) sound.play(e.shot === 'dunk' ? 'dunk' : 'swish');
        if (loud && big && calm) sound.play('cheer');
        this.popText(p.x, p.y, label, col, big);
        const side = this.hoopSide(e.team, e.quarter);
        this.swish[side] = 0.5;
        this.cheer(e.team as 0 | 1, big ? 1 : 0.6);
        if (e.team === 0 && e.pts === 3 && this.mood.wave < 0 && Math.random() < 0.25) this.mood.wave = 0;
        if ((e.shot === 'dunk' || e.alleyOop) && calm) {
          this.cameras.main.shake(140, 0.006);
          if (speed <= 2) this.zoomAt(sx(COURT.length / 2 + (side === 0 ? -12.4 : 12.4)), szy(7.5, 2));
        }
        if (big) this.host.onBigPlay?.(e);
        // 컷인: 앨리웁, 버저비터, 막판 접전의 3점·덩크, 고른 선수의 덩크·3점
        const clutch = e.quarter >= 4 && e.clock < 180 && Math.abs(e.score[0] - e.score[1]) <= 5;
        const buzzer = e.clock < 0.6;
        const mine = e.player === this.host.focus && (e.shot === 'dunk' || e.pts === 3);
        const worth = e.alleyOop || (buzzer && e.pts >= 2) || (clutch && big) || mine;
        if (worth && calm && e.tick - this.lastCutIn > 300) {
          this.lastCutIn = e.tick;
          this.cutIn(e, buzzer ? '버저비터!' : label.replace('+2', '득점!'));
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
          this.popText(p.x, p.y, '블록!', '#9fd8ff', true);
          this.cheer((1 - e.team) as 0 | 1, 0.8);
          if (calm && Math.random() < 0.5) this.bubble(p.x, p.y - 14, '어림없지!');
          if (calm) this.cameras.main.shake(100, 0.004);
        }
        break;
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
