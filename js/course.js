// コース生成（シード固定で毎回同じコース → タイムを競える）
import { mulberry32 } from './util.js';

export const LANE_W = 1.7;      // レーン幅
export const HALF_W = 3.0;      // 階段の半幅
export const laneU = (lane) => (lane - 1) * LANE_W;

// 物理パラメータ（コース上のアイテム配置にも使う）
export const PHYS = {
  G: 38,
  JUMP_V: 11.6,
  RAMP_V: 21,
  BASE_SPEED: 19,
  END_SPEED: 24,
};

export class Course {
  constructor(seed, length = 1600) {
    this.seed = seed;
    this.L = length;
    this.rng = mulberry32(seed);
    this.obstacles = [];
    this.items = [];
    this.zones = [];
    this.checkpoints = [Math.round(length / 3), Math.round((2 * length) / 3)];
    this.finishS = length;
    this.buildProfile();
    this.populate();
    this.obstacles.sort((a, b) => a.s0 - b.s0);
    this.items.sort((a, b) => a.s - b.s);
    this.zones.sort((a, b) => a.s0 - b.s0);
    this.obstacles.forEach((o, i) => (o.id = i));
    this.items.forEach((it, i) => (it.id = i));
    this.counts = {
      coin: this.items.filter((i) => i.type === 'coin').length,
      gem: this.items.filter((i) => i.type === 'gem').length,
    };
  }

  // ---------- 高低差（階段 / 踊り場） ----------
  buildProfile() {
    const r = this.rng, L = this.L;
    const secs = [];
    let s = -80, y = 0;
    const push = (len, slope, type) => {
      secs.push({ s0: s, s1: s + len, y0: y, slope, type });
      y += slope * len;
      s += len;
    };
    push(120, 0, 'plaza');
    const endFlat = L - 50;
    while (s < endFlat) {
      const st = Math.min(45 + r() * 70, endFlat - s);
      if (st > 6) push(st, -(0.26 + r() * 0.17), 'stairs');
      if (s >= endFlat) break;
      const ld = Math.min(12 + r() * 22, endFlat - s);
      if (ld > 4) push(ld, 0, 'landing');
      else break;
    }
    push(L + 300 - s, 0, 'plaza');
    this.sections = secs;
    this.cA = 9 + r() * 5;
    this.cB = 4 + r() * 3;
    this.cP = r() * 6.28;
    this.cQ = r() * 6.28;
    this.x0 = 0;
    this.x0 = this.curveX(0);
  }

