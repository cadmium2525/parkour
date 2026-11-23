// すべてのテクスチャを Canvas で生成（画像アセット不要＝コスト0）
import * as THREE from '../lib/three.module.min.js';
import { mulberry32 } from './util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = false, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

function noise(ctx, w, h, rnd, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(rnd() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    const s = 1 + rnd() * 3;
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

export function makeTextures() {
  const rnd = mulberry32(1234);
  const T = {};

  // 石畳（階段）
  {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#9aa0a3'; g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, rnd, 5000, 0.25);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(60,64,66,${0.05 + rnd() * 0.12})`;
      g.beginPath();
      g.ellipse(rnd() * 256, rnd() * 256, 6 + rnd() * 30, 4 + rnd() * 18, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(50,52,55,0.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      let x = rnd() * 256, y = rnd() * 256;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
    T.stone = tex(c, true);
  }

  // コンクリ（障害物）
  {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#8b9195'; g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, rnd, 4000, 0.2);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(40,45,50,${0.05 + rnd() * 0.1})`;
      g.beginPath();
      g.arc(rnd() * 256, rnd() * 256, 5 + rnd() * 25, 0, Math.PI * 2);
      g.fill();
    }
    T.concrete = tex(c, true);
  }

  // 黒い壁
  {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, 128, 128);
    noise(g, 128, 128, rnd, 1500, 0.15);
    T.dark = tex(c, true);
  }

  // シェブロン（ブースト・ジャンプ台）
  {
    const [c, g] = canvas(128, 256);
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 128, 256);
    for (let i = 0; i < 4; i++) {
      const y = 20 + i * 64;
      g.fillStyle = i % 2 ? '#ffe600' : '#ff8a00';
      g.beginPath();
      g.moveTo(10, y + 40); g.lineTo(64, y); g.lineTo(118, y + 40);
      g.lineTo(118, y + 58); g.lineTo(64, y + 18); g.lineTo(10, y + 58);
      g.closePath(); g.fill();
    }
    T.chevron = tex(c, true);
  }

  // トラ柄（バー）
  {
    const [c, g] = canvas(128, 32);
    g.fillStyle = '#ffd400'; g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#111';
    for (let x = -32; x < 160; x += 32) {
      g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, 32); g.fill();
    }
    T.stripe = tex(c, true);
  }

  // 粒子用のぼんやり円
  {
    const [c, g] = canvas(64, 64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    T.dot = tex(c, false, false);
  }

  // キラッ（星型スパーク）
  {
    const [c, g] = canvas(64, 64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.2, 'rgba(255,255,255,0.4)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.moveTo(32, 0); g.lineTo(35, 29); g.lineTo(64, 32); g.lineTo(35, 35); g.lineTo(32, 64); g.lineTo(29, 35); g.lineTo(0, 32); g.lineTo(29, 29); g.closePath(); g.fill();
    T.spark = tex(c, false, false);
  }

  // 雲
  {
    const [c, g] = canvas(256, 128);
    for (let i = 0; i < 26; i++) {
      const x = 40 + rnd() * 176, y = 50 + rnd() * 40, r = 18 + rnd() * 34;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    }
    T.cloud = tex(c);
  }

  // 遠景の山並み（霧がかったカルスト）
  {
    const W = 2048, H = 512;
    const [c, g] = canvas(W, H);
    g.clearRect(0, 0, W, H);
    const layers = [
      { base: 300, amp: 120, col: [176, 196, 214], peaks: 22 },
      { base: 340, amp: 140, col: [140, 168, 180], peaks: 16 },
      { base: 390, amp: 150, col: [96, 132, 132], peaks: 12 },
      { base: 440, amp: 130, col: [66, 104, 92], peaks: 9 },
    ];
    for (const L of layers) {
      const pts = [];
      for (let i = 0; i <= L.peaks; i++) {
        pts.push({ x: (i / L.peaks) * W, h: L.base - L.amp * (0.35 + 0.65 * rnd()) });
      }
      pts[pts.length - 1].h = pts[0].h; // シームレス
      g.beginPath();
      g.moveTo(0, H);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const steps = 30;
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          // 尖ったカルスト峰：中央が高い
          const peak = Math.pow(Math.sin(Math.PI * t), 0.6);
          const y = L.base - (L.base - Math.min(a.h, b.h)) * peak * (0.9 + 0.1 * Math.sin(t * 40));
          g.lineTo(a.x + (b.x - a.x) * t, y + (rnd() - 0.5) * 3);
        }
      }
      g.lineTo(W, H);
      g.closePath();
      const gr = g.createLinearGradient(0, L.base - L.amp, 0, H);
      const [r1, g1, b1] = L.col;
      gr.addColorStop(0, `rgba(${r1},${g1},${b1},1)`);
      gr.addColorStop(0.55, `rgba(${r1 + 30},${g1 + 30},${b1 + 30},0.95)`);
      gr.addColorStop(1, 'rgba(225,232,238,0.9)');
      g.fillStyle = gr;
      g.fill();
    }
    T.mountains = tex(c, true);
  }

  // 観客
  {
    const W = 1024, H = 256;
    const [c, g] = canvas(W, H);
    g.clearRect(0, 0, W, H);
    const cols = ['#e63946', '#f1c453', '#2a9d8f', '#3a86ff', '#ff006e', '#8338ec', '#fb5607', '#ffffff', '#222222', '#06d6a0'];
    const skins = ['#f1c27d', '#e0ac69', '#c68642', '#ffdbac'];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 26; i++) {
        const x = 18 + i * 38.5 + (rnd() - 0.5) * 10 + row * 19;
        const y = row === 0 ? 120 : 170;
        const sc = row === 0 ? 0.85 : 1;
        g.save(); g.translate(x, y); g.scale(sc, sc);
        const col = cols[Math.floor(rnd() * cols.length)];
        const skin = skins[Math.floor(rnd() * skins.length)];
        const up = rnd() < 0.6;
        // 腕
        g.strokeStyle = skin; g.lineWidth = 7; g.lineCap = 'round';
        g.beginPath();
        if (up) { g.moveTo(-12, 8); g.lineTo(-22, -30); g.moveTo(12, 8); g.lineTo(22, -30); }
        else { g.moveTo(-12, 8); g.lineTo(-18, 40); g.moveTo(12, 8); g.lineTo(18, 40); }
        g.stroke();
        // 体
        g.fillStyle = col;
        if (g.roundRect) { g.beginPath(); g.roundRect(-15, 0, 30, 60, 8); g.fill(); } else g.fillRect(-15, 0, 30, 60);
        // 頭
        g.fillStyle = skin;
        g.beginPath(); g.arc(0, -12, 12, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1b1b1b';
        g.beginPath(); g.arc(0, -16, 12, Math.PI, 0); g.fill();
        if (rnd() < 0.3) { // 旗やスマホ
          g.fillStyle = rnd() < 0.5 ? '#ff2d55' : '#00e5ff';
          g.fillRect(up ? 18 : 14, up ? -55 : 20, 22, 14);
        }
        g.restore();
      }
    }
    T.crowd = tex(c, true);
  }

  // 地面のチェッカー（ゴールライン）
  {
    const [c, g] = canvas(128, 32);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
    T.checker = tex(c, true);
  }

  return T;
}

