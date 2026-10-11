import confetti from 'canvas-confetti';

/**
 * AIRSKIDO Arcade Celebration FX System
 * High-performance, multi-stage particle celebrations for match wins & level-ups.
 * Automatically adapts particle density on mobile to maintain 60 FPS.
 */
export class CelebrationFX {
  private static isMobile(): boolean {
    return (
      window.innerWidth <= 768 ||
      (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 0)
    );
  }

  /**
   * Multi-stage arcade fireworks celebration for match victory
   */
  public static celebrateVictory(theme: 'yellow' | 'frost' | 'blaze' = 'yellow') {
    const mobile = this.isMobile();
    const countMultiplier = mobile ? 0.65 : 1.0;

    let palette: string[];
    if (theme === 'frost') {
      palette = ['#00F0FF', '#38BDF8', '#FFFFFF', '#FFE600', '#0284C7'];
    } else if (theme === 'blaze') {
      palette = ['#FF385C', '#F87171', '#FFE600', '#FFFFFF', '#DC2626'];
    } else {
      palette = ['#FFE600', '#FFDE59', '#10B981', '#00D2FF', '#FFFFFF'];
    }

    // ── STAGE 1: Dual Corner Cannons (Angled inward towards center) ──
    try {
      confetti({
        particleCount: Math.round(55 * countMultiplier),
        angle: 60,
        spread: 55,
        origin: { x: 0.1, y: 0.82 },
        colors: palette,
        shapes: ['star', 'circle'],
        ticks: 200,
        gravity: 0.95,
        scalar: 1.1,
      });

      confetti({
        particleCount: Math.round(55 * countMultiplier),
        angle: 120,
        spread: 55,
        origin: { x: 0.9, y: 0.82 },
        colors: palette,
        shapes: ['star', 'circle'],
        ticks: 200,
        gravity: 0.95,
        scalar: 1.1,
      });
    } catch {
      // Graceful fallback for environments with standard shapes only
      confetti({
        particleCount: Math.round(60 * countMultiplier),
        spread: 70,
        origin: { y: 0.6 },
        colors: palette,
      });
    }

    // ── STAGE 2: Mid-air Center Floral Burst (Delayed by 260ms) ──
    window.setTimeout(() => {
      try {
        confetti({
          particleCount: Math.round(75 * countMultiplier),
          spread: 100,
          origin: { x: 0.5, y: 0.4 },
          colors: palette,
          shapes: ['circle', 'star'],
          ticks: 240,
          gravity: 0.8,
          scalar: 1.25,
        });
      } catch {
        confetti({
          particleCount: Math.round(70 * countMultiplier),
          spread: 90,
          origin: { x: 0.5, y: 0.5 },
          colors: palette,
        });
      }
    }, 260);

    // ── STAGE 3: Cascading Golden Star Shimmer (Delayed by 560ms) ──
    window.setTimeout(() => {
      try {
        confetti({
          particleCount: Math.round(40 * countMultiplier),
          spread: 80,
          origin: { x: 0.5, y: 0.25 },
          colors: ['#FFE600', '#FFD700', '#FFFFFF'],
          shapes: ['star'],
          ticks: 260,
          gravity: 0.65,
          scalar: 1.35,
          drift: 0.05,
        });
      } catch {
        // Fallback
      }
    }, 560);
  }

  /**
   * Spectacular Level-Up Celebration with star burst & animated bonus counter
   */
  public static celebrateLevelUp(newLevel: number, bonusCoins: number) {
    const mobile = this.isMobile();
    const countMultiplier = mobile ? 0.65 : 1.0;
    const goldPalette = ['#FFE600', '#FFD700', '#10B981', '#00D2FF', '#FFFFFF'];

    // ── Explosive Star Burst ──
    try {
      confetti({
        particleCount: Math.round(90 * countMultiplier),
        spread: 90,
        origin: { x: 0.5, y: 0.45 },
        colors: goldPalette,
        shapes: ['star', 'circle'],
        ticks: 250,
        gravity: 0.85,
        scalar: 1.3,
      });

      // Side glitter cannons
      confetti({
        particleCount: Math.round(45 * countMultiplier),
        angle: 45,
        spread: 60,
        origin: { x: 0.08, y: 0.75 },
        colors: ['#FFE600', '#10B981', '#FFFFFF'],
        shapes: ['star'],
      });

      confetti({
        particleCount: Math.round(45 * countMultiplier),
        angle: 135,
        spread: 60,
        origin: { x: 0.92, y: 0.75 },
        colors: ['#FFE600', '#00D2FF', '#FFFFFF'],
        shapes: ['star'],
      });
    } catch {
      confetti({
        particleCount: Math.round(110 * countMultiplier),
        spread: 85,
        origin: { y: 0.55 },
        colors: goldPalette,
      });
    }

    // ── Animated Coin Counter Ticker ──
    const rewardEl = document.getElementById('finish-levelup-reward-text');
    if (rewardEl && bonusCoins > 0) {
      let current = 0;
      const duration = 800; // ms
      const steps = 16;
      const increment = bonusCoins / steps;
      const interval = duration / steps;

      const timer = window.setInterval(() => {
        current = Math.min(bonusCoins, Math.round(current + increment));
        rewardEl.innerHTML = `🎁 +${current} BONUS COINS UNLOCKED!`;
        if (current >= bonusCoins) {
          window.clearInterval(timer);
          rewardEl.classList.add('reward-pulse');
        }
      }, interval);
    }
  }

  /**
   * Reward crate unlock celebration
   */
  public static celebrateCrateUnlock() {
    const mobile = this.isMobile();
    const countMultiplier = mobile ? 0.65 : 1.0;
    try {
      confetti({
        particleCount: Math.round(75 * countMultiplier),
        spread: 80,
        origin: { y: 0.55 },
        colors: ['#FF385C', '#FFE600', '#00D2FF', '#FFFFFF'],
        shapes: ['star', 'circle'],
      });
    } catch {
      confetti({
        particleCount: Math.round(80 * countMultiplier),
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }
}
