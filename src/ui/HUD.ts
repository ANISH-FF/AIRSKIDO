import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { CelebrationFX } from './CelebrationFX';
import { Track } from '../world/Track';
import { RacerProgress } from '../world/CheckpointSystem';
import { Kart } from '../entities/Kart';
import { RumbleManager, RumbleRacer, RumbleTeam } from '../world/RumbleManager';
import { economy } from '../core/Economy';
import { RecordManager } from '../core/RecordManager';
import { sounds } from '../core/Sound';
import { nameSystem } from '../core/NameSystem';

const VIP_CROWN_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" class="standing-vip-crown" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>`;

export class HUD {
  private posEl: HTMLElement;
  private lapEl: HTMLElement;
  private timeEl: HTMLElement;
  private timeBoxEl: HTMLElement | null = null;
  private pbBoxEl: HTMLElement | null = null;
  private pbTimeEl: HTMLElement | null = null;
  public isTimeSprintActive: boolean = false;
  private speedEl: HTMLElement;
  private nitroEl: HTMLElement;
  private alertEl: HTMLElement;
  private countdownEl: HTMLElement;
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;
  private cachedTrackSpline: Track | null = null;
  private trackPoints: { x: number; z: number }[] = [];
  private trackCenterX: number = 0;
  private trackCenterZ: number = 0;
  private trackScale: number = 0;
  private staticMinimapCanvas: HTMLCanvasElement | null = null;

  // Rumble Arena UI Elements
  private rumbleHudBar: HTMLElement | null = null;
  private rumbleFrostScore: HTMLElement | null = null;
  private rumbleBlazeScore: HTMLElement | null = null;
  private rumbleBoxLeft: HTMLElement | null = null;
  private rumbleBoxRight: HTMLElement | null = null;
  private rumbleLabelLeft: HTMLElement | null = null;
  private rumbleLabelRight: HTMLElement | null = null;
  private rumbleIndicatorLeft: HTMLElement | null = null;
  private rumbleIndicatorRight: HTMLElement | null = null;
  private lastRumbleFormat: string = '';
  private lastRumbleBoxLeftClass: string = '';
  private lastRumbleBoxRightClass: string = '';
  private lastRumbleLabelLeft: string = '';
  private lastRumbleLabelRight: string = '';
  private rumbleMatchTitle: HTMLElement | null = null;
  private rumbleTimerDisplay: HTMLElement | null = null;
  private killfeedContainer: HTMLElement | null = null;
  private lastKillfeedKey: string = '';
  public isRumbleModeActive: boolean = false;
  private rumbleVictoryBannerEl: HTMLElement | null = null;
  private rumbleBannerTitleEl: HTMLElement | null = null;
  private rumbleBannerSubtextEl: HTMLElement | null = null;

  private alertTimeout: number | null = null;
  private smashCombatEl: HTMLElement | null = null;
  private smashCombatTimeout: number | null = null;
  private standingsListEl: HTMLElement | null = null;
  private finishCountdownBannerEl: HTMLElement | null = null;
  private finishCountdownSecEl: HTMLElement | null = null;
  private spectatorOverlayEl: HTMLElement | null = null;
  private spectatorNameEl: HTMLElement | null = null;
  private spectatorPosEl: HTMLElement | null = null;

  // 3 Tactical Nitro Canister UI Elements
  private nitroPip1: HTMLElement | null = null;
  private nitroPip2: HTMLElement | null = null;
  private nitroPip3: HTMLElement | null = null;
  private nitroCountEl: HTMLElement | null = null;
  private touchNitroLabel: HTMLElement | null = null;
  private touchNitroBtn: HTMLElement | null = null;

  // DOM Layout Cache (Prevents continuous 60fps layout reflows)
  private lastRank: number = -1;
  private lastLapStr: string = '';
  private lastTimeStr: string = '';
  private lastSpeedStr: string = '';
  private lastNitroPct: number = -1;
  private lastNitroCharges: number = -1;
  private lastStandingsHtml: string = '';
  private minimapFrameSkip: number = 0;
  private lastRumbleFrost: string = '';
  private lastRumbleBlaze: string = '';
  private lastRumbleTitle: string = '';
  private lastRumbleTimer: string = '';
  private staticArenaMinimapCanvas: HTMLCanvasElement | null = null;
  private countdownTimeout: any = null;
  private wrongWayEl: HTMLElement | null = null;
  private isWrongWayVisible: boolean = false;

  constructor() {
    this.posEl = document.getElementById('hud-pos')!;
    this.lapEl = document.getElementById('hud-lap')!;
    this.timeEl = document.getElementById('hud-time')!;
    this.speedEl = document.getElementById('hud-speed')!;
    this.nitroEl = document.getElementById('hud-nitro')!;
    this.alertEl = document.getElementById('alert-banner')!;
    this.countdownEl = document.getElementById('countdown-overlay')!;
    this.smashCombatEl = document.getElementById('smash-combat-overlay');
    this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.minimapCtx = this.minimapCanvas.getContext('2d')!;

    this.standingsListEl = document.getElementById('standings-list');
    this.finishCountdownBannerEl = document.getElementById('finish-countdown-banner');
    this.finishCountdownSecEl = document.getElementById('finish-countdown-sec');
    this.spectatorOverlayEl = document.getElementById('spectator-overlay');
    this.spectatorNameEl = document.getElementById('spectator-target-name');
    this.spectatorPosEl = document.getElementById('spectator-target-pos');
    this.pbTimeEl = document.getElementById('hud-pb-time');
    this.timeBoxEl = document.getElementById('hud-time-box');
    this.pbBoxEl = document.getElementById('hud-pb-box');

    this.nitroPip1 = document.getElementById('nitro-pip-1');
    this.nitroPip2 = document.getElementById('nitro-pip-2');
    this.nitroPip3 = document.getElementById('nitro-pip-3');
    this.nitroCountEl = document.getElementById('hud-nitro-count');
    this.touchNitroLabel = document.getElementById('touch-nitro-label');
    this.touchNitroBtn = document.getElementById('touch-btn-nitro');

    this.rumbleHudBar = document.getElementById('rumble-hud-bar');
    this.rumbleFrostScore = document.getElementById('rumble-frost-score') || document.getElementById('rumble-cyan-score');
    this.rumbleBlazeScore = document.getElementById('rumble-blaze-score') || document.getElementById('rumble-crimson-score');
    this.rumbleBoxLeft = document.getElementById('rumble-box-left');
    this.rumbleBoxRight = document.getElementById('rumble-box-right');
    this.rumbleLabelLeft = document.getElementById('rumble-label-left');
    this.rumbleLabelRight = document.getElementById('rumble-label-right');
    this.rumbleIndicatorLeft = document.getElementById('rumble-indicator-left');
    this.rumbleIndicatorRight = document.getElementById('rumble-indicator-right');
    this.rumbleMatchTitle = document.getElementById('rumble-match-title');
    this.rumbleTimerDisplay = document.getElementById('rumble-timer-display');
    this.killfeedContainer = document.getElementById('killfeed-container');

    this.rumbleVictoryBannerEl = document.getElementById('rumble-victory-banner');
    this.rumbleBannerTitleEl = document.getElementById('rumble-banner-title');
    this.rumbleBannerSubtextEl = document.getElementById('rumble-banner-subtext');
    this.wrongWayEl = document.getElementById('wrong-way-banner');
  }

  public showRumbleVictoryBanner(title: string, subtext: string, theme: 'frost' | 'blaze' | 'solo' | 'draw') {
    this.hideSmashCombat();
    if (this.rumbleVictoryBannerEl && this.rumbleBannerTitleEl && this.rumbleBannerSubtextEl) {
      this.rumbleBannerTitleEl.innerText = title;
      this.rumbleBannerSubtextEl.innerText = subtext;
      this.rumbleVictoryBannerEl.className = `theme-${theme}`;
      this.rumbleVictoryBannerEl.style.display = 'flex';
      // Force CSS reflow to re-trigger pop spring animation reliably
      this.rumbleVictoryBannerEl.style.animation = 'none';
      void this.rumbleVictoryBannerEl.offsetWidth;
      this.rumbleVictoryBannerEl.style.animation = '';
    }
  }

