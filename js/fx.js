// ド派手エフェクト：パーティクル / 破片 / 衝撃波リング / 虹トレイル / 集中線
import * as THREE from '../lib/three.module.min.js';
import { hsv } from './util.js';

const tmpC = new THREE.Color();

export class FX {
  constructor(scene, T, level = 2) {
    this.scene = scene;
    this.level = level; // 1: 控えめ 2: ド派手
    this.N = 5000;
    const N = this.N;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.size = new Float32Array(N);
    this.alpha = new Float32Array(N);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.maxLife = new Float32Array(N);
    this.grav = new Float32Array(N);
    this.drag = new Float32Array(N);
    this.size0 = new Float32Array(N);
    this.size1 = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.uniforms = { tex: { value: T.dot }, scale: { value: 600 } };
    const mkMat = (tex) => new THREE.ShaderMaterial({
      uniforms: { tex: { value: tex }, scale: this.uniforms.scale },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 pcolor;
        uniform float scale; varying vec3 vC; varying float vA;
        void main(){ vC = pcolor; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = alpha > 0.0 ? size * scale / max(0.1, -mv.z) : 0.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D tex; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(tex, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mkMat(T.dot));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.cursor = 0;

    // 破片
    this.DN = 220;
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.DN);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.frustumCulled = false;
    this.dState = [];
    const m0 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.DN; i++) {
      this.debris.setMatrixAt(i, m0);
      this.debris.setColorAt(i, tmpC.setHex(0xffffff));
      this.dState.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0.2 });
    }
    this.dCursor = 0;
    scene.add(this.debris);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._sv = new THREE.Vector3();