// テキスト入りの横断幕
export function bannerTexture(text, sub, c1 = '#ff2d95', c2 = '#7b2dff') {
  const [c, g] = canvas(1024, 256);
  const gr = g.createLinearGradient(0, 0, 1024, 0);
  gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = 'rgba(255,255,255,0.15)';
  for (let x = -256; x < 1024; x += 64) {
    g.beginPath(); g.moveTo(x, 256); g.lineTo(x + 128, 0); g.lineTo(x + 160, 0); g.lineTo(x + 32, 256); g.fill();
  }
  g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(10, 10, 1004, 236);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 130px "Dela Gothic One", "Arial Black", sans-serif';
  g.lineWidth = 16; g.strokeStyle = '#1a0033';
  g.strokeText(text, 512, sub ? 112 : 132);
  g.fillStyle = '#fff';
  g.fillText(text, 512, sub ? 112 : 132);
  if (sub) {
    g.font = '700 44px "Dela Gothic One", sans-serif';
    g.fillStyle = '#ffe600';
    g.fillText(sub, 512, 205);
  }
  return tex(c);
}

export function screenTexture(lines) {
  const [c, g] = canvas(1024, 576);
  const gr = g.createLinearGradient(0, 0, 0, 576);
  gr.addColorStop(0, '#0b0f3a'); gr.addColorStop(1, '#2a0845');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 576);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 150px "Dela Gothic One", sans-serif';
  const tg = g.createLinearGradient(0, 120, 0, 320);
  tg.addColorStop(0, '#fff36b'); tg.addColorStop(1, '#ff7a00');
  g.fillStyle = tg;
  g.fillText(lines[0], 512, 230);
  g.font = '700 64px "Dela Gothic One", sans-serif';
  g.fillStyle = '#7ef9ff';
  g.fillText(lines[1] || '', 512, 400);
  return tex(c);
}
