export interface GameSettings {
  volume: number; // 0.0 to 1.0 (default 0.8)
  muted: boolean; // default false
  graphics: 'high' | 'low'; // default 'high'
  shadows: boolean; // default true
  fpsCounter: boolean; // default false
}

export class SettingsManager {
  private settings: GameSettings;
  private listeners: ((settings: GameSettings) => void)[] = [];

  constructor() {
    this.settings = this.load();
  }

  private load(): GameSettings {
    try {
      const saved = localStorage.getItem('airskido_settings') || localStorage.getItem('airskid_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          volume: typeof parsed.volume === 'number' ? parsed.volume : 0.8,
          muted: typeof parsed.muted === 'boolean' ? parsed.muted : false,
          graphics: parsed.graphics === 'low' ? 'low' : 'high',
          shadows: typeof parsed.shadows === 'boolean' ? parsed.shadows : true,
          fpsCounter: typeof parsed.fpsCounter === 'boolean' ? parsed.fpsCounter : false,
        };
      }
    } catch {}
    return {
      volume: 0.8,
      muted: false,
      graphics: 'high',
      shadows: true,
      fpsCounter: false,
    };
  }

  public save() {
    try {
      localStorage.setItem('airskido_settings', JSON.stringify(this.settings));
    } catch {}
    this.notify();
  }

  public get(): GameSettings {
    return { ...this.settings };
  }

  public setVolume(val: number) {
    this.settings.volume = Math.max(0, Math.min(1, val));
    if (this.settings.volume > 0 && this.settings.muted) {
      this.settings.muted = false;
    }
    this.save();
  }

  public setMuted(muted: boolean) {
    this.settings.muted = muted;
    this.save();
  }

  public setGraphics(preset: 'high' | 'low') {
    this.settings.graphics = preset;
    if (preset === 'low') {
      this.settings.shadows = false;
    } else {
      this.settings.shadows = true;
    }
    this.save();
  }

  public setShadows(enabled: boolean) {
    this.settings.shadows = enabled;
    this.save();
  }

  public setFpsCounter(enabled: boolean) {
    this.settings.fpsCounter = enabled;
    this.save();
  }

  public onChange(cb: (settings: GameSettings) => void) {
    this.listeners.push(cb);
  }

  private notify() {
    const current = this.get();
    for (const cb of this.listeners) {
      cb(current);
    }
  }
}

export const settings = new SettingsManager();
