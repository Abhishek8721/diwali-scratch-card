/**
 * scratch.js – Interactive canvas scratch card engine
 */

// ─── Polyfill for CanvasRenderingContext2D.roundRect ──────────────────────────
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
    const { tl = 0, tr = 0, br = 0, bl = 0 } = r || {};
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
}

class ScratchCard {
  constructor(container, options = {}) {
    this.container    = container;
    this.width        = options.width  || 340;
    this.height       = options.height || 220;
    this.coverColor   = options.coverColor   || null; // null = use gradient
    this.coverType    = options.coverType    || 'silver'; // 'silver' | 'gold'
    this.threshold    = options.threshold    || 0.50; // 50% scratch to reveal
    this.onComplete   = options.onComplete   || (() => {});
    this.onProgress   = options.onProgress   || (() => {});

    this.canvas       = null;
    this.ctx          = null;
    this.isScratching = false;
    this.completed    = false;
    this.lastX        = 0;
    this.lastY        = 0;
    this.scratchRadius = options.scratchRadius || 28;

    this.init();
  }

  init() {
    // Create canvas overlay
    this.canvas = document.createElement('canvas');
    this.canvas.width  = this.width;
    this.canvas.height = this.height;
    this.canvas.classList.add('scratch-overlay');
    this.canvas.style.cssText = `
      position: absolute; top: 0; left: 0;
      width: 100%; height: 100%;
      border-radius: 20px;
      cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%23FFD700' stroke='%23FF6B00' stroke-width='2'/%3E%3Ctext x='16' y='21' text-anchor='middle' font-size='14' fill='%231a0533'%3E%E2%9C%A6%3C/text%3E%3C/svg%3E") 16 16, crosshair;
      touch-action: none;
      user-select: none;
    `;

    this.ctx = this.canvas.getContext('2d');
    this.drawCover();
    this.container.style.position = 'relative';
    this.container.appendChild(this.canvas);
    this.attachEvents();
  }

  drawCover() {
    const ctx = this.ctx;
    const w   = this.width;
    const h   = this.height;

    if (this.coverType === 'gold') {
      // Golden premium cover
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0,    '#B8860B');
      grad.addColorStop(0.2,  '#FFD700');
      grad.addColorStop(0.4,  '#DAA520');
      grad.addColorStop(0.6,  '#FFD700');
      grad.addColorStop(0.8,  '#FFA500');
      grad.addColorStop(1,    '#B8860B');
      ctx.fillStyle = grad;
    } else {
      // Silver default
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0,    '#8A8A8A');
      grad.addColorStop(0.3,  '#D0D0D0');
      grad.addColorStop(0.5,  '#F0F0F0');
      grad.addColorStop(0.7,  '#C0C0C0');
      grad.addColorStop(1,    '#808080');
      ctx.fillStyle = grad;
    }

    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 20);
    ctx.fill();

    // Shimmer stripes
    ctx.globalAlpha = 0.15;
    for (let i = -h; i < w + h; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 20, 0);
      ctx.lineTo(i + 20 - h, h);
      ctx.lineTo(i - h, h);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pattern dots
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = this.coverType === 'gold' ? '#8B4513' : '#555';
    for (let x = 15; x < w; x += 25) {
      for (let y = 15; y < h; y += 25) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Label
    ctx.fillStyle = this.coverType === 'gold' ? 'rgba(60,20,0,0.6)' : 'rgba(80,80,80,0.5)';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦ SCRATCH HERE ✦', w / 2, h / 2 - 10);
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillText('Rub to reveal your prize!', w / 2, h / 2 + 15);

    // Festive stars
    const starPositions = [[30, 30], [w-30, 30], [30, h-30], [w-30, h-30]];
    starPositions.forEach(([sx, sy]) => {
      ctx.font = '20px serif';
      ctx.fillStyle = this.coverType === 'gold' ? 'rgba(80,30,0,0.4)' : 'rgba(100,100,100,0.4)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', sx, sy);
    });
  }

  attachEvents() {
    const c = this.canvas;

    // Mouse
    c.addEventListener('mousedown', e => { this.isScratching = true; this.scratch(e); });
    c.addEventListener('mousemove', e => { if (this.isScratching) this.scratch(e); });
    c.addEventListener('mouseup',   () => { this.isScratching = false; });
    c.addEventListener('mouseleave',() => { this.isScratching = false; });

    // Touch
    c.addEventListener('touchstart', e => { e.preventDefault(); this.isScratching = true; this.scratch(e.touches[0]); }, { passive: false });
    c.addEventListener('touchmove',  e => { e.preventDefault(); if (this.isScratching) this.scratch(e.touches[0]); }, { passive: false });
    c.addEventListener('touchend',   e => { e.preventDefault(); this.isScratching = false; }, { passive: false });
  }

  getPos(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.width  / rect.width;
    const scaleY = this.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top)  * scaleY,
    };
  }

  scratch(event) {
    if (this.completed) return;
    const { x, y } = this.getPos(event);
    const ctx = this.ctx;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();

    // Draw eraser circle
    const r = this.scratchRadius;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.9)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Connect strokes for smooth line
    if (this.lastX && this.lastY) {
      ctx.beginPath();
      ctx.lineWidth = r * 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.moveTo(this.lastX, this.lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    this.lastX = x;
    this.lastY = y;
    ctx.globalCompositeOperation = 'source-over';

    this.checkProgress();
  }

  checkProgress() {
    const imageData = this.ctx.getImageData(0, 0, this.width, this.height);
    const pixels    = imageData.data;
    let transparent = 0;

    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 128) transparent++;
    }

    const ratio = transparent / (this.width * this.height);
    this.onProgress(ratio);

    if (!this.completed && ratio >= this.threshold) {
      this.completed = true;
      this.reveal();
      this.onComplete(ratio);
    }
  }

  reveal() {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'destination-out';

    let alpha = 0;
    const fade = () => {
      alpha += 0.08;
      ctx.globalAlpha = Math.min(alpha, 1);
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      ctx.roundRect(0, 0, this.width, this.height, 20);
      ctx.fill();
      if (alpha < 1) requestAnimationFrame(fade);
      else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        this.canvas.style.pointerEvents = 'none';
      }
    };
    fade();
  }

  enable() {
    this.canvas.style.pointerEvents = 'auto';
  }
  disable() {
    this.canvas.style.pointerEvents = 'none';
  }
  destroy() {
    this.canvas.remove();
  }
}
