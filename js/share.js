// シェア用のスコア画像（1200x675）を Canvas で生成
import { fmtTime, fmtNum, mulberry32 } from './util.js';

export const CARD_W = 1200, CARD_H = 675;
const POP = '"Dela Gothic One", "Arial Black", sans-serif';
const RAINBOW = ['#ff2d55', '#ffcc00', '#4dff7c', '#3ff2ff', '#7b2dff', '#ff2d95'];

// ゴール時のゲーム画面（rect の範囲）を縮小コピー（WebGL描画直後に呼ぶ）
export function captureSnapshot(src, rect = null, maxSide = 1280) {
  const r = rect || { x: 0, y: 0, w: src.width, h: src.height };
  const k = Math.min(1, maxSide / Math.max(r.w, r.h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(r.w * k));
  c.height = Math.max(1, Math.round(r.h * k));
  c.getContext('2d').drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c;
}

function strokeFill(g, text, x, y, fill, stroke = '#1a0033', lw = 10) {
  g.lineJoin = 'round';
  g.lineWidth = lw;
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

function pill(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function drawShareCard(d) {
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const g = c.getContext('2d');
  const rnd = mulberry32(Math.round(d.total) || 1);

  // 背景：ゴール瞬間のスクショ（cover）
  const bg = g.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, '#1b0f4a'); bg.addColorStop(1, '#4a0e5c');
  g.fillStyle = bg; g.fillRect(0, 0, CARD_W, CARD_H);
  if (d.snap) {
    const s = d.snap;
    const k = Math.max(CARD_W / s.width, CARD_H / s.height);
    const w = s.width * k, h = s.height * k;
    g.drawImage(s, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
  }
  // 読みやすくするための暗幕
  const ov = g.createLinearGradient(0, 0, CARD_W, 0);
  ov.addColorStop(0, 'rgba(14,8,40,0.93)'); ov.addColorStop(0.5, 'rgba(14,8,40,0.6)'); ov.addColorStop(1, 'rgba(14,8,40,0.2)');
  g.fillStyle = ov; g.fillRect(0, 0, CARD_W, CARD_H);
  const ov2 = g.createLinearGradient(0, CARD_H - 140, 0, CARD_H);
  ov2.addColorStop(0, 'rgba(14,8,40,0)'); ov2.addColorStop(1, 'rgba(14,8,40,0.85)');
  g.fillStyle = ov2; g.fillRect(0, CARD_H - 140, CARD_W, 140);

  // ランク背後の放射光
  const RX = 935, RY = 330;
  g.save();
  g.translate(RX, RY);
  for (let i = 0; i < 18; i++) {
    g.rotate((Math.PI * 2) / 18);
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(255,45,149,0.10)';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-60, -520); g.lineTo(60, -520); g.closePath(); g.fill();
  }
  g.restore();
  // 紙吹雪
  for (let i = 0; i < 70; i++) {
    g.save();
    g.translate(560 + rnd() * 640, rnd() * CARD_H);
    g.rotate(rnd() * 6);
    g.fillStyle = RAINBOW[(rnd() * RAINBOW.length) | 0];
    g.globalAlpha = 0.55 + rnd() * 0.45;
    g.fillRect(-7, -3, 14, 6);
    g.restore();
  }

  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  // ロゴ
  g.font = `400 26px ${POP}`;
  strokeFill(g, 'S K Y   S T A I R S   R U S H', 62, 76, '#3ff2ff', '#1a0033', 6);
  g.font = `400 84px ${POP}`;
  const lg = g.createLinearGradient(0, 95, 0, 175);
  lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.45, '#fff36b'); lg.addColorStop(0.75, '#ff7a00'); lg.addColorStop(1, '#ff2d95');
  strokeFill(g, '天空パルクール', 56, 170, lg, '#1a0033', 14);
  g.font = `400 26px ${POP}`;
  strokeFill(g, d.courseLabel, 62, 218, '#ffffff', '#1a0033', 6);

  // スコア
  const label = (t, y) => { g.font = `400 24px ${POP}`; strokeFill(g, t, 62, y, '#b9a8ff', '#1a0033', 5); };
  label('TIME', 286);
  g.font = `400 76px ${POP}`;
  g.shadowColor = 'rgba(63,242,255,0.8)'; g.shadowBlur = 18;
  strokeFill(g, fmtTime(d.time), 58, 360, '#ffffff', '#1a0033', 10);
  g.shadowBlur = 0;
  label('SCORE', 418);
  g.font = `400 76px ${POP}`;
  g.shadowColor = 'rgba(255,150,0,0.85)'; g.shadowBlur = 18;
  strokeFill(g, `${fmtNum(d.total)}`, 58, 492, '#fff6c2', '#1a0033', 10);
  g.shadowBlur = 0;
  const w = g.measureText(fmtNum(d.total)).width;
  g.font = `400 30px ${POP}`;
  strokeFill(g, 'pt', 70 + w, 492, '#fff6c2', '#1a0033', 6);

  // サブ統計
  const chips = [`MAX COMBO ${d.maxCombo}`, `COIN ${d.coins}/${d.coinTotal}`, `PERFECT ${d.perfect}`];
  let x = 62;
  g.font = `400 24px ${POP}`;
  for (const t of chips) {
    const tw = g.measureText(t).width + 30;
    pill(g, x, 522, tw, 46, 23);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke();
    g.fillStyle = '#ffffff';
    g.fillText(t, x + 15, 554);
    x += tw + 12;
  }

  // ランク
  g.save();
  g.translate(RX, RY + 20);
  g.rotate(-0.14);
  g.textAlign = 'center';
  g.font = `400 34px ${POP}`;
  strokeFill(g, 'RANK', 0, -175, '#ffe14d', '#1a0033', 7);
  const big = d.rank.length >= 3 ? 210 : d.rank.length === 2 ? 250 : 300;
  g.font = `400 ${big}px ${POP}`;
  const rw = g.measureText(d.rank).width;
  let fill;
  if (d.rank === 'SSS' || d.rank === 'SS') {
    fill = g.createLinearGradient(-rw / 2, 0, rw / 2, 0);
    RAINBOW.forEach((col, i) => fill.addColorStop(i / (RAINBOW.length - 1), col));
  } else {
    fill = g.createLinearGradient(0, -big * 0.8, 0, 0);
    const pal = { S: ['#fffbd0', '#ffd000', '#ff8a00'], A: ['#ffd6f6', '#ff4fd8', '#c4007a'], B: ['#e0fdff', '#3ff2ff', '#008fd6'], C: ['#ffffff', '#cfcfcf', '#8a8a9a'] }[d.rank] || ['#fff', '#fff', '#fff'];
    pal.forEach((col, i) => fill.addColorStop(i / 2, col));
  }
  g.shadowColor = 'rgba(255,255,255,0.7)'; g.shadowBlur = 30;
  strokeFill(g, d.rank, 0, 70, fill, '#1a0033', 22);
  g.shadowBlur = 0;
  g.restore();

  // NEW RECORD
  if (d.isNew) {
    g.save();
    g.translate(985, 80);
    g.rotate(0.07);
    g.font = `400 34px ${POP}`;
    const t = d.isNew;
    const tw = g.measureText(t).width + 44;
    pill(g, -tw / 2, -40, tw, 58, 29);
    const ng = g.createLinearGradient(-tw / 2, 0, tw / 2, 0);
    ng.addColorStop(0, '#ff2d95'); ng.addColorStop(1, '#ff9f1c');
    g.fillStyle = ng; g.fill();
    g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
    g.textAlign = 'center';
    strokeFill(g, t, 0, 2, '#ffffff', '#5a0030', 6);
    g.restore();
  }

  // フッター
  g.textAlign = 'left';
  g.font = `400 24px ${POP}`;
  strokeFill(g, '#天空パルクール', 62, 636, '#ffe14d', '#1a0033', 5);
  g.textAlign = 'right';
  g.font = `700 22px "M PLUS Rounded 1c", sans-serif`;
  strokeFill(g, d.url.replace(/^https?:\/\//, ''), CARD_W - 40, 636, '#ffffff', '#1a0033', 5);
  return c;
}
