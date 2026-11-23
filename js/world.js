// 3Dワールド構築：山の大階段・手すり・カルスト峰・障害物・アイテム
import * as THREE from '../lib/three.module.min.js';
import { HALF_W, LANE_W, laneU } from './course.js';
import { bannerTexture, screenTexture } from './textures.js';
import { mulberry32, hsv } from './util.js';

const _v = { x: 0, y: 0, z: 0 };
const _f = {};

// パス空間 (s, u, h) で頂点を積み上げるジオメトリビルダー
class GeoBuilder {
  // absH=true のとき h は「路面からの高さ」ではなく絶対高さ（階段の踏面用）
  constructor(course, absH = false) {
    this.c = course;
    this.absH = absH;
    this.pos = []; this.col = []; this.uv = []; this.idx = []; this.n = 0;
  }
  v(s, u, h, color, tu = 0, tv = 0, hFn) {
    const p = this.c.toWorld(s, u, h, _v);
    if (hFn) p.y = hFn(s) + h;
    else if (this.absH) p.y = h;
    this.pos.push(p.x, p.y, p.z);
    this.col.push(color.r, color.g, color.b);
    this.uv.push(tu, tv);
    return this.n++;
  }
  // ワールド座標の頂点
  vw(x, y, z, color, tu = 0, tv = 0) {
    this.pos.push(x, y, z);
    this.col.push(color.r, color.g, color.b);
    this.uv.push(tu, tv);
    return this.n++;
  }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  // 路面に沿った箱（上面・側面・前後面）
  sweptBox(s0, s1, u0, u1, h0, h1, color, hTop, uvScale = 0.5) {
    const n = Math.max(1, Math.ceil((s1 - s0) / 1.0));
    const top = (s) => (hTop ? hTop(s) : h1);
    const L = [], R = [], TL = [], TR = [], BL = [], BR = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      const ht = top(s);
      TL.push(this.v(s, u0, ht, color, u0 * uvScale, s * uvScale));
      TR.push(this.v(s, u1, ht, color, u1 * uvScale, s * uvScale));
      L.push([this.v(s, u0, h0, color, s * uvScale, h0 * uvScale), this.v(s, u0, ht, color, s * uvScale, ht * uvScale)]);
      R.push([this.v(s, u1, h0, color, s * uvScale, h0 * uvScale), this.v(s, u1, ht, color, s * uvScale, ht * uvScale)]);
      BL.push(0); BR.push(0);
    }
    for (let i = 0; i < n; i++) {
      this.quad(TL[i], TR[i], TR[i + 1], TL[i + 1]);
      this.quad(L[i][0], L[i][1], L[i + 1][1], L[i + 1][0]);
      this.quad(R[i][0], R[i + 1][0], R[i + 1][1], R[i][1]);
    }
    // 前面・背面
    for (const [s, flip] of [[s0, false], [s1, true]]) {
      const ht = top(s);
      if (ht - h0 < 0.01) continue;
      const a = this.v(s, u0, h0, color, u0 * uvScale, h0 * uvScale);
      const b = this.v(s, u1, h0, color, u1 * uvScale, h0 * uvScale);
      const c = this.v(s, u1, ht, color, u1 * uvScale, ht * uvScale);
      const d = this.v(s, u0, ht, color, u0 * uvScale, ht * uvScale);
      if (flip) this.quad(a, d, c, b); else this.quad(a, b, c, d);
    }
  }

  // 矩形断面のチューブ（中心 uc,hc）を s 方向に
  sweepRect(s0, s1, uc, hc, wu, wh, color, ds = 1, hFn) {
    const n = Math.max(1, Math.ceil((s1 - s0) / ds));
    const corners = [[-wu / 2, -wh / 2], [wu / 2, -wh / 2], [wu / 2, wh / 2], [-wu / 2, wh / 2]];
    const rings = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      rings.push(corners.map(([du, dh]) => this.v(s, uc + du, hc + dh, color, 0, 0, hFn)));
    }
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        this.quad(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]);
      }
    }
    // 端面
    const a = rings[0], b = rings[n];
    this.quad(a[0], a[3], a[2], a[1]);
    this.quad(b[0], b[1], b[2], b[3]);
  }

  // 任意断面ポリラインを s 方向へスイープ
  sweepSection(s0, s1, section, colors, ds = 2, hFn, colorJitter = 0, rnd = Math.random) {
    const n = Math.max(1, Math.ceil((s1 - s0) / ds));
    const rows = [];
    const tmp = new THREE.Color();
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      rows.push(section.map(([u, h], j) => {
        tmp.copy(colors[j] || colors[colors.length - 1]);
        if (colorJitter) tmp.multiplyScalar(1 - colorJitter + rnd() * colorJitter * 2);
        return this.v(s, u, h, tmp, u * 0.25, s * 0.25, hFn);
      }));
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < section.length - 1; j++) {
        this.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
      }
    }
  }

  // パス座標系の向きに合わせた小さな箱（s で接線方向を決める）
  boxAt(s, u, h, ds, du, dh, color) {
    const f = this.c.frame(s, _f);
    const cx = f.px + f.rx * u, cz = f.pz + f.rz * u, cy = f.py + h;
    const ax = [f.fx * ds / 2, 0, f.fz * ds / 2];
    const ar = [f.rx * du / 2, 0, f.rz * du / 2];
    const au = [0, dh / 2, 0];
    const P = (a, b, c) => [cx + ax[0] * a + ar[0] * b, cy + au[1] * c, cz + ax[2] * a + ar[2] * b];
    const faces = [
      [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]], // top
      [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]],
      [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]],
      [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]],
      [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]],
      [[-1, -1, -1], [-1, -1, 1], [1, -1, 1], [1, -1, -1]],
    ];
    for (const fc of faces) {
      const id = fc.map(([a, b, c]) => { const p = P(a, b, c); return this.vw(p[0], p[1], p[2], color); });
      this.quad(id[0], id[1], id[2], id[3]);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const C = (hex) => new THREE.Color(hex);

export class World {
  constructor(scene, course, T) {
    this.scene = scene;
    this.course = course;
    this.T = T;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.rnd = mulberry32(course.seed ^ 0x5bd1e995);
    this.time = 0;
    this.crowds = [];
    this.spinners = [];
    this.boostMats = [];

    const DS = THREE.DoubleSide;
    this.mats = {
      stone: new THREE.MeshLambertMaterial({ map: T.stone, vertexColors: true, side: DS }),
      concrete: new THREE.MeshLambertMaterial({ map: T.concrete, vertexColors: true, side: DS }),
      dark: new THREE.MeshLambertMaterial({ map: T.dark, vertexColors: true, side: DS }),
      tape: new THREE.MeshLambertMaterial({ color: 0x2f6dff, emissive: 0x0b2a9a, side: DS }),
      vcol: new THREE.MeshLambertMaterial({ vertexColors: true, side: DS }),
      metal: new THREE.MeshPhongMaterial({ color: 0xcfd6de, specular: 0xffffff, shininess: 90, side: DS }),
      flat: new THREE.MeshLambertMaterial({ vertexColors: true, side: DS }),
    };

    this.buildSky();
    this.buildStairs();
    this.buildSides();
    this.buildScenery();
    this.buildGates();
    this.buildObstacles();
    this.buildZones();
    this.buildItems();
  }

  // ---------- 空と遠景 ----------
  buildSky() {
    const uniforms = {
      top: { value: C(0x6f9fd6) },
      mid: { value: C(0xd4e1ea) },
      bottom: { value: C(0xe8eef2) },
      time: { value: 0 },
      fever: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform float time; uniform float fever;
        varying vec3 vDir;
        vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
        void main(){
          float h = vDir.y;
          vec3 col = mix(mid, top, smoothstep(0.02, 0.65, h));
          col = mix(bottom, col, smoothstep(-0.3, 0.03, h));
          if (fever > 0.001) {
            float a = atan(vDir.x, vDir.z);
            vec3 rb = hsv2rgb(vec3(fract(time*0.12 + h*0.7 + a*0.159), 0.6, 1.0));
            float rays = 0.5 + 0.5*sin(a*14.0 + time*3.0);
            col = mix(col, rb * (0.75 + 0.35*rays), fever*0.7);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.skyU = uniforms;
    this.root.add(this.sky);

    this.T.mountains.repeat.set(3, 1);
    const mm = new THREE.MeshBasicMaterial({ map: this.T.mountains, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false });
    this.mountains = new THREE.Mesh(new THREE.CylinderGeometry(760, 760, 460, 48, 1, true), mm);
    this.mountains.renderOrder = -9;
    this.root.add(this.mountains);

    this.fogBase = C(0xd0dce5);
    this.scene.fog = new THREE.Fog(this.fogBase.clone(), 70, 360);
  }

  // ---------- 階段 ----------
  buildStairs() {
    const c = this.course;
    const steps = [];
    for (const sec of c.sections) {
      if (sec.slope < 0) {
        const n = Math.max(1, Math.round((sec.s1 - sec.s0) / 0.5));
        const d = (sec.s1 - sec.s0) / n;
        for (let k = 0; k < n; k++) {
          const a = sec.s0 + k * d;
          steps.push({ a, b: a + d, h: sec.y0 + sec.slope * (k * d + d * 0.5), stair: true });
        }
      } else {
        const n = Math.max(1, Math.ceil((sec.s1 - sec.s0) / 2.5));
        const d = (sec.s1 - sec.s0) / n;
        for (let k = 0; k < n; k++) {
          const a = sec.s0 + k * d;
          steps.push({ a, b: a + d, h: sec.y0, stair: false });
        }
      }
    }
    const CH = 40;
    const chunks = new Map();
    const rnd = this.rnd;
    const tread = new THREE.Color(), nose = C(0x5c6165), riser = C(0x6a6f73), tile = new THREE.Color();
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const key = Math.floor(st.a / CH);
      if (!chunks.has(key)) chunks.set(key, new GeoBuilder(c, true));
      const g = chunks.get(key);
      const W = HALF_W + 0.05;
      if (st.stair) {
        const k = (i % 2 ? 0.88 : 0.95) + rnd() * 0.05;
        tread.setRGB(k, k, k * 1.01);
        const nb = st.b - 0.1;
        g.quad(g.v(st.a, -W, st.h, tread, -W * 0.5, st.a * 0.5), g.v(st.a, W, st.h, tread, W * 0.5, st.a * 0.5), g.v(nb, W, st.h, tread, W * 0.5, nb * 0.5), g.v(nb, -W, st.h, tread, -W * 0.5, nb * 0.5));
        g.quad(g.v(nb, -W, st.h, nose), g.v(nb, W, st.h, nose), g.v(st.b, W, st.h, nose), g.v(st.b, -W, st.h, nose));
      } else {
        // 踊り場：大判の石タイル
        const k = 0.9 + rnd() * 0.1;
        tile.setRGB(k, k * 0.99, k * 0.97);
        g.quad(g.v(st.a, -W, st.h, tile, -W * 0.3, st.a * 0.3), g.v(st.a, W, st.h, tile, W * 0.3, st.a * 0.3), g.v(st.b, W, st.h, tile, W * 0.3, st.b * 0.3), g.v(st.b, -W, st.h, tile, -W * 0.3, st.b * 0.3));
        // 目地
        g.quad(g.v(st.b - 0.04, -W, st.h + 0.005, nose), g.v(st.b - 0.04, W, st.h + 0.005, nose), g.v(st.b, W, st.h + 0.005, nose), g.v(st.b, -W, st.h + 0.005, nose));
      }
      const next = steps[i + 1];
      const hn = next ? next.h : st.h - 0.5;
      if (hn < st.h - 0.001) {
        g.quad(g.v(st.b, -W, hn, riser), g.v(st.b, -W, st.h, riser), g.v(st.b, W, st.h, riser), g.v(st.b, W, hn, riser));
      }
    }
    for (const g of chunks.values()) {
      const m = new THREE.Mesh(g.build(), this.mats.stone);
      this.root.add(m);
    }
  }

  // ---------- 側壁・手すり・斜面 ----------
  buildSides() {
    const c = this.course;
    const rnd = this.rnd;
    const s0 = -80, s1 = c.L + 260;
    const CH = 60;
    const curb = C(0x8a8f92), curbTop = C(0xa4a8aa), wood = C(0x5b4636), woodLight = C(0x7a5e45);
    const grassNear = C(0x6f8c43), grass = C(0x4f7a35), grassFar = C(0x2f5a2c), rock = C(0x6d6f68);
    const slopeSec = [[HALF_W + 0.4, -0.7], [4.4, -1.0], [7, -3.2], [12, -7.5], [20, -18], [34, -46], [60, -110]];
    const slopeCols = [curb, grassNear, grass, grass, rock, grassFar, grassFar];
    for (let a = s0; a < s1; a += CH) {
      const b = Math.min(s1, a + CH);
      const g = new GeoBuilder(c);
      for (const side of [-1, 1]) {
        // 側壁（ストリンガー）
        const sec = [[HALF_W, -0.9], [HALF_W, 0.28], [HALF_W + 0.4, 0.28], [HALF_W + 0.4, -0.9]].map(([u, h]) => [u * side, h]);
        g.sweepSection(a, b, sec, [curb, curbTop, curbTop, curb], 1.5);
        // 外側斜面
        const ss = slopeSec.map(([u, h]) => [u * side, h]);
        g.sweepSection(a, b, ss, slopeCols, 4, null, 0.18, rnd);
        // 手すり（2段）
        g.sweepRect(a, b, side * (HALF_W + 0.2), 1.22, 0.12, 0.1, woodLight, 2);
        g.sweepRect(a, b, side * (HALF_W + 0.2), 0.78, 0.08, 0.14, wood, 2);
      }
      const m = new THREE.Mesh(g.build(), this.mats.stone);
      // 斜面は石テクスチャで十分（緑の頂点色）
      this.root.add(m);
    }
    // 支柱（インスタンス）
    const count = Math.ceil((s1 - s0) / 2.4) * 2;
    const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), new THREE.MeshLambertMaterial({ color: 0x4a3828 }), count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    let i = 0;
    for (let s = s0; s < s1 && i < count - 1; s += 2.4) {
      const f = c.frame(s, _f);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw);
      for (const side of [-1, 1]) {
        c.toWorld(s, side * (HALF_W + 0.2), 0.8, p);
        m4.compose(p, q, sc);
        post.setMatrixAt(i++, m4);
      }
    }
    post.count = i;
    this.root.add(post);
  }

  // 斜面上の高さ（木の配置用）
  slopeH(u) {
    const sec = [[HALF_W + 0.4, -0.7], [4.4, -1.0], [7, -3.2], [12, -7.5], [20, -18], [34, -46]];
    u = Math.abs(u);
    for (let i = 0; i < sec.length - 1; i++) {
      const [u0, h0] = sec[i], [u1, h1] = sec[i + 1];
      if (u <= u1) return h0 + ((h1 - h0) * (u - u0)) / (u1 - u0);
    }
    return -46;
  }

  // ---------- 木・カルスト峰・雲 ----------
  buildScenery() {
    const c = this.course, rnd = this.rnd;
    const s0 = -80, s1 = c.L + 260;
    // 木
    const treeGeo = new THREE.IcosahedronGeometry(1, 0);
    treeGeo.scale(1, 1.25, 1);
    const nTree = Math.ceil((s1 - s0) / 2.2) * 2;
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), nTree);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    let ti = 0;
    for (let s = s0; s < s1; s += 2.2) {
      for (const side of [-1, 1]) {
        if (ti >= nTree) break;
        const k = 0.9 + rnd() * 2.0;
        const u = side * (HALF_W + 1.4 + k + Math.pow(rnd(), 1.5) * 15);
        c.toWorld(s + rnd() * 2, u, this.slopeH(u) + k * 0.7, p);
        q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0));
        sc.set(k, k * (0.9 + rnd() * 0.6), k);
        m4.compose(p, q, sc);
        trees.setMatrixAt(ti, m4);
        col.setHSL(0.24 + rnd() * 0.1, 0.45 + rnd() * 0.2, 0.22 + rnd() * 0.14);
        if (rnd() < 0.06) col.setHSL(0.08 + rnd() * 0.05, 0.6, 0.45); // 紅葉
        trees.setColorAt(ti, col);
        ti++;
      }
    }
    trees.count = ti;
    this.root.add(trees);

    // カルスト峰
    const karstMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const variants = 3, per = Math.ceil((c.L + 400) / 22);
    for (let v = 0; v < variants; v++) {
      const geo = this.karstGeometry(mulberry32(777 + v * 13));
      const im = new THREE.InstancedMesh(geo, karstMat, per);
      let k = 0;
      for (let i = 0; i < per; i++) {
        const s = s0 - 60 + rnd() * (s1 - s0 + 200);
        const side = rnd() < 0.5 ? -1 : 1;
        const lat = 32 + Math.pow(rnd(), 1.3) * 230;
        const w = 12 + rnd() * 30 + lat * 0.06;
        const rel = -40 + rnd() * 140;
        const base = c.heightAt(s) - 170;
        const h = c.heightAt(s) + rel - base;
        c.toWorld(s, side * lat, 0, p);
        p.y = base;
        q.setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0));
        sc.set(w, h, w * (0.7 + rnd() * 0.6));
        m4.compose(p, q, sc);
        im.setMatrixAt(k++, m4);
      }
      im.count = k;
      this.root.add(im);
    }

    // 雲
    const cloudMat = new THREE.SpriteMaterial({ map: this.T.cloud, transparent: true, depthWrite: false, opacity: 0.85, fog: true });
    this.clouds = [];
    for (let i = 0; i < 70; i++) {
      const s = s0 + rnd() * (s1 - s0 + 100);
      const side = rnd() < 0.5 ? -1 : 1;
      const sp = new THREE.Sprite(cloudMat);
      c.toWorld(s, side * (18 + rnd() * 160), -15 - rnd() * 70, sp.position);
      const k = 30 + rnd() * 60;
      sp.scale.set(k, k * 0.45, 1);
      this.root.add(sp);
      this.clouds.push(sp);
    }
  }

  karstGeometry(r) {
    const g = new THREE.CylinderGeometry(0.42, 0.62, 1, 9, 12, false);
    g.translate(0, 0.5, 0);
    const pos = g.attributes.position;
    const colors = [];
    const ph = r() * 10, ph2 = r() * 10;
    const rockC = new THREE.Color(0x8a8d86), greenC = new THREE.Color(0x3e6b35), darkG = new THREE.Color(0x2c4f2a), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const bulge = 1 + 0.22 * Math.sin(y * 11 + a * 3 + ph) + 0.12 * Math.sin(y * 23 + a * 5 + ph2) + (r() - 0.5) * 0.12;
      const taper = 1 - 0.55 * Math.pow(y, 2.2);
      const k = bulge * taper;
      x *= k; z *= k;
      if (y > 0.97) { x *= 0.6; z *= 0.6; y = 0.985 + r() * 0.03; }
      pos.setXYZ(i, x, y, z);
      const cliff = 0.5 + 0.5 * Math.sin(a * 4 + y * 8 + ph);
      tmp.copy(greenC).lerp(rockC, Math.max(0, cliff - 0.35) * 1.2);
      if (y > 0.85) tmp.lerp(darkG, 0.6);
      if (y < 0.3) tmp.lerp(darkG, 0.5);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }

  // ---------- ゲート・観客・ゴールステージ ----------
  makeGate(s, text, sub, c1, c2) {
    const c = this.course;
    const f = c.frame(s, _f);
    const grp = new THREE.Group();
    c.toWorld(s, 0, 0, grp.position);
    grp.rotation.y = f.yaw;
    const pm = new THREE.MeshLambertMaterial({ color: 0x1b1f2a });
    const glow = new THREE.MeshBasicMaterial({ color: 0x40e0ff });
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6, 0.55), pm);
      pillar.position.set(side * (HALF_W + 0.9), 3, 0);
      grp.add(pillar);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5.6, 0.58), glow);
      strip.position.set(side * (HALF_W + 0.9) - side * 0.22, 3, 0);
      grp.add(strip);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * (HALF_W + 1.2), 1.9, 0.45), pm);
    beam.position.set(0, 6.2, 0);
    grp.add(beam);
    const bt = bannerTexture(text, sub, c1, c2);
    for (const z of [0.24, -0.24]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(2 * (HALF_W + 1.1), 1.75), new THREE.MeshBasicMaterial({ map: bt, fog: false }));
      pl.position.set(0, 6.2, z);
      if (z < 0) pl.rotation.y = Math.PI;
      grp.add(pl);
    }
    this.root.add(grp);
    return grp;
  }

  addCrowd(sa, sb) {
    const c = this.course;
    const mat = new THREE.MeshBasicMaterial({ map: this.T.crowd, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    for (let s = sa; s < sb; s += 9.5) {
      for (const side of [-1, 1]) {
        if (this.rnd() < 0.15) continue;
        const f = c.frame(s + 4.75, _f);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), mat);
        c.toWorld(s + 4.75, side * (HALF_W + 1.5), 0.7, m.position);
        m.position.y = this.course.heightAt(s + 4.75) + 0.9;
        m.rotation.y = f.yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        m.userData.baseY = m.position.y;
        m.userData.ph = this.rnd() * 6;
        this.root.add(m);
        this.crowds.push(m);
      }
    }
  }

  buildGates() {
    const c = this.course;
    this.makeGate(0, 'START', 'SKY STAIRS RUSH', '#00c6ff', '#7b2dff');
    c.checkpoints.forEach((cp, i) => this.makeGate(cp, `CHECKPOINT ${i + 1}`, null, '#ff9f1c', '#ff2d95'));
    this.makeGate(c.finishS, 'GOAL', '↓ FINISH ↓', '#ff2d95', '#ffcc00');
    // ゴールライン
    const g = new GeoBuilder(c);
    const w = C(0xffffff);
    const s = c.finishS;
    g.quad(g.v(s - 0.6, -HALF_W, 0.03, w, 0, 0), g.v(s - 0.6, HALF_W, 0.03, w, 1, 0), g.v(s + 0.6, HALF_W, 0.03, w, 1, 1), g.v(s + 0.6, -HALF_W, 0.03, w, 0, 1));
    const ck = this.T.checker.clone();
    ck.needsUpdate = true;
    this.root.add(new THREE.Mesh(g.build(), new THREE.MeshBasicMaterial({ map: ck, side: THREE.DoubleSide })));

    // 観客
    this.addCrowd(-40, 45);
    for (const cp of c.checkpoints) this.addCrowd(cp - 40, cp + 15);
    this.addCrowd(c.finishS - 90, c.finishS + 60);

    // ゴールの大型ビジョン
    const f = c.frame(c.finishS + 55, _f);
    const st = new THREE.Group();
    c.toWorld(c.finishS + 55, 0, 0, st.position);
    st.rotation.y = f.yaw;
    const scr = new THREE.Mesh(new THREE.BoxGeometry(15, 8.5, 0.6), [
      new THREE.MeshLambertMaterial({ color: 0x111 }), new THREE.MeshLambertMaterial({ color: 0x111 }),
      new THREE.MeshLambertMaterial({ color: 0x111 }), new THREE.MeshLambertMaterial({ color: 0x111 }),
      new THREE.MeshBasicMaterial({ map: screenTexture(['GOAL!!', 'SKY STAIRS RUSH']), fog: false }),
      new THREE.MeshLambertMaterial({ color: 0x111 }),
    ]);
    scr.position.set(0, 7.5, 0);
    st.add(scr);
    const truss = new THREE.MeshLambertMaterial({ color: 0x333a44 });
    for (const x of [-8, 8]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12, 0.6), truss);
      t.position.set(x, 6, 0);
      st.add(t);
    }
    this.root.add(st);
  }

  // ---------- 障害物 ----------
  buildObstacles() {
    const c = this.course;
    const grey = C(0xffffff), blue = C(0x2f6dff), silver = C(0xc9d0d6), yellow = C(0xffd400), black = C(0x161616), metalDark = C(0x7d858c);
    for (const o of c.obstacles) {
      const grp = new THREE.Group();
      if (o.type === 'box' || o.type === 'tallbox') {
        const body = new GeoBuilder(c);
        body.sweptBox(o.s0, o.s1, o.u0, o.u1, -0.3, o.h1, grey);
        grp.add(new THREE.Mesh(body.build(), o.type === 'box' ? this.mats.concrete : this.mats.dark));
        const t = new GeoBuilder(c);
        const e = 0.09;
        // 上面の縁（青テープ）
        t.sweepRect(o.s0, o.s1, o.u0 + e / 2 - 0.01, o.h1 + 0.005, e, e, blue, 1);
        t.sweepRect(o.s0, o.s1, o.u1 - e / 2 + 0.01, o.h1 + 0.005, e, e, blue, 1);
        t.boxAt(o.s0 + e / 2 - 0.01, (o.u0 + o.u1) / 2, o.h1 + 0.005, e, o.u1 - o.u0 + 0.02, e, blue);
        t.boxAt(o.s1 - e / 2 + 0.01, (o.u0 + o.u1) / 2, o.h1 + 0.005, e, o.u1 - o.u0 + 0.02, e, blue);
        // 前面の縁
        t.boxAt(o.s0 - 0.01, o.u0 + e / 2, o.h1 / 2, e, e, o.h1, blue);
        t.boxAt(o.s0 - 0.01, o.u1 - e / 2, o.h1 / 2, e, e, o.h1, blue);
        t.boxAt(o.s0 - 0.01, (o.u0 + o.u1) / 2, 0.05, e, o.u1 - o.u0, e, blue);
        grp.add(new THREE.Mesh(t.build(), this.mats.tape));
      } else if (o.type === 'hurdle') {
        const g = new GeoBuilder(c);
        const sm = (o.s0 + o.s1) / 2;
        g.boxAt(sm, o.u0 + 0.06, 0.47, 0.1, 0.1, 0.95, silver);
        g.boxAt(sm, o.u1 - 0.06, 0.47, 0.1, 0.1, 0.95, silver);
        // 途中の支柱
        for (let l = o.laneA; l < o.laneB; l++) g.boxAt(sm, laneU(l) + LANE_W / 2, 0.47, 0.08, 0.08, 0.95, silver);
        g.boxAt(sm, (o.u0 + o.u1) / 2, 0.86, 0.14, o.u1 - o.u0, 0.12, blue);
        g.boxAt(sm, (o.u0 + o.u1) / 2, 0.45, 0.06, o.u1 - o.u0, 0.06, silver);
        // 足
        g.boxAt(sm, o.u0 + 0.06, 0.03, 0.8, 0.12, 0.06, metalDark);
        g.boxAt(sm, o.u1 - 0.06, 0.03, 0.8, 0.12, 0.06, metalDark);
        grp.add(new THREE.Mesh(g.build(), this.mats.flat));
      } else if (o.type === 'bar') {
        const g = new GeoBuilder(c);
        const sm = (o.s0 + o.s1) / 2;
        g.boxAt(sm, o.u0 - 0.12, 1.0, 0.14, 0.14, 2.0, silver);
        g.boxAt(sm, o.u1 + 0.12, 1.0, 0.14, 0.14, 2.0, silver);
        g.boxAt(sm, o.u0 - 0.12, 0.03, 1.0, 0.3, 0.06, metalDark);
        g.boxAt(sm, o.u1 + 0.12, 0.03, 1.0, 0.3, 0.06, metalDark);
        // トラ柄のバー
        const w = o.u1 - o.u0 + 0.3, n = Math.round(w / 0.4);
        for (let k = 0; k < n; k++) {
          const u = o.u0 - 0.15 + (k + 0.5) * (w / n);
          g.boxAt(sm, u, (o.h0 + o.h1) / 2, 0.24, w / n + 0.002, o.h1 - o.h0, k % 2 ? black : yellow);
        }
        grp.add(new THREE.Mesh(g.build(), this.mats.flat));
      } else if (o.type === 'ramp') {
        const body = new GeoBuilder(c);
        const top = (s) => (o.h1 * (s - o.s0)) / (o.s1 - o.s0);
        body.sweptBox(o.s0, o.s1, o.u0, o.u1, -0.2, o.h1, grey, top);
        grp.add(new THREE.Mesh(body.build(), this.mats.concrete));
        // 天面のシェブロン
        const d = new GeoBuilder(c);
        const n = 5;
        for (let i = 0; i < n; i++) {
          const a = o.s0 + ((o.s1 - o.s0) * i) / n, b = o.s0 + ((o.s1 - o.s0) * (i + 1)) / n;
          d.quad(
            d.v(a, o.u0 + 0.1, top(a) + 0.02, grey, 0, 1 - i / n),
            d.v(a, o.u1 - 0.1, top(a) + 0.02, grey, 1, 1 - i / n),
            d.v(b, o.u1 - 0.1, top(b) + 0.02, grey, 1, 1 - (i + 1) / n),
            d.v(b, o.u0 + 0.1, top(b) + 0.02, grey, 0, 1 - (i + 1) / n));
        }
        const cm = new THREE.MeshBasicMaterial({ map: this.T.chevron, transparent: true, side: THREE.DoubleSide, depthWrite: false });
        grp.add(new THREE.Mesh(d.build(), cm));
        const t = new GeoBuilder(c);
        t.sweepRect(o.s0, o.s1, o.u0 + 0.04, 0, 0.09, 0.09, blue, 1, (s) => c.heightAt(s) + top(s));
        t.sweepRect(o.s0, o.s1, o.u1 - 0.04, 0, 0.09, 0.09, blue, 1, (s) => c.heightAt(s) + top(s));
        t.boxAt(o.s1, (o.u0 + o.u1) / 2, o.h1, 0.1, o.u1 - o.u0, 0.1, blue);
        grp.add(new THREE.Mesh(t.build(), this.mats.tape));
      }
      o.mesh = grp;
      this.root.add(grp);
    }
  }

  // ---------- 滑り台・ブーストパッド ----------
  buildZones() {
    const c = this.course;
    const blue = C(0x2f6dff), yellow = C(0xffd400);
    for (const z of c.zones) {
      if (z.type === 'chute') {
        const g = new GeoBuilder(c);
        const uc = laneU(z.lane), R = 0.78;
        const sec = [];
        for (let k = 0; k <= 12; k++) {
          const a = Math.PI + (Math.PI * k) / 12;
          sec.push([uc + R * Math.cos(a), 0.82 + R * Math.sin(a)]);
        }
        const white = C(0xffffff);
        g.sweepSection(z.s0, z.s1, sec, sec.map(() => white), 1);
        const m = new THREE.Mesh(g.build(), this.mats.metal);
        this.root.add(m);
        const t = new GeoBuilder(c);
        t.sweepRect(z.s0, z.s1, uc - R, 0.84, 0.1, 0.1, blue, 1);
        t.sweepRect(z.s0, z.s1, uc + R, 0.84, 0.1, 0.1, blue, 1);
        // 入口の黄色いX
        t.boxAt(z.s0, uc, 0.84, 0.08, 2 * R, 0.08, yellow);
        this.root.add(new THREE.Mesh(t.build(), this.mats.tape));
        z.mesh = m;
      } else if (z.type === 'boost') {
        const g = new GeoBuilder(c);
        const w = C(0xffffff);
        const u0 = z.u0 + 0.1, u1 = z.u1 - 0.1;
        g.quad(g.v(z.s0, u0, 0.05, w, 0, 1.5), g.v(z.s0, u1, 0.05, w, 1, 1.5), g.v(z.s1, u1, 0.05, w, 1, 0), g.v(z.s1, u0, 0.05, w, 0, 0));
        const tex = this.T.chevron.clone();
        tex.needsUpdate = true;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0x66ffff });
        this.boostMats.push(mat);
        const m = new THREE.Mesh(g.build(), mat);
        this.root.add(m);
        const base = new GeoBuilder(c);
        const dk = C(0x1a2a6a);
        base.quad(base.v(z.s0 - 0.2, z.u0, 0.03, dk), base.v(z.s0 - 0.2, z.u1, 0.03, dk), base.v(z.s1 + 0.2, z.u1, 0.03, dk), base.v(z.s1 + 0.2, z.u0, 0.03, dk));
        this.root.add(new THREE.Mesh(base.build(), this.mats.flat));
      }
    }
  }

  // ---------- アイテム ----------
  buildItems() {
    const c = this.course;
    const coins = c.items.filter((i) => i.type === 'coin');
    const cg = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 20);
    cg.rotateX(Math.PI / 2);
    const cm = new THREE.MeshPhongMaterial({ color: 0xffc928, emissive: 0x8a5200, specular: 0xffffff, shininess: 70 });
    this.coinMesh = new THREE.InstancedMesh(cg, cm, Math.max(1, coins.length));
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.frustumCulled = false;
    coins.forEach((it, i) => { it.inst = i; });
    this.coinItems = coins;
    this.root.add(this.coinMesh);
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3();
    this._e = new THREE.Euler();
    for (const it of coins) this.setCoinMatrix(it, 0);

    const glowMat = (color) => new THREE.SpriteMaterial({ map: this.T.dot, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
    for (const it of c.items) {
      if (it.type === 'coin') continue;
      const g = new THREE.Group();
      if (it.type === 'gem') {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0xff00ff, shininess: 100, flatShading: true }));
        m.scale.set(1, 1.35, 1);
        g.add(m);
        const s = new THREE.Sprite(glowMat(0xff66ff)); s.scale.set(2.6, 2.6, 1); g.add(s);
        it.inner = m; it.glow = s;
      } else if (it.type === 'clock') {
        const m = new THREE.Group();
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 24).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x335566 }));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 8, 24), new THREE.MeshLambertMaterial({ color: 0x00e5ff, emissive: 0x007799 }));
        const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.04), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        h1.position.set(0, 0.12, 0.07);
        const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.04), new THREE.MeshBasicMaterial({ color: 0xff2d55 }));
        h2.position.set(0.09, 0, 0.07);
        m.add(face, ring, h1, h2);
        g.add(m);
        const s = new THREE.Sprite(glowMat(0x00e5ff)); s.scale.set(2.4, 2.4, 1); g.add(s);
        it.inner = m;
      } else if (it.type === 'star') {
        const shape = new THREE.Shape();
        for (let k = 0; k < 10; k++) {
          const r = k % 2 ? 0.24 : 0.55, a = (k / 10) * Math.PI * 2 + Math.PI / 2;
          if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 1 });
        geo.center();
        const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xffe14d, emissive: 0xff7a00, shininess: 80 }));
        g.add(m);
        const s = new THREE.Sprite(glowMat(0xffb300)); s.scale.set(2.8, 2.8, 1); g.add(s);
        it.inner = m;
      }
      c.toWorld(it.s, it.u, it.h, g.position);
      it.mesh = g;
      this.root.add(g);
    }
  }

  setCoinMatrix(it, rot) {
    if (it.collected) {
      this._s.set(0, 0, 0);
    } else {
      const k = it.scale ?? 1;
      this._s.set(k, k, k);
    }
    this.course.toWorld(it.s, it.u, it.h, this._p);
    this._e.set(0, rot, 0);
    this._q.setFromEuler(this._e);
    this._m4.compose(this._p, this._q, this._s);
    this.coinMesh.setMatrixAt(it.inst, this._m4);
  }

  update(dt, playerS, camera, fever) {
    this.time += dt;
    const t = this.time;
    this.sky.position.copy(camera.position);
    this.mountains.position.set(camera.position.x, camera.position.y + 60, camera.position.z);
    this.skyU.time.value = t;
    this.skyU.fever.value += ((fever ? 1 : 0) - this.skyU.fever.value) * Math.min(1, dt * 3);
    const fv = this.skyU.fever.value;
    if (fv > 0.001) {
      const hc = new THREE.Color(hsv(t * 0.12, 0.5, 1));
      this.scene.fog.color.copy(this.fogBase).lerp(hc, fv * 0.55);
    } else this.scene.fog.color.copy(this.fogBase);

    // コイン回転（近くだけ）
    const rot = t * 4;
    const lo = playerS - 6, hi = playerS + 180;
    let dirty = false;
    for (const it of this.coinItems) {
      if (it.s < lo - 30 || it.s > hi) continue;
      if (it.collected && it._hidden) continue;
      this.setCoinMatrix(it, rot + it.s * 0.15);
      if (it.collected) it._hidden = true;
      dirty = true;
    }
    if (dirty) this.coinMesh.instanceMatrix.needsUpdate = true;

    for (const it of this.course.items) {
      if (!it.mesh) continue;
      if (it.collected) { it.mesh.visible = false; continue; }
      if (it.s < lo || it.s > hi) continue;
      it.mesh.visible = true;
      this.course.toWorld(it.s, it.u, it.h + Math.sin(t * 3 + it.s) * 0.12, it.mesh.position);
      if (it.inner) it.inner.rotation.y = t * 2.5;
      if (it.type === 'gem' && it.inner) {
        it.inner.material.emissive.setHex(hsv(t * 0.5 + it.s * 0.01, 1, 1));
        it.glow.material.color.setHex(hsv(t * 0.5 + it.s * 0.01, 0.7, 1));
      }
    }

    for (const m of this.crowds) {
      m.position.y = m.userData.baseY + Math.abs(Math.sin(t * 7 + m.userData.ph)) * 0.25;
    }
    for (const bm of this.boostMats) bm.map.offset.y = (t * 2.5) % 1;
  }
}
