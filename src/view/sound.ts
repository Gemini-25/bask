// 효과음과 칩튠 음악 (SD1, SD2): 파일 없이 WebAudio로 코드에서 만든다.
// 브라우저는 사용자가 한 번 눌러야 소리를 낼 수 있어서 첫 클릭 때 켠다.

export type Sfx = 'swish' | 'dunk' | 'clank' | 'block' | 'whistle' | 'buzzer' | 'cheer' | 'bounce' | 'click' | 'jingle' | 'fanfare' | 'pop';

const PREF = 'bask.sound';

class SoundBox {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  sfxOn = true;
  bgmOn = true;
  private bgmTimer = 0;
  private bgmWanted = false;
  private nextNote = 0;
  private step = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(PREF);
      if (raw) {
        const p = JSON.parse(raw);
        this.sfxOn = p.sfx !== false;
        this.bgmOn = p.bgm !== false;
      }
    } catch {
      // 저장소를 못 쓰면 기본값
    }
    const unlock = () => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private save() {
    try {
      localStorage.setItem(PREF, JSON.stringify({ sfx: this.sfxOn, bgm: this.bgmOn }));
    } catch {
      // 무시
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.bgmWanted) this.startBgm();
    return this.ctx;
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    this.save();
  }

  setBgm(on: boolean) {
    this.bgmOn = on;
    this.save();
    if (on && this.bgmWanted) this.startBgm();
    else this.stopBgmTimer();
  }

  /** 짧은 음 하나 */
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = 0) {
    const c = this.ctx!;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, freq: number, q = 1, at = 0, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx!;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  play(name: Sfx) {
    if (!this.sfxOn) return;
    const c = this.ensure();
    if (!c || c.state !== 'running') return;
    switch (name) {
      case 'swish':
        this.hiss(0.25, 0.5, 3500, 0.8);
        break;
      case 'dunk':
        this.tone('sine', 120, 50, 0.25, 0.8);
        this.tone('square', 220, 180, 0.25, 0.12, 0.02);
        this.hiss(0.2, 0.3, 1800, 2, 0.02);
        break;
      case 'clank':
        this.tone('square', 660, 600, 0.12, 0.12);
        this.tone('triangle', 990, 900, 0.18, 0.12, 0.01);
        break;
      case 'block':
        this.tone('sine', 180, 60, 0.15, 0.7);
        break;
      case 'whistle': {
        const t = c.currentTime;
        const o = c.createOscillator();
        const lfo = c.createOscillator();
        const lg = c.createGain();
        const g = c.createGain();
        o.type = 'sine';
        o.frequency.value = 2900;
        lfo.frequency.value = 28;
        lg.gain.value = 120;
        lfo.connect(lg).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.setValueAtTime(0.18, t + 0.32);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g).connect(this.master!);
        o.start(t);
        lfo.start(t);
        o.stop(t + 0.42);
        lfo.stop(t + 0.42);
        break;
      }
      case 'buzzer':
        this.tone('sawtooth', 160, 150, 0.8, 0.22);
        this.tone('square', 162, 152, 0.8, 0.08);
        break;
      case 'cheer':
        this.hiss(1.4, 0.35, 900, 0.5);
        this.hiss(1.2, 0.2, 2200, 0.7, 0.1);
        break;
      case 'bounce':
        this.tone('sine', 140, 70, 0.08, 0.35);
        break;
      case 'click':
        this.tone('square', 880, 880, 0.04, 0.06);
        break;
      case 'pop':
        this.tone('square', 520, 1040, 0.08, 0.08);
        break;
      case 'jingle':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.12, 0.07, i * 0.08));
        break;
      case 'fanfare':
        [392, 523, 659, 784, 659, 1047].forEach((f, i) => this.tone('square', f, f, i === 5 ? 0.4 : 0.12, 0.08, i * 0.1));
        [196, 262, 330].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.12, i * 0.2));
        break;
    }
  }

  // ───── 칩튠 음악: 8마디를 반복하는 밝은 루프 ─────

  /** 화면이 원하면 음악을 튼다 (경기 화면은 관중 소리만) */
  music(on: boolean) {
    this.bgmWanted = on;
    if (on && this.bgmOn) this.startBgm();
    else this.stopBgmTimer();
  }

  private startBgm() {
    const c = this.ctx;
    if (!c || this.bgmTimer || !this.bgmOn) return;
    this.nextNote = c.currentTime + 0.1;
    this.bgmTimer = window.setInterval(() => this.schedule(), 100);
  }

  private stopBgmTimer() {
    if (this.bgmTimer) window.clearInterval(this.bgmTimer);
    this.bgmTimer = 0;
  }

  private schedule() {
    const c = this.ctx;
    if (!c) return;
    // C - Am - F - G 진행, 8분음표
    const beat = 0.2;
    const prog = [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ];
    const lead = [72, 0, 74, 76, 79, 0, 76, 74, 72, 0, 69, 72, 74, 0, 0, 0, 69, 0, 72, 74, 76, 0, 74, 72, 71, 0, 72, 74, 67, 0, 0, 0];
    const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
    while (this.nextNote < c.currentTime + 0.4) {
      const s = this.step % 32;
      const chord = prog[Math.floor(s / 8)];
      const at = this.nextNote - c.currentTime;
      const ln = lead[s];
      if (ln) this.tone('square', midi(ln), midi(ln), beat * 0.9, 0.035, at);
      if (s % 2 === 0) this.tone('triangle', midi(chord[0] - 12), midi(chord[0] - 12), beat * 1.8, 0.08, at);
      this.tone('square', midi(chord[(s % 3) + 0]), midi(chord[(s % 3) + 0]), beat * 0.4, 0.012, at);
      if (s % 4 === 0) this.hiss(0.05, 0.05, 6000, 1, at, 'highpass');
      this.nextNote += beat;
      this.step++;
    }
  }
}

export const sound = new SoundBox();
