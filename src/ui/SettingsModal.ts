import { settings } from '../core/Settings';
import { sounds } from '../core/Sound';
import { Engine } from '../core/Engine';

const SVG_UNMUTED = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#000"><polygon points="4,9 8,9 14,4 14,20 8,15 4,15"/><path d="M17 8c1.5 2 1.5 6 0 8" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
const SVG_MUTED = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#64748B"><polygon points="4,9 8,9 14,4 14,20 8,15 4,15"/><line x1="17" y1="9" x2="23" y2="15" stroke="#FF385C" stroke-width="2" stroke-linecap="round"/><line x1="23" y1="9" x2="17" y2="15" stroke="#FF385C" stroke-width="2" stroke-linecap="round"/></svg>`;

export class SettingsModal {
  private engine?: Engine;
  private modalEl: HTMLElement | null = null;
  private isInRace: boolean = false;
  private currentTab: 'settings' | 'controls' = 'settings';
  public onQuitRace?: () => void;

  constructor() {
    this.modalEl = document.getElementById('settings-modal');
    this.bindEvents();
  }

  public setEngine(engine: Engine) {
    this.engine = engine;
  }

  public setIsInRace(inRace: boolean) {
    this.isInRace = inRace;
    const quitBtn = document.getElementById('btn-quit-race');
    if (quitBtn) {
      quitBtn.style.display = inRace ? 'block' : 'none';
    }
  }

  public getIsInRace(): boolean {
    return this.isInRace;
  }

  public setTab(tab: 'settings' | 'controls') {
    this.currentTab = tab;
    const tabSettings = document.getElementById('tab-btn-settings');
    const tabControls = document.getElementById('tab-btn-controls');
    const paneGeneral = document.getElementById('settings-pane-general');
    const paneControls = document.getElementById('settings-pane-controls');
    const titleEl = document.getElementById('settings-header-title');

    if (tab === 'settings') {
      tabSettings?.classList.add('active');
      tabControls?.classList.remove('active');
      if (paneGeneral) paneGeneral.style.display = 'flex';
      if (paneControls) paneControls.style.display = 'none';
      if (titleEl) titleEl.innerText = 'GAME SETTINGS';
    } else {
      tabControls?.classList.add('active');
      tabSettings?.classList.remove('active');
      if (paneGeneral) paneGeneral.style.display = 'none';
      if (paneControls) paneControls.style.display = 'flex';
      if (titleEl) titleEl.innerText = 'HOW TO PLAY & CONTROLS';
    }
  }

