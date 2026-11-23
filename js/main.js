// 天空パルクール SKY STAIRS RUSH — メイン
import * as THREE from '../lib/three.module.min.js';
import { Course, laneU, PHYS } from './course.js';
import { World } from './world.js';
import { RunnerModel } from './player.js';
import { FX, SpeedLines } from './fx.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { HUD, TIERS, tierOf } from './hud.js';
import { makeTextures } from './textures.js';
import { clamp, damp, fmtTime, fmtNum, hashStr, todayKey, store, hsv, isTouchDevice } from './util.js';

const BODY_H = 1.7, SLIDE_H = 0.8, SLIDE_T = 0.6, FLIP_T = 0.42;
const COMBO_WINDOW = 2.2, FEVER_DUR = 7;
const MILESTONES = [
  [10, 'NICE!', '10 COMBO'], [25, 'GREAT!!', '25 COMBO'], [50, 'AMAZING!!!', '50 COMBO'],
  [75, 'えぐい!!!!', '75 COMBO'], [100, '神!!!!!', '100 COMBO'], [150, '人間やめてる!?', '150 COMBO'],
  [200, '∞ GOD MODE ∞', '200 COMBO'], [300, '伝説になった', '300 COMBO'],
];
const TRICK_NAMES = ['FLIP!', 'DOUBLE FLIP!!', 'TRIPLE FLIP!!!', 'QUAD FLIP!!!!', 'GOD FLIP!!!!!'];
const PRAISE = ['いいね!', 'うまい!', 'キレてる!', 'やばっ!', 'えぐ!', '天才!?', 'ナイス!'];