  public hideRumbleVictoryBanner() {
    if (this.rumbleVictoryBannerEl) {
      this.rumbleVictoryBannerEl.style.display = 'none';
    }
  }

  public setTrackPB(seconds: number | null) {
    if (this.pbTimeEl) {
      this.pbTimeEl.innerText = seconds !== null ? RecordManager.formatTime(seconds) : '--:--.--';
    }
  }

  public setTimeSprintMode(active: boolean) {
    this.isTimeSprintActive = active;
    if (!this.timeBoxEl) this.timeBoxEl = document.getElementById('hud-time-box');
    if (!this.pbBoxEl) this.pbBoxEl = document.getElementById('hud-pb-box');
    if (this.timeBoxEl) {
      this.timeBoxEl.style.display = active ? 'block' : 'none';
    }
    if (this.pbBoxEl) {
      this.pbBoxEl.style.display = active ? 'block' : 'none';
    }
  }

  public showHUD() {
    const hud = document.getElementById('hud-container');
    if (hud) hud.style.display = 'block';

    const touch = document.getElementById('touch-controls');
    const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || window.innerWidth <= 1024;
    if (touch && isTouch) {
      touch.style.display = 'block';
    }
  }

  public hideHUD() {
    const hud = document.getElementById('hud-container');
    if (hud) hud.style.display = 'none';

    const touch = document.getElementById('touch-controls');
    if (touch) {
      touch.style.display = 'none';
    }

    this.hideFinishCountdown();
    this.hideSpectatorOverlay();
    this.hideRumbleVictoryBanner();
    this.hideSmashCombat();
    this.hideCountdown();
  }

  public resetForNewRace(totalLaps: number = 3) {
    this.hideCountdown();
    this.lastSpeedStr = '0';
    if (this.speedEl) {
      this.speedEl.innerText = '0';
    }

    this.lastTimeStr = '00:00.0';
    if (this.timeEl) {
      this.timeEl.innerText = '00:00.0';
    }

    this.lastLapStr = `1/${totalLaps}`;
    if (this.lapEl) {
      this.lapEl.innerText = `1/${totalLaps}`;
      this.lapEl.style.color = 'var(--brut-black)';
    }

    this.lastRank = 1;
    if (this.posEl) {
      this.posEl.innerText = '1st';
      this.posEl.style.background = 'linear-gradient(135deg, #ffe600, #ff9900)';
      this.posEl.style.color = '#000';
    }

    this.lastNitroPct = 0;
    if (this.nitroEl) {
      this.nitroEl.style.width = '0%';
    }

    this.lastNitroCharges = 3;
    if (this.nitroPip1) this.nitroPip1.classList.add('active');
    if (this.nitroPip2) this.nitroPip2.classList.add('active');
    if (this.nitroPip3) this.nitroPip3.classList.add('active');
    if (this.nitroCountEl) {
      this.nitroCountEl.innerText = '3/3';
      this.nitroCountEl.classList.remove('depleted');
    }
    if (this.touchNitroLabel) {
      this.touchNitroLabel.innerText = 'NITRO (3)';
    }
    if (this.touchNitroBtn) {
      this.touchNitroBtn.classList.remove('depleted');
    }

    // Reset Live Standings Card on Left
    this.lastStandingsHtml = '';
    this.standingsThrottle = 0;
    if (this.standingsListEl) {
      this.standingsListEl.innerHTML = '';
    }

    if (this.isRumbleModeActive) {
      const topLeft = document.querySelector('.top-left-hud') as HTMLElement | null;
      const topRight = document.querySelector('.top-right-hud') as HTMLElement | null;
      const standingsCard = document.getElementById('live-standings-card');
      const pbBox = document.getElementById('hud-pb-box');
      if (topLeft) topLeft.style.setProperty('display', 'none', 'important');
      if (topRight) topRight.style.setProperty('display', 'none', 'important');
      if (standingsCard) standingsCard.style.setProperty('display', 'none', 'important');
      if (pbBox) pbBox.style.setProperty('display', 'none', 'important');
    } else {
      this.setTimeSprintMode(this.isTimeSprintActive);
    }

    this.hideFinishCountdown();
    this.hideSpectatorOverlay();
    this.showWrongWay(false);
    this.hideSmashCombat();
    if (this.alertTimeout) {
      clearTimeout(this.alertTimeout);
      this.alertTimeout = null;
    }
    if (this.alertEl) {
      this.alertEl.className = '';
      this.alertEl.innerText = '';
    }
  }

