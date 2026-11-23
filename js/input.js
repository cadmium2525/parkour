// 入力：キーボード / スワイプ / タップ
export class Input {
  constructor(el, h) {
    this.h = h; // {left,right,jump,slide,pause,camera,restart}
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const tg = e.target;
      if (tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT')) return; // 文章入力中は無視
      const k = e.key;
      if (k === 'Escape' && h.escape && h.escape()) return;
      let used = true;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.fire('left');
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.fire('right');
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') this.fire('jump');
      else if (k === 'ArrowDown' || k === 's' || k === 'S') this.fire('slide');
      else if (k === 'Escape' || k === 'p' || k === 'P') h.pause && h.pause();
      else if (k === 'c' || k === 'C') h.camera && h.camera();
      else if (k === 'r' || k === 'R') h.restart && h.restart();
      else if (k === 'Enter') h.enter && h.enter();
      else used = false;
      if (used && (k.startsWith('Arrow') || k === ' ')) e.preventDefault();
    });

    let start = null;
    const isUI = (t) => t && t.closest && t.closest('button, .screen, a, input, textarea, label, select');
    el.addEventListener('pointerdown', (e) => {
      if (isUI(e.target)) return;
      start = { x: e.clientX, y: e.clientY, t: performance.now(), fired: false, id: e.pointerId };
    });
    el.addEventListener('pointermove', (e) => {
      if (!start || start.fired || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      const th = Math.max(22, Math.min(window.innerWidth, window.innerHeight) * 0.045);
      if (Math.hypot(dx, dy) > th) {
        start.fired = true;
        if (Math.abs(dx) > Math.abs(dy)) this.fire(dx > 0 ? 'right' : 'left');
        else this.fire(dy < 0 ? 'jump' : 'slide');
      }
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (!start.fired && performance.now() - start.t < 350) this.fire('jump');
      start = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { start = null; });
    el.addEventListener('touchmove', (e) => { if (!isUI(e.target)) e.preventDefault(); }, { passive: false });
  }

  fire(a) {
    if (!this.enabled) return;
    this.h[a] && this.h[a]();
  }
}