    // 衝撃波リング
    this.rings = [];
    const rg = new THREE.RingGeometry(0.82, 1, 48);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      m.renderOrder = 6;
      scene.add(m);
      this.rings.push({ m, life: 0, max: 1, grow: 6 });
    }

    // トレイル（リボン）
    this.TN = 34;
    this.trailPts = [];
    const tg = new THREE.BufferGeometry();
    this.tPos = new Float32Array(this.TN * 2 * 3);
    this.tCol = new Float32Array(this.TN * 2 * 4);
    tg.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('tcolor', new THREE.BufferAttribute(this.tCol, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.TN - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, d, a, d, c);
    }
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.ShaderMaterial({
      vertexShader: `attribute vec4 tcolor; varying vec4 vC; void main(){ vC = tcolor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec4 vC; void main(){ gl_FragColor = vC;
        #include <colorspace_fragment>
      }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 4;
    scene.add(this.trail);
    this.trailTime = 0;
  }

  // ---------- パーティクル ----------
  spawn(x, y, z, vx, vy, vz, color, size, life, grav = 0, drag = 0, size1 = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.N;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    tmpC.setHex(color);
    this.col[i3] = tmpC.r; this.col[i3 + 1] = tmpC.g; this.col[i3 + 2] = tmpC.b;
    this.size0[i] = size; this.size1[i] = size1;
    this.size[i] = size;
    this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag;
    this.alpha[i] = 1;
  }

  // 球状バースト
  burst(p, n, { colors = [0xffffff], speed = 6, life = 0.7, size = 0.35, grav = 0, drag = 2, up = 0, inherit = null, rainbow = false, size1 = 0 } = {}) {
    n = Math.round(n * (this.level >= 2 ? 1 : 0.5));
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = speed * (0.4 + Math.random() * 0.8);
      let vx = r * Math.cos(th) * sp, vy = u * sp + up, vz = r * Math.sin(th) * sp;
      if (inherit) { vx += inherit.x; vy += inherit.y; vz += inherit.z; }
      const col = rainbow ? hsv(Math.random(), 0.8, 1) : colors[(Math.random() * colors.length) | 0];
      this.spawn(p.x, p.y, p.z, vx, vy, vz, col, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), grav, drag, size1);
    }
  }

  // 紙吹雪（上空から）
  confetti(p, n = 80, inherit = null) {
    n = Math.round(n * (this.level >= 2 ? 1 : 0.4));
    for (let k = 0; k < n; k++) {
      const vx = (Math.random() - 0.5) * 14, vz = (Math.random() - 0.5) * 14, vy = 6 + Math.random() * 10;
      this.spawn(p.x + (Math.random() - 0.5) * 2, p.y + 1, p.z + (Math.random() - 0.5) * 2,
        vx + (inherit ? inherit.x : 0), vy, vz + (inherit ? inherit.z : 0),
        hsv(Math.random(), 0.85, 1), 0.28 + Math.random() * 0.2, 1.2 + Math.random(), 14, 1.2);
    }
  }

  // 花火
  firework(p) {
    const hue = Math.random();
    const n = this.level >= 2 ? 90 : 40;
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = 14 + Math.random() * 3;
      this.spawn(p.x, p.y, p.z, r * Math.cos(th) * sp, u * sp, r * Math.sin(th) * sp, hsv(hue + Math.random() * 0.12, 0.8, 1), 0.6, 1.4, 6, 1.6, 0.1);
    }
    this.ring(p, hsv(hue, 0.7, 1), { grow: 30, life: 0.6, face: 'camera' });
  }

  // ---------- 破片 ----------
  shatter(p, n, colors, inherit = null, power = 10) {
    n = Math.round(n * (this.level >= 2 ? 1 : 0.5));
    for (let k = 0; k < n; k++) {
      const d = this.dState[this.dCursor];
      const i = this.dCursor;
      this.dCursor = (this.dCursor + 1) % this.DN;
      d.life = 1.4 + Math.random() * 0.6;
      d.p.set(p.x + (Math.random() - 0.5) * 1.4, p.y + Math.random() * 1.2, p.z + (Math.random() - 0.5) * 1.4);
      d.v.set((Math.random() - 0.5) * power, 4 + Math.random() * power * 0.9, (Math.random() - 0.5) * power);
      if (inherit) d.v.add(inherit);
      d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      d.s = 0.12 + Math.random() * 0.3;
      this.debris.setColorAt(i, tmpC.setHex(colors[(Math.random() * colors.length) | 0]));
    }
    this.debris.instanceColor.needsUpdate = true;
  }

  // ---------- リング ----------
  ring(p, color, { grow = 8, life = 0.45, face = 'camera', normal = null, start = 0.3 } = {}) {
    const r = this.rings.find((x) => x.life <= 0) || this.rings[0];
    r.life = life; r.max = life; r.grow = grow; r.face = face; r.start = start;
    r.m.visible = true;
    r.m.position.copy(p);
    r.m.material.color.setHex(color);
    r.m.scale.setScalar(start);
    if (face === 'flat') r.m.rotation.set(-Math.PI / 2, 0, 0);
    else if (normal) r.m.lookAt(p.x + normal.x, p.y + normal.y, p.z + normal.z);
  }

  // ---------- トレイル ----------
  // left/right: ワールド座標（リボンの両端）
  pushTrail(left, right, colorFn, active) {
    this.trailPts.unshift({ l: left.clone(), r: right.clone() });
    if (this.trailPts.length > this.TN) this.trailPts.pop();
    const n = this.trailPts.length;
    for (let i = 0; i < this.TN; i++) {
      const pt = this.trailPts[Math.min(i, n - 1)];
      const a = i * 2;
      this.tPos.set([pt.l.x, pt.l.y, pt.l.z], a * 3);
      this.tPos.set([pt.r.x, pt.r.y, pt.r.z], (a + 1) * 3);
      const t = i / (this.TN - 1);
      const alpha = active ? Math.pow(1 - t, 1.5) * 0.85 : 0;
      tmpC.setHex(colorFn(t));
      this.tCol.set([tmpC.r, tmpC.g, tmpC.b, alpha], a * 4);
      this.tCol.set([tmpC.r, tmpC.g, tmpC.b, alpha * 0.4], (a + 1) * 4);
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.tcolor.needsUpdate = true;
  }

  clearTrail() { this.trailPts.length = 0; }

  update(dt, camera, viewH) {
    // パーティクル
    const N = this.N;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      const dg = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dg; this.vel[i3 + 1] = this.vel[i3 + 1] * dg - this.grav[i] * dt; this.vel[i3 + 2] *= dg;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = t < 0.3 ? t / 0.3 : 1;
      this.size[i] = this.size1[i] ? this.size1[i] + (this.size0[i] - this.size1[i]) * t : this.size0[i];
      if (this.life[i] <= 0) this.alpha[i] = 0;
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.alpha.needsUpdate = true; a.size.needsUpdate = true; a.pcolor.needsUpdate = true;
    this.uniforms.scale.value = viewH / (2 * Math.tan((camera.fov * Math.PI) / 360));

    // 破片
    let any = false;
    for (let i = 0; i < this.DN; i++) {
      const d = this.dState[i];
      if (d.life <= 0) continue;
      any = true;
      d.life -= dt;
      d.v.y -= 30 * dt;
      d.p.addScaledVector(d.v, dt);
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
      const k = d.life > 0 ? d.s * Math.min(1, d.life * 2) : 0;
      this._q.setFromEuler(d.r);
      this._sv.set(k, k, k);
      this._m.compose(d.p, this._q, this._sv);
      this.debris.setMatrixAt(i, this._m);
    }
    if (any) this.debris.instanceMatrix.needsUpdate = true;

    // リング
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(0, r.life) / r.max;
      r.m.scale.setScalar(r.start + r.grow * (1 - Math.pow(1 - t, 3)));
      r.m.material.opacity = (1 - t) * 0.7;
      if (r.face === 'camera') r.m.quaternion.copy(camera.quaternion);
      if (r.life <= 0) r.m.visible = false;
    }
  }
}

// 画面の集中線（2D キャンバス）
export class SpeedLines {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.intensity = 0;
    this.rainbow = false;
    this.t = 0;
  }
  resize(w, h, dpr) {
    this.c.width = Math.round(w * dpr * 0.5);
    this.c.height = Math.round(h * dpr * 0.5);
    this.c.style.width = w + 'px';
    this.c.style.height = h + 'px';
  }
  draw(dt) {
    const g = this.g, W = this.c.width, H = this.c.height;
    this.t += dt;
    g.clearRect(0, 0, W, H);
    const k = this.intensity;
    if (k < 0.05) return;
    const cx = W / 2, cy = H * 0.45;
    const R = Math.hypot(W, H) * 0.5;
    const n = Math.round(18 + k * 46);
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = R * (0.55 + Math.random() * 0.35 - k * 0.15);
      const len = R * (0.15 + Math.random() * 0.4) * k;
      const x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0;
      const x1 = cx + Math.cos(a) * (r0 + len), y1 = cy + Math.sin(a) * (r0 + len);
      const col = this.rainbow ? `hsla(${(Math.random() * 360) | 0},100%,70%,${0.35 + k * 0.4})` : `rgba(255,255,255,${0.18 + k * 0.4})`;
      g.strokeStyle = col;
      g.lineWidth = (1 + Math.random() * 3) * (W / 600);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
}
