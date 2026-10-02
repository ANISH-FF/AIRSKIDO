// High-Octane Radial Speedlines / Wind Rush Streaks Effect (Deadshot.io / Warp Speed Style)
// STRICT PROMISE: Only activates during Nitro/Boost (boostTime > 0). Zero overhead & completely invisible during normal driving.

interface SpeedStreak {
  angle: number;
  radius: number;
  length: number;
  speed: number;
  width: number;
  alpha: number;
}

export class SpeedlinesOverlay {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private streaks: SpeedStreak[] = [];
  private numStreaks: number = 38;
  private intensity: number = 0;
  private isClear: boolean = true;
  private width: number = window.innerWidth;
  private height: number = window.innerHeight;

  constructor() {
    this.ensureCanvas();
  }

  private ensureCanvas(): boolean {
    if (!this.canvas) {
      this.canvas = document.getElementById('speedlines-canvas') as HTMLCanvasElement | null;
      if (this.canvas) {
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.initStreaks();
      }
    }
    return !!(this.canvas && this.ctx);
  }

  private resize() {
    if (!this.canvas) return;
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 840;
    this.numStreaks = isMobile ? 18 : 34;
    // 1x DPR is perfectly sharp for speedlines while saving 4x GPU fillrate
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.isClear = false;
  }

  private initStreaks() {
    const minDim = Math.min(this.width, this.height);
    this.streaks = [];

    for (let i = 0; i < this.numStreaks; i++) {
      this.streaks.push({
        angle: Math.random() * Math.PI * 2,
        radius: minDim * (0.28 + Math.random() * 0.4),
        length: 60 + Math.random() * 120,
        speed: 1000 + Math.random() * 1400,
        width: 1.5 + Math.random() * 2.5,
        alpha: 0.45 + Math.random() * 0.55,
      });
    }
  }

  /**
   * Called every frame in the main render loop.
   * @param dt Delta time in seconds
   * @param isBoosting True strictly when player kart has active nitro/boost (kart.boostTime > 0)
   */
  public update(dt: number, isBoosting: boolean) {
    if (!this.ensureCanvas() || !this.ctx || !this.canvas) return;
    const ctx = this.ctx;

    // Smooth attack and decay for nitro transition
    if (isBoosting) {
      this.intensity = Math.min(1.0, this.intensity + dt * 9.0); // Fast snap to full speed (0.11s)
    } else {
      this.intensity = Math.max(0.0, this.intensity - dt * 6.5); // Smooth natural fade out (0.15s)
    }

    // STRICT PROMISE: During normal driving, intensity drops to 0 and canvas stays completely clear.
    if (this.intensity <= 0.001) {
      if (!this.isClear) {
        ctx.clearRect(0, 0, this.width, this.height);
        this.isClear = true;
      }
      return;
    }

    this.isClear = false;
    const w = this.width;
    const h = this.height;
    const cx = w * 0.5;
    const cy = h * 0.52; // Slightly aligned with kart road perspective
    const minDim = Math.min(w, h);
    const innerDeadzone = minDim * 0.26; // Keeps central driving view clean and clear
    const maxRadius = Math.hypot(w, h) * 0.58;

    // Clear previous frame
    ctx.clearRect(0, 0, w, h);

    // Draw active aerodynamic wind streaks in a single fast batched pass
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#FFFFFF';

    ctx.beginPath();
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];

      // Advance streak radially outward
      s.radius += s.speed * dt * (0.85 + this.intensity * 0.65);

      // Reset streak when it travels off screen
      if (s.radius > maxRadius) {
        s.angle = Math.random() * Math.PI * 2;
        s.radius = innerDeadzone + Math.random() * (minDim * 0.2);
        s.length = 60 + Math.random() * 120;
        s.speed = 1000 + Math.random() * 1400;
        s.width = 1.5 + Math.random() * 2.5;
        s.alpha = 0.45 + Math.random() * 0.55;
      }

      const cosA = Math.cos(s.angle);
      const sinA = Math.sin(s.angle);

      // Tapered aerodynamic speed streak coordinates
      const rInner = Math.max(innerDeadzone, s.radius);
      const dynamicLen = (s.length + this.intensity * 60);
      const rOuter = Math.min(maxRadius, rInner + dynamicLen);

      const x1 = cx + cosA * rInner;
      const y1 = cy + sinA * rInner;
      const x2 = cx + cosA * rOuter;
      const y2 = cy + sinA * rOuter;

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }

    ctx.globalAlpha = Math.min(1.0, this.intensity * 0.92);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  /**
   * Resets speedlines immediately (e.g. on race reset, menu open, or respawn)
   */
  public reset() {
    this.intensity = 0;
    if (this.canvas && this.ctx && !this.isClear) {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.isClear = true;
    }
  }
}

export const speedlines = new SpeedlinesOverlay();
