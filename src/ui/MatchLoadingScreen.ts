/**
 * MatchLoadingScreen.ts
 * Authentic AIRSKIDO Neo-Brutalist Arcade Match Loading Screen.
 * Perfectly styled to match AIRSKIDO's signature yellow, white & black cartoon aesthetic:
 * warm radial sunburst gradient, chunky 4px borders, hard drop shadows, Fredoka typography,
 * spinning alloy tire, and mode-specific tactical gamer quotes.
 */

import airskidoLogoUrl from '../logo/airskido_logo.webp';

export type LoadingMode = 'classic' | 'hardcore' | 'time_sprint' | 'rumble';

// ── MODE-SPECIFIC ARCADE QUOTES (NO AUTHORS, PURE GAMER TIPS) ──────────
export const RUMBLE_QUOTES: string[] = [
  "🌱 In the game, trees can save you. In real life, you can save them.",
  "🌳 Trees might save you in the game. Plant one to save the planet.",
  "Smash into enemies at full speed for instant knockouts.",
  "Chain double and triple smashes to dominate the arena."
];

export const HARDCORE_QUOTES: string[] = [
  "No abilities, no gimmicks. Win on pure driving skill.",
  "Raw skill over raw speed. One mistake and the track punishes you.",
  "No room for error. Survival here takes razor-sharp reflexes and absolute control.",
  "Watch the swing rhythm of the kinetic hammers — timing is everything."
];

export const CLASSIC_QUOTES: string[] = [
  "You only have 3 Nitros for the whole race. Save them for the long straights.",
  "Hold drift through sharp corners and release for a clean mini-turbo burst.",
  "Hit the glowing yellow boost chevrons on the ground for instant speed.",
  "Brake before entering a sharp turn, hit the inside apex, and accelerate out.",
  "Smooth steering preserves momentum. Oversteering just kills your speed."
];

export const TIME_SPRINT_QUOTES: string[] = [
  "Every millisecond matters. Find the tightest racing line around each apex.",
  "Zero collisions, zero rivals. Pure 1-lap speed against the clock.",
  "No abilities, no luck. Beat the clock and set the ultimate lap record."
];

export class MatchLoadingScreen {
  private overlay: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private quoteTextEl: HTMLElement | null = null;
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
    overlay.className = 'match-loading-overlay';

    overlay.innerHTML = `
      <div id="match-loading-card" class="match-loading-card">
        <!-- Top Rainbow Deco Strip -->
        <div class="match-loading-strip"></div>

        <!-- AIRSKIDO Logo -->
        <div class="match-loading-logo-wrap">
          <img src="${airskidoLogoUrl}" alt="AIRSKIDO" class="match-loading-brand-img" onerror="this.onerror=null;this.src='./logo/airskido_logo.webp';" />
        </div>

        <!-- Mode Badge -->
        <div class="match-loading-badge">
          <span class="match-loading-dot"></span>
          <span id="match-loading-title">PREPARING MATCH...</span>
        </div>

        <!-- Quote Card Box (Clean, Direct Gamer Tip) -->
        <div class="match-loading-quote-box">
          <div id="match-loading-quote" class="match-loading-quote-text">
            “No abilities, no gimmicks. Win on pure driving skill.”
          </div>
        </div>

        <!-- Precision Chunky Loading Bar -->
        <div class="match-loading-bar-wrap">
          <div id="match-loading-bar" class="match-loading-bar-fill"></div>
        </div>

        <!-- Status Tag -->
        <div class="match-loading-status-wrap">
          <span id="match-loading-status">SYNCHRONIZING SQUADS & TRACK...</span>
          <span class="match-loading-pill">AIRSKIDO.IO</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    this.overlay = overlay;
    this.titleEl = document.getElementById('match-loading-title');
    this.quoteTextEl = document.getElementById('match-loading-quote');
    this.progressBarEl = document.getElementById('match-loading-bar');
    this.statusTextEl = document.getElementById('match-loading-status');
  }

  /**
   * Show the Match Loading Screen with a mode-specific random gamer quote and animated progress bar
   * @param title Custom header title (e.g. "CLASSIC GRAND PRIX")
   * @param durationMs Duration in ms before auto-fading out (default: 2800ms)
   * @param mode Target game mode to select appropriate quotes ('classic' | 'hardcore' | 'time_sprint' | 'rumble')
   * @param onComplete Callback invoked when the screen finishes fading out
   */
  public show(
    title?: string,
    durationMs: number = 2800,
    mode: LoadingMode = 'classic',
    onComplete?: () => void
  ) {
    if (!this.overlay) this.createDOM();
    if (!this.overlay) return;

    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Pick a random quote based on the current mode
    let pool: string[];
    switch (mode) {
      case 'rumble':
        pool = RUMBLE_QUOTES;
        break;
      case 'hardcore':
        pool = HARDCORE_QUOTES;
        break;
      case 'time_sprint':
        pool = TIME_SPRINT_QUOTES;
        break;
      case 'classic':
      default:
        pool = CLASSIC_QUOTES;
        break;
    }
    const randomIdx = Math.floor(Math.random() * pool.length);
    const selectedQuote = pool[randomIdx];

    if (this.titleEl) {
      this.titleEl.innerText = title || 'PREPARING MATCH...';
    }
    if (this.quoteTextEl) {
      this.quoteTextEl.innerText = `“${selectedQuote}”`;
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
    const card = document.getElementById('match-loading-card');
    if (card) {
      card.style.transform = 'scale(0.96) translateY(8px)';
      card.style.opacity = '0';
    }

    requestAnimationFrame(() => {
      if (this.overlay) this.overlay.style.opacity = '1';
      if (card) {
        card.style.transform = 'scale(1) translateY(0)';
        card.style.opacity = '1';
      }
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
    const card = document.getElementById('match-loading-card');
    if (card) {
      card.style.transform = 'scale(0.97) translateY(-6px)';
      card.style.opacity = '0';
    }
    this.isVisible = false;

    setTimeout(() => {
      if (this.overlay) {
        this.overlay.style.display = 'none';
      }
      if (card) {
        card.style.transform = 'scale(0.96) translateY(8px)';
      }
      if (onComplete) onComplete();
    }, 420);
  }
}

export const matchLoadingScreen = new MatchLoadingScreen();
