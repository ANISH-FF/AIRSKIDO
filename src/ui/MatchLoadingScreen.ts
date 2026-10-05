/**
 * MatchLoadingScreen.ts
 * Authentic AirSkid Neo-Brutalist Arcade Match Loading Screen.
 * Perfectly styled to match AirSkid's signature yellow, white & black cartoon aesthetic:
 * warm radial sunburst gradient, chunky 4px borders, hard drop shadows, Fredoka typography,
 * spinning alloy tire, and clean eco-driving quotes.
 */

export interface LoadingQuote {
  quote: string;
  author: string;
}

// ── CUSTOMIZABLE QUOTES LIST ──────────────────────────────────────────
// Feel free to add, remove, or modify quotes here at any time!
export const MATCH_LOADING_QUOTES: LoadingQuote[] = [
  {
    quote: "🌱 In the game, trees can save you. In real life, you can save them.",
    author: "PLANET EARTH"
  },
  {
    quote: "🌳 Trees might save you in the game. Plant one to save the planet.",
    author: "AIRSKID INITIATIVE"
  },
  {
    quote: "Straight roads are for fast cars. Sharp turns are for fast drivers.",
    author: "APEX PRINCIPLE"
  },
  {
    quote: "No shortcuts, no gimmicks. Victory is earned at the apex of every corner.",
    author: "RACING CODE"
  },
  {
    quote: "Smooth is fast. True precision on the racing line beats brute speed every time.",
    author: "DRIVER DISCIPLINE"
  },
  {
    quote: "Every millisecond counts. Master your braking point, conquer the exit.",
    author: "TRACK MASTERY"
  },
  {
    quote: "A great driver doesn't fight the track — they flow with the asphalt.",
    author: "PURE SKILL"
  }
];

export class MatchLoadingScreen {
  private overlay: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private quoteTextEl: HTMLElement | null = null;
  private quoteAuthorEl: HTMLElement | null = null;
  private progressBarEl: HTMLElement | null = null;
  private statusTextEl: HTMLElement | null = null;
  private isVisible: boolean = false;
  private hideTimeout: number | null = null;

  constructor() {
    this.createDOM();
  }