  public open(tab: 'settings' | 'controls' = 'settings') {
    sounds.playSelect();
    this.syncUI();
    this.setTab(tab);
    const quitBtn = document.getElementById('btn-quit-race');
    if (quitBtn) {
      quitBtn.style.display = this.isInRace ? 'block' : 'none';
    }
    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
    }
  }

  public close() {
    sounds.playSelect();
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }

  public isOpen(): boolean {
    return !!(this.modalEl && this.modalEl.style.display !== 'none');
  }

  public syncUI() {
    const s = settings.get();

    // Volume Slider & Badge
    const volSlider = document.getElementById('settings-volume-slider') as HTMLInputElement | null;
    const volBadge = document.getElementById('settings-volume-badge');
    const muteIcon = document.getElementById('settings-mute-icon');

    if (volSlider) {
      volSlider.value = `${Math.round(s.volume * 100)}`;
    }
    if (volBadge) {
      volBadge.innerText = s.muted ? 'MUTED' : `${Math.round(s.volume * 100)}%`;
    }
    if (muteIcon) {
      muteIcon.innerHTML = s.muted || s.volume === 0 ? SVG_MUTED : SVG_UNMUTED;
    }

    // Graphics Preset Buttons (Warm Yellow #FFE600 active)
    const btnGfxHigh = document.getElementById('btn-gfx-high');
    const btnGfxLow = document.getElementById('btn-gfx-low');
    if (btnGfxHigh && btnGfxLow) {
      const isHigh = s.graphics === 'high';
      btnGfxHigh.style.background = isHigh ? '#FFE600' : '#FFF';
      btnGfxHigh.style.color = isHigh ? '#000' : '#64748B';
      btnGfxHigh.style.boxShadow = isHigh ? '2px 2px 0px #000' : 'none';

      btnGfxLow.style.background = !isHigh ? '#FFE600' : '#FFF';
      btnGfxLow.style.color = !isHigh ? '#000' : '#64748B';
      btnGfxLow.style.boxShadow = !isHigh ? '2px 2px 0px #000' : 'none';
    }

    // Shadows Buttons (Warm Yellow #FFE600 active)
    const btnShadowsOn = document.getElementById('btn-shadows-on');
    const btnShadowsOff = document.getElementById('btn-shadows-off');
    if (btnShadowsOn && btnShadowsOff) {
      btnShadowsOn.style.background = s.shadows ? '#FFE600' : '#FFF';
      btnShadowsOn.style.color = s.shadows ? '#000' : '#64748B';
      btnShadowsOn.style.boxShadow = s.shadows ? '2px 2px 0px #000' : 'none';

      btnShadowsOff.style.background = !s.shadows ? '#FFE600' : '#FFF';
      btnShadowsOff.style.color = !s.shadows ? '#000' : '#64748B';
      btnShadowsOff.style.boxShadow = !s.shadows ? '2px 2px 0px #000' : 'none';
    }

    // FPS Counter Buttons (Warm Yellow #FFE600 active)
    const btnFpsOn = document.getElementById('btn-fps-on');
    const btnFpsOff = document.getElementById('btn-fps-off');
    if (btnFpsOn && btnFpsOff) {
      btnFpsOn.style.background = s.fpsCounter ? '#FFE600' : '#FFF';
      btnFpsOn.style.color = s.fpsCounter ? '#000' : '#64748B';
      btnFpsOn.style.boxShadow = s.fpsCounter ? '2px 2px 0px #000' : 'none';

      btnFpsOff.style.background = !s.fpsCounter ? '#FFE600' : '#FFF';
      btnFpsOff.style.color = !s.fpsCounter ? '#000' : '#64748B';
      btnFpsOff.style.boxShadow = !s.fpsCounter ? '2px 2px 0px #000' : 'none';
    }

    const fpsTracker = document.getElementById('perf-fps-tracker');
    if (fpsTracker) {
      fpsTracker.style.display = s.fpsCounter ? 'flex' : 'none';
    }
  }

  private bindEvents() {
    const btnOpen = document.getElementById('btn-open-settings');
    const btnInGame = document.getElementById('btn-in-game-settings');
    const btnClose = document.getElementById('btn-close-settings');
    const btnDone = document.getElementById('btn-close-settings-done');
    const btnQuit = document.getElementById('btn-quit-race');

    if (btnOpen) btnOpen.onclick = () => this.open();
    if (btnInGame) btnInGame.onclick = () => this.open();
    if (btnClose) btnClose.onclick = () => this.close();
    if (btnDone) btnDone.onclick = () => this.close();

    const tabSettings = document.getElementById('tab-btn-settings');
    const tabControls = document.getElementById('tab-btn-controls');
    if (tabSettings) {
      tabSettings.onclick = () => {
        sounds.playSelect();
        this.setTab('settings');
      };
    }
    if (tabControls) {
      tabControls.onclick = () => {
        sounds.playSelect();
        this.setTab('controls');
      };
    }

    if (btnQuit) {
      btnQuit.onclick = () => {
        sounds.playSelect();
        this.close();
        if (this.onQuitRace) {
          this.onQuitRace();
        }
      };
    }

    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }

    // Volume Slider
    const volSlider = document.getElementById('settings-volume-slider') as HTMLInputElement | null;
    if (volSlider) {
      volSlider.addEventListener('input', () => {
        const val = parseInt(volSlider.value, 10) / 100;
        settings.setVolume(val);
        sounds.setVolume(val);
        const volBadge = document.getElementById('settings-volume-badge');
        const muteIcon = document.getElementById('settings-mute-icon');
        if (volBadge) volBadge.innerText = `${Math.round(val * 100)}%`;
        if (muteIcon) muteIcon.innerHTML = val === 0 ? SVG_MUTED : SVG_UNMUTED;
      });
    }

    // Mute Button
    const muteBtn = document.getElementById('settings-mute-btn');
    if (muteBtn) {
      muteBtn.onclick = () => {
        sounds.playSelect();
        const nowMuted = !settings.get().muted;
        settings.setMuted(nowMuted);
        sounds.setMuted(nowMuted);
        this.syncUI();
      };
    }

    // Graphics Preset Buttons
    const btnGfxHigh = document.getElementById('btn-gfx-high');
    const btnGfxLow = document.getElementById('btn-gfx-low');
    if (btnGfxHigh && btnGfxLow) {
      btnGfxHigh.onclick = () => {
        sounds.playSelect();
        settings.setGraphics('high');
        if (this.engine) this.engine.setGraphicsPreset('high');
        this.syncUI();
      };
      btnGfxLow.onclick = () => {
        sounds.playSelect();
        settings.setGraphics('low');
        if (this.engine) this.engine.setGraphicsPreset('low');
        this.syncUI();
      };
    }

    // Shadows Buttons
    const btnShadowsOn = document.getElementById('btn-shadows-on');
    const btnShadowsOff = document.getElementById('btn-shadows-off');
    if (btnShadowsOn && btnShadowsOff) {
      btnShadowsOn.onclick = () => {
        sounds.playSelect();
        settings.setShadows(true);
        if (this.engine) this.engine.setShadows(true);
        this.syncUI();
      };
      btnShadowsOff.onclick = () => {
        sounds.playSelect();
        settings.setShadows(false);
        if (this.engine) this.engine.setShadows(false);
        this.syncUI();
      };
    }

    // FPS Counter Buttons
    const btnFpsOn = document.getElementById('btn-fps-on');
    const btnFpsOff = document.getElementById('btn-fps-off');
    if (btnFpsOn && btnFpsOff) {
      btnFpsOn.onclick = () => {
        sounds.playSelect();
        settings.setFpsCounter(true);
        this.syncUI();
      };
      btnFpsOff.onclick = () => {
        sounds.playSelect();
        settings.setFpsCounter(false);
        this.syncUI();
      };
    }
  }
}

export const settingsModal = new SettingsModal();
