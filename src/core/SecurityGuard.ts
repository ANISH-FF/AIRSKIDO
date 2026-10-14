/**
 * SecurityGuard.ts — Client-Side Anti-Inspect & Asset Shield
 * 
 * Provides:
 * 1. Disables Right-Click Context Menu (Prevents casual "Inspect Element").
 * 2. Blocks Developer Keyboard Shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S).
 * 3. Prevents Canvas / Asset Dragging & Selection.
 * 4. Active DevTools Protection & Anti-Tamper Console Guard.
 * 5. Production Environment Defense (Allows debugging in local dev if needed).
 */

export class SecurityGuard {
  private static isInitialized = false;

  public static init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const isProduction = !import.meta.env.DEV;

    // 1. Disable Right-Click Context Menu across game
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    }, { capture: true });

    // 2. Block Developer Shortcuts & Save Page Keys
    window.addEventListener('keydown', (e) => {
      // F12 key
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      if (ctrlOrMeta) {
        // Ctrl+Shift+I (Inspect), Ctrl+Shift+J (Console), Ctrl+Shift+C (Inspect Element)
        if (e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Ctrl+U (View Source)
        if (e.key === 'u' || e.key === 'U') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Ctrl+S (Save Page HTML & Assets)
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    }, { capture: true });

    // 3. Prevent dragging game canvas and graphics
    document.addEventListener('dragstart', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'CANVAS' || (e.target as HTMLElement)?.tagName === 'IMG') {
        e.preventDefault();
      }
    });

    // 4. Production DevTools Monitor & Console Guard
    if (isProduction) {
      // Print Security Warning Banner in console
      const titleStyle = 'color: #EF4444; font-size: 26px; font-weight: 900; -webkit-text-stroke: 1px #000;';
      const msgStyle = 'color: #0F172A; font-size: 14px; font-weight: 700; line-height: 1.5;';
      console.log('%c⛔ AIRSKIDO SHIELD ACTIVE', titleStyle);
      console.log(
        '%cReverse engineering, asset scraping, or tampering with AIRSKIDO game engine is strictly prohibited.\nAll race data is validated via server physics anti-cheat.',
        msgStyle
      );

      // Periodic console sanitization in production
      setInterval(() => {
        try {
          console.clear();
          console.log('%c⛔ AIRSKIDO SHIELD ACTIVE', titleStyle);
        } catch {
          // ignore
        }
      }, 5000);
    }
  }
}
