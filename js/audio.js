// WebAudio シンセ：効果音とBGMをすべてプログラムで生成（音源ファイル0）
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.55;
    this.sfxVol = 0.8;
    this.muted = false;
    this.intensity = 0;
    this.playing = false;
    this.step = 0;
    this.slideNode = null;
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVol * 0.5;
    this.music.connect(this.master);
    // ノイズバッファ
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.music.gain.value = music * 0.5;
    this.sfx.gain.value = sfx;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  tone({ type = 'square', f = 440, f2 = null, dur = 0.15, vol = 0.2, at = 0, a = 0.005, out = null, detune = 0, lp = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (lp) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = lp;
      o.connect(fl); node = fl;
    }
    node.connect(g);
    g.connect(out || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.2, type = 'bandpass', f = 1000, f2 = null, q = 1, at = 0, out = null, a = 0.003 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(out || this.sfx);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  // ---------- 効果音 ----------
  coin(chain) {
    const n = 81 + SCALE[chain % SCALE.length] + Math.floor(chain / SCALE.length) * 0;
    this.tone({ type: 'square', f: mtof(n), dur: 0.07, vol: 0.09, lp: 6000 });
    this.tone({ type: 'square', f: mtof(n + 7), dur: 0.16, vol: 0.08, at: 0.05, lp: 6000 });
    this.tone({ type: 'sine', f: mtof(n + 12), dur: 0.2, vol: 0.06, at: 0.05 });
  }
  gem() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone({ type: 'triangle', f: mtof(84 + s), dur: 0.3, vol: 0.12, at: i * 0.04 }));
    this.noise({ type: 'highpass', f: 6000, dur: 0.5, vol: 0.06 });
  }
  clock() {
    [0, 7, 12, 19].forEach((s, i) => this.tone({ type: 'sine', f: mtof(88 + s), dur: 0.25, vol: 0.12, at: i * 0.05 }));
    this.tone({ type: 'square', f: 2400, dur: 0.03, vol: 0.06, at: 0.0 });
    this.tone({ type: 'square', f: 2400, dur: 0.03, vol: 0.06, at: 0.12 });
  }
  star() {
    [0, 4, 7, 11, 14, 19, 23, 26].forEach((s, i) => this.tone({ type: 'square', f: mtof(76 + s), dur: 0.18, vol: 0.07, at: i * 0.035, lp: 5000 }));
  }
  jump() {
    this.tone({ type: 'square', f: 260, f2: 720, dur: 0.14, vol: 0.07, lp: 2500 });
    this.noise({ type: 'bandpass', f: 1200, f2: 3500, dur: 0.18, vol: 0.06, q: 0.8 });
  }
  flip() {
    this.noise({ type: 'bandpass', f: 600, f2: 3000, dur: 0.3, vol: 0.12, q: 1.2 });
    this.tone({ type: 'sawtooth', f: 300, f2: 900, dur: 0.25, vol: 0.05, lp: 1800 });
  }
  slide() {
    this.noise({ type: 'lowpass', f: 2500, f2: 500, dur: 0.35, vol: 0.12 });
  }
  land() {
    this.tone({ type: 'sine', f: 140, f2: 50, dur: 0.12, vol: 0.18 });
    this.noise({ type: 'lowpass', f: 900, dur: 0.08, vol: 0.06 });
  }
  lane() {
    this.noise({ type: 'bandpass', f: 2000, f2: 900, dur: 0.1, vol: 0.05, q: 1.5 });
  }
  perfect(level = 0) {
    const base = 72 + Math.min(level, 6) * 2;
    [0, 4, 7, 12].forEach((s, i) => {
      this.tone({ type: 'sawtooth', f: mtof(base + s), dur: 0.35, vol: 0.06, at: i * 0.025, lp: 4000, detune: -8 });
      this.tone({ type: 'sawtooth', f: mtof(base + s), dur: 0.35, vol: 0.06, at: i * 0.025, lp: 4000, detune: 8 });
    });
    this.noise({ type: 'highpass', f: 7000, dur: 0.4, vol: 0.07 });
  }
  good() {
    this.tone({ type: 'triangle', f: mtof(79), dur: 0.12, vol: 0.12 });
    this.tone({ type: 'triangle', f: mtof(84), dur: 0.18, vol: 0.1, at: 0.06 });
  }
  trick(n) {
    [0, 5, 9, 12, 17].slice(0, 2 + Math.min(3, n)).forEach((s, i) => this.tone({ type: 'square', f: mtof(76 + s + n * 2), dur: 0.2, vol: 0.07, at: i * 0.05, lp: 4500 }));
  }
  boost() {
    this.tone({ type: 'sawtooth', f: 150, f2: 1200, dur: 0.5, vol: 0.09, lp: 3000 });
    this.noise({ type: 'bandpass', f: 500, f2: 5000, dur: 0.5, vol: 0.1, q: 0.7 });
  }
  hit() {
    this.tone({ type: 'sawtooth', f: 220, f2: 40, dur: 0.4, vol: 0.18, lp: 1200 });
    this.noise({ type: 'lowpass', f: 1500, f2: 200, dur: 0.35, vol: 0.25 });
  }
  smash() {
    this.noise({ type: 'lowpass', f: 5000, f2: 300, dur: 0.45, vol: 0.3 });
    this.tone({ type: 'square', f: 180, f2: 50, dur: 0.25, vol: 0.12, lp: 1500 });
    this.tone({ type: 'triangle', f: mtof(96), dur: 0.15, vol: 0.06, at: 0.02 });
  }
  comboBreak() {
    this.tone({ type: 'triangle', f: mtof(67), f2: mtof(55), dur: 0.5, vol: 0.12 });
  }
  milestone(level) {
    const base = 67 + (level % 5) * 2;
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => {
      this.tone({ type: 'square', f: mtof(base + s), dur: 0.22, vol: 0.06, at: i * 0.05, lp: 5000 });
      this.tone({ type: 'sawtooth', f: mtof(base + s - 12), dur: 0.22, vol: 0.04, at: i * 0.05, lp: 2500 });
    });
    this.noise({ type: 'highpass', f: 5000, dur: 0.8, vol: 0.08, at: 0.3 });
  }
  fever() {
    for (let i = 0; i < 4; i++) this.tone({ type: 'sawtooth', f: 400, f2: 1600, dur: 0.18, vol: 0.06, at: i * 0.12, lp: 4000 });
    [0, 4, 7, 11, 14].forEach((s) => {
      this.tone({ type: 'sawtooth', f: mtof(64 + s), dur: 1.0, vol: 0.05, at: 0.5, detune: -10, lp: 3500 });
      this.tone({ type: 'sawtooth', f: mtof(64 + s), dur: 1.0, vol: 0.05, at: 0.5, detune: 10, lp: 3500 });
    });
  }
  beep(final = false) {
    this.tone({ type: 'square', f: final ? 1320 : 660, dur: final ? 0.5 : 0.15, vol: 0.12, lp: 5000 });
  }
  checkpoint() {
    [0, 7, 12, 16].forEach((s, i) => this.tone({ type: 'triangle', f: mtof(79 + s), dur: 0.25, vol: 0.12, at: i * 0.06 }));
  }
  finish() {
    const seq = [0, 4, 7, 12, 7, 12, 16, 19, 24];
    seq.forEach((s, i) => {
      this.tone({ type: 'square', f: mtof(67 + s), dur: 0.25, vol: 0.07, at: i * 0.09, lp: 5000 });
      this.tone({ type: 'sawtooth', f: mtof(55 + s), dur: 0.25, vol: 0.04, at: i * 0.09, lp: 2000 });
    });
    this.noise({ type: 'highpass', f: 4000, dur: 1.5, vol: 0.1, at: 0.8 });
  }
  uiTap() { this.tone({ type: 'triangle', f: 880, f2: 1320, dur: 0.08, vol: 0.08 }); }

  chuteLoop(on) {
    if (!this.ctx) return;
    if (on && !this.slideNode) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 3200; fl.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.09, this.now + 0.08);
      src.connect(fl); fl.connect(g); g.connect(this.sfx);
      src.start();
      this.slideNode = { src, g };
    } else if (!on && this.slideNode) {
      const { src, g } = this.slideNode;
      g.gain.cancelScheduledValues(this.now);
      g.gain.setValueAtTime(g.gain.value, this.now);
      g.gain.exponentialRampToValueAtTime(0.0001, this.now + 0.12);
      src.stop(this.now + 0.15);
      this.slideNode = null;
    }
  }

  // ---------- BGM（150BPM / Am-F-C-G） ----------
  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextT = this.now + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    this.playing = false;
    clearInterval(this.timer);
    this.chuteLoop(false);
  }
  schedule() {
    if (!this.playing) return;
    const spb = 60 / 150 / 4; // 16分
    while (this.nextT < this.now + 0.12) {
      this.playStep(this.step, this.nextT - this.now);
      this.nextT += spb;
      this.step++;
    }
  }
  playStep(st, at) {
    const out = this.music;
    const I = this.intensity;
    const s16 = st % 16, bar = Math.floor(st / 16) % 4;
    const roots = [57, 53, 48, 55]; // A F C G
    const chords = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const root = roots[bar];
    // キック
    if (s16 % 4 === 0) this.tone({ type: 'sine', f: 150, f2: 45, dur: 0.16, vol: 0.5, at, out });
    if (I >= 3 && s16 % 4 === 2) this.tone({ type: 'sine', f: 120, f2: 45, dur: 0.1, vol: 0.25, at, out });
    // スネア/クラップ
    if (s16 === 4 || s16 === 12) {
      this.noise({ type: 'bandpass', f: 1800, dur: 0.14, vol: 0.32, q: 0.9, at, out });
      this.tone({ type: 'triangle', f: 190, f2: 120, dur: 0.08, vol: 0.15, at, out });
    }
    if (I >= 2 && (s16 === 15 || s16 === 14) && bar === 3) this.noise({ type: 'bandpass', f: 2200, dur: 0.08, vol: 0.2, q: 1, at, out });
    // ハイハット
    if (s16 % 4 === 2 || (I >= 2 && s16 % 2 === 1)) this.noise({ type: 'highpass', f: 8000, dur: 0.04, vol: s16 % 4 === 2 ? 0.12 : 0.06, at, out });
    // ベース
    if (s16 % 2 === 0) {
      const oct = s16 % 4 === 2 ? 12 : 0;
      this.tone({ type: 'sawtooth', f: mtof(root - 24 + oct), dur: 0.11, vol: 0.16, at, out, lp: 700 + I * 250 });
    }
    // アルペジオ
    if (I >= 1) {
      const ch = chords[bar];
      const pat = [0, 1, 2, 1, 0, 2, 1, 2];
      const n = root + 12 + ch[pat[s16 % 8]] + (s16 >= 8 && I >= 2 ? 12 : 0);
      this.tone({ type: 'square', f: mtof(n), dur: 0.09, vol: 0.045, at, out, lp: 3000 + I * 800 });
    }
    // フィーバー：シンセスタブ
    if (I >= 3 && (s16 === 2 || s16 === 6 || s16 === 10 || s16 === 14)) {
      for (const c of chords[bar]) {
        this.tone({ type: 'sawtooth', f: mtof(root + 12 + c), dur: 0.12, vol: 0.03, at, out, detune: -12, lp: 4000 });
        this.tone({ type: 'sawtooth', f: mtof(root + 12 + c), dur: 0.12, vol: 0.03, at, out, detune: 12, lp: 4000 });
      }
    }
    // パッド（各小節頭）
    if (s16 === 0) {
      for (const c of chords[bar]) this.tone({ type: 'triangle', f: mtof(root + c), dur: 1.5, vol: 0.05, at, out, a: 0.2 });
    }
  }
}