  section(s) {
    const a = this.sections;
    if (s <= a[0].s0) return a[0];
    let lo = 0, hi = a.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (a[mid].s0 <= s) lo = mid; else hi = mid - 1;
    }
    return a[lo];
  }

  heightAt(s) {
    const sec = this.section(s);
    return sec.y0 + sec.slope * (Math.max(s, sec.s0) - sec.s0);
  }

  curveX(s) {
    return this.cA * Math.sin(s / 180 + this.cP) + this.cB * Math.sin(s / 71 + this.cQ) - this.x0;
  }

  curveDX(s) {
    return (this.cA / 180) * Math.cos(s / 180 + this.cP) + (this.cB / 71) * Math.cos(s / 71 + this.cQ);
  }

  // 進行方向・右方向ベクトル
  frame(s, out = {}) {
    const dx = this.curveDX(s);
    const n = Math.sqrt(dx * dx + 1);
    out.fx = dx / n; out.fz = -1 / n;
    out.rx = 1 / n; out.rz = dx / n;
    out.px = this.curveX(s); out.py = this.heightAt(s); out.pz = -s;
    out.yaw = Math.atan2(-out.fx, -out.fz);
    return out;
  }

  // (s: 距離, u: 横, h: 路面からの高さ) → ワールド座標
  toWorld(s, u, h, out) {
    const dx = this.curveDX(s);
    const n = Math.sqrt(dx * dx + 1);
    out.x = this.curveX(s) + u / n;
    out.y = this.heightAt(s) + h;
    out.z = -s + (u * dx) / n;
    return out;
  }

  // ---------- 障害物・アイテム ----------
  addObs(type, s0, la, lb, len) {
    const defs = {
      hurdle: { len: 0.3, h0: 0, h1: 0.9, solid: true, platform: false },
      box: { len: 3, h0: 0, h1: 1.0, solid: true, platform: true },
      tallbox: { len: 3, h0: 0, h1: 2.6, solid: true, platform: true },
      bar: { len: 0.3, h0: 1.05, h1: 1.4, solid: true, platform: false },
      ramp: { len: 5, h0: 0, h1: 1.3, solid: false, platform: true },
    };
    const d = defs[type];
    const L = len ?? d.len;
    const lo = Math.min(la, lb), hi = Math.max(la, lb);
    const o = {
      type, s0, s1: s0 + L, laneA: lo, laneB: hi,
      u0: laneU(lo) - 0.75, u1: laneU(hi) + 0.75,
      h0: d.h0, h1: d.h1, solid: d.solid, platform: d.platform,
      hit: false, eng: null, cleared: false, smashed: false, near: false,
    };
    this.obstacles.push(o);
    return o;
  }

  addZone(type, s0, s1, lane) {
    const z = { type, s0, s1, lane, u0: laneU(lane) - 0.8, u1: laneU(lane) + 0.8, used: false };
    this.zones.push(z);
    return z;
  }

  addItem(type, s, lane, h) {
    this.items.push({ type, s, u: laneU(lane), h, collected: false, lane });
  }

  coinLine(s0, s1, lane, h = 0.7, step = 2.2) {
    for (let s = s0; s <= s1; s += step) this.addItem('coin', s, lane, h);
  }

  coinArc(sc, lane, span = 6, base = 0.7, top = 2.7) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      this.addItem('coin', sc - span + 2 * span * t, lane, base + (top - base) * Math.sin(Math.PI * t));
    }
  }

  cruiseAt(s) {
    return PHYS.BASE_SPEED + (PHYS.END_SPEED - PHYS.BASE_SPEED) * Math.min(1, s / this.L);
  }

  populate() {
    const r = this.rng, L = this.L;
    const ri = (n) => Math.floor(r() * n);
    const others = (l) => [0, 1, 2].filter((x) => x !== l);
    const avoid = [...this.checkpoints, this.finishS];
    const blocked = (a, b) => avoid.some((c) => b > c - 9 && a < c + 9);
    let clocks = 0, stars = 0;

    const P = {
      hurdleAll: (s) => {
        this.addObs('hurdle', s, 0, 2);
        this.coinArc(s + 0.15, ri(3));
        return s + 1;
      },
      hurdleTwo: (s) => {
        const free = ri(3);
        for (const l of others(free)) this.addObs('hurdle', s, l, l);
        this.coinLine(s - 8, s + 8, free);
        this.coinArc(s + 0.15, others(free)[ri(2)]);
        return s + 1;
      },
      box: (s) => {
        const l = ri(3), len = 3 + r() * 2.5;
        this.addObs('box', s, l, l, len);
        this.coinLine(s + 0.6, s + len - 0.4, l, 1.6, 1.4);
        if (r() < 0.5) this.coinLine(s - 6, s + len + 6, others(l)[ri(2)]);
        return s + len;
      },
      boxRun: (s) => {
        const l = ri(3);
        let x = s;
        for (let i = 0; i < 3; i++) {
          const len = 6 + r() * 2.5;
          this.addObs('box', x, l, l, len);
          this.coinLine(x + 0.5, x + len - 0.3, l, 1.6, 1.5);
          x += len + 4.5;
        }
        x -= 4.5;
        if (r() < 0.55 && clocks < 7) { this.addItem('clock', x - 2, l, 2.2); clocks++; }
        // 横レーンには邪魔を
        const o = others(l);
        this.addObs('hurdle', s + 6, o[0], o[0]);
        this.addObs('bar', s + 18, o[1], o[1]);
        this.addObs('hurdle', s + 26, o[1], o[1]);
        return x;
      },
      barAll: (s) => {
        this.addObs('bar', s, 0, 2);
        this.coinLine(s - 5, s + 5, ri(3), 0.4, 1.4);
        return s + 1;
      },
      walls: (s) => {
        const free = ri(3), len = 2.5 + r() * 2;
        for (const l of others(free)) this.addObs('tallbox', s, l, l, len);
        this.coinLine(s - 7, s + len + 4, free);
        return s + len;
      },
      zigzag: (s) => {
        const a = ri(3);
        const b = others(a)[ri(2)];
        this.addObs('tallbox', s, a, a, 3);
        this.addObs('tallbox', s + 17, b, b, 3);
        this.coinLine(s - 4, s + 3, b, 0.7, 2);
        this.coinLine(s + 10, s + 20, others(b)[ri(2)], 0.7, 2);
        return s + 20;
      },
      chute: (s) => {
        const l = ri(3), len = 28 + r() * 22;
        this.addZone('chute', s, s + len, l);
        this.coinLine(s + 2, s + len - 1, l, 0.5, 1.6);
        const o = others(l);
        this.addObs('hurdle', s + len * 0.35, o[0], o[0]);
        this.addObs('bar', s + len * 0.55, o[1], o[1]);
        this.addObs('hurdle', s + len * 0.8, o[0], o[1]);
        if (r() < 0.45 && stars < 4) { this.addItem('star', s + len - 2, l, 0.8); stars++; }
        return s + len;
      },
      ramp: (s) => {
        const l = ri(3);
        this.addObs('ramp', s, l, l, 5);
        const v = this.cruiseAt(s);
        const g = PHYS.G, vy = PHYS.RAMP_V;
        for (let i = 1; i <= 11; i++) {
          const t = i * 0.1;
          const h = 1.3 + vy * t - 0.5 * g * t * t;
          if (Math.abs(t - vy / g) < 0.06) this.addItem('gem', s + 5 + v * t, l, h + 0.6);
          else this.addItem('coin', s + 5 + v * t, l, h + 0.8);
        }
        const o = others(l);
        this.addObs('hurdle', s + 3, o[0], o[0]);
        this.addObs('box', s + 8, o[1], o[1], 3);
        return s + 5 + v * 1.25;
      },
      boost: (s) => {
        const l = ri(3);
        this.addZone('boost', s, s + 3, l);
        this.coinLine(s + 4, s + 24, l, 0.7, 1.8);
        return s + 24;
      },
      mixed: (s) => {
        const ls = [0, 1, 2].sort(() => r() - 0.5);
        this.addObs('bar', s, ls[0], ls[0]);
        this.addObs('hurdle', s, ls[1], ls[1]);
        this.addObs('tallbox', s, ls[2], ls[2], 3);
        this.coinArc(s + 0.15, ls[1]);
        return s + 3;
      },
      barHurdle: (s) => {
        this.addObs('bar', s, 0, 2);
        this.addObs('hurdle', s + 15, 0, 2);
        this.coinLine(s + 3, s + 12, ri(3));
        return s + 16;
      },
    };

    // 通常パターン（特殊パターンは別枠で必ず一定間隔に入れる）
    const pool = (d) => {
      const list = [
        ['hurdleAll', 3], ['hurdleTwo', 3], ['box', 3], ['barAll', 3], ['walls', 3],
        ['boxRun', d > 0.15 ? 1.2 : 0], ['zigzag', d > 0.2 ? 1.6 : 0],
        ['mixed', d > 0.3 ? 2.5 : 0], ['barHurdle', d > 0.4 ? 2 : 0],
      ];
      const tot = list.reduce((a, b) => a + b[1], 0);
      let x = r() * tot;
      for (const [k, w] of list) { if ((x -= w) <= 0) return k; }
      return 'hurdleAll';
    };
    const specials = ['ramp', 'chute', 'boost', 'boxRun', 'ramp', 'chute', 'zigzag', 'boost', 'ramp', 'chute'];
    let specialIdx = 0, count = 0;

    // 序盤のチュートリアル的な並び
    let s = 75;
    s = P.hurdleAll(s) + 26;
    s = P.box(s) + 26;
    s = P.barAll(s) + 26;
    s = P.walls(s) + 28;
    s = P.ramp(s) + 26;

    let last = '';
    while (s < L - 45) {
      const d = s / L;
      const special = count % 3 === 2;
      let k = special ? specials[specialIdx % specials.length] : pool(d);
      if (!special && k === last) k = pool(d);
      const est = { boxRun: 40, zigzag: 22, chute: 52, ramp: 40, boost: 26, barHurdle: 18 }[k] || 8;
      if (blocked(s, s + est) || s + est > L - 30) {
        this.coinLine(s, s + 10, ri(3));
        s += 14;
        continue;
      }
      const end = P[k](s);
      if (special) specialIdx++;
      count++;
      last = k;
      const gap = 30 - 10 * d + r() * 8;
      // 隙間にコイン列
      if (r() < 0.55) {
        const l = ri(3);
        const a = end + 6, b = end + gap - 6;
        if (b > a) this.coinLine(a, b, l, 0.7, 2.2);
      }
      if (r() < 0.07 && clocks < 7) { this.addItem('clock', end + gap * 0.5, ri(3), 0.9); clocks++; }
      s = end + gap;
    }
    // ゴール前のご褒美ストレート
    for (let l = 0; l < 3; l++) this.coinLine(L - 28, L - 4, l, 0.7, 2.4);
    this.addItem('gem', L - 14, 1, 1.0);
  }
}
