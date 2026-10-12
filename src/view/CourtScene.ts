import Phaser from 'phaser';
import { COURT } from '../sim/court';
import { FLAG_STUN, type GameEvent } from '../sim/types';
import type { Playback } from './playback';
import { shade } from './pixel';
import {
  drawBall,
  drawCourt,
  drawDizzy,
  drawHoop,
  drawMarker,
  drawPlayerToken,
  drawShadow,
  sx,
  sy,
  VIEW_H,
  VIEW_W,
  ZPX,
} from './textures';

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
}

const FONT = 'Galmuri11, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

export class CourtScene extends Phaser.Scene {
  private host: SceneHost;
  private builtFor = -1;
  private court?: Phaser.GameObjects.Image;
  private tokens: Phaser.GameObjects.Image[] = [];
  private shadows: Phaser.GameObjects.Image[] = [];
  private dizzy: Phaser.GameObjects.Image[] = [];
  private slotPid: number[] = new Array(10).fill(-1);
  private bars!: Phaser.GameObjects.Graphics;
  private ball!: Phaser.GameObjects.Image;
  private ballShadow!: Phaser.GameObjects.Image;
  private marker!: Phaser.GameObjects.Image;
  private banner!: Phaser.GameObjects.Container;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerUntil = 0;
  private lastTick = 0;
  private prev = new Float32Array(20);

  constructor(host: SceneHost) {
    super('court');
    this.host = host;
  }

  create() {
    this.textures.addCanvas('ball', drawBall());
    this.textures.addCanvas('ballShadow', drawShadow(7, 3, 0.35));
    this.textures.addCanvas('shadow', drawShadow(15, 6, 0.3));
    this.textures.addCanvas('marker', drawMarker());
    this.textures.addCanvas('dizzy', drawDizzy());
    this.textures.addCanvas('hoop0', drawHoop(0));
    this.textures.addCanvas('hoop1', drawHoop(1));

    for (let i = 0; i < 10; i++) {
      this.shadows.push(this.add.image(0, 0, 'shadow').setDepth(2));
      this.tokens.push(this.add.image(0, 0, 'ball'));
      this.dizzy.push(this.add.image(0, 0, 'dizzy').setDepth(60).setVisible(false));
    }
    this.bars = this.add.graphics().setDepth(55);
    // 골대: 림 중심이 (골대 바닥 위치 - 림 높이)에 오게
    const rimUp = COURT.rimHeight * ZPX;
    const hy = sy(COURT.width / 2) - rimUp;
    this.add.image(sx(COURT.hoopFromBaseline), hy, 'hoop0').setOrigin(10 / 24, 14 / 30).setDepth(40);
    this.add.image(sx(COURT.length - COURT.hoopFromBaseline), hy, 'hoop1').setOrigin(13 / 24, 14 / 30).setDepth(40);

    this.ballShadow = this.add.image(0, 0, 'ballShadow').setDepth(2);
    this.ball = this.add.image(0, 0, 'ball').setDepth(30);
    this.marker = this.add.image(0, 0, 'marker').setDepth(70);

    const band = this.add.rectangle(0, 0, VIEW_W, 30, 0x0d1018, 0.85);
    this.bannerText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '22px', color: '#ffe9b0', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
    this.banner = this.add.container(VIEW_W / 2, VIEW_H / 2, [band, this.bannerText]).setDepth(300).setVisible(false);
  }

  private tokenKey(pid: number) {
    return `tok${this.host.gameId}-${pid}`;
  }

  /** 새 경기: 팀 색에 맞춰 코트와 선수 토큰(로스터 전원)을 다시 만든다 */
  private build() {
    const pb = this.host.pb!;
    const id = this.host.gameId;
    const looks = this.host.looks;
    const courtKey = `court${id}`;
    if (this.textures.exists(courtKey)) this.textures.remove(courtKey);
    this.textures.addCanvas(courtKey, drawCourt([looks[0].paint, looks[1].paint]));
    if (this.court) this.court.setTexture(courtKey);
    else this.court = this.add.image(0, 0, courtKey).setOrigin(0).setDepth(0);
    pb.game.players.forEach((pl, pid) => {
      const key = this.tokenKey(pid);
      if (this.textures.exists(key)) this.textures.remove(key);
      const look = looks[pb.game.teamOf[pid]];
      this.textures.addCanvas(key, drawPlayerToken(look.fill, pl.number, look.num));
    });
    this.slotPid.fill(-1);
    for (let i = 0; i < 20; i++) this.prev[i] = pb.game.rec.pos[i];
    this.lastTick = pb.cur;
    this.banner.setVisible(false);
    this.builtFor = id;
  }