  public updateStatus(
    rank: number,
    lap: number,
    totalLaps: number,
    elapsedSeconds: number,
    speedKmh: number,
    boostFraction: number,
    nitroCharges: number = 3
  ) {
    const safeRank = (typeof rank === 'number' && !isNaN(rank) && rank > 0) ? Math.floor(rank) : 1;
    if (safeRank !== this.lastRank) {
      this.lastRank = safeRank;
      const j = safeRank % 10;
      const k = safeRank % 100;
      let suffix = 'th';
      if (j === 1 && k !== 11) suffix = 'st';
      else if (j === 2 && k !== 12) suffix = 'nd';
      else if (j === 3 && k !== 13) suffix = 'rd';
      this.posEl.innerText = `${safeRank}${suffix.toUpperCase()}`;

      if (safeRank === 1) {
        this.posEl.style.background = 'linear-gradient(135deg, #ffe600, #ff9900)';
        this.posEl.style.color = '#000';
      } else {
        this.posEl.style.background = 'linear-gradient(135deg, #ff3366, #ff0044)';
        this.posEl.style.color = '#fff';
      }
    }

    const lapStr = lap === totalLaps ? `${totalLaps}/${totalLaps} (FINAL)` : `${Math.min(lap, totalLaps)}/${totalLaps}`;
    if (lapStr !== this.lastLapStr) {
      this.lastLapStr = lapStr;
      this.lapEl.innerText = lapStr;
      this.lapEl.style.color = lap === totalLaps ? '#ff385c' : 'var(--brut-black)';
    }

    // Format time: MM:SS.ms (throttled to 100ms updates)
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = Math.floor(elapsedSeconds % 60);
    const millis = Math.floor((elapsedSeconds % 1) * 10);
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis}`;
    if (timeStr !== this.lastTimeStr) {
      this.lastTimeStr = timeStr;
      this.timeEl.innerText = timeStr;
    }

    const speedStr = speedKmh.toString();
    if (speedStr !== this.lastSpeedStr) {
      this.lastSpeedStr = speedStr;
      this.speedEl.innerText = speedStr;
    }

    const nitroPct = Math.round(boostFraction * 100);
    if (nitroPct !== this.lastNitroPct) {
      this.lastNitroPct = nitroPct;
      this.nitroEl.style.width = `${nitroPct}%`;
    }

    if (nitroCharges !== this.lastNitroCharges) {
      this.lastNitroCharges = nitroCharges;
      if (this.nitroPip1) this.nitroPip1.classList.toggle('active', nitroCharges >= 1);
      if (this.nitroPip2) this.nitroPip2.classList.toggle('active', nitroCharges >= 2);
      if (this.nitroPip3) this.nitroPip3.classList.toggle('active', nitroCharges >= 3);

      if (this.nitroCountEl) {
        this.nitroCountEl.innerText = `${nitroCharges}/3`;
        this.nitroCountEl.classList.toggle('depleted', nitroCharges <= 0);
      }

      if (this.touchNitroLabel) {
        this.touchNitroLabel.innerText = `NITRO (${nitroCharges})`;
      }
      if (this.touchNitroBtn) {
        this.touchNitroBtn.classList.toggle('depleted', nitroCharges <= 0);
      }
    }
  }

  public updateSpeed(speedKmh: number) {
    const speedStr = speedKmh.toString();
    if (speedStr !== this.lastSpeedStr) {
      this.lastSpeedStr = speedStr;
      this.speedEl.innerText = speedStr;
    }
  }

  public showAlert(text: string, type: 'smash' | 'recoil' | 'respawn' | 'boost' | 'nitro' | 'lap' = 'smash', durationMs: number = 2500) {
    if (this.alertTimeout) clearTimeout(this.alertTimeout);

    this.alertEl.className = `active ${type}`;
    this.alertEl.innerText = text;

    this.alertTimeout = window.setTimeout(() => {
      this.alertEl.className = '';
    }, durationMs);
  }

  // Giant arcade center splash (like countdown start "SMASH!")
  public showSmashCombat(text: string, comboCount: number = 1, isKnockout: boolean = false) {
    if (!this.smashCombatEl) return;
    if (this.smashCombatTimeout) clearTimeout(this.smashCombatTimeout);

    let comboClass = '';
    if (isKnockout) {
      comboClass = 'knockout';
    } else if (comboCount === 2) {
      comboClass = 'double';
    } else if (comboCount === 3) {
      comboClass = 'triple';
    } else if (comboCount >= 4) {
      comboClass = 'mega';
    }

    this.smashCombatEl.className = `active ${comboClass}`;
    this.smashCombatEl.innerText = text;

    this.smashCombatTimeout = window.setTimeout(() => {
      if (this.smashCombatEl) {
        this.smashCombatEl.className = '';
      }
    }, 1300);
  }

  public hideSmashCombat() {
    if (this.smashCombatTimeout) {
      clearTimeout(this.smashCombatTimeout);
      this.smashCombatTimeout = null;
    }
    if (this.smashCombatEl) {
      this.smashCombatEl.className = '';
    }
  }

  public showCountdown(value: string) {
    if (this.countdownTimeout) {
      clearTimeout(this.countdownTimeout);
      this.countdownTimeout = null;
    }
    if (!this.countdownEl) return;
    this.countdownEl.style.display = 'block';
    this.countdownEl.innerText = value;
    this.countdownEl.style.transform = 'translate(-50%, -50%) scale(1.2)';

    this.countdownTimeout = setTimeout(() => {
      if (this.countdownEl) {
        this.countdownEl.style.transform = 'translate(-50%, -50%) scale(1.0)';
      }
    }, 50);

    if (value === 'GO!' || value === 'SMASH!') {
      this.countdownTimeout = setTimeout(() => {
        if (this.countdownEl) {
          this.countdownEl.style.display = 'none';
          this.countdownEl.innerText = '';
        }
        this.countdownTimeout = null;
      }, 900);
    }
  }

  public hideCountdown() {
    if (this.countdownTimeout) {
      clearTimeout(this.countdownTimeout);
      this.countdownTimeout = null;
    }
    if (this.countdownEl) {
      this.countdownEl.style.display = 'none';
      this.countdownEl.innerText = '';
    }
  }

  public showWrongWay(visible: boolean) {
    if (this.isWrongWayVisible === visible) return;
    this.isWrongWayVisible = visible;
    if (!this.wrongWayEl) {
      this.wrongWayEl = document.getElementById('wrong-way-banner');
    }
    if (this.wrongWayEl) {
      this.wrongWayEl.style.display = visible ? 'flex' : 'none';
    }
  }

  public drawMinimap(track: Track, playerKart: Kart, otherKarts: Kart[]) {
    // Throttle minimap redraw: 15fps on mobile (every 4th frame), 30fps on PC (every 2nd frame)
    const isMobile = window.innerWidth <= 840 || ('ontouchstart' in window);
    const skipFreq = isMobile ? 4 : 2;
    this.minimapFrameSkip = (this.minimapFrameSkip + 1) % skipFreq;
    if (this.minimapFrameSkip !== 0) return;

    if (track.isArena || this.isRumbleModeActive) {
      return;
    }

    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    // 1. One-time accurate bounding box computation & offscreen canvas pre-render
    if (this.cachedTrackSpline !== track || this.trackPoints.length === 0 || !this.staticMinimapCanvas) {
      this.cachedTrackSpline = track;
      this.trackPoints = [];
      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      const samples = 140;
      for (let i = 0; i <= samples; i++) {
        const slice = track.getTrackSlice(i / samples);
        this.trackPoints.push({ x: slice.position.x, z: slice.position.z });
        if (slice.position.x < minX) minX = slice.position.x;
        if (slice.position.x > maxX) maxX = slice.position.x;
        if (slice.position.z < minZ) minZ = slice.position.z;
        if (slice.position.z > maxZ) maxZ = slice.position.z;
      }

      this.trackCenterX = (minX + maxX) / 2;
      this.trackCenterZ = (minZ + maxZ) / 2;
      const spanX = maxX - minX;
      const spanZ = maxZ - minZ;

      // Fit with 28px padding so track never clips
      const padding = 28;
      this.trackScale = Math.min((w - padding * 2) / spanX, (h - padding * 2) / spanZ);

      // Pre-render static track circuit to offscreen canvas
      this.staticMinimapCanvas = document.createElement('canvas');
      this.staticMinimapCanvas.width = w;
      this.staticMinimapCanvas.height = h;
      const sCtx = this.staticMinimapCanvas.getContext('2d')!;

      const centerX = w / 2;
      const centerY = h / 2;
      const scale = this.trackScale;
      const toScreenX = (x: number) => centerX + (x - this.trackCenterX) * scale;
      const toScreenY = (z: number) => centerY + (z - this.trackCenterZ) * scale;

      // 2. Subtle radar background rings / crosshairs
      sCtx.strokeStyle = '#161d2a';
      sCtx.lineWidth = 1.5;
      sCtx.beginPath();
      sCtx.arc(centerX, centerY, w * 0.40, 0, Math.PI * 2);
      sCtx.stroke();
      sCtx.beginPath();
      sCtx.moveTo(centerX, 12); sCtx.lineTo(centerX, h - 12);
      sCtx.moveTo(12, centerY); sCtx.lineTo(w - 12, centerY);
      sCtx.stroke();

      // 3. Draw Track Road Outer Border (Bold Dark Outline)
      sCtx.strokeStyle = '#05070c';
      sCtx.lineWidth = 18;
      sCtx.lineCap = 'round';
      sCtx.lineJoin = 'round';
      sCtx.beginPath();
      for (let i = 0; i < this.trackPoints.length; i++) {
        const p = this.trackPoints[i];
        const sx = toScreenX(p.x);
        const sy = toScreenY(p.z);
        if (i === 0) sCtx.moveTo(sx, sy);
        else sCtx.lineTo(sx, sy);
      }
      sCtx.closePath();
      sCtx.stroke();

      // 4. Draw Track Road Asphalt Surface
      sCtx.strokeStyle = '#283344';
      sCtx.lineWidth = 12;
      sCtx.beginPath();
      for (let i = 0; i < this.trackPoints.length; i++) {
        const p = this.trackPoints[i];
        const sx = toScreenX(p.x);
        const sy = toScreenY(p.z);
        if (i === 0) sCtx.moveTo(sx, sy);
        else sCtx.lineTo(sx, sy);
      }
      sCtx.closePath();
      sCtx.stroke();

      // 5. Draw Glowing Neon Cyan Circuit Guide Line
      sCtx.strokeStyle = '#00f0ff';
      sCtx.lineWidth = 3;
      sCtx.setLineDash([8, 6]);
      sCtx.beginPath();
      for (let i = 0; i < this.trackPoints.length; i++) {
        const p = this.trackPoints[i];
        const sx = toScreenX(p.x);
        const sy = toScreenY(p.z);
        if (i === 0) sCtx.moveTo(sx, sy);
        else sCtx.lineTo(sx, sy);
      }
      sCtx.closePath();
      sCtx.stroke();
      sCtx.setLineDash([]);

      // 6. Highlight Canyon Stunt Jump Gap (Classic) or Cyber Vortex Tube (Hardcore)
      if (track.config.antiGravTube?.enabled) {
        const tube = track.config.antiGravTube;
        sCtx.strokeStyle = '#ff00bb';
        sCtx.lineWidth = 6;
        sCtx.beginPath();
        for (let s = tube.startSlice; s <= tube.endSlice; s++) {
          const pt = track.getTrackSlice(s / Track.SAMPLES).position;
          const sx = toScreenX(pt.x);
          const sy = toScreenY(pt.z);
          if (s === tube.startSlice) sCtx.moveTo(sx, sy);
          else sCtx.lineTo(sx, sy);
        }
        sCtx.stroke();
      } else {
        const jumpStartPt = track.getTrackSlice(Track.GAP_START_SLICE / Track.SAMPLES).position;
        const jumpEndPt = track.getTrackSlice(Track.GAP_END_SLICE / Track.SAMPLES).position;
        const jx1 = toScreenX(jumpStartPt.x), jy1 = toScreenY(jumpStartPt.z);
        const jx2 = toScreenX(jumpEndPt.x), jy2 = toScreenY(jumpEndPt.z);

        sCtx.strokeStyle = '#ff0055';
        sCtx.lineWidth = 5;
        sCtx.setLineDash([5, 4]);
        sCtx.beginPath();
        sCtx.moveTo(jx1, jy1);
        sCtx.lineTo(jx2, jy2);
        sCtx.stroke();
        sCtx.setLineDash([]);
      }

      // 7. Start / Finish Line Banner
      const startPt = this.trackPoints[0];
      const sx = toScreenX(startPt.x);
      const sy = toScreenY(startPt.z);

      sCtx.fillStyle = '#ffe600';
      sCtx.strokeStyle = '#000000';
      sCtx.lineWidth = 2.5;
      sCtx.beginPath();
      sCtx.arc(sx, sy, 6, 0, Math.PI * 2);
      sCtx.fill();
      sCtx.stroke();
    }

    const centerX = w / 2;
    const centerY = h / 2;
    const scale = this.trackScale;
    const toScreenX = (x: number) => centerX + (x - this.trackCenterX) * scale;
    const toScreenY = (z: number) => centerY + (z - this.trackCenterZ) * scale;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.staticMinimapCanvas!, 0, 0);

    // 8. Draw Remote Human Opponents (High-Contrast Neon Dots with dark border)
    const otherColors = ['#39ff14', '#00d2ff', '#a855f7', '#fb923c'];
    otherKarts.forEach((k, idx) => {
      const pos = k.group.position;
      const ox = toScreenX(pos.x);
      const oy = toScreenY(pos.z);

      ctx.fillStyle = otherColors[idx % otherColors.length];
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ox, oy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // 9. Draw Player Racer (Glowing Directional Arrow pointing in heading direction)
    const pPos = playerKart.group.position;
    const px = toScreenX(pPos.x);
    const py = toScreenY(pPos.z);

    const rot = playerKart.group.quaternion;
    const fwdX = 2 * (rot.x * rot.z + rot.w * rot.y);
    const fwdZ = 1 - 2 * (rot.x * rot.x + rot.y * rot.y);
    const headingAngle = Math.atan2(fwdX, fwdZ);

    // Glowing aura
    ctx.fillStyle = 'rgba(255, 34, 85, 0.45)';
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fill();

    // Directional racing arrowhead
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-headingAngle + Math.PI);

    ctx.fillStyle = '#ff2255';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -11);      // Forward nose
    ctx.lineTo(7, 8);        // Right rear wing
    ctx.lineTo(0, 4);        // Rear center indent
    ctx.lineTo(-7, 8);       // Left rear wing
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Golden nose beacon
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.arc(0, -5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  public setRoomBadge(_roomCode: string | null) {
    const badge = document.getElementById('room-badge');
    if (badge) {
      badge.style.display = 'none'; // Permanently hidden on in-game HUD to protect streamer privacy
    }
  }

  public setPing(pingMs: number | null) {
    const badge = document.getElementById('mp-ping-badge');

    if (pingMs === null || pingMs < 0) {
      if (badge) badge.style.display = 'none';
      return;
    }

    const dotColor = pingMs < 80 ? '#10B981' : (pingMs < 160 ? '#F59E0B' : '#EF4444');
    const text = pingMs === 0 ? '0 MS' : `${pingMs} MS`;

    if (badge) {
      badge.style.display = 'inline-flex';
      const dot = badge.querySelector('.ping-dot') as HTMLElement | null;
      const val = badge.querySelector('.ping-val') as HTMLElement | null;
      if (dot) dot.style.color = dotColor;
      if (val) val.innerText = text;
    }
  }

  public showFinishLeaderboard(
    standings: RacerProgress[],
    playerWon: boolean,
    recordInfo?: {
      isNewPB: boolean;
      currentTime: number;
      prevPB: number | null;
      delta: number;
    },
    racerTimes?: Map<string, number>
  ) {
    sounds.fadeEngineOut(1.0);
    const modal = document.getElementById('finish-modal')!;
    const title = document.getElementById('finish-title')!;
    const subtext = document.getElementById('finish-subtext')!;
    const tbody = document.getElementById('results-body')!;

    modal.classList.remove('has-tdm');
    const tdmResults = document.getElementById('rumble-tdm-results');
    if (tdmResults) tdmResults.style.display = 'none';
    const resultsTable = document.getElementById('results-table');
    if (resultsTable) resultsTable.style.display = 'table';

    modal.style.display = 'flex';
    this.showWrongWay(false);

    const finishBadge = document.getElementById('finish-title-badge');
    if (playerWon) {
      title.innerText = 'VICTORY // 1ST PLACE';
      title.style.color = '#000000';
      if (finishBadge) {
        finishBadge.style.background = 'var(--brut-yellow)';
        finishBadge.style.borderColor = '#000000';
      }
      subtext.innerText = 'Sky track mastered. Recoil chaos conquered.';
      // Fire premium multi-stage fireworks celebration!
      CelebrationFX.celebrateVictory('yellow');
    } else {
      title.innerText = 'RACE COMPLETE';
      title.style.color = '#FFFFFF';
      if (finishBadge) {
        finishBadge.style.background = '#0F172A';
        finishBadge.style.borderColor = '#000000';
      }
      subtext.innerText = 'Final standings recorded.';
    }

    // Populate Personal Best (PB) Banner - STRICTLY ONLY for Time Sprint mode!
    const recordBanner = document.getElementById('finish-record-banner');
    const recordTitle = document.getElementById('finish-record-title');
    const recordStat = document.getElementById('finish-record-stat');
    const recordDelta = document.getElementById('finish-record-delta');
    const recordIcon = document.getElementById('finish-record-icon');

    if (this.isTimeSprintActive && recordBanner && recordInfo) {
      recordBanner.style.display = 'flex';
      if (recordInfo.isNewPB) {
        recordBanner.classList.add('is-new-record');
        if (recordTitle) recordTitle.innerText = recordInfo.prevPB === null ? 'FIRST TRACK RECORD SET!' : '🏆 NEW PERSONAL RECORD!';
        if (recordStat) recordStat.innerText = RecordManager.formatTime(recordInfo.currentTime);
        if (recordDelta) {
          recordDelta.innerText = recordInfo.prevPB === null ? 'NEW PB' : RecordManager.formatDelta(recordInfo.delta);
          recordDelta.className = 'record-delta-pill';
        }
        if (recordIcon) recordIcon.innerText = '🏆';
      } else {
        recordBanner.classList.remove('is-new-record');
        if (recordTitle) recordTitle.innerText = 'PERSONAL BEST';
        if (recordStat) recordStat.innerText = RecordManager.formatTime(recordInfo.prevPB ?? recordInfo.currentTime);
        if (recordDelta) {
          recordDelta.innerText = RecordManager.formatDelta(recordInfo.delta);
          recordDelta.className = 'record-delta-pill delta-positive';
        }
        if (recordIcon) recordIcon.innerText = '⏱️';
      }
    } else if (recordBanner) {
      recordBanner.style.display = 'none';
    }

    const thead = document.querySelector('#results-table thead');
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>POS</th>
          <th>RACER</th>
          <th>TIME</th>
        </tr>
      `;
    }
    tbody.innerHTML = '';
    const winnerId = standings.length > 0 ? standings[0].id : null;
    let winnerTime = winnerId && racerTimes?.has(winnerId) ? racerTimes.get(winnerId)! : null;
    if (winnerTime === null && recordInfo && standings.length > 0 && standings[0].isPlayer) {
      winnerTime = recordInfo.currentTime;
    }

    standings.forEach((racer, idx) => {
      const row = document.createElement('tr');
      if (racer.isPlayer) row.className = 'highlight';

      let timeText = 'DNF';
      let t: number | null = null;
      if (racerTimes && racerTimes.has(racer.id)) {
        t = racerTimes.get(racer.id)!;
      } else if (racer.isPlayer && recordInfo) {
        t = recordInfo.currentTime;
      } else if (typeof racer.finishTime === 'number' && racer.finishTime > 0) {
        t = racer.finishTime < 10000 ? racer.finishTime : null;
      }

      if (t !== null && t > 0) {
        if (idx === 0 || winnerTime === null) {
          timeText = RecordManager.formatTime(t);
        } else {
          const gap = t - winnerTime;
          timeText = `${RecordManager.formatTime(t)} (+${gap.toFixed(2)}s)`;
        }
      }

      const isVip = racer.isPlayer ? economy.isVip() : !!racer.isVip;
      const tag = racer.isPlayer
        ? (isVip ? `${VIP_CROWN_SVG} (YOU - VIP)` : '(YOU)')
        : (isVip ? `${VIP_CROWN_SVG} (VIP)` : (racer.name.toLowerCase().includes('bot') || racer.name.toLowerCase().includes('ai') ? '(AI)' : '(ONLINE)'));

      row.innerHTML = `
        <td>#${idx + 1}</td>
        <td>${racer.name} ${tag}</td>
        <td>${timeText}</td>
      `;
      tbody.appendChild(row);
    });

    this.hideFinishCountdown();
    this.hideSpectatorOverlay();
  }

  public showGrandRecordCelebration(params: {
    trackName: string;
    timeSeconds: number;
    deltaSeconds: number;
    prevPB: number | null;
    globalRank?: number | null;
    onClose?: () => void;
  }) {
    if (params.onClose) params.onClose();
  }

  private standingsThrottle: number = 0;

  public updateLiveStandings(standings: RacerProgress[], totalLaps: number, spectatedId?: string, force: boolean = false) {
    if (!this.standingsListEl || this.isRumbleModeActive) return;

    if (!force) {
      // Throttle to 10Hz (every 6th frame at 60fps) to eliminate 50+ string template concatenations/sec
      this.standingsThrottle = (this.standingsThrottle + 1) % 6;
      if (this.standingsThrottle !== 0) return;
    }

    let html = '';
    for (let i = 0; i < standings.length; i++) {
      const racer = standings[i];
      const isPlayer = racer.isPlayer;
      const isSpectated = racer.id === spectatedId;
      const rowClass = `standing-row${isPlayer ? ' is-player' : ''}${isSpectated ? ' is-spectated' : ''}`;

      let lapHtml = '';
      if (racer.finishTime !== null) {
        lapHtml = `<span class="standing-lap-tag finished">DONE</span>`;
      } else if (racer.lap === totalLaps) {
        lapHtml = `<span class="standing-lap-tag final-lap">FINAL</span>`;
      } else {
        lapHtml = `<span class="standing-lap-tag">L${Math.min(racer.lap, totalLaps)}/${totalLaps}</span>`;
      }

      const isVip = isPlayer ? economy.isVip() : !!racer.isVip;
      const displayName = isPlayer
        ? (isVip ? `${VIP_CROWN_SVG}YOU` : 'YOU')
        : (isVip ? `${VIP_CROWN_SVG}${racer.name}` : racer.name);

      html += `
        <div class="${rowClass}">
          <span class="standing-rank-badge">#${i + 1}</span>
          <span class="standing-name-text">${displayName}</span>
          ${lapHtml}
        </div>
      `;
    }
    if (this.lastStandingsHtml === html) return;
    this.lastStandingsHtml = html;
    this.standingsListEl.innerHTML = html;
  }

  public showFinishCountdown(seconds: number) {
    if (this.finishCountdownBannerEl && this.finishCountdownSecEl) {
      this.finishCountdownBannerEl.style.display = 'flex';
      this.finishCountdownSecEl.innerText = Math.max(0, Math.ceil(seconds)).toString();
    }
  }

  public hideFinishCountdown() {
    if (this.finishCountdownBannerEl) {
      this.finishCountdownBannerEl.style.display = 'none';
    }
  }

  public showSpectatorOverlay(
    targetName: string,
    targetRankOrTag: number | string,
    isEliminated: boolean = false,
    customHeader?: string
  ) {
    if (!this.spectatorOverlayEl) {
      this.spectatorOverlayEl = document.getElementById('spectator-overlay');
    }
    if (!this.spectatorOverlayEl) return;

    this.spectatorOverlayEl.style.display = 'flex';

    const posEl = document.getElementById('spectator-target-pos') || this.spectatorPosEl;
    if (posEl) {
      const tagStr = typeof targetRankOrTag === 'number' ? `#${targetRankOrTag}` : (targetRankOrTag || '#2');
      if (typeof tagStr === 'string' && tagStr.includes('<')) {
        posEl.innerHTML = tagStr;
      } else {
        posEl.innerText = tagStr;
      }
    }

    const badgeSpan = this.spectatorOverlayEl.querySelector('.spectator-badge span:nth-child(2)') as HTMLElement | null;
    if (badgeSpan) {
      if (customHeader) {
        badgeSpan.innerHTML = `${customHeader} // SPECTATING: <strong id="spectator-target-name">${targetName}</strong>`;
      } else {
        badgeSpan.innerHTML = isEliminated
          ? `ELIMINATED // SPECTATING: <strong id="spectator-target-name">${targetName}</strong>`
          : `SPECTATING: <strong id="spectator-target-name">${targetName}</strong>`;
      }
    }
  }

  public hideSpectatorOverlay() {
    if (this.spectatorOverlayEl) {
      this.spectatorOverlayEl.style.display = 'none';
    }
  }

  public resetRumbleHud() {
    this.lastRumbleFormat = '';
    this.lastRumbleBoxLeftClass = '';
    this.lastRumbleBoxRightClass = '';
    this.lastRumbleLabelLeft = '';
    this.lastRumbleLabelRight = '';
    this.lastRumbleFrost = '';
    this.lastRumbleBlaze = '';
    this.lastRumbleTitle = '';
    this.lastRumbleTimer = '';
    this.lastKillfeedKey = '';
    if (this.rumbleFrostScore) this.rumbleFrostScore.innerHTML = '0';
    if (this.rumbleBlazeScore) this.rumbleBlazeScore.innerHTML = '0';
    if (this.rumbleLabelLeft) this.rumbleLabelLeft.innerText = 'FROST';
    if (this.rumbleLabelRight) this.rumbleLabelRight.innerText = 'BLAZE';
    if (this.rumbleMatchTitle) this.rumbleMatchTitle.innerText = 'ARENA BATTLE';
    if (this.rumbleTimerDisplay) this.rumbleTimerDisplay.innerText = 'PREPARING';
    if (this.killfeedContainer) this.killfeedContainer.innerHTML = '';
  }

  public setRumbleMode(active: boolean) {
    this.isRumbleModeActive = active;
    document.body.classList.toggle('is-rumble-mode', active);
    const hudContainer = document.getElementById('hud-container');
    if (hudContainer) hudContainer.classList.toggle('is-rumble-mode', active);

    const topLeft = document.querySelector('.top-left-hud') as HTMLElement | null;
    const topRight = document.querySelector('.top-right-hud') as HTMLElement | null;
    const standingsCard = document.getElementById('live-standings-card');
    const pbBox = document.getElementById('hud-pb-box');
    const nitroCard = document.querySelector('.nitro-card') as HTMLElement | null;
    const touchNitroRow = document.querySelector('.touch-steer-top-row') as HTMLElement | null;

    const topBar = document.getElementById('top-bar');

    if (active) {
      if (topLeft) topLeft.style.setProperty('display', 'none', 'important');
      if (topRight) topRight.style.setProperty('display', 'none', 'important');
      if (standingsCard) standingsCard.style.setProperty('display', 'none', 'important');
      if (pbBox) pbBox.style.setProperty('display', 'none', 'important');
      if (nitroCard) nitroCard.style.setProperty('display', 'none', 'important');
      if (touchNitroRow) touchNitroRow.style.setProperty('display', 'none', 'important');
      if (topBar) topBar.classList.add('rumble-top-bar');
      if (this.rumbleHudBar) this.rumbleHudBar.style.display = 'flex';
      if (this.killfeedContainer) {
        this.killfeedContainer.style.display = 'flex';
        this.killfeedContainer.innerHTML = '';
        this.lastKillfeedKey = '';
      }
    } else {
      this.resetRumbleHud();
      if (topLeft) topLeft.style.removeProperty('display');
      if (topRight) topRight.style.removeProperty('display');
      if (standingsCard) standingsCard.style.removeProperty('display');
      this.setTimeSprintMode(this.isTimeSprintActive);
      if (nitroCard) nitroCard.style.removeProperty('display');
      if (touchNitroRow) touchNitroRow.style.removeProperty('display');
      if (topBar) topBar.classList.remove('rumble-top-bar');
      if (this.rumbleHudBar) this.rumbleHudBar.style.display = 'none';
      if (this.killfeedContainer) {
        this.killfeedContainer.style.display = 'none';
        this.killfeedContainer.innerHTML = '';
        this.lastKillfeedKey = '';
      }
    }
  }

  private generateCuteHeartsHtml(lives: number, maxLives: number = 3): string {
    let heartsHtml = '<div class="hud-hearts-row">';
    for (let i = 0; i < maxLives; i++) {
      if (i < lives) {
        heartsHtml += '<svg class="cute-heart-svg" viewBox="0 0 24 24" width="22" height="22" fill="#FF385C" stroke="#000" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
      } else {
        heartsHtml += '<svg class="cute-heart-svg heart-lost" viewBox="0 0 24 24" width="22" height="22" fill="#E2E8F0" stroke="#94A3B8" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
      }
    }
    heartsHtml += '</div>';
    return heartsHtml;
  }

  public updateRumbleHud(manager: RumbleManager, playerKart: Kart, spectatedTargetId?: string) {
    if (!this.rumbleHudBar) return;

    const isTDM = manager.isTDM;
    const is3Lives = manager.winRule === 'lives_3';
    const myRacer = manager.racers.get(playerKart.id);
    const isPlayerEliminated = myRacer ? myRacer.isEliminated : false;
    const isSpectating = !!spectatedTargetId || isPlayerEliminated;
    const spectatedRacer = spectatedTargetId ? manager.racers.get(spectatedTargetId) : undefined;
    const totalRacers = manager.racers.size;
    const aliveRacersList = Array.from(manager.racers.values()).filter((r) => !r.isEliminated);
    const aliveCount = aliveRacersList.length;
    const is1v1 = totalRacers === 2;

    let leftBoxClass = 'frost-box';
    let rightBoxClass = 'blaze-box';
    let leftLabel = 'FROST';
    let rightLabel = 'BLAZE';
    let leftContent = '';
    let rightContent = '';
    let titleText = '';
    let timerText = '';

    if (is3Lives) {
      if (is1v1) {
        // 1v1 Survival Duel (Both TDM 1v1 and Solo FFA 1v1)
        const opponent = Array.from(manager.racers.values()).find((r) => r.id !== playerKart.id);
        const isPlayerFrost = !myRacer || myRacer.team === 'frost' || myRacer.team === 'cyan';

        if (isTDM) {
          leftBoxClass = isPlayerFrost ? 'frost-box' : 'blaze-box';
          rightBoxClass = isPlayerFrost ? 'blaze-box' : 'frost-box';
          titleText = '1V1 TEAM DUEL';
        } else {
          leftBoxClass = 'ffa-you-box';
          rightBoxClass = 'ffa-top-box';
          titleText = '1V1 SURVIVAL DUEL';
        }

        if (!isSpectating) {
          leftLabel = 'YOU';
          leftContent = this.generateCuteHeartsHtml(myRacer ? Math.max(0, myRacer.lives) : 0);
          rightLabel = opponent ? opponent.name : 'OPPONENT';
          rightContent = this.generateCuteHeartsHtml(opponent ? Math.max(0, opponent.lives) : 0);
        } else {
          leftLabel = 'YOU (OUT)';
          leftContent = this.generateCuteHeartsHtml(0);
          rightLabel = opponent ? opponent.name : 'WINNER';
          rightContent = this.generateCuteHeartsHtml(opponent ? Math.max(0, opponent.lives) : 0);
        }
        timerText = 'LAST PILOT STANDING';
      } else if (!isTDM) {
        // 3+ Racers Solo Free For All Survival
        leftBoxClass = 'ffa-you-box';
        rightBoxClass = 'ffa-top-box';
        titleText = 'SOLO SURVIVAL BRAWL';
        timerText = 'LAST PILOT STANDING';

        if (!isSpectating) {
          leftLabel = 'YOUR LIVES';
          leftContent = this.generateCuteHeartsHtml(myRacer ? Math.max(0, myRacer.lives) : 0);
        } else {
          const target = spectatedRacer || aliveRacersList[0];
          leftLabel = target ? `SPECTATING: ${target.name}` : 'SPECTATING';
          leftContent = this.generateCuteHeartsHtml(target ? Math.max(0, target.lives) : 0);
        }
        rightLabel = 'SURVIVORS';
        rightContent = `${aliveCount} / ${totalRacers}`;
      } else {
        // 3+ Racers Team Deathmatch Survival
        const aliveFrost = aliveRacersList.filter((r) => r.team === 'frost' || r.team === 'cyan').length;
        const aliveBlaze = aliveRacersList.filter((r) => r.team === 'blaze' || r.team === 'crimson').length;
        const isPlayerFrost = !myRacer || myRacer.team === 'frost' || myRacer.team === 'cyan';

        leftBoxClass = isPlayerFrost ? 'frost-box' : 'blaze-box';
        rightBoxClass = isPlayerFrost ? 'blaze-box' : 'frost-box';
        titleText = 'TDM SURVIVAL BRAWL';
        timerText = 'LAST SQUAD STANDING';

        if (!isSpectating) {
          leftLabel = 'YOUR LIVES';
          leftContent = this.generateCuteHeartsHtml(myRacer ? Math.max(0, myRacer.lives) : 0);
        } else {
          const target = spectatedRacer || aliveRacersList[0];
          leftLabel = target ? `SPECTATING: ${target.name}` : 'SPECTATING';
          leftContent = this.generateCuteHeartsHtml(target ? Math.max(0, target.lives) : 0);
        }
        rightLabel = 'SQUADS ALIVE';
        rightContent = `<span style="color:#0284c7;font-weight:900;">${aliveFrost}</span> <span style="color:#000;font-size:12px;opacity:0.6;font-weight:900;margin:0 4px;">VS</span> <span style="color:#e11d48;font-weight:900;">${aliveBlaze}</span>`;
      }
    } else if (isTDM) {
      // Standard TDM (Kills / Timer)
      leftBoxClass = 'frost-box';
      rightBoxClass = 'blaze-box';
      leftLabel = 'FROST';
      rightLabel = 'BLAZE';
      leftContent = manager.frostScore.toString();
      rightContent = manager.blazeScore.toString();
      titleText = 'TEAM DEATHMATCH';

      if (manager.winRule.startsWith('time_')) {
        const m = Math.floor(manager.matchTimer / 60);
        const s = Math.floor(manager.matchTimer % 60);
        timerText = `${m}:${s.toString().padStart(2, '0')}`;
      } else {
        timerText = `FIRST TO ${manager.targetKills} KILLS`;
      }
    } else {
      // Standard Solo FFA (Kills / Timer)
      leftBoxClass = 'ffa-you-box';
      rightBoxClass = 'ffa-top-box';
      titleText = 'SOLO FREE FOR ALL';

      if (!isSpectating) {
        leftLabel = myRacer?.name || 'YOU';
        leftContent = `${myRacer ? myRacer.kills : 0}`;
      } else {
        const target = spectatedRacer || aliveRacersList[0];
        leftLabel = target ? `SPECTATING: ${target.name}` : 'SPECTATING';
        leftContent = `${target ? target.kills : 0}`;
      }

      const activeSubjectId = isSpectating && spectatedRacer ? spectatedRacer.id : playerKart.id;
      const otherRacers = Array.from(manager.racers.values()).filter((r) => r.id !== activeSubjectId);
      if (otherRacers.length === 1) {
        const opponent = otherRacers[0];
        rightLabel = opponent.name;
        rightContent = `${opponent.kills}`;
      } else if (otherRacers.length > 1) {
        const allSorted = Array.from(manager.racers.values()).sort((a, b) => b.kills - a.kills);
        const leader = allSorted[0];
        const rival = allSorted[1];
        if (leader && leader.id === activeSubjectId) {
          rightLabel = rival ? `${rival.name} (2ND)` : 'CONTENDER';
          rightContent = `${rival ? rival.kills : 0}`;
        } else {
          rightLabel = leader ? `${leader.name} (1ST)` : 'LEADER';
          rightContent = `${leader ? leader.kills : 0}`;
        }
      } else {
        rightLabel = 'RIVAL';
        rightContent = '0';
      }

      if (manager.winRule.startsWith('time_')) {
        const m = Math.floor(manager.matchTimer / 60);
        const s = Math.floor(manager.matchTimer % 60);
        timerText = `${m}:${s.toString().padStart(2, '0')}`;
      } else {
        timerText = `FIRST TO ${manager.targetKills} KILLS`;
      }
    }

    // Only touch DOM when values actually change
    if (this.rumbleBoxLeft && leftBoxClass && this.lastRumbleBoxLeftClass !== leftBoxClass) {
      this.lastRumbleBoxLeftClass = leftBoxClass;
      this.rumbleBoxLeft.className = `rumble-team-box ${leftBoxClass}`;
    }
    if (this.rumbleBoxRight && rightBoxClass && this.lastRumbleBoxRightClass !== rightBoxClass) {
      this.lastRumbleBoxRightClass = rightBoxClass;
      this.rumbleBoxRight.className = `rumble-team-box ${rightBoxClass}`;
    }
    if (this.rumbleLabelLeft && leftLabel !== this.lastRumbleLabelLeft) {
      this.lastRumbleLabelLeft = leftLabel;
      this.rumbleLabelLeft.innerText = leftLabel;
    }
    if (this.rumbleLabelRight && rightLabel !== this.lastRumbleLabelRight) {
      this.lastRumbleLabelRight = rightLabel;
      this.rumbleLabelRight.innerText = rightLabel;
    }
    if (this.rumbleFrostScore && leftContent !== this.lastRumbleFrost) {
      this.lastRumbleFrost = leftContent;
      if (leftContent.startsWith('<')) {
        this.rumbleFrostScore.innerHTML = leftContent;
      } else {
        this.rumbleFrostScore.innerText = leftContent;
      }
    }
    if (this.rumbleBlazeScore && rightContent !== this.lastRumbleBlaze) {
      this.lastRumbleBlaze = rightContent;
      if (rightContent.startsWith('<')) {
        this.rumbleBlazeScore.innerHTML = rightContent;
      } else {
        this.rumbleBlazeScore.innerText = rightContent;
      }
    }
    if (this.rumbleMatchTitle && titleText !== this.lastRumbleTitle) {
      this.lastRumbleTitle = titleText;
      this.rumbleMatchTitle.innerText = titleText;
    }
    if (this.rumbleTimerDisplay && timerText !== this.lastRumbleTimer) {
      this.lastRumbleTimer = timerText;
      this.rumbleTimerDisplay.innerText = timerText;
    }

    // Compact cute top-right killfeed (max 3 recent entries)
    if (this.killfeedContainer) {
      const feedKey = manager.killfeed.map(e => `${e.id}_${e.isElimination}`).join('|');
      if (feedKey !== this.lastKillfeedKey) {
        this.lastKillfeedKey = feedKey;
        this.killfeedContainer.innerHTML = manager.killfeed
          .slice(0, 3)
          .map((entry) => {
            const aTeamClass = (entry.attackerTeam === 'frost' || entry.attackerTeam === 'cyan') ? 'team-frost' : (entry.attackerTeam === 'blaze' || entry.attackerTeam === 'crimson') ? 'team-blaze' : 'team-solo';
            const vTeamClass = (entry.victimTeam === 'frost' || entry.victimTeam === 'cyan') ? 'team-frost' : (entry.victimTeam === 'blaze' || entry.victimTeam === 'crimson') ? 'team-blaze' : 'team-solo';
            
            const attackerDisplay = entry.isSelfAttacker ? `${entry.attackerName} (YOU)` : entry.attackerName;
            const victimDisplay = entry.isSelfVictim ? `${entry.victimName} (YOU)` : entry.victimName;

            let content = '';
            if (entry.attackerName) {
              if (entry.isElimination) {
                content = `<span class="killfeed-name ${aTeamClass}">${attackerDisplay}</span><span class="killfeed-action eliminated">ELIMINATED</span><span class="killfeed-name victim ${vTeamClass}">${victimDisplay}</span>`;
              } else {
                content = `<span class="killfeed-name ${aTeamClass}">${attackerDisplay}</span><span class="killfeed-action">SLAMMED</span><span class="killfeed-name victim ${vTeamClass}">${victimDisplay}</span>`;
              }
            } else {
              if (entry.isElimination) {
                content = `<span class="killfeed-name victim ${vTeamClass}">${victimDisplay}</span><span class="killfeed-tag-out eliminated">LOST ALL LIVES</span>`;
              } else {
                content = `<span class="killfeed-name victim ${vTeamClass}">${victimDisplay}</span><span class="killfeed-tag-out">FELL OFF</span>`;
              }
            }
            return `<div class="killfeed-entry">${content}</div>`;
          })
          .join('');
      }
    }
  }

  private drawArenaMinimap(playerKart: Kart, otherKarts: Kart[]) {
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cX = w / 2;
    const cY = h / 2;
    const arenaRadius = 98.0;
    const scale = (w * 0.42) / arenaRadius;

    // 1. One-time accurate offscreen canvas pre-render of static arena radar
    if (!this.staticArenaMinimapCanvas) {
      this.staticArenaMinimapCanvas = document.createElement('canvas');
      this.staticArenaMinimapCanvas.width = w;
      this.staticArenaMinimapCanvas.height = h;
      const bCtx = this.staticArenaMinimapCanvas.getContext('2d')!;

      // Radar coliseum background disc
      bCtx.fillStyle = '#0a0e17';
      bCtx.beginPath();
      bCtx.arc(cX, cY, w * 0.42, 0, Math.PI * 2);
      bCtx.fill();

      // Territory Halves tint (Frost North vs Blaze South)
      bCtx.save();
      bCtx.beginPath();
      bCtx.arc(cX, cY, w * 0.42, Math.PI, 0);
      bCtx.fillStyle = 'rgba(0, 240, 255, 0.16)';
      bCtx.fill();

      bCtx.beginPath();
      bCtx.arc(cX, cY, w * 0.42, 0, Math.PI);
      bCtx.fillStyle = 'rgba(255, 68, 34, 0.18)';
      bCtx.fill();
      bCtx.restore();

      // Banked Slope Perimeter Ring (72m to 98m)
      bCtx.fillStyle = 'rgba(255, 170, 0, 0.08)';
      bCtx.beginPath();
      bCtx.arc(cX, cY, w * 0.42, 0, Math.PI * 2);
      bCtx.arc(cX, cY, 72.0 * scale, 0, Math.PI * 2, true);
      bCtx.fill();

      // Banked Slope Inner Ridge Line (72m demarcation)
      bCtx.strokeStyle = 'rgba(255, 170, 0, 0.45)';
      bCtx.lineWidth = 1.5;
      bCtx.setLineDash([4, 4]);
      bCtx.beginPath();
      bCtx.arc(cX, cY, 72.0 * scale, 0, Math.PI * 2);
      bCtx.stroke();
      bCtx.setLineDash([]);

      // Heavy Titanium Outer Rim (Crest lip at 98m)
      bCtx.strokeStyle = '#182234';
      bCtx.lineWidth = 6;
      bCtx.beginPath();
      bCtx.arc(cX, cY, w * 0.42, 0, Math.PI * 2);
      bCtx.stroke();

      // Glowing Cyan Hazard Dashes on Crest
      bCtx.strokeStyle = '#00f0ff';
      bCtx.lineWidth = 2;
      bCtx.setLineDash([6, 4]);
      bCtx.beginPath();
      bCtx.arc(cX, cY, w * 0.42 - 2, 0, Math.PI * 2);
      bCtx.stroke();
      bCtx.setLineDash([]);

      // Center Dais & Mega-Pad (14m radius)
      bCtx.fillStyle = '#0d1627';
      bCtx.strokeStyle = '#ffea00';
      bCtx.lineWidth = 2;
      bCtx.beginPath();
      bCtx.arc(cX, cY, 14.0 * scale, 0, Math.PI * 2);
      bCtx.fill();
      bCtx.stroke();

      // 4 Kicker Ramps at radius 48m (diagonals: 45°, 135°, 225°, 315°)
      const kickerAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
      bCtx.fillStyle = '#ffea00';
      for (const a of kickerAngles) {
        const rx = cX + Math.cos(a) * (48.0 * scale);
        const ry = cY + Math.sin(a) * (48.0 * scale);
        bCtx.fillRect(rx - 3, ry - 3, 6, 6);
      }

      // 4 Perimeter Boost Pads at radius 48m (cardinal: 0°, 90°, 180°, 270°)
      const padAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      bCtx.fillStyle = '#00f0ff';
      bCtx.strokeStyle = '#000000';
      bCtx.lineWidth = 1.5;
      for (const a of padAngles) {
        const px = cX + Math.cos(a) * (48.0 * scale);
        const py = cY + Math.sin(a) * (48.0 * scale);
        bCtx.beginPath();
        bCtx.arc(px, py, 4, 0, Math.PI * 2);
        bCtx.fill();
        bCtx.stroke();
      }

      // Center Mega Boost Pad
      bCtx.fillStyle = '#00f0ff';
      bCtx.beginPath();
      bCtx.arc(cX, cY, 4.5, 0, Math.PI * 2);
      bCtx.fill();
      bCtx.stroke();
    }

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.staticArenaMinimapCanvas, 0, 0);

    // 2. Draw Opponents & Teammates
    for (const other of otherKarts) {
      const pos = other.group.position;
      if (pos.y < -5.0) continue; // In void fall

      const ox = cX + pos.x * scale;
      const oy = cY + pos.z * scale;

      const isFrost = other.team === 'frost' || other.team === 'cyan';
      const isBlaze = other.team === 'blaze' || other.team === 'crimson';
      ctx.fillStyle = isFrost ? '#00f0ff' : isBlaze ? '#ff3344' : '#39ff14';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox, oy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 3. Draw Local Player
    const pPos = playerKart.group.position;
    const px = cX + pPos.x * scale;
    const py = cY + pPos.z * scale;

    const rot = playerKart.group.quaternion;
    const fwdX = 2 * (rot.x * rot.z + rot.w * rot.y);
    const fwdZ = 1 - 2 * (rot.x * rot.x + rot.y * rot.y);
    const headingAngle = Math.atan2(fwdX, fwdZ);

    // Glowing aura
    ctx.fillStyle = 'rgba(255, 234, 0, 0.45)';
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fill();

    // Player Arrowhead
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-headingAngle + Math.PI);
    ctx.fillStyle = '#ffe600';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public showRumbleFinish(
    winningTeam: RumbleTeam | 'draw',
    winnerName: string,
    isPlayerWinner: boolean,
    racers: RumbleRacer[]
  ) {
    sounds.fadeEngineOut(1.0);
    const modal = document.getElementById('finish-modal')!;
    const title = document.getElementById('finish-title')!;
    const subtext = document.getElementById('finish-subtext')!;
    const tbody = document.getElementById('results-body')!;
    const resultsTable = document.getElementById('results-table') as HTMLElement | null;
    const tdmResults = document.getElementById('rumble-tdm-results') as HTMLElement | null;
    const recordBanner = document.getElementById('finish-record-banner');
    if (recordBanner) {
      recordBanner.style.display = 'none';
    }

    modal.style.display = 'flex';
    this.showWrongWay(false);
    this.hideSpectatorOverlay();

    const finishBadge = document.getElementById('finish-title-badge');
    if (isPlayerWinner) {
      title.innerText = 'VICTORY // ARENA CHAMPION!';
      title.style.color = '#000000';
      if (finishBadge) {
        finishBadge.style.background = 'var(--brut-yellow)';
        finishBadge.style.borderColor = '#000000';
      }
      subtext.innerText = `${winnerName} DOMINATED THE SKY ARENA!`;
      const victoryTheme = winningTeam === 'frost' ? 'frost' : winningTeam === 'blaze' ? 'blaze' : 'yellow';
      CelebrationFX.celebrateVictory(victoryTheme);
    } else {
      title.innerText = 'MATCH COMPLETE';
      title.style.color = '#FFFFFF';
      if (finishBadge) {
        finishBadge.style.background = '#0F172A';
        finishBadge.style.borderColor = '#000000';
      }
      subtext.innerText = `${winnerName} WON THE ARENA CLASH.`;
    }

    const isTdm = racers.some(r => r.team === 'frost' || r.team === 'blaze' || r.team === 'cyan' || r.team === 'crimson');

    if (isTdm && tdmResults) {
      modal.classList.add('has-tdm');
      if (resultsTable) resultsTable.style.display = 'none';
      tdmResults.style.display = 'grid';

      const frostRacers = racers.filter(r => r.team === 'frost' || r.team === 'cyan').sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const blazeRacers = racers.filter(r => r.team === 'blaze' || r.team === 'crimson').sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

      const frostScore = frostRacers.reduce((acc, r) => acc + r.kills, 0);
      const blazeScore = blazeRacers.reduce((acc, r) => acc + r.kills, 0);

      const frostPtsEl = document.getElementById('frost-squad-pts');
      const blazePtsEl = document.getElementById('blaze-squad-pts');
      if (frostPtsEl) frostPtsEl.innerText = frostScore.toString();
      if (blazePtsEl) blazePtsEl.innerText = blazeScore.toString();

      const frostPill = document.getElementById('frost-outcome-pill');
      const blazePill = document.getElementById('blaze-outcome-pill');

      if (winningTeam === 'frost') {
        if (frostPill) { frostPill.innerText = 'VICTORY'; frostPill.className = 'rumble-squad-outcome-pill won'; }
        if (blazePill) { blazePill.innerText = 'DEFEAT'; blazePill.className = 'rumble-squad-outcome-pill lost'; }
      } else if (winningTeam === 'blaze') {
        if (frostPill) { frostPill.innerText = 'DEFEAT'; frostPill.className = 'rumble-squad-outcome-pill lost'; }
        if (blazePill) { blazePill.innerText = 'VICTORY'; blazePill.className = 'rumble-squad-outcome-pill won'; }
      } else {
        if (frostPill) { frostPill.innerText = 'TIED'; frostPill.className = 'rumble-squad-outcome-pill tied'; }
        if (blazePill) { blazePill.innerText = 'TIED'; blazePill.className = 'rumble-squad-outcome-pill tied'; }
      }

      const renderRoster = (containerId: string, teamRacers: RumbleRacer[]) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        const maxKills = Math.max(...teamRacers.map(r => r.kills), 0);

        teamRacers.forEach(r => {
          const isMvp = r.kills > 0 && r.kills === maxKills;
          const row = document.createElement('div');
          row.className = `rumble-pilot-row ${r.isPlayer ? 'is-self' : ''}`;
          row.innerHTML = `
            <div class="pilot-left">
              ${isMvp ? '<span class="pilot-mvp-pill">MVP</span>' : ''}
              <span class="pilot-name" title="${this.escapeHtml(r.name)}">${this.escapeHtml(r.name)}</span>
              ${r.isPlayer ? '<span class="pilot-you-tag">YOU</span>' : ''}
            </div>
            <div class="pilot-stat-cols">
              <span class="col-val-k" title="${r.kills} Kills">${r.kills}</span>
              <span class="col-val-d" title="${r.deaths} Deaths">${r.deaths}</span>
            </div>
          `;
          container.appendChild(row);
        });
      };

      renderRoster('frost-squad-roster', frostRacers);
      renderRoster('blaze-squad-roster', blazeRacers);
    } else {
      modal.classList.remove('has-tdm');
      if (tdmResults) tdmResults.style.display = 'none';
      if (resultsTable) resultsTable.style.display = 'table';

      const thead = document.querySelector('#results-table thead');
      if (thead) {
        thead.innerHTML = `
          <tr>
            <th>POS</th>
            <th>PILOT</th>
            <th>KILLS</th>
            <th>DEATHS</th>
          </tr>
        `;
      }

      tbody.innerHTML = '';
      const sorted = [...racers].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      sorted.forEach((r, idx) => {
        const row = document.createElement('tr');
        if (r.isPlayer) row.className = 'highlight';

        const tag = r.isPlayer ? '(YOU)' : '';

        row.innerHTML = `
          <td>#${idx + 1}</td>
          <td>${this.escapeHtml(r.name)} ${tag}</td>
          <td>${r.kills}</td>
          <td>${r.deaths}</td>
        `;
        tbody.appendChild(row);
      });
    }

    this.hideFinishCountdown();
    this.hideSpectatorOverlay();
  }
}