  private createDOM() {
    if (document.getElementById('match-loading-overlay')) {
      this.overlay = document.getElementById('match-loading-overlay');
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'match-loading-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 999998;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 38%, #FFF9C4 0%, #FFDE59 45%, #F59E0B 85%, #D97706 100%);
      opacity: 0;
      transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: all;
      user-select: none;
      overflow: hidden;
      padding: 20px;
      box-sizing: border-box;
      font-family: 'Fredoka', 'Space Grotesk', sans-serif;
    `;

    overlay.innerHTML = `
      <div style="
        background: #FFFDF5;
        border: 4px solid #000000;
        box-shadow: 10px 10px 0px #000000;
        border-radius: 28px;
        padding: 28px 36px;
        max-width: 540px;
        width: 100%;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        position: relative;
        overflow: hidden;
        box-sizing: border-box;
      ">
        <!-- Top Rainbow Deco Strip -->
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 6px;
          background: linear-gradient(90deg, #FFDE59 0%, #00D2FF 50%, #FFDE59 100%);
        "></div>

        <!-- AIRSKID Logo -->
        <div style="width: 100%; max-width: 280px; display: flex; justify-content: center; margin-top: 4px;">
          <img src="/src/logo/airskid_logo.webp" alt="AIRSKID" style="width: 100%; max-height: 70px; object-fit: contain;" />
        </div>

        <!-- Mode Badge -->
        <div style="
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #FFDE59;
          border: 2.5px solid #000;
          box-shadow: 3px 3px 0 #000;
          border-radius: 12px;
          padding: 6px 18px;
        ">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #EF4444; border: 1.5px solid #000;"></span>
          <span id="match-loading-title" style="
            font-family: 'Fredoka', 'Bungee', sans-serif;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 1px;
            color: #000;
            text-transform: uppercase;
          ">PREPARING MATCH...</span>
        </div>

        <!-- Quote Card Box -->
        <div style="
          width: 100%;
          background: #FFFFFF;
          border: 3px solid #000000;
          box-shadow: 4px 4px 0px #000000;
          border-radius: 18px;
          padding: 18px 22px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          min-height: 95px;
        ">
          <div id="match-loading-quote" style="
            font-family: 'Fredoka', sans-serif;
            font-size: 18px;
            font-weight: 700;
            line-height: 1.4;
            color: #0F172A;
            margin-bottom: 8px;
            letter-spacing: 0.2px;
          ">
            “Straight roads are for fast cars. Sharp turns are for fast drivers.”
          </div>
          <div id="match-loading-author" style="
            font-family: 'Fredoka', sans-serif;
            font-size: 12px;
            font-weight: 800;
            color: #0284C7;
            letter-spacing: 1.5px;
            text-transform: uppercase;
          ">
            — RACING CODE
          </div>
        </div>

        <!-- Precision Chunky Loading Bar -->
        <div style="
          width: 100%;
          height: 18px;
          background: #FFFFFF;
          border: 2.5px solid #000000;
          box-shadow: 3px 3px 0 #000000;
          border-radius: 10px;
          overflow: hidden;
          position: relative;
          box-sizing: border-box;
        ">
          <div id="match-loading-bar" style="
            width: 15%;
            height: 100%;
            background: linear-gradient(90deg, #FFDE59 0%, #00D2FF 100%);
            border-right: 2px solid #000;
            border-radius: 7px;
            transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          "></div>
        </div>

        <!-- Status Tag -->
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          font-family: 'Fredoka', sans-serif;
          font-size: 12px;
          font-weight: 800;
          color: #0F172A;
          letter-spacing: 1px;
        ">
          <span id="match-loading-status">SYNCHRONIZING SQUADS & TRACK...</span>
          <span style="
            background: #FFDE59;
            border: 1.5px solid #000;
            border-radius: 6px;
            padding: 2px 8px;
            font-size: 11px;
          ">AIRSKID NET</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    this.overlay = overlay;
    this.titleEl = document.getElementById('match-loading-title');
    this.quoteTextEl = document.getElementById('match-loading-quote');
    this.quoteAuthorEl = document.getElementById('match-loading-author');
    this.progressBarEl = document.getElementById('match-loading-bar');
    this.statusTextEl = document.getElementById('match-loading-status');
  }

  /**
   * Show the Match Loading Screen with a random quote and animated progress bar
   * @param title Custom header title (e.g. "SKY RUMBLE // ARENA CLASH")
   * @param durationMs Duration in ms before auto-fading out (default: 2200ms)
   * @param onComplete Callback invoked when the screen finishes fading out
   */
  public show(title?: string, durationMs: number = 2200, onComplete?: () => void) {
    if (!this.overlay) this.createDOM();
    if (!this.overlay) return;

    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Pick a random quote
    const randomIdx = Math.floor(Math.random() * MATCH_LOADING_QUOTES.length);
    const selectedQuote = MATCH_LOADING_QUOTES[randomIdx];

    if (this.titleEl) {
      this.titleEl.innerText = title || 'PREPARING ARENA...';
    }
    if (this.quoteTextEl) {
      this.quoteTextEl.innerText = `“${selectedQuote.quote}”`;
    }
    if (this.quoteAuthorEl) {
      this.quoteAuthorEl.innerText = `— ${selectedQuote.author}`;
    }

    if (this.progressBarEl) {
      this.progressBarEl.style.transition = 'none';
      this.progressBarEl.style.width = '15%';
    }
    if (this.statusTextEl) {
      this.statusTextEl.innerText = 'PREPARING ARENA & TRACK...';
    }

    // Display overlay
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      if (this.overlay) this.overlay.style.opacity = '1';
    });
    this.isVisible = true;

    // Animate progress smoothly over the duration
    setTimeout(() => {
      if (this.progressBarEl) {
        this.progressBarEl.style.transition = `width ${durationMs * 0.75}ms cubic-bezier(0.1, 0.8, 0.2, 1)`;
        this.progressBarEl.style.width = '96%';
      }
      if (this.statusTextEl) {
        this.statusTextEl.innerText = 'GRID READY // STARTING RACE';
      }
    }, 100);

    // Auto fade out when loading window ends
    if (durationMs > 0) {
      this.hideTimeout = window.setTimeout(() => {
        this.hide(onComplete);
      }, durationMs);
    }
  }

  /**
   * Hide the Match Loading Screen with a smooth fade-out
   */
  public hide(onComplete?: () => void) {
    if (!this.overlay || !this.isVisible) {
      if (onComplete) onComplete();
      return;
    }

    if (this.progressBarEl) {
      this.progressBarEl.style.width = '100%';
    }

    this.overlay.style.opacity = '0';
    this.isVisible = false;

    setTimeout(() => {
      if (this.overlay) {
        this.overlay.style.display = 'none';
      }
      if (onComplete) onComplete();
    }, 420);
  }
}

export const matchLoadingScreen = new MatchLoadingScreen();
