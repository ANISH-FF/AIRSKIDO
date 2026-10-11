/**
 * AIRSKIDO RACING // UNIVERSAL UI SCALE ENGINE
 * ================================================================
 * Resolution-Independent UI Scaling System (WebGL Responsive Architecture).
 *
 * Dynamically computes viewport-ratio scale factors and updates root CSS variables
 * (--ui-scale, --topbar-scale, --vh, --vw) on every resize and orientation change.
 * Ensures the entire Game HUD, 3D Showroom Lobby, and Navigation Bar scale fluidly
 * across desktop monitors, small laptop windows, tablets, and mobile devices
 * without component overlap, clipping, or text wrapping.
 */

export class UIScaleEngine {
  // Reference virtual canvas resolution (Standard Desktop 16:9)
  private static readonly REF_WIDTH = 1366;
  private static readonly REF_HEIGHT = 768;

  // Raised from 0.50 → 0.62 so mobile elements are always comfortably legible
  private static readonly MIN_UI_SCALE = 0.62;
  private static readonly MAX_UI_SCALE = 1.15;

  private static initialized = false;

  public static init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.update();

    // High-performance passive resize listeners
    window.addEventListener('resize', () => this.update(), { passive: true });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.update(), 80);
    });

    // Also fire on DOMContentLoaded and full load for reliability
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.update());
    }
    window.addEventListener('load', () => this.update(), { passive: true });
  }

  public static update(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Viewport-based scale factors
    const scaleX = w / this.REF_WIDTH;
    const scaleY = h / this.REF_HEIGHT;

    // Universal scale: take minimum so UI components never exceed physical screen limits
    let uiScale = Math.min(scaleX, scaleY);
    uiScale = Math.max(this.MIN_UI_SCALE, Math.min(this.MAX_UI_SCALE, uiScale));

    // Badge scale: side panels (APEX, Garage, Event card) need to stay readable
    // on small screens — always 12% bigger than ui-scale, minimum 0.70
    const badgeScale = Math.max(0.70, Math.min(1.0, uiScale * 1.12));

    // Topbar specific horizontal scale factor
    // Full navbar cluster requires ~1020px virtual width
    let topbarScale = 1.0;
    if (w < 1050) {
      topbarScale = Math.max(0.52, Math.min(1.0, (w - 20) / 1020));
    }

    // Modal Card scale (for centered popups like Rumble, Finish, Pause, Guide, Loot)
    const modalScale = Math.max(0.46, Math.min(1.0, (w - 24) / 540, (h - 24) / 600));

    // Fullscreen Deck scale (for 4-Mode Selector and Multiplayer Hub)
    // Min lowered to 0.38 — inverted-scale container compensates layout, can go smaller
    const deckScale = Math.max(0.38, Math.min(1.0, (w - 28) / 1260, (h - 28) / 580));

    const root = document.documentElement;
    root.style.setProperty('--ui-scale', uiScale.toFixed(4));
    root.style.setProperty('--badge-scale', badgeScale.toFixed(4));
    root.style.setProperty('--topbar-scale', topbarScale.toFixed(4));
    root.style.setProperty('--modal-scale', modalScale.toFixed(4));
    root.style.setProperty('--deck-scale', deckScale.toFixed(4));
    root.style.setProperty('--vw', `${w * 0.01}px`);
    root.style.setProperty('--vh', `${h * 0.01}px`);

    // Measure the lobby-bottom-wrapper (play buttons) height so left/right badges
    // can dock precisely ABOVE them — avoids overlap on any screen size.
    requestAnimationFrame(() => {
      const bottomWrapper = document.querySelector('.lobby-bottom-wrapper') as HTMLElement | null;
      if (bottomWrapper) {
        // getBoundingClientRect().height is already the VISUAL (post-transform) height —
        // do NOT multiply by uiScale again or badges get pushed too high on desktop.
        const bh = bottomWrapper.getBoundingClientRect().height;
        const bMargin = Math.min(24, Math.max(6, h * 0.018));
        const clearance = bh + bMargin + 10;
        root.style.setProperty('--bottom-hub-height', `${clearance.toFixed(1)}px`);
      } else {
        root.style.setProperty('--bottom-hub-height', `${(110 + 20).toFixed(1)}px`);
      }
    });

    // Adaptive screen tier classes for layout reflow & drawer docking
    const body = document.body;
    body.classList.toggle('screen-compact', w < 840 || h < 560);
    body.classList.toggle('screen-mobile', w < 620);
    body.classList.toggle('screen-short', h < 640);
    body.classList.toggle('screen-ultrawide', w / h > 2.0);
  }

  /**
   * Helper to manually query current calculated UI scale
   */
  public static getScale(): number {
    const scaleStr = document.documentElement.style.getPropertyValue('--ui-scale');
    return scaleStr ? parseFloat(scaleStr) : 1.0;
  }
}
