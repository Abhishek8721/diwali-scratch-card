/**
 * confetti.js – Confetti & Fireworks animation engine
 */

class ConfettiEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.fireworks = [];
    this.running = false;
    this.animId = null;
    this.resize();
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  launch(duration = 4000) {
    this.running = true;
    this.particles = [];
    this.fireworks = [];
    const end = Date.now() + duration;

    const burst = () => {
      if (!this.running) return;
      this.spawnConfettiBurst();
      if (Math.random() < 0.4) this.spawnFirework();
      if (Date.now() < end) {
        setTimeout(burst, 300);
      } else {
        // Let remaining particles finish
        setTimeout(() => this.stop(), 2000);
      }
    };

    burst();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  spawnConfettiBurst(count = 60) {
    const colors = ['#FFD700','#FF6B00','#FF0000','#FFA500','#FFEC47',
                    '#FF69B4','#00CFFF','#9B59B6','#2ECC71','#E74C3C'];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x:    Math.random() * this.canvas.width,
        y:    Math.random() * this.canvas.height * 0.5,
        w:    Math.random() * 12 + 4,
        h:    Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx:   (Math.random() - 0.5) * 8,
        vy:   Math.random() * -6 - 2,
        gravity: 0.3,
        angle:  Math.random() * Math.PI * 2,
        spin:   (Math.random() - 0.5) * 0.3,
        alpha:  1,
        life:   Math.random() * 120 + 60,
        maxLife: 180,
      });
    }
  }

  spawnFirework() {
    const x = Math.random() * this.canvas.width;
    const y = Math.random() * this.canvas.height * 0.5;
    const colors = ['#FFD700','#FF4500','#FF69B4','#00CFFF','#9B59B6'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const count = 50;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i;
      const speed = Math.random() * 5 + 2;
      this.fireworks.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        alpha: 1,
        life: Math.random() * 60 + 30,
        size: Math.random() * 3 + 1,
        gravity: 0.1,
      });
    }
  }

  loop() {
    this.animId = requestAnimationFrame(() => this.loop());
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.updateParticles();
    this.updateFireworks();
  }

  updateParticles() {
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => {
      p.x    += p.vx;
      p.y    += p.vy;
      p.vy   += p.gravity;
      p.angle += p.spin;
      p.life--;
      p.alpha = p.life / p.maxLife;

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, p.alpha);
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.angle);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      this.ctx.restore();
    });
  }

  updateFireworks() {
    this.fireworks = this.fireworks.filter(f => f.life > 0);
    this.fireworks.forEach(f => {
      f.x    += f.vx;
      f.y    += f.vy;
      f.vy   += f.gravity;
      f.vx   *= 0.97;
      f.life--;
      f.alpha = f.life / 90;

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, f.alpha);
      this.ctx.beginPath();
      this.ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      this.ctx.fillStyle = f.color;
      this.ctx.fill();
      this.ctx.restore();
    });
  }
}

// Global instance
let confettiEngine = null;

function launchCelebration(duration) {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  if (!confettiEngine) {
    confettiEngine = new ConfettiEngine(canvas);
    window.addEventListener('resize', () => confettiEngine.resize());
  }
  confettiEngine.launch(duration || 5000);
}

function stopCelebration() {
  if (confettiEngine) confettiEngine.stop();
}

