// ローポリのランナー（プロシージャルアニメーション）
import * as THREE from '../lib/three.module.min.js';

function part(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

export class RunnerModel {
  constructor({ ghost = false } = {}) {
    const mk = (color, extra = {}) => ghost
      ? new THREE.MeshBasicMaterial({ color: 0x66f6ff, transparent: true, opacity: 0.28, depthWrite: false })
      : new THREE.MeshLambertMaterial({ color, ...extra });
    const M = {
      top: mk(0x2b6cff, { emissive: 0x0a1f66 }),
      pants: mk(0x1c1c22),
      skin: mk(0xd9a27a),
      shoe: mk(0xffffff, { emissive: 0x333333 }),
      band: mk(0x111111),
      hair: mk(0x1a1410),
      accent: mk(0x00f0ff, { emissive: 0x00a0b0 }),
    };
    this.mats = M;
    this.root = new THREE.Group();       // 位置・向き
    this.flip = new THREE.Group();       // 宙返り用ピボット（重心）
    this.flip.position.y = 0.95;
    this.root.add(this.flip);
    this.body = new THREE.Group();
    this.body.position.y = -0.95;
    this.flip.add(this.body);

    // 腰
    this.hips = new THREE.Group();
    this.hips.position.y = 0.95;
    this.body.add(this.hips);
    // 胴体
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const chest = part(new THREE.BoxGeometry(0.44, 0.56, 0.26), M.top, 0, 0.3, 0);
    this.torso.add(chest);
    const stripe = part(new THREE.BoxGeometry(0.45, 0.06, 0.27), M.accent, 0, 0.42, 0);
    this.torso.add(stripe);
    const hood = part(new THREE.BoxGeometry(0.3, 0.14, 0.14), M.top, 0, 0.56, 0.12);
    this.torso.add(hood);
    // 頭
    this.head = new THREE.Group();
    this.head.position.y = 0.66;
    this.torso.add(this.head);
    this.head.add(part(new THREE.SphereGeometry(0.15, 12, 10), M.skin, 0, 0.1, 0));
    const hair = part(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, 0, 0.12, 0.01);
    this.head.add(hair);
    // 腕
    this.arms = [];
    for (const side of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(side * 0.29, 0.52, 0);
      this.torso.add(sh);
      sh.add(part(new THREE.BoxGeometry(0.12, 0.3, 0.12), M.top, 0, -0.14, 0));
      const el = new THREE.Group();
      el.position.y = -0.3;
      sh.add(el);
      el.add(part(new THREE.BoxGeometry(0.1, 0.28, 0.1), M.skin, 0, -0.13, 0));
      el.add(part(new THREE.BoxGeometry(0.11, 0.06, 0.11), M.band, 0, -0.22, 0));
      el.add(part(new THREE.BoxGeometry(0.1, 0.1, 0.06), M.skin, 0, -0.31, 0));
      this.arms.push({ sh, el, side });
    }
    // 脚
    this.legs = [];
    for (const side of [-1, 1]) {
      const hp = new THREE.Group();
      hp.position.set(side * 0.12, 0, 0);
      this.hips.add(hp);
      hp.add(part(new THREE.BoxGeometry(0.17, 0.46, 0.18), M.pants, 0, -0.22, 0));
      const kn = new THREE.Group();
      kn.position.y = -0.45;
      hp.add(kn);
      kn.add(part(new THREE.BoxGeometry(0.15, 0.44, 0.15), M.pants, 0, -0.21, 0));
      const ft = part(new THREE.BoxGeometry(0.14, 0.09, 0.28), M.shoe, 0, -0.46, -0.06);
      kn.add(ft);
      this.legs.push({ hp, kn, side });
    }
    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.phase = 0;
    this.lean = 0;
  }

  setOpacity(o) {
    for (const m of Object.values(this.mats)) {
      m.transparent = o < 1;
      m.opacity = o;
    }
  }

  // state: {mode:'run'|'air'|'slide'|'stumble'|'idle'|'chute'|'cheer', speed, flip(0..1), vy, laneVel}
  animate(dt, st) {
    const sp = st.speed || 0;
    this.phase += dt * (sp > 0.5 ? 4.2 + sp * 0.42 : 0);
    const p = this.phase;
    const L = this.legs, A = this.arms;
    let torsoX = 0, headX = 0, hipsY = 0.95, bodyRotX = 0;
    const set = (legL, kneeL, legR, kneeR, armL, elL, armR, elR, armSpreadL = 0, armSpreadR = 0) => {
      // 正: 脚を前へ / 膝は正の値で自然に曲がる
      L[0].hp.rotation.x = legL; L[0].kn.rotation.x = -kneeL;
      L[1].hp.rotation.x = legR; L[1].kn.rotation.x = -kneeR;
      A[0].sh.rotation.x = armL; A[0].el.rotation.x = elL; A[0].sh.rotation.z = -armSpreadL;
      A[1].sh.rotation.x = armR; A[1].el.rotation.x = elR; A[1].sh.rotation.z = armSpreadR;
    };
    switch (st.mode) {
      case 'idle': {
        const b = Math.sin(this.phase * 0 + performance.now() * 0.003) * 0.03;
        set(0.05, 0.1, -0.05, 0.1, 0.1, 0.2, -0.1, 0.2, 0.1, 0.1);
        hipsY = 0.95 + b;
        break;
      }
      case 'cheer': {
        const t = performance.now() * 0.012;
        set(0.1, 0.2, -0.1, 0.2, Math.PI * 0.95 + Math.sin(t) * 0.2, 0.3, Math.PI * 0.95 - Math.sin(t) * 0.2, 0.3, 0.4, 0.4);
        hipsY = 0.95 + Math.abs(Math.sin(t)) * 0.12;
        break;
      }
      case 'run':
      case 'stumble': {
        const s = Math.sin(p), c = Math.cos(p);
        const amp = Math.min(1, 0.5 + sp / 30);
        set(
          s * 0.95 * amp, Math.max(0, -c) * 1.4 * amp + 0.15,
          -s * 0.95 * amp, Math.max(0, c) * 1.4 * amp + 0.15,
          -s * 0.9 * amp, 1.4, s * 0.9 * amp, 1.4, 0.08, 0.08,
        );
        // 前傾（走り）
        torsoX = -0.28;
        hipsY = 0.93 + Math.abs(Math.sin(p)) * 0.07;
        if (st.mode === 'stumble') {
          torsoX = -0.6 + Math.sin(performance.now() * 0.03) * 0.2;
          A[0].sh.rotation.z = -1.2 + Math.sin(performance.now() * 0.04) * 0.4;
          A[1].sh.rotation.z = 1.2 - Math.sin(performance.now() * 0.04) * 0.4;
        }
        break;
      }
      case 'air': {
        const tuck = st.flip > 0 ? 1 : Math.min(1, Math.max(0, (st.vy + 4) / 10));
        set(1.0 + tuck * 0.6, 1.3 + tuck * 0.6, 0.5 + tuck * 1.0, 1.0 + tuck * 0.9,
          2.5 - tuck * 1.2, 0.4, 2.7 - tuck * 1.3, 0.5, 0.35, 0.35);
        torsoX = -0.15 - tuck * 0.4;
        break;
      }
      case 'slide':
      case 'chute': {
        set(1.45, 0.15, 1.2, 0.5, -0.5, 0.3, -0.4, 0.3, 0.6, 0.6);
        torsoX = 0.85;
        headX = -0.6;
        hipsY = 0.35;
        if (st.mode === 'chute') {
          A[0].sh.rotation.z = -1.0; A[1].sh.rotation.z = 1.0;
          A[0].sh.rotation.x = -0.3; A[1].sh.rotation.x = -0.3;
        }
        break;
      }
    }
    this.torso.rotation.x = torsoX;
    this.head.rotation.x = headX;
    this.hips.position.y += (hipsY - this.hips.position.y) * Math.min(1, dt * 18);
    // 宙返り（前方）
    this.flip.rotation.x = st.flip > 0 ? -Math.PI * 2 * easeFlip(st.flip) : bodyRotX;
    // レーン移動の傾き
    this.lean += ((st.laneVel || 0) * -0.06 - this.lean) * Math.min(1, dt * 10);
    this.flip.rotation.z = this.lean;
  }
}

function easeFlip(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
