// DOM HUD：タイム・スコア・コンボ・フィーバー・ポップアップ
import { fmtTime, fmtNum } from './util.js';

const $ = (id) => document.getElementById(id);

export const TIERS = [
  { min: 0, color: '#ffffff', glow: '#9fdcff', hex: 0xffffff },
  { min: 10, color: '#3ff2ff', glow: '#00b3ff', hex: 0x3ff2ff },
  { min: 25, color: '#9dff3f', glow: '#2bff88', hex: 0x9dff3f },
  { min: 50, color: '#ffd93f', glow: '#ff9500', hex: 0xffc400 },
  { min: 75, color: '#ff4fd8', glow: '#ff006e', hex: 0xff3fd0 },
  { min: 100, color: 'rainbow', glow: '#ffffff', hex: -1 },
];
export const tierOf = (c) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (c >= TIERS[i].min) t = i; return t; };

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), time: $('time'), split: $('split'), score: $('score'), coins: $('coins'),
      combo: $('comboBox'), comboNum: $('comboNum'), comboMult: $('comboMult'), comboBar: $('comboBar'),
      fever: $('feverFill'), feverBox: $('feverBox'), speed: $('speed'), prog: $('progMe'), progGhost: $('progGhost'),
      popups: $('popups'), banner: $('banner'), flash: $('flash'), vignette: $('vignette'), app: $('app'),
    };
    this.shown = 0;
    this.target = 0;
    this.lastCombo = 0;
    this.fxLevel = 2;
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  update(dt, g) {
    const e = this.el;
    e.time.textContent = fmtTime(g.time);
    this.target = g.score;
    if (this.shown < this.target) {
      this.shown += Math.max(1, (this.target - this.shown) * Math.min(1, dt * 12));
      if (this.shown > this.target) this.shown = this.target;
    } else this.shown = this.target;
    e.score.textContent = fmtNum(this.shown);
    e.coins.textContent = g.coins;
    e.speed.textContent = Math.round(g.p.speed * 3.6);
    const pr = Math.min(1, Math.max(0, g.p.s / g.course.finishS));
    e.prog.style.left = (pr * 100).toFixed(2) + '%';
    if (g.ghostS != null) {
      e.progGhost.style.display = 'block';
      e.progGhost.style.left = (Math.min(1, Math.max(0, g.ghostS / g.course.finishS)) * 100).toFixed(2) + '%';
    } else e.progGhost.style.display = 'none';

    // コンボ
    const c = g.combo;
    if (c !== this.lastCombo) {
      if (c > this.lastCombo) {
        e.combo.classList.remove('bump');
        void e.combo.offsetWidth;
        e.combo.classList.add('bump');
      }
      this.lastCombo = c;
      e.comboNum.textContent = c;
      const t = tierOf(c);
      e.combo.dataset.tier = t;
      e.comboMult.textContent = 'x' + g.mult().toFixed(1);
    }
    e.combo.classList.toggle('active', c >= 2);
    e.comboBar.style.transform = `scaleX(${Math.max(0, g.comboTimer / g.comboWindow)})`;
    // フィーバー
    e.fever.style.transform = `scaleX(${g.fever ? g.feverTime / g.feverDur : g.feverGauge / 100})`;
    e.feverBox.classList.toggle('on', g.fever);
    e.feverBox.classList.toggle('ready', !g.fever && g.feverGauge > 80);
    e.app.classList.toggle('fever', g.fever);
    // ビネット
    const tier = tierOf(c);
    e.vignette.style.opacity = g.fever ? 1 : Math.min(0.85, c / 60);
    e.vignette.dataset.tier = tier;
  }

  setSplit(text, good) {
    const s = this.el.split;
    s.textContent = text;
    s.className = good == null ? 'show' : good ? 'show good' : 'show bad';
    clearTimeout(this._splitT);
    this._splitT = setTimeout(() => (s.className = ''), 3000);
  }

  // ワールド上の位置付近にポップ
  pop(text, x, y, cls = '', scale = 1) {
    const p = this.el.popups;
    while (p.childElementCount > 26) p.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'pop ' + cls;
    d.textContent = text;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    d.style.setProperty('--s', scale);
    d.style.setProperty('--r', ((Math.random() - 0.5) * 16).toFixed(1) + 'deg');
    d.addEventListener('animationend', () => d.remove());
    p.appendChild(d);
  }

  banner(text, sub = '', cls = '') {
    const b = this.el.banner;
    b.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'bnr ' + cls;
    const t = document.createElement('div');
    t.className = 'bnr-main';
    t.textContent = text;
    t.dataset.text = text;
    d.appendChild(t);
    if (sub) {
      const s = document.createElement('div');
      s.className = 'bnr-sub';
      s.textContent = sub;
      d.appendChild(s);
    }
    d.addEventListener('animationend', (ev) => { if (ev.target === d) d.remove(); });
    b.appendChild(d);
  }

  flash(color = '#fff', strength = 0.6) {
    if (this.fxLevel < 2) strength *= 0.3;
    const f = this.el.flash;
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = strength;
    void f.offsetWidth;
    f.style.transition = 'opacity 0.35s ease-out';
    f.style.opacity = 0;
  }

  shakeDom(cls = 'shake') {
    if (this.fxLevel < 2) return;
    const a = this.el.hud;
    a.classList.remove(cls);
    void a.offsetWidth;
    a.classList.add(cls);
  }
}