  update(_time: number, delta: number) {
    const pb = this.host.pb;
    if (!pb) return;
    if (this.builtFor !== this.host.gameId) this.build();
    pb.advance(Math.min(delta, 100) / 1000);
    const fr = pb.sample();
    const lineup = pb.lineupAt(pb.cur);
    this.bars.clear();

    for (let i = 0; i < 10; i++) {
      const pid = lineup.pids[i];
      if (this.slotPid[i] !== pid) {
        this.tokens[i].setTexture(this.tokenKey(pid));
        this.slotPid[i] = pid;
      }
      const x = fr.px[i * 2];
      const y = fr.px[i * 2 + 1];
      const d = Math.hypot(x - this.prev[i * 2], y - this.prev[i * 2 + 1]);
      this.prev[i * 2] = x;
      this.prev[i * 2 + 1] = y;
      const px = Math.round(sx(x));
      const py = Math.round(sy(y));
      // 걸을 때 통통 튄다 (카이로 감성)
      const bob = d > 0.01 ? Math.round(Math.abs(Math.sin(this.time.now / 90 + i)) * 1) : 0;
      this.tokens[i].setPosition(px, py - 2 - bob).setDepth(10 + y);
      this.shadows[i].setPosition(px, py + 5);
      const stunned = (fr.flags[i] & FLAG_STUN) !== 0;
      this.dizzy[i].setVisible(stunned).setPosition(px, py - 13 + (Math.floor(this.time.now / 120) % 2));
      // 지친 선수는 발밑에 체력 막대
      const e = fr.energy[i];
      if (e < 70) {
        const w = 12;
        this.bars.fillStyle(0x0b0d12, 0.85).fillRect(px - w / 2 - 1, py + 7, w + 2, 3);
        this.bars.fillStyle(e < 45 ? 0xff5a4a : 0xffc93c, 1).fillRect(px - w / 2, py + 8, Math.max(1, Math.round((w * e) / 100)), 1);
      }
    }

    const [bx, by, bz] = fr.ball;
    this.ball.setPosition(Math.round(sx(bx)), Math.round(sy(by) - bz * ZPX - 2));
    this.ball.setDepth(bz > 2 ? 45 : 10 + by + 0.3);
    this.ballShadow.setPosition(Math.round(sx(bx)), Math.round(sy(by) + 2)).setAlpha(Math.max(0.25, 1 - bz / 5));

    const fs = this.host.focus >= 0 ? lineup.pids.indexOf(this.host.focus) : -1;
    if (fs >= 0) {
      const t = this.tokens[fs];
      this.marker.setVisible(true).setPosition(t.x, t.y - 12 - (Math.floor(this.time.now / 250) % 2));
    } else this.marker.setVisible(false);

    // 이벤트 연출: 크게 건너뛴 경우엔 생략
    const jump = pb.cur - this.lastTick;
    if (jump > 0 && jump < 30) for (const ev of pb.eventsBetween(this.lastTick, pb.cur)) this.popEvent(ev, pb.speed);
    if (jump < 0 || jump >= 30) this.banner.setVisible(false);
    this.lastTick = pb.cur;
    if (pb.ended) this.showBanner('경기 종료', Infinity);
    else if (this.time.now > this.bannerUntil) this.banner.setVisible(false);

    this.host.onFrame();
  }

  private showBanner(text: string, ms: number) {
    this.bannerText.setText(text);
    this.banner.setVisible(true);
    this.bannerUntil = this.time.now + ms;
  }

  private popText(x: number, y: number, text: string, color: string, big = false) {
    const t = this.add
      .text(Math.round(x), Math.round(y), text, { fontFamily: FONT, fontSize: big ? '16px' : '12px', color, stroke: '#14100c', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(200);
    this.tweens.add({ targets: t, y: y - 16, duration: 700, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 650, duration: 350, onComplete: () => t.destroy() });
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
      return { x: sx(fr.px[slot * 2]), y: sy(fr.px[slot * 2 + 1]) - 10 };
    };
    const calm = speed <= 4;
    switch (e.type) {
      case 'made': {
        const p = at(e.player);
        const col = shade(looks[e.team].fill, 0.4);
        const label = e.alleyOop ? '앨리웁!' : e.andOne ? '앤드원!' : e.shot === 'dunk' ? '덩크!' : e.pts === 3 ? '3점!' : '+2';
        const big = e.alleyOop || e.andOne || e.shot === 'dunk' || e.pts === 3;
        this.popText(p.x, p.y, label, col, big);
        if ((e.shot === 'dunk' || e.alleyOop) && calm) this.cameras.main.shake(140, 0.006);
        break;
      }
      case 'miss':
        if (e.blocked && e.other >= 0) {
          const p = at(e.other);
          this.popText(p.x, p.y, '블록!', '#9fd8ff', true);
          if (calm) this.cameras.main.shake(100, 0.004);
        }
        break;
      case 'turnover':
        if (e.tov === 'offFoul') break; // 파울 팝업이 대신한다
        if (e.other >= 0) {
          const p = at(e.other);
          this.popText(p.x, p.y, '스틸!', '#b9f6a4', true);
        } else if (speed <= 8) {
          const p = at(e.player);
          this.popText(p.x, p.y, e.tov === 'shotClock' ? '24초!' : e.tov === 'eightSec' ? '8초!' : '실책', '#ffb3a8');
        }
        break;
      case 'foul': {
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
        if (calm) {
          const p = at(e.player);
          this.popText(p.x, p.y, e.made ? '+1' : '실패', e.made ? shade(looks[e.team].fill, 0.4) : '#aab2c4');
        }
        break;
      case 'ankle': {
        const p = at(e.other);
        this.popText(p.x, p.y, '휘청!', '#ffe066', true);
        break;
      }
      case 'rebound':
        if (e.offensive && calm) {
          const p = at(e.player);
          this.popText(p.x, p.y, '공격 리바운드', '#e8e8e8');
        }
        break;
      case 'sub':
        if (calm) {
          const p = at(e.player);
          this.popText(p.x, p.y, '교체', '#cfd6e6');
        }
        break;
      case 'ejected': {
        const p = at(e.player);
        this.popText(p.x, p.y, '퇴장', '#ff6a5a', true);
        break;
      }
      case 'timeout':
        this.showBanner(`타임아웃 · ${teams[e.team].city} ${teams[e.team].name}`, 1600);
        break;
      case 'quarterEnd': {
        const q = e.quarter;
        const label = q === 2 ? '전반 종료' : q <= 4 ? `${q}쿼터 종료` : `연장 ${q - 4}차 종료`;
        this.showBanner(label, 1800);
        break;
      }
      default:
        break;
    }
  }
}