const COURSES = {
  main: { name: '天門ルート', sub: '本コース', seed: 20261123, length: 1600 },
  daily: { name: 'デイリー', sub: '今日だけのコース', seed: hashStr('daily-' + todayKey()), length: 1400, daily: true },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _f = {};
const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.settings = Object.assign({ cam: 'third', fx: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 2, music: 0.55, sfx: 0.8, ghost: true }, store.get('skyrush.settings', {}));
    this.touch = isTouchDevice();
    const canvas = $('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.touch ? 1.6 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 2000);
    this.scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x5a6a4a, 1.25));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.7);
    sun.position.set(-40, 80, 30);
    this.scene.add(sun);

    this.T = makeTextures();
    this.sound = new Sound();
    this.sound.setVolumes(this.settings.music, this.settings.sfx);
    this.hud = new HUD();
    this.hud.fxLevel = this.settings.fx;
    this.fx = new FX(this.scene, this.T, this.settings.fx);
    this.lines = new SpeedLines($('fx2d'));

    this.runner = new RunnerModel();
    this.scene.add(this.runner.root);
    this.ghostModel = new RunnerModel({ ghost: true });
    this.ghostModel.root.visible = false;
    this.scene.add(this.ghostModel.root);
    // 足元の影
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    this.shadow = sh;
    this.scene.add(sh);

    this.state = 'title';
    this.trauma = 0;
    this.fovKick = 0;
    this.timeScale = 1;
    this.hitStop = 0;
    this.titleT = 0;
    this.camU = 0; this.camH = 3;

    this.input = new Input($('app'), {
      left: () => this.act('left'), right: () => this.act('right'),
      jump: () => this.act('jump'), slide: () => this.act('slide'),
      pause: () => this.togglePause(), camera: () => this.toggleCam(),
      restart: () => { if (this.state === 'result' || this.state === 'paused') this.startRun(); },
      enter: () => { if (this.state === 'title') this.startRun(); else if (this.state === 'result') this.startRun(); },
    });

    this.bindUI();
    this.loadCourse('main');
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'racing') this.togglePause(true); });
    this.last = performance.now();
    this.perf = { acc: 0, n: 0, slow: 0 };
    this.showScreen('title');
    $('loading').classList.add('hidden');
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- コース ----------
  loadCourse(key) {
    if (this.world) {
      this.scene.remove(this.world.root);
      this.world.root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    }
    this.courseKey = key;
    const def = COURSES[key];
    this.course = new Course(def.seed, def.length);
    this.world = new World(this.scene, this.course, this.T);
    this.recKey = def.daily ? `skyrush.rec.daily.${todayKey()}` : `skyrush.rec.${key}`;
    this.record = store.get(this.recKey, null);
    this.resetRun();
    this.updateTitleRecords();
  }

  resetRun() {
    const c = this.course;
    for (const o of c.obstacles) {
      o.hit = false; o.eng = null; o.cleared = false; o.smashed = false; o.near = false;
      if (o.mesh) o.mesh.visible = true;
    }
    for (const z of c.zones) z.used = false;
    // アイテムは元の位置へ
    if (!this.itemOrig) this.itemOrig = new Map();
    for (const it of c.items) {
      const o = this.itemOrig.get(it);
      if (o) { it.s = o.s; it.u = o.u; it.h = o.h; } else this.itemOrig.set(it, { s: it.s, u: it.u, h: it.h });
      it.collected = false; it._hidden = false; it.magnet = false;
    }
    this.p = {
      s: -5, u: 0, lane: 1, prevLane: 1, y: 0, vy: 0, grounded: true, speed: 0,
      sliding: false, slideT: 0, tJump: 9, tSlide: 9, tLane: 9, flipT: -1, flipsDone: 0, flipsThisAir: 0, flipsAllowed: 1,
      rampAir: false, stumble: 0, invuln: 0, onChute: false, supportType: null, boost: 0, laneVel: 0, slideQueued: false,
    };
    this.time = 0;
    this.runT = 0;
    this.score = 0; this.coins = 0; this.combo = 0; this.maxCombo = 0; this.comboTimer = 0; this.comboWindow = COMBO_WINDOW;
    this.feverGauge = 0; this.fever = false; this.feverTime = 0; this.feverDur = FEVER_DUR;
    this.coinChain = 0; this.coinChainT = 0; this.coinPop = 0; this.coinPopT = 0;
    this.stats = { perfect: 0, good: 0, tricks: 0, hits: 0, smash: 0, gems: 0, clocks: 0, near: 0 };
    this.jumpBuffer = 0;
    this.obIdx = 0; this.itIdx = 0; this.zIdx = 0;
    this.cpDone = 0;
    this.splits = [];
    this.chuteTick = 0;
    this.ghostRec = [];
    this.ghostAcc = 0;
    this.ghostS = null;
    this.ghostData = this.settings.ghost && this.record && this.record.ghost ? this.record.ghost : null;
    this.ghostModel.root.visible = false;
    this.milestoneIdx = 0;
    this.fx.clearTrail();
    this.timeScale = 1; this.hitStop = 0; this.trauma = 0; this.fovKick = 0;
    this.camU = 0; this.camH = 3;
    this.sound.intensity = 0;
    this.lastPraise = 0;
    this.finishT = 0;
  }

  // ---------- UI ----------
  bindUI() {
    const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); this.sound.init(); this.sound.uiTap(); fn(); });
    tap('btnStart', () => { if (this.courseKey !== 'main') this.loadCourse('main'); this.startRun(); });
    tap('btnDaily', () => { if (this.courseKey !== 'daily') this.loadCourse('daily'); this.startRun(); });
    tap('btnHow', () => this.showScreen('howto'));
    tap('btnHowBack', () => this.showScreen('title'));
    tap('btnSettings', () => { this.syncSettingsUI(); this.showScreen('settings'); });
    tap('btnSetBack', () => this.showScreen(this.settingsFrom || 'title'));
    tap('pauseBtn', () => this.togglePause());
    tap('btnResume', () => this.togglePause(false));
    tap('btnRetryP', () => this.startRun());
    tap('btnTitleP', () => this.toTitle());
    tap('btnSetP', () => { this.settingsFrom = 'pause'; this.syncSettingsUI(); this.showScreen('settings'); });
    tap('btnRetry', () => this.startRun());
    tap('btnTitle', () => this.toTitle());
    tap('btnShare', () => this.share());
    tap('btnMute', () => { this.sound.setMuted(!this.sound.muted); $('btnMute').textContent = this.sound.muted ? '🔇' : '🔊'; });

    const seg = (name, val, fn) => {
      document.querySelectorAll(`[data-set="${name}"] button`).forEach((b) => {
        b.addEventListener('click', () => { this.sound.init(); this.sound.uiTap(); fn(b.dataset.v); this.syncSettingsUI(); this.saveSettings(); });
      });
    };
    seg('cam', null, (v) => (this.settings.cam = v));
    seg('fx', null, (v) => { this.settings.fx = +v; this.fx.level = +v; this.hud.fxLevel = +v; });
    seg('ghost', null, (v) => (this.settings.ghost = v === '1'));
    $('volMusic').addEventListener('input', (e) => { this.settings.music = +e.target.value; this.sound.setVolumes(this.settings.music, this.settings.sfx); this.saveSettings(); });
    $('volSfx').addEventListener('input', (e) => { this.settings.sfx = +e.target.value; this.sound.setVolumes(this.settings.music, this.settings.sfx); this.saveSettings(); this.sound.init(); this.sound.coin(3); });
    $('howKeys').classList.toggle('hidden', this.touch);
    $('howTouch').classList.toggle('hidden', !this.touch);
  }

  syncSettingsUI() {
    const s = this.settings;
    const mark = (name, v) => document.querySelectorAll(`[data-set="${name}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
    mark('cam', s.cam); mark('fx', s.fx); mark('ghost', s.ghost ? '1' : '0');
    $('volMusic').value = s.music; $('volSfx').value = s.sfx;
  }

  saveSettings() { store.set('skyrush.settings', this.settings); }

  showScreen(name) {
    for (const id of ['title', 'howto', 'settings', 'pause', 'result']) $(id).classList.toggle('hidden', id !== name);
    if (name !== 'settings') this.settingsFrom = name === 'pause' ? 'pause' : 'title';
  }
  hideScreens() { for (const id of ['title', 'howto', 'settings', 'pause', 'result']) $(id).classList.add('hidden'); }

  updateTitleRecords() {
    const r1 = store.get('skyrush.rec.main', null);
    const r2 = store.get(`skyrush.rec.daily.${todayKey()}`, null);
    $('bestMain').textContent = r1 ? `BEST ${fmtTime(r1.bestTime)} / ${fmtNum(r1.bestTotal)}pt` : 'まだ記録なし';
    $('bestDaily').textContent = r2 ? `BEST ${fmtTime(r2.bestTime)} / ${fmtNum(r2.bestTotal)}pt` : `${todayKey().slice(4, 6)}/${todayKey().slice(6)} のコース`;
  }

  toTitle() {
    this.sound.stopMusic();
    if (this.sound.ctx && this.sound.ctx.state === 'suspended') this.sound.resume();
    this.state = 'title';
    this.hud.show(false);
    this.resetRun();
    this.updateTitleRecords();
    this.showScreen('title');
  }

  toggleCam() {
    this.settings.cam = this.settings.cam === 'third' ? 'pov' : 'third';
    this.saveSettings();
    this.hud.pop(this.settings.cam === 'pov' ? '一人称視点' : '三人称視点', innerWidth / 2, innerHeight * 0.3, 'pop-info');
  }

  togglePause(force) {
    if (this.state === 'racing' && force !== false) {
      this.state = 'paused';
      this.showScreen('pause');
      if (this.sound.ctx) this.sound.ctx.suspend();
    } else if (this.state === 'paused' && force !== true) {
      this.hideScreens();
      this.state = 'racing';
      this.last = performance.now();
      this.sound.resume();
    }
  }

  // ---------- レース開始 ----------
  startRun() {
    this.sound.init();
    this.sound.resume();
    this.sound.stopMusic();
    this.resetRun();
    this.hideScreens();
    this.hud.show(true);
    this.hud.shown = 0;
    this.state = 'countdown';
    this.countT = 3.2;
    this.countShown = 4;
    $('cpMarks').innerHTML = this.course.checkpoints.map((c) => `<span class="cp" style="left:${(c / this.course.finishS) * 100}%"></span>`).join('');
  }

  act(a) {
    if (this.state !== 'racing') {
      if (a === 'jump' && this.state === 'title') return;
      return;
    }
    const p = this.p;
    if (a === 'left' || a === 'right') {
      const nl = clamp(p.lane + (a === 'left' ? -1 : 1), 0, 2);
      if (nl !== p.lane) { p.prevLane = p.lane; p.lane = nl; p.tLane = 0; this.sound.lane(); }
    } else if (a === 'jump') {
      if (p.grounded) this.doJump();
      else if ((p.flipT < 0 || p.flipT > 0.8) && p.flipsThisAir < p.flipsAllowed) this.startFlip();
      else this.jumpBuffer = 0.15;
    } else if (a === 'slide') {
      if (!p.grounded) { p.vy = Math.min(p.vy, -26); p.slideQueued = true; }
      else this.startSlide();
    }
  }

  doJump() {
    const p = this.p;
    p.grounded = false; p.vy = PHYS.JUMP_V; p.tJump = 0; p.sliding = false;
    p.flipsThisAir = 0; p.flipsAllowed = 1; p.rampAir = false; p.flipsDone = 0;
    this.sound.jump();
    this.worldPos(p.s, p.u, p.y + 0.1, _v);
    this.fx.burst(_v, 6, { colors: [0xffffff, 0xd0e4ff], speed: 3, life: 0.35, size: 0.3, drag: 4 });
  }

  startFlip() {
    const p = this.p;
    p.flipT = 0; p.flipsThisAir++;
    if (!p.rampAir) p.vy = Math.max(p.vy, 7.5);
    this.sound.flip();
    this.worldPos(p.s, p.u, p.y + 0.9, _v);
    this.fx.ring(_v, 0xffffff, { grow: 3, life: 0.3 });
  }

  startSlide() {
    const p = this.p;
    if (p.onChute) return;
    p.sliding = true; p.slideT = SLIDE_T; p.tSlide = 0;
    this.sound.slide();
    this.worldPos(p.s, p.u, 0.1, _v);
    this.fx.burst(_v, 12, { colors: [0xcfcfcf, 0xffffff], speed: 4, life: 0.5, size: 0.45, drag: 3, up: 1 });
  }

  worldPos(s, u, h, out) { return this.course.toWorld(s, u, h, out); }

  screenPos(s, u, h) {
    this.course.toWorld(s, u, h, _v3);
    _v3.project(this.camera);
    return [(_v3.x * 0.5 + 0.5) * innerWidth, (-_v3.y * 0.5 + 0.5) * innerHeight];
  }

  popAtPlayer(text, cls, scale = 1, dh = 2.3) {
    const p = this.p;
    const [x, y] = this.screenPos(p.s, p.u, p.y + dh);
    this.hud.pop(text, clamp(x, 80, innerWidth - 80), clamp(y, 120, innerHeight - 140), cls, scale);
  }

  // ---------- スコア・コンボ ----------
  mult() { return Math.min(5, 1 + Math.floor(this.combo / 10) * 0.5); }

  addPoints(base) {
    const pts = Math.round(base * this.mult() * (this.fever ? 2 : 1));
    this.score += pts;
    return pts;
  }

  addCombo(n = 1) {
    const before = this.combo;
    this.combo += n;
    this.comboTimer = COMBO_WINDOW;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    while (this.milestoneIdx < MILESTONES.length && this.combo >= MILESTONES[this.milestoneIdx][0]) {
      if (before < MILESTONES[this.milestoneIdx][0]) this.milestone(this.milestoneIdx);
      this.milestoneIdx++;
    }
    this.updateIntensity();
  }

  updateIntensity() {
    this.sound.intensity = this.fever ? 3 : this.combo >= 40 ? 2 : this.combo >= 10 ? 1 : 0;
  }

  addFever(x) {
    if (this.fever) return;
    this.feverGauge = Math.min(100, this.feverGauge + x);
    if (this.feverGauge >= 100) this.startFever();
  }

  breakCombo(reason) {
    if (this.combo >= 5) {
      this.hud.banner('COMBO BREAK…', `${this.combo} COMBO 消滅`, 'bad');
      this.sound.comboBreak();
    }
    this.combo = 0; this.comboTimer = 0; this.milestoneIdx = 0;
    this.updateIntensity();
  }

  comboFinish() {
    const c = this.combo;
    if (c >= 8) {
      const bonus = this.addPoints((c * 60) / this.mult());
      this.hud.banner(`${c} COMBO FINISH!`, `+${fmtNum(bonus)}`, 'finish');
      this.sound.good();
    }
    this.combo = 0; this.comboTimer = 0; this.milestoneIdx = 0;
    this.updateIntensity();
  }

  milestone(i) {
    const [n, text, sub] = MILESTONES[i];
    this.hud.banner(text, sub, `ms ms${Math.min(i, 5)}`);
    const col = TIERS[Math.min(TIERS.length - 1, tierOf(n))];
    this.hud.flash(col.color === 'rainbow' ? '#ffffff' : col.color, 0.45);
    this.hud.shakeDom('shake-big');
    this.sound.milestone(i);
    const p = this.p;
    this.worldPos(p.s + 2, p.u, p.y + 1.5, _v);
    this.fx.confetti(_v, 90, this.playerVel());
    this.fx.ring(_v, col.hex > 0 ? col.hex : 0xffffff, { grow: 5, life: 0.6 });
    this.trauma = Math.min(1, this.trauma + 0.35);
    this.hitStop = Math.max(this.hitStop, 0.07);
    this.fovKick += 8;
    this.addFever(12);
    this.vibrate([20, 30, 40]);
  }

  startFever() {
    this.fever = true;
    this.feverTime = FEVER_DUR;
    this.feverGauge = 0;
    this.hud.banner('FEVER!!', '無敵 / スコア2倍 / 障害物ぶっ壊せ!', 'fever');
    this.hud.flash('#ff00ea', 0.55);
    this.sound.fever();
    this.updateIntensity();
    this.fovKick += 14;
    this.trauma = Math.min(1, this.trauma + 0.4);
    const p = this.p;
    this.worldPos(p.s + 3, p.u, p.y + 1, _v);
    this.fx.confetti(_v, 140, this.playerVel());
    this.fx.burst(_v, 80, { rainbow: true, speed: 14, life: 0.8, size: 0.6, inherit: this.playerVel() });
    this.vibrate([40, 40, 80]);
  }

  endFever() {
    this.fever = false;
    this.hud.pop('FEVER END', innerWidth / 2, innerHeight * 0.32, 'pop-info');
    this.updateIntensity();
  }

  vibrate(p) {
    if (this.settings.fx >= 2 && navigator.vibrate) try { navigator.vibrate(p); } catch (e) { /* noop */ }
  }

  playerVel() {
    const f = this.course.frame(this.p.s, _f);
    return new THREE.Vector3(f.fx * this.p.speed, 0, f.fz * this.p.speed);
  }

  // ---------- 物理 ----------
  supportAt(s, u, y) {
    let h = 0, type = null;
    const obs = this.course.obstacles;
    for (let i = this.obIdx; i < obs.length; i++) {
      const o = obs[i];
      if (o.s0 > s + 0.01) break;
      if (!o.platform || o.smashed || o.s1 < s) continue;
      if (u < o.u0 - 0.15 || u > o.u1 + 0.15) continue;
      let top;
      if (o.type === 'ramp') {
        top = o.h1 * clamp((s - o.s0) / (o.s1 - o.s0), 0, 1);
        if (top > y + 0.6) continue;
      } else {
        top = o.h1;
        if (top > y + 0.36) continue;
      }
      if (top > h) { h = top; type = o.type; }
    }
    return { h, type };
  }

  step(dt) {
    const p = this.p, c = this.course;
    this.time += dt;
    this.runT += dt;
    p.tJump += dt; p.tSlide += dt; p.tLane += dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.stumble > 0) p.stumble -= dt;
    if (p.sliding) { p.slideT -= dt; if (p.slideT <= 0) p.sliding = false; }
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;

    // 速度
    const cruise = c.cruiseAt(Math.max(0, p.s)) * (this.fever ? 1.22 : 1);
    let target = cruise;
    if (p.onChute) target = Math.max(cruise + 8, 30);
    if (p.boost > 0) { p.boost -= dt; target = Math.max(target, cruise + 10); }
    if (p.speed < target) p.speed = Math.min(target, p.speed + (p.stumble > 0 ? 7 : 24) * dt);
    else p.speed = Math.max(target, p.speed - 5 * dt);

    const prevS = p.s;
    p.s += p.speed * dt;
    const prevU = p.u;
    p.u = damp(p.u, laneU(p.lane), 16, dt);
    p.laneVel = (p.u - prevU) / Math.max(dt, 1e-4);

    // 縦
    const sup = this.supportAt(p.s, p.u, p.y);
    if (p.grounded) {
      if (sup.h < p.y - 0.08) {
        p.grounded = false;
        if (p.supportType === 'ramp') this.launchRamp();
        else p.vy = 0;
      } else p.y = sup.h;
    } else {
      p.vy -= PHYS.G * dt;
      p.y += p.vy * dt;
      if (p.flipT >= 0) {
        p.flipT += dt / FLIP_T;
        if (p.flipT >= 1) { p.flipT = -1; p.flipsDone++; }
      }
      if (p.y <= sup.h && p.vy <= 0) this.land(sup);
    }
    p.supportType = p.grounded ? sup.type : null;

    this.checkObstacles(prevS);
    this.checkZones(dt);
    this.checkItems(dt);
    this.checkProgress(prevS);
  }

  launchRamp() {
    const p = this.p;
    p.vy = PHYS.RAMP_V; p.rampAir = true; p.flipsAllowed = 99; p.flipsThisAir = 0; p.flipsDone = 0; p.tJump = 0;
    this.sound.boost();
    this.fovKick += 10;
    this.popAtPlayer('ジャンプ台!! 連打で宙返り!', 'pop-trick', 1.1);
    this.worldPos(p.s, p.u, p.y, _v);
    this.fx.burst(_v, 40, { colors: [0xffe600, 0xff8a00, 0xffffff], speed: 10, life: 0.6, size: 0.5, inherit: this.playerVel() });
    this.addCombo(1);
    this.addPoints(150);
  }

  land(sup) {
    const p = this.p;
    const impact = -p.vy;
    p.y = sup.h; p.vy = 0; p.grounded = true;
    let crashed = false;
    if (p.flipT >= 0) {
      if (p.flipT < 0.7) crashed = true;
      else p.flipsDone++;
      p.flipT = -1;
    }
    if (crashed) {
      this.stumble('着地失敗…');
      p.flipsDone = 0;
    } else if (p.flipsDone > 0) {
      this.awardTrick(p.flipsDone, p.rampAir);
    }
    p.flipsDone = 0; p.rampAir = false; p.flipsThisAir = 0;
    this.worldPos(p.s, p.u, p.y + 0.05, _v);
    if (impact > 6) {
      this.fx.burst(_v, impact > 15 ? 26 : 10, { colors: [0xe8e8e8, 0xffffff], speed: impact > 15 ? 7 : 4, life: 0.5, size: 0.5, drag: 4, up: 1 });
      if (impact > 15) { this.fx.ring(_v, 0xffffff, { grow: 4, life: 0.35, face: 'flat' }); this.trauma = Math.min(1, this.trauma + 0.15); }
      this.sound.land();
    }
    if (this.jumpBuffer > 0 && !crashed) { this.jumpBuffer = 0; this.doJump(); return; }
    if (p.slideQueued) { p.slideQueued = false; this.startSlide(); }
  }

  awardTrick(n, ramp) {
    const pts = this.addPoints(350 * n * n + (ramp ? 200 : 0));
    this.stats.tricks += n;
    this.addCombo(n);
    this.addFever(6 * n);
    this.sound.trick(n);
    this.popAtPlayer(`${TRICK_NAMES[Math.min(n, 5) - 1]} +${fmtNum(pts)}`, n >= 2 ? 'pop-perfect big' : 'pop-trick', 1 + n * 0.15);
    const p = this.p;
    this.worldPos(p.s, p.u, p.y + 1, _v);
    this.fx.burst(_v, 20 + n * 15, { rainbow: true, speed: 9, life: 0.7, size: 0.5, inherit: this.playerVel() });
    this.fx.ring(_v, 0xff66ff, { grow: 2.5 + n, life: 0.45 });
    if (n >= 2) { this.hud.flash('#ffffff', 0.3); this.hitStop = Math.max(this.hitStop, 0.06); this.trauma = Math.min(1, this.trauma + 0.2); }
  }

  stumble(text) {
    const p = this.p;
    p.speed *= 0.32; p.invuln = 1.3; p.stumble = 0.9; p.sliding = false; p.flipT = -1;
    this.stats.hits++;
    this.breakCombo();
    this.sound.hit();
    this.trauma = Math.min(1, this.trauma + 0.7);
    this.hud.flash('#ff0033', 0.45);
    this.hud.shakeDom('shake-big');
    this.popAtPlayer(text, 'pop-bad', 1.2);
    this.worldPos(p.s + 0.5, p.u, p.y + 0.9, _v);
    this.fx.burst(_v, 30, { colors: [0xff2244, 0xffffff, 0xffaa00], speed: 8, life: 0.5, size: 0.4 });
    this.vibrate(90);
  }

  checkObstacles(prevS) {
    const p = this.p, obs = this.course.obstacles;
    while (this.obIdx < obs.length && obs[this.obIdx].s1 < p.s - 12) this.obIdx++;
    for (let i = this.obIdx; i < obs.length; i++) {
      const o = obs[i];
      if (o.s0 > p.s + 1) break;
      if (o.smashed) continue;
      const lat = p.u + 0.3 > o.u0 && p.u - 0.3 < o.u1;
      if (prevS < o.s0 && p.s >= o.s0) {
        if (lat && !o.eng) o.eng = { air: !p.grounded, tj: p.tJump, ts: p.tSlide, sliding: p.sliding || p.onChute };
        else if (!lat && !o.near && o.type !== 'ramp' && p.tLane < 0.4 && p.prevLane >= o.laneA && p.prevLane <= o.laneB) {
          o.near = true;
          this.nearMiss();
        }
      }
      if (o.solid && lat && p.s + 0.3 > o.s0 && p.s - 0.3 < o.s1) {
        const top = p.y + (p.sliding || p.onChute ? SLIDE_H : BODY_H);
        if (p.y < o.h1 - 0.02 && top > o.h0) {
          if (o.platform && !o.hit && p.y >= o.h1 - 0.4) {
            if (!p.grounded) this.land({ h: o.h1, type: o.type });
            p.y = o.h1;
          } else if (this.fever) {
            this.smash(o);
          } else if (p.invuln <= 0 && !o.hit) {
            o.hit = true;
            const side = prevS - 0.3 > o.s0 + 0.05;
            if (side) { p.lane = p.prevLane; }
            if (!p.grounded) p.vy = Math.min(p.vy, 0);
            this.stumble(side ? 'ぶつかった!' : 'OUCH!!');
          }
        }
      }
      if (prevS < o.s1 && p.s >= o.s1 && o.eng && !o.hit && !o.cleared && !o.smashed) {
        o.cleared = true;
        this.clearObstacle(o);
      }
    }
  }

  clearObstacle(o) {
    const e = o.eng, p = this.p;
    let perfect = false, label;
    if (o.type === 'ramp') return;
    if (o.type === 'bar') {
      if (e.sliding) { perfect = e.ts <= 0.32; label = perfect ? 'PERFECT SLIDE!' : 'SLIDE!'; }
      else if (e.air) { perfect = e.tj >= 0.1 && e.tj <= 0.3; label = perfect ? 'PERFECT!' : 'OVER!'; }
      else return;
    } else {
      if (!e.air) return;
      perfect = e.tj >= 0.08 && e.tj <= 0.3;
      if (o.type === 'hurdle') label = perfect ? 'PERFECT!' : 'NICE!';
      else label = perfect ? 'PERFECT VAULT!' : 'VAULT!';
    }
    this.worldPos(p.s, p.u, p.y + 1, _v);
    if (perfect) {
      this.stats.perfect++;
      this.addCombo(2);
      const pts = this.addPoints(500);
      this.addFever(9);
      this.sound.perfect(tierOf(this.combo));
      this.popAtPlayer(`${label} +${fmtNum(pts)}`, 'pop-perfect', 1.1);
      this.fx.ring(_v, 0x3ff2ff, { grow: 3.6, life: 0.4 });
      this.fx.ring(_v, 0xff4fd8, { grow: 2.4, life: 0.35 });
      this.fx.burst(_v, 30, { rainbow: true, speed: 9, life: 0.6, size: 0.45, inherit: this.playerVel() });
      this.hitStop = Math.max(this.hitStop, 0.045);
      this.hud.flash('#bff8ff', 0.18);
      this.fovKick += 3;
      this.vibrate(15);
      if (Math.random() < 0.3 && this.time - this.lastPraise > 3) {
        this.lastPraise = this.time;
        this.hud.pop(PRAISE[(Math.random() * PRAISE.length) | 0], innerWidth * (0.2 + Math.random() * 0.6), innerHeight * 0.22, 'pop-praise');
      }
    } else {
      this.stats.good++;
      this.addCombo(1);
      const pts = this.addPoints(200);
      this.addFever(4);
      this.sound.good();
      this.popAtPlayer(`${label} +${fmtNum(pts)}`, 'pop-good');
      this.fx.burst(_v, 12, { colors: [0xffffff, 0x9fdcff], speed: 6, life: 0.45, size: 0.4, inherit: this.playerVel() });
    }
  }

  nearMiss() {
    this.stats.near++;
    const pts = this.addPoints(150);
    this.addCombo(1);
    this.addFever(3);
    this.popAtPlayer(`ギリギリ!! +${fmtNum(pts)}`, 'pop-near', 0.95, 1.8);
    this.sound.good();
  }

  smash(o) {
    o.smashed = true;
    if (o.mesh) o.mesh.visible = false;
    this.stats.smash++;
    const cs = (o.s0 + o.s1) / 2;
    this.worldPos(Math.min(cs, this.p.s + 1), (o.u0 + o.u1) / 2, (o.h0 + o.h1) * 0.5, _v);
    const vel = this.playerVel().multiplyScalar(0.7);
    this.fx.shatter(_v, o.type === 'tallbox' ? 40 : 26, o.type === 'bar' ? [0xffd400, 0x161616, 0xcfd6de] : [0x8b9195, 0x2f6dff, 0xaab0b5, 0x2b2f36], vel, 12);
    this.fx.burst(_v, 40, { rainbow: true, speed: 12, life: 0.6, size: 0.6, inherit: vel });
    this.fx.ring(_v, 0xffffff, { grow: 4, life: 0.35 });
    this.sound.smash();
    this.trauma = Math.min(1, this.trauma + 0.35);
    this.hitStop = Math.max(this.hitStop, 0.04);
    const pts = this.addPoints(300);
    this.addCombo(1);
    this.popAtPlayer(`SMASH!! +${fmtNum(pts)}`, 'pop-smash', 1.15);
    this.vibrate(30);
  }

  checkZones(dt) {
    const p = this.p, zs = this.course.zones;
    const wasChute = p.onChute;
    p.onChute = false;
    while (this.zIdx < zs.length && zs[this.zIdx].s1 < p.s - 5) this.zIdx++;
    for (let i = this.zIdx; i < zs.length; i++) {
      const z = zs[i];
      if (z.s0 > p.s) break;
      if (p.s > z.s1 || p.u < z.u0 || p.u > z.u1) continue;
      if (z.type === 'chute' && p.y < 0.45) {
        p.onChute = true;
        p.sliding = false;
        if (!z.used) {
          z.used = true;
          this.popAtPlayer('スライダー!! 加速!', 'pop-trick');
          this.sound.boost();
          this.fovKick += 6;
          this.addCombo(1);
        }
      } else if (z.type === 'boost' && !z.used && p.y < 0.5) {
        z.used = true;
        p.boost = 1.8;
        p.speed = Math.max(p.speed, this.course.cruiseAt(p.s) + 12);
        this.sound.boost();
        this.fovKick += 12;
        this.trauma = Math.min(1, this.trauma + 0.15);
        const pts = this.addPoints(100);
        this.addCombo(1);
        this.addFever(5);
        this.popAtPlayer(`BOOST!! +${pts}`, 'pop-boost', 1.1);
        this.worldPos(p.s, p.u, 0.3, _v);
        this.fx.burst(_v, 30, { colors: [0x66ffff, 0xffffff, 0x3f8cff], speed: 8, life: 0.5, size: 0.5, inherit: this.playerVel() });
      }
    }
    if (p.onChute) {
      this.chuteTick += dt;
      this.comboTimer = COMBO_WINDOW;
      while (this.chuteTick >= 0.25) {
        this.chuteTick -= 0.25;
        this.addPoints(40);
        this.addCombo(1);
        this.addFever(1);
      }
    } else this.chuteTick = 0;
    if (wasChute !== p.onChute) this.sound.chuteLoop(p.onChute);
  }

  checkItems(dt) {
    const p = this.p, items = this.course.items;
    while (this.itIdx < items.length && (items[this.itIdx].collected || items[this.itIdx].s < p.s - 4)) this.itIdx++;
    const top = p.y + (p.sliding || p.onChute ? SLIDE_H : BODY_H);
    for (let i = this.itIdx; i < items.length; i++) {
      const it = items[i];
      if (it.s > p.s + 12) break;
      if (it.collected) continue;
      if (this.fever && !it.magnet && it.s - p.s < 11 && it.s > p.s - 1) it.magnet = true;
      if (it.magnet) {
        it.u = damp(it.u, p.u, 10, dt);
        it.h = damp(it.h, p.y + 1, 10, dt);
        it.s = damp(it.s, p.s + 0.3, 6, dt);
      }
      if (Math.abs(it.s - p.s) < 1.15 && Math.abs(it.u - p.u) < 0.95 && it.h > p.y - 0.45 && it.h < top + 0.45) this.collect(it);
    }
  }

  collect(it) {
    it.collected = true;
    const p = this.p;
    this.course.toWorld(it.s, it.u, it.h, _v);
    const vel = this.playerVel().multiplyScalar(0.85);
    if (it.type === 'coin') {
      this.coins++;
      this.coinChain = this.coinChainT > 0 ? this.coinChain + 1 : 0;
      this.coinChainT = 0.7;
      const pts = this.addPoints(50);
      this.coinPop += pts; this.coinPopT = this.coinPopT || 0.22;
      this.addCombo(1);
      this.addFever(1.5);
      this.sound.coin(this.coinChain);
      this.fx.burst(_v, 9, { colors: [0xffd84a, 0xffffff, 0xffa600], speed: 5, life: 0.4, size: 0.35, inherit: vel });
    } else if (it.type === 'gem') {
      this.stats.gems++;
      const pts = this.addPoints(1000);
      this.addCombo(3);
      this.addFever(15);
      this.sound.gem();
      this.popAtPlayer(`GEM!! +${fmtNum(pts)}`, 'pop-gem', 1.3);
      this.fx.burst(_v, 60, { rainbow: true, speed: 12, life: 0.8, size: 0.55, inherit: vel });
      this.fx.ring(_v, 0xff66ff, { grow: 4.5, life: 0.5 });
      this.hud.flash('#ffd6ff', 0.3);
      this.hitStop = Math.max(this.hitStop, 0.05);
    } else if (it.type === 'clock') {
      this.stats.clocks++;
      this.time = Math.max(0, this.time - 1);
      this.addPoints(300);
      this.addCombo(1);
      this.sound.clock();
      this.popAtPlayer('TIME -1.00s!!', 'pop-clock', 1.3);
      this.fx.burst(_v, 40, { colors: [0x00e5ff, 0xffffff, 0x7afcff], speed: 9, life: 0.6, size: 0.5, inherit: vel });
      this.fx.ring(_v, 0x00e5ff, { grow: 4, life: 0.45 });
      this.hud.flash('#aaf6ff', 0.25);
    } else if (it.type === 'star') {
      this.addPoints(500);
      this.addCombo(2);
      this.sound.star();
      this.popAtPlayer('FEVER UP!!', 'pop-star', 1.2);
      this.fx.burst(_v, 50, { colors: [0xffe14d, 0xff7a00, 0xffffff], speed: 10, life: 0.7, size: 0.55, inherit: vel });
      this.addFever(45);
    }
  }

  checkProgress(prevS) {
    const p = this.p, c = this.course;
    for (let i = this.cpDone; i < c.checkpoints.length; i++) {
      const cp = c.checkpoints[i];
      if (prevS < cp && p.s >= cp) {
        this.cpDone = i + 1;
        this.splits[i] = this.time;
        const best = this.record && this.record.splits ? this.record.splits[i] : null;
        if (best != null) {
          const d = this.time - best;
          this.hud.setSplit(`CP${i + 1}  ${d < 0 ? '-' : '+'}${Math.abs(d).toFixed(2)}`, d < 0);
        } else this.hud.setSplit(`CP${i + 1}  ${fmtTime(this.time)}`, null);
        this.sound.checkpoint();
        this.hud.banner('CHECKPOINT!', fmtTime(this.time), 'cp');
        for (const u of [-4, 4]) { this.worldPos(cp + 2, u, 7, _v); this.fx.firework(_v); }
        this.addFever(8);
      }
    }
    if (prevS < c.finishS && p.s >= c.finishS) this.finish();
  }

  // ---------- ゴール ----------
  finish() {
    this.state = 'finish';
    this.finishT = 0;
    this.finalTime = this.time;
    if (this.combo >= 8) this.comboFinish();
    this.sound.chuteLoop(false);
    this.sound.finish();
    this.sound.intensity = 1;
    this.hud.banner('GOAL!!', fmtTime(this.finalTime), 'goal');
    this.hud.flash('#ffffff', 0.6);
    this.timeScale = 0.35;
    const p = this.p;
    for (let k = 0; k < 3; k++) { this.worldPos(p.s + 8 + k * 6, (k - 1) * 4, 6 + k * 2, _v); this.fx.firework(_v); }
    this.worldPos(p.s + 2, p.u, p.y + 2, _v);
    this.fx.confetti(_v, 200, this.playerVel());
    this.computeResults();
  }

  computeResults() {
    const L = this.course.L;
    const par = L / 22.5;
    const t = this.finalTime;
    const timeBonus = Math.max(0, Math.round((par * 1.6 - t) * 2000));
    const total = this.score + timeBonus;
    const k = L / 1600;
    const ranks = [['SSS', 480000], ['SS', 400000], ['S', 320000], ['A', 240000], ['B', 160000], ['C', 0]];
    const rank = ranks.find(([, v]) => total >= v * k)[0];
    const rec = this.record || {};
    const newTime = !rec.bestTime || t < rec.bestTime;
    const newTotal = !rec.bestTotal || total > rec.bestTotal;
    const out = {
      bestTime: newTime ? t : rec.bestTime,
      bestTotal: newTotal ? total : rec.bestTotal,
      bestRank: newTotal ? rank : rec.bestRank,
      maxCombo: Math.max(rec.maxCombo || 0, this.maxCombo),
      splits: newTime ? this.splits.slice() : rec.splits,
      ghost: newTime ? this.packGhost() : rec.ghost,
      plays: (rec.plays || 0) + 1,
    };
    store.set(this.recKey, out);
    this.record = out;
    this.result = { t, score: this.score, timeBonus, total, rank, newTime, newTotal, prevTime: rec.bestTime, prevTotal: rec.bestTotal };
  }

  packGhost() {
    // [s,u,y,mode,flip] を 0.1秒ごと
    return { dt: 0.1, d: this.ghostRec.map((f) => f.map((x) => Math.round(x * 100) / 100)) };
  }

  showResults() {
    const r = this.result, st = this.stats;
    this.state = 'result';
    this.hud.show(false);
    this.showScreen('result');
    $('resCourse').textContent = COURSES[this.courseKey].name + (COURSES[this.courseKey].daily ? ` (${todayKey().slice(4, 6)}/${todayKey().slice(6)})` : '');
    const rows = [
      ['TIME', fmtTime(r.t), r.newTime ? 'NEW!' : ''],
      ['SCORE', fmtNum(r.score), ''],
      ['TIME BONUS', '+' + fmtNum(r.timeBonus), ''],
      ['MAX COMBO', this.maxCombo, ''],
      ['COINS', `${this.coins} / ${this.course.counts.coin}`, ''],
      ['PERFECT', st.perfect, ''],
      ['TRICKS', st.tricks, ''],
      ['SMASH', st.smash, ''],
      ['ミス', st.hits, st.hits === 0 ? 'ノーミス!' : ''],
    ];
    const tb = $('resRows');
    tb.innerHTML = '';
    rows.forEach(([k, v, badge], i) => {
      const d = document.createElement('div');
      d.className = 'row';
      d.style.animationDelay = (0.1 + i * 0.08) + 's';
      d.innerHTML = `<span class="k">${k}</span><span class="v">${v}${badge ? ` <em>${badge}</em>` : ''}</span>`;
      tb.appendChild(d);
    });
    const totalEl = $('resTotal');
    totalEl.textContent = '0';
    const t0 = performance.now();
    const dur = 1400;
    const anim = () => {
      const k = Math.min(1, (performance.now() - t0 - 900) / dur);
      if (k > 0) totalEl.textContent = fmtNum(r.total * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(anim);
      else {
        totalEl.textContent = fmtNum(r.total);
        $('resRank').className = 'rank show r-' + r.rank;
        $('resRank').textContent = r.rank;
        this.sound.milestone(4);
        this.hud.flash('#ffffff', 0.4);
        if (r.newTotal || r.newTime) $('resNew').classList.add('show');
      }
    };
    $('resRank').className = 'rank';
    $('resNew').classList.remove('show');
    $('resNew').textContent = r.newTime && r.newTotal ? 'NEW RECORD!! タイム & スコア' : r.newTime ? 'NEW RECORD!! ベストタイム' : 'NEW RECORD!! ハイスコア';
    $('resPrev').textContent = r.prevTime ? `自己ベスト ${fmtTime(Math.min(r.prevTime, r.t))} / ${fmtNum(Math.max(r.prevTotal, r.total))}pt` : '初クリア!';
    requestAnimationFrame(anim);
  }

  share() {
    const r = this.result;
    if (!r) return;
    const url = location.href.split('#')[0].split('?')[0];
    const text = `天空パルクールで【${r.rank}ランク】!\n⏱ ${fmtTime(r.t)} / 🏆 ${fmtNum(r.total)}pt / 🔥 最大${this.maxCombo}コンボ\n${COURSES[this.courseKey].daily ? 'デイリーコース ' + todayKey() + '\n' : ''}#天空パルクール`;
    if (navigator.share && this.touch) {
      navigator.share({ title: '天空パルクール', text, url }).catch(() => {});
    } else {
      window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
    }
  }

  // ---------- ループ ----------
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const rdt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.adaptPerf(rdt);
    try {
      this.frame(rdt);
    } catch (e) {
      console.error(e);
    }
  }

  adaptPerf(rdt) {
    const P = this.perf;
    P.acc += rdt; P.n++;
    if (P.acc > 2) {
      const avg = P.acc / P.n;
      if (avg > 1 / 42 && this.pixelRatio > 0.8) {
        this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.onResize();
      }
      P.acc = 0; P.n = 0;
    }
  }

  frame(rdt) {
    const p = this.p;
    let simDt = 0;
    if (this.state === 'racing' || this.state === 'finish') {
      this.timeScale += (1 - this.timeScale) * Math.min(1, rdt * (this.state === 'finish' ? 0.8 : 3));
      simDt = rdt * this.timeScale;
      if (this.hitStop > 0) { this.hitStop -= rdt; simDt = 0; }
    }

    if (this.state === 'countdown') {
      this.countT -= rdt;
      const n = Math.ceil(this.countT - 0.2);
      if (n !== this.countShown && n >= 0) {
        this.countShown = n;
        const el = $('countdown');
        el.textContent = n > 0 ? n : 'GO!!';
        el.className = '';
        void el.offsetWidth;
        el.className = n > 0 ? 'show' : 'show go';
        this.sound.beep(n === 0);
        if (n === 0) {
          this.state = 'racing';
          this.sound.startMusic();
          this.fovKick += 10;
          this.worldPos(p.s, p.u, 1, _v);
          this.fx.burst(_v, 40, { rainbow: true, speed: 10, life: 0.6, size: 0.5 });
        }
      }
    }

    if (this.state === 'racing' && simDt > 0) {
      const n = clamp(Math.ceil((simDt * Math.max(p.speed, 1)) / 0.22), 1, 10);
      const d = simDt / n;
      for (let i = 0; i < n && this.state === 'racing'; i++) this.step(d);
      // コンボタイマー
      if (this.combo > 0 && !p.onChute) {
        this.comboTimer -= simDt;
        if (this.comboTimer <= 0) this.comboFinish();
      }
      if (this.fever) { this.feverTime -= simDt; if (this.feverTime <= 0) this.endFever(); }
      if (this.coinChainT > 0) this.coinChainT -= simDt;
      if (this.coinPopT > 0) {
        this.coinPopT -= simDt;
        if (this.coinPopT <= 0 && this.coinPop > 0) { this.popAtPlayer(`+${fmtNum(this.coinPop)}`, 'pop-coin', 0.8, 2.0); this.coinPop = 0; this.coinPopT = 0; }
      }
      // ゴースト記録
      this.ghostAcc += simDt;
      while (this.ghostAcc >= 0.1) {
        this.ghostAcc -= 0.1;
        this.ghostRec.push([p.s, p.u, p.y, p.grounded ? (p.sliding || p.onChute ? 2 : 0) : 1, p.flipT >= 0 ? p.flipT : 0]);
      }
      this.ambientFX(simDt);
    } else if (this.state === 'finish') {
      this.finishT += rdt;
      p.speed = Math.max(0, p.speed - 18 * simDt);
      p.s += p.speed * simDt;
      p.u = damp(p.u, 0, 3, simDt);
      if (!p.grounded) { p.vy -= PHYS.G * simDt; p.y += p.vy * simDt; if (p.y <= 0) { p.y = 0; p.grounded = true; p.flipT = -1; } }
      else if (p.y > 0) { p.y = Math.max(0, p.y - simDt * 4); }
      if (p.flipT >= 0) { p.flipT += simDt / FLIP_T; if (p.flipT >= 1) p.flipT = -1; }
      if (Math.random() < rdt * 3) { this.worldPos(p.s + 10 + Math.random() * 20, (Math.random() - 0.5) * 16, 6 + Math.random() * 8, _v); this.fx.firework(_v); }
      if (this.finishT > 3.2) this.showResults();
    }

    // 演出の減衰
    this.trauma = Math.max(0, this.trauma - rdt * 1.6);
    this.fovKick *= Math.exp(-rdt * 4);

    this.updateRunner(rdt);
    this.updateGhost();
    this.updateCamera(rdt);
    this.world.update(rdt, this.state === 'title' ? this.titleS || 0 : p.s, this.camera, this.fever);
    this.fx.update(rdt, this.camera, this.renderer.domElement.height);
    if (this.state === 'racing' || this.state === 'finish' || this.state === 'countdown') this.hud.update(rdt, this);

    // 集中線
    const sp = this.state === 'racing' ? p.speed : 0;
    let inten = clamp((sp - 21) / 12, 0, 1);
    if (this.fever) inten = Math.max(inten, 0.6);
    if (p.boost > 0) inten = Math.max(inten, 0.8);
    if (this.settings.fx < 2) inten *= 0.4;
    this.lines.intensity = inten;
    this.lines.rainbow = this.fever;
    this.lines.draw(rdt);

    this.renderer.render(this.scene, this.camera);
  }

  ambientFX(dt) {
    const p = this.p;
    const vel = this.playerVel();
    // 風のチリ
    const rate = (p.speed > 22 ? 40 : 18) * dt * (this.settings.fx >= 2 ? 1 : 0.4);
    for (let i = 0; i < rate + Math.random(); i++) {
      this.worldPos(p.s + 15 + Math.random() * 30, (Math.random() - 0.5) * 12, Math.random() * 5, _v);
      this.fx.spawn(_v.x, _v.y, _v.z, 0, 0, 0, this.fever ? hsv(Math.random(), 0.7, 1) : 0xffffff, 0.07, 1.2, 0, 0);
    }
    // 滑り台の火花
    if (p.onChute) {
      for (let i = 0; i < 4; i++) {
        this.worldPos(p.s - 0.2, p.u + (Math.random() - 0.5) * 0.6, 0.12, _v);
        this.fx.spawn(_v.x, _v.y, _v.z, vel.x * 0.5 + (Math.random() - 0.5) * 6, 2 + Math.random() * 5, vel.z * 0.5 + (Math.random() - 0.5) * 6,
          Math.random() < 0.5 ? 0xffb000 : 0xffffff, 0.22, 0.45, 18, 1);
      }
    }
    // 高コンボのオーラ
    const tier = this.fever ? 5 : tierOf(this.combo);
    if (tier >= 2) {
      const n = (tier - 1) * dt * 30 * (this.settings.fx >= 2 ? 1 : 0.4);
      for (let i = 0; i < n; i++) {
        this.worldPos(p.s + (Math.random() - 0.5), p.u + (Math.random() - 0.5) * 0.8, p.y + Math.random() * 1.7, _v);
        const col = tier >= 5 ? hsv(Math.random(), 0.8, 1) : TIERS[tier].hex;
        this.fx.spawn(_v.x, _v.y, _v.z, vel.x * 0.92, 2 + Math.random() * 2, vel.z * 0.92, col, 0.3, 0.45, 0, 0.5);
      }
    }
    // ブースト中の炎
    if (p.boost > 0) {
      for (let i = 0; i < 3; i++) {
        this.worldPos(p.s - 0.4, p.u + (Math.random() - 0.5) * 0.5, p.y + 0.2 + Math.random() * 0.6, _v);
        this.fx.spawn(_v.x, _v.y, _v.z, vel.x * 0.6, 1 + Math.random() * 2, vel.z * 0.6, Math.random() < 0.5 ? 0x3fe0ff : 0x9f6bff, 0.5, 0.35, 0, 1, 0.05);
      }
    }
  }

  updateRunner(dt) {
    const p = this.p, c = this.course, r = this.runner;
    if (this.state === 'title') { r.root.visible = false; this.shadow.visible = false; return; }
    const pov = this.settings.cam === 'pov' && this.state !== 'finish';
    r.root.visible = !pov && !(p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0);
    const f = c.frame(p.s, _f);
    c.toWorld(p.s, p.u, p.y, r.root.position);
    if (p.onChute) r.root.position.y += 0.05;
    r.root.rotation.y = f.yaw;
    let mode = 'run';
    if (this.state === 'countdown') mode = 'idle';
    else if (this.state === 'finish' && p.speed < 2) mode = 'cheer';
    else if (p.stumble > 0) mode = 'stumble';
    else if (p.onChute) mode = 'chute';
    else if (!p.grounded) mode = 'air';
    else if (p.sliding) mode = 'slide';
    r.animate(dt, { mode, speed: p.speed, flip: p.flipT >= 0 ? p.flipT : 0, vy: p.vy, laneVel: p.laneVel });
    // 影
    this.shadow.visible = true;
    c.toWorld(p.s, p.u, 0.06, this.shadow.position);
    this.shadow.rotation.z = -f.yaw;
    const sc = Math.max(0.4, 1 - p.y * 0.12);
    this.shadow.scale.setScalar(sc);
    this.shadow.material.opacity = 0.35 * sc;
    // トレイル
    if (this.state === 'racing' || this.state === 'finish') {
      const hy = p.y + (p.sliding || p.onChute ? 0.45 : 0.95);
      c.toWorld(p.s - 0.2, p.u - 0.28, hy, _v);
      c.toWorld(p.s - 0.2, p.u + 0.28, hy, _v2);
      const tier = this.fever ? 5 : tierOf(this.combo);
      const t = this.world.time;
      const fn = tier >= 5 ? (k) => hsv(k * 1.2 - t * 1.5, 0.85, 1) : () => (TIERS[tier].hex > 0 ? TIERS[tier].hex : 0xffffff);
      this.fx.pushTrail(_v, _v2, fn, !pov && (tier >= 1 || p.speed > 20));
    }
  }

  updateGhost() {
    const g = this.ghostModel;
    const d = this.ghostData;
    if (!d || (this.state !== 'racing' && this.state !== 'countdown') || !this.settings.ghost) { g.root.visible = false; this.ghostS = null; return; }
    const t = this.state === 'countdown' ? 0 : this.runT;
    const fi = t / d.dt;
    const i = Math.floor(fi);
    if (i >= d.d.length - 1) { g.root.visible = false; this.ghostS = null; return; }
    const a = d.d[i], b = d.d[i + 1], k = fi - i;
    const s = a[0] + (b[0] - a[0]) * k, u = a[1] + (b[1] - a[1]) * k, y = a[2] + (b[2] - a[2]) * k;
    this.ghostS = s;
    g.root.visible = Math.abs(s - this.p.s) > 0.8 || this.settings.cam === 'pov';
    const f = this.course.frame(s, _f);
    this.course.toWorld(s, u, y, g.root.position);
    g.root.rotation.y = f.yaw;
    const mode = this.state === 'countdown' ? 'idle' : a[3] === 1 ? 'air' : a[3] === 2 ? 'slide' : 'run';
    g.animate(0.016, { mode, speed: 20, flip: a[4], vy: (b[2] - a[2]) * 10, laneVel: 0 });
  }

  updateCamera(dt) {
    const cam = this.camera, c = this.course, p = this.p;
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 0.85;
    let fov;
    if (this.state === 'title') {
      this.titleT += dt;
      const s = (this.titleT * 9) % (c.L - 40) + 5;
      this.titleS = s;
      c.toWorld(s, Math.sin(this.titleT * 0.25) * 2.2, 4.2 + Math.sin(this.titleT * 0.4) * 1.2, cam.position);
      c.toWorld(s + 22, 0, 0.5, _v);
      cam.lookAt(_v);
      fov = portrait ? 80 : 60;
    } else if (this.settings.cam === 'pov' && this.state !== 'finish') {
      const bob = p.grounded && !p.sliding ? Math.abs(Math.sin(this.runner.phase)) * 0.06 : 0;
      const eye = p.sliding || p.onChute ? 0.75 : 1.6;
      c.toWorld(p.s + 0.1, p.u, p.y + eye + bob, cam.position);
      c.toWorld(p.s + 12, p.u * 0.9, p.y * 0.6 + 0.7, _v);
      cam.lookAt(_v);
      cam.rotateZ(-p.laneVel * 0.012);
      fov = (portrait ? 84 : 70) + clamp(p.speed - 19, 0, 15) * 0.7;
    } else {
      const fin = this.state === 'finish' ? Math.min(1, this.finishT / 1.5) : 0;
      const back = (portrait ? 6.3 : 5.4) + clamp(p.speed - 19, 0, 12) * 0.05;
      const up = portrait ? 3.3 : 2.7;
      this.camU = damp(this.camU, p.u * 0.7, 7, dt);
      this.camH = damp(this.camH, up + p.y * 0.75, 6, dt);
      const cs = p.s - back * (1 - fin) + fin * 7;
      const cu = this.camU * (1 - fin) + fin * Math.sin(this.finishT * 0.5) * 4;
      // 下り階段で真上から見下ろしにならないよう、高さはプレイヤー基準で
      const groundY = c.heightAt(p.s), pathCam = c.heightAt(cs);
      c.toWorld(cs, cu, 0, cam.position);
      cam.position.y = groundY + (pathCam - groundY) * 0.3 + this.camH + fin * 0.2;
      const minY = pathCam + 1.2;
      if (cam.position.y < minY) cam.position.y = minY;
      const ls = p.s + 7 * (1 - fin);
      c.toWorld(ls, p.u * 0.5, 0, _v);
      _v.y = groundY + (c.heightAt(ls) - groundY) * 0.45 + 0.6 + p.y * 0.85 + fin * 0.8;
      cam.lookAt(_v);
      fov = (portrait ? 78 : 62) + clamp(p.speed - 19, 0, 15) * 0.6;
    }
    // シェイク
    if (this.trauma > 0 && this.settings.fx >= 1) {
      const k = this.trauma * this.trauma * (this.settings.fx >= 2 ? 1 : 0.35);
      cam.position.x += (Math.random() - 0.5) * 0.5 * k;
      cam.position.y += (Math.random() - 0.5) * 0.5 * k;
      cam.rotateZ((Math.random() - 0.5) * 0.08 * k);
    }
    fov += this.fovKick * (this.settings.fx >= 2 ? 1 : 0.4);
    cam.fov = clamp(fov, 40, 110);
    cam.updateProjectionMatrix();
  }

  onResize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lines.resize(w, h, Math.min(this.pixelRatio, 1.5));
  }
}

async function boot() {
  try {
    if (document.fonts && document.fonts.load) {
      await Promise.race([
        Promise.all([document.fonts.load('900 40px "Dela Gothic One"'), document.fonts.load('800 20px "M PLUS Rounded 1c"')]),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    }
  } catch (e) { /* フォントが無くても続行 */ }
  try {
    window.app = new App();
  } catch (e) {
    console.error(e);
    $('loading').textContent = 'WebGLを初期化できませんでした。別のブラウザでお試しください。';
  }
}
boot();
