import { ACTIVE_ENGINE_CONFIG, DEFAULT_ENGINE_AUDIO_CONFIG, SampleEngineAudioConfig } from './EngineSound';
import engineAudioUrl from '../sounds/enginetest.wav';
import driftAudioUrl from '../sounds/drift.mp3';

// Web Audio API procedural sound engine - Pure Steady Racing Synthesizer
// Features: Clean racing sawtooth core + sub-bass body + overtone harmonic + aerodynamic intake airflow.
// Zero wobble, zero tremolo flutter, zero synthetic artifacts. 100% steady, smooth racing acceleration.

export interface ArcadeEngineConfig {
  /** Base idle fundamental frequency in Hz (clean racing idle) */
  baseFrequency: number;
  /** Max fundamental frequency at top speed in Hz */
  maxFrequency: number;
  /** Volume balance of the primary racing sawtooth tone (0.0 - 1.0) */
  fundamentalGain: number;
  /** Volume balance of the sub-bass chassis tone (0.0 - 1.0) */
  subGain: number;
  /** Volume balance of the upper racing harmonic layer (0.0 - 1.0) */
  harmonicGain: number;
  /** Volume balance of the aerodynamic intake airflow (0.0 - 1.0) */
  noiseGain: number;
  /** Idle low-pass filter cutoff in Hz */
  filterCutoffIdle: number;
  /** Max low-pass filter cutoff under full throttle in Hz */
  filterCutoffMax: number;
  /** Filter resonance Q factor */
  filterQ: number;
  /** Master engine volume intensity ceiling */
  masterEngineGain: number;
}

export const DEFAULT_ARCADE_ENGINE_CONFIG: ArcadeEngineConfig = {
  baseFrequency: 55,       // Clean, solid racing idle (55 Hz)
  maxFrequency: 175,       // Steady racing top speed rev (175 Hz)
  fundamentalGain: 0.45,   // Pure racing core tone
  subGain: 0.35,           // Solid low-end body
  harmonicGain: 0.18,      // Clean upper racing harmonic
  noiseGain: 0.08,         // Aerodynamic air rush under throttle
  filterCutoffIdle: 440,   // Mellow idle filter
  filterCutoffMax: 2000,   // Bright, open racing roar under throttle
  filterQ: 1.0,            // Smooth roll-off, zero resonance peak
  masterEngineGain: 1.0,   // Full dynamic mix
};

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.8;

  // ── AUTHENTIC REAL CAR ENGINE NODES ──
  private engineRunning: boolean = false;
  private isEngineStoppedManually: boolean = false;
  public isScoreboardActive: boolean = false;
  public isFadingOut: boolean = false;
  private engineFadeTimeout: number | null = null;
  private engineSampleBuffer: AudioBuffer | null = null;
  private engineSampleSource: AudioBufferSourceNode | null = null;
  private isEngineSampleLoading: boolean = false;
  private engineMainOsc: OscillatorNode | null = null;         // Fallback racing tone
  private engineSubOsc: OscillatorNode | null = null;          // Solid chassis low-end
  private engineHarmonicOsc: OscillatorNode | null = null;     // Upper racing harmonic
  private engineHarmonicGain: GainNode | null = null;
  private engineMainGain: GainNode | null = null;
  private engineSubGain: GainNode | null = null;
  private engineIntakeNoiseNode: AudioBufferSourceNode | null = null;
  private engineIntakeFilter: BiquadFilterNode | null = null;
  private engineIntakeGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;        // Master lowpass filter (tames treble)
  private engineBassBoost: BiquadFilterNode | null = null;     // Deep low-shelf vibration & rumble booster
  private engineGain: GainNode | null = null;                  // Master engine volume
  private wasAccelerating: boolean = false;
  private lastSpeedFraction: number = 0;
  private currentEngineRPM: number = 0.0;
  private lastRPMUpdateTime: number = 0;

  // Engine sound configuration parameters
  private engineConfig: ArcadeEngineConfig = { ...DEFAULT_ARCADE_ENGINE_CONFIG };

  // ── DYNAMIC ASPHALT TIRE DRIFT / SKID NODES ──
  private driftNoiseNode: AudioBufferSourceNode | null = null;
  private driftScreechFilter: BiquadFilterNode | null = null;
  private driftGritFilter: BiquadFilterNode | null = null;
  private driftFlutterOsc: OscillatorNode | null = null;
  private driftFlutterGain: GainNode | null = null;
  private driftGain: GainNode | null = null;
  private isDriftActive: boolean = false;
  private driftSampleBuffer: AudioBuffer | null = null;
  private driftSampleSource: AudioBufferSourceNode | null = null;
  private driftSampleSource2: AudioBufferSourceNode | null = null;
  private driftGain2: GainNode | null = null;
  private driftStartTime: number = 0;
  private isDriftSampleLoading: boolean = false;
  private driftStopTimeout: number | null = null;

  // ── CACHED BUFFERS & WAVETABLES ──
  private cachedNoiseBuffer: AudioBuffer | null = null;
  private cachedCrashBuffer: AudioBuffer | null = null;
  private cachedBoostBuffer: AudioBuffer | null = null;
  private lastCrashSoundTime: number = 0;

  constructor() {
    // Initialized on first user gesture to comply with browser autoplay policies
  }

  public getEngineConfig(): ArcadeEngineConfig {
    return { ...this.engineConfig };
  }

  public getSampleEngineConfig(): SampleEngineAudioConfig {
    return { ...ACTIVE_ENGINE_CONFIG };
  }

  public setSampleEngineConfig(config: Partial<SampleEngineAudioConfig>) {
    Object.assign(ACTIVE_ENGINE_CONFIG, config);
  }

  public resetSampleEngineConfig(): void {
    Object.assign(ACTIVE_ENGINE_CONFIG, DEFAULT_ENGINE_AUDIO_CONFIG);
  }

  public getMasterDestination(): AudioNode {
    if (!this.ctx || !this.masterGain) this.initCtx();
    return this.masterGain || this.ctx!.destination;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.volume > 0 && this.isMuted) {
      this.isMuted = false;
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const isMobile =
        typeof navigator !== 'undefined' &&
        (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
          window.innerWidth <= 840 ||
          window.innerHeight <= 560);
      try {
        this.ctx = new AudioCtx({
          latencyHint: isMobile ? 'balanced' : 'interactive',
        });
      } catch {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.masterGain && this.ctx) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

      // Transparent soft-knee master limiter to prevent ear-piercing audio clipping at 100% volume
      this.masterCompressor = this.ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.setValueAtTime(-2.0, this.ctx.currentTime);
      this.masterCompressor.knee.setValueAtTime(6.0, this.ctx.currentTime);
      this.masterCompressor.ratio.setValueAtTime(8.0, this.ctx.currentTime);
      this.masterCompressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.masterCompressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      this.masterGain.connect(this.masterCompressor);
      this.masterCompressor.connect(this.ctx.destination);
    }
    // Pre-warm boost & crash buffers and load samples in background
    if (!this.cachedBoostBuffer) {
      setTimeout(() => {
        try {
          this.getBoostBuffer();
          this.getCrashBuffer();
          this.loadDriftSample();
          this.loadEngineSample();
        } catch {}
      }, 50);
    }
  }

  // Pre-load user-provided drift audio sample
  private async loadDriftSample() {
    if (this.driftSampleBuffer || this.isDriftSampleLoading || !this.ctx) return;
    this.isDriftSampleLoading = true;
    try {
      const urlsToTry = [driftAudioUrl, './sounds/drift.mp3', '/sounds/drift.mp3', '/src/sounds/drift.mp3'];
      let arrayBuffer: ArrayBuffer | null = null;
      for (const url of urlsToTry) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            arrayBuffer = await response.arrayBuffer();
            break;
          }
        } catch {}
      }
      if (arrayBuffer && this.ctx) {
        this.driftSampleBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      }
    } catch (e) {
      console.warn('[SoundEngine] Note: using procedural fallback for drift', e);
    } finally {
      this.isDriftSampleLoading = false;
    }
  }

  // Pre-load authentic racing car engine audio sample
  private async loadEngineSample() {
    if (this.engineSampleBuffer || this.isEngineSampleLoading || !this.ctx) return;
    this.isEngineSampleLoading = true;
    try {
      const urlsToTry = [
        engineAudioUrl,
        `./sounds/enginetest.wav?t=${Date.now()}`,
        './sounds/enginetest.wav',
        `/sounds/enginetest.wav?t=${Date.now()}`,
        '/sounds/enginetest.wav',
        '/src/sounds/enginetest.wav'
      ];
      let arrayBuffer: ArrayBuffer | null = null;
      for (const url of urlsToTry) {
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (response.ok) {
            arrayBuffer = await response.arrayBuffer();
            break;
          }
        } catch {}
      }
      if (arrayBuffer && this.ctx) {
        this.engineSampleBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        // If engine is already active and waiting, transition to real sample immediately
        if (this.engineRunning && !this.engineSampleSource && this.ctx) {
          this.startSampleEngine();
        }
      }
    } catch (e) {
      console.warn('[SoundEngine] Note: using procedural fallback for engine', e);
    } finally {
      this.isEngineSampleLoading = false;
    }
  }

  // Start real racing car sample engine
  private startSampleEngine(t?: number) {
    if (!this.ctx || !this.engineSampleBuffer || this.engineSampleSource) return;
    const now = t ?? this.ctx.currentTime;
    const cfg = ACTIVE_ENGINE_CONFIG;

    this.engineSampleSource = this.ctx.createBufferSource();
    this.engineSampleSource.buffer = this.engineSampleBuffer;
    this.engineSampleSource.loop = true;
    this.engineSampleSource.playbackRate.setValueAtTime(cfg.idlePlaybackRate, now);

    if (!this.engineGain) {
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(cfg.initialGain * this.engineConfig.masterEngineGain, now);
      this.engineGain.connect(this.getMasterDestination());
    }

    if (!this.engineFilter) {
      // Smooth racing filter: lets crisp treble through (2800 Hz idle -> 6500 Hz full throttle)
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(cfg.initialFilterCutoff, now);
      this.engineFilter.Q.setValueAtTime(cfg.filterQ, now);
      this.engineFilter.connect(this.engineGain);
    }

    if (!this.engineBassBoost) {
      // Deep engine vibration booster: low-shelf keeps solid bass rumble and combustion thrum
      this.engineBassBoost = this.ctx.createBiquadFilter();
      this.engineBassBoost.type = 'lowshelf';
      this.engineBassBoost.frequency.setValueAtTime(cfg.bassBoostFreq, now);
      this.engineBassBoost.gain.setValueAtTime(cfg.initialBassBoostGain, now);
      this.engineBassBoost.connect(this.engineFilter);
    }

    this.engineSampleSource.connect(this.engineBassBoost);
    this.engineSampleSource.start(now);

    // Stop procedural synth oscillators if they were running as fallback
    if (this.engineMainOsc) {
      try { this.engineMainOsc.stop(); this.engineMainOsc.disconnect(); } catch {}
      this.engineMainOsc = null;
    }
    if (this.engineSubOsc) {
      try { this.engineSubOsc.stop(); this.engineSubOsc.disconnect(); } catch {}
      this.engineSubOsc = null;
    }
    if (this.engineHarmonicOsc) {
      try { this.engineHarmonicOsc.stop(); this.engineHarmonicOsc.disconnect(); } catch {}
      this.engineHarmonicOsc = null;
    }
    if (this.engineIntakeNoiseNode) {
      try { this.engineIntakeNoiseNode.stop(); this.engineIntakeNoiseNode.disconnect(); } catch {}
      this.engineIntakeNoiseNode = null;
    }
    if (this.engineMainGain) {
      try { this.engineMainGain.disconnect(); } catch {}
      this.engineMainGain = null;
    }
    if (this.engineSubGain) {
      try { this.engineSubGain.disconnect(); } catch {}
      this.engineSubGain = null;
    }
    if (this.engineHarmonicGain) {
      try { this.engineHarmonicGain.disconnect(); } catch {}
      this.engineHarmonicGain = null;
    }
    if (this.engineIntakeGain) {
      try { this.engineIntakeGain.disconnect(); } catch {}
      this.engineIntakeGain = null;
    }
    if (this.engineIntakeFilter) {
      try { this.engineIntakeFilter.disconnect(); } catch {}
      this.engineIntakeFilter = null;
    }
  }

  // Pre-generate a 1.5s seamless white noise loop buffer for tire friction and crunch
  private getNoiseBuffer(): AudioBuffer {
    if (!this.ctx) this.initCtx();
    if (!this.cachedNoiseBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = Math.floor(sampleRate * 1.5);
      this.cachedNoiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = this.cachedNoiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return this.cachedNoiseBuffer!;
  }

  // ── PURE STEADY RACING ENGINE (ZERO WOBBLE, SMOOTH REV) ──
  public startEngine() {
    if (this.isScoreboardActive) return;
    this.initCtx();
    if (!this.ctx || this.engineRunning || this.isMuted) return;

    this.loadEngineSample();

    try {
      const t = this.ctx.currentTime;
      this.isScoreboardActive = false;
      this.isEngineStoppedManually = false;
      this.isFadingOut = false;
      this.currentEngineRPM = 0.0;
      this.lastRPMUpdateTime = performance.now();

      // If authentic real car sample is ready, start it immediately!
      if (this.engineSampleBuffer) {
        this.startSampleEngine(t);
        this.engineRunning = true;
        this.initDriftSound();
        return;
      }

      const f0 = this.engineConfig.baseFrequency;

      // 1. Primary Racing Cylinder Core (Clean Sawtooth Tone)
      this.engineMainOsc = this.ctx.createOscillator();
      this.engineMainOsc.type = 'sawtooth';
      this.engineMainOsc.frequency.setValueAtTime(f0, t);

      this.engineMainGain = this.ctx.createGain();
      this.engineMainGain.gain.setValueAtTime(this.engineConfig.fundamentalGain, t);
      this.engineMainOsc.connect(this.engineMainGain);

      // 2. Sub-Bass Chassis Tone (Solid Triangle, 0.5x f0)
      this.engineSubOsc = this.ctx.createOscillator();
      this.engineSubOsc.type = 'triangle';
      this.engineSubOsc.frequency.setValueAtTime(f0 * 0.5, t);

      this.engineSubGain = this.ctx.createGain();
      this.engineSubGain.gain.setValueAtTime(this.engineConfig.subGain, t);
      this.engineSubOsc.connect(this.engineSubGain);

      // 3. Upper Harmonic Racing Layer (Clean Octave, 2.0x f0)
      this.engineHarmonicOsc = this.ctx.createOscillator();
      this.engineHarmonicOsc.type = 'sawtooth';
      this.engineHarmonicOsc.frequency.setValueAtTime(f0 * 2.0, t);

      this.engineHarmonicGain = this.ctx.createGain();
      this.engineHarmonicGain.gain.setValueAtTime(this.engineConfig.harmonicGain, t);
      this.engineHarmonicOsc.connect(this.engineHarmonicGain);

      // 4. Aerodynamic Air Intake Noise
      const noiseBuffer = this.getNoiseBuffer();
      this.engineIntakeNoiseNode = this.ctx.createBufferSource();
      this.engineIntakeNoiseNode.buffer = noiseBuffer;
      this.engineIntakeNoiseNode.loop = true;

      this.engineIntakeFilter = this.ctx.createBiquadFilter();
      this.engineIntakeFilter.type = 'bandpass';
      this.engineIntakeFilter.frequency.setValueAtTime(450, t);
      this.engineIntakeFilter.Q.setValueAtTime(1.2, t);

      this.engineIntakeGain = this.ctx.createGain();
      this.engineIntakeGain.gain.setValueAtTime(this.engineConfig.noiseGain * 0.4, t);

      this.engineIntakeNoiseNode.connect(this.engineIntakeFilter);
      this.engineIntakeFilter.connect(this.engineIntakeGain);

      // 5. Master Racing Low-Pass Filter (Opens smoothly under throttle)
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(this.engineConfig.filterCutoffIdle, t);
      this.engineFilter.Q.setValueAtTime(this.engineConfig.filterQ, t);

      // Sum all clean layers into master filter
      this.engineMainGain.connect(this.engineFilter);
      this.engineSubGain.connect(this.engineFilter);
      this.engineHarmonicGain.connect(this.engineFilter);
      this.engineIntakeGain.connect(this.engineFilter);

      // 6. Master Engine Gain Node (Direct steady feed - ZERO LFO, ZERO WOBBLE)
      this.engineGain = this.ctx.createGain();
      const initialGain = 0.18 * this.engineConfig.masterEngineGain;
      this.engineGain.gain.setValueAtTime(initialGain, t);

      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.getMasterDestination());

      // Start sound sources
      this.engineMainOsc.start(t);
      this.engineSubOsc.start(t);
      this.engineHarmonicOsc.start(t);
      this.engineIntakeNoiseNode.start(t);

      this.engineRunning = true;
      this.initDriftSound();
    } catch {
      // AudioContext policy handled
    }
  }

  /**
   * Smooth, steady racing engine pitch & load dynamics
   * Authentic car engine sample playback modulation + procedural fallback.
   * @param speedFraction Normalized vehicle speed (0.0 to 1.0)
   * @param isAccelerating Whether forward throttle is actively applied
   */
  public updateEnginePitch(speedFraction: number, isAccelerating: boolean) {
    if (this.isScoreboardActive) {
      // Scoreboard is active: strictly silent, never restart or modulate engine
      return;
    }
    if (!this.ctx) this.initCtx();
    if (this.isEngineStoppedManually) {
      // If engine was manually stopped (e.g. race finish / scoreboard), only resume when player actively hits throttle
      if (!isAccelerating && speedFraction < 0.15) {
        return;
      }
      this.isEngineStoppedManually = false;
    }
    if (isAccelerating || speedFraction > 0.05) {
      this.isEngineStoppedManually = false;
    }
    if (!this.engineRunning && !this.isEngineStoppedManually) {
      this.startEngine();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const clampedSpeed = Math.min(1.0, Math.max(0.0, speedFraction));

    // Smooth continuous racing load & RPM target
    // Natural throttle rev bite, smooth coasting momentum
    let targetRPM = clampedSpeed;
    if (isAccelerating) {
      targetRPM = Math.min(1.0, 0.12 + clampedSpeed * 0.88);
    } else {
      targetRPM = Math.max(0.0, clampedSpeed * 0.72);
    }

    // Rotational Flywheel Inertia (Smooth natural transitions without jitter)
    const now = performance.now();
    const dt = this.lastRPMUpdateTime > 0 ? Math.min(0.1, (now - this.lastRPMUpdateTime) / 1000) : 0.016;
    this.lastRPMUpdateTime = now;

    const lerpRate = isAccelerating ? 7.5 : 4.5; // Natural throttle pickup, organic coasting decay
    this.currentEngineRPM += (targetRPM - this.currentEngineRPM) * Math.min(1.0, dt * lerpRate);

    // ── CASE 1: REAL RECORDED CAR ENGINE AUDIO (SAMPLE-BASED) ──
    if (this.engineSampleSource && this.engineGain && this.engineFilter) {
      const cfg = ACTIVE_ENGINE_CONFIG;

      // Dynamic speed revving (silky smooth, non-fatiguing acceleration curve):
      const targetRate = isAccelerating
        ? cfg.accelBaseRate + this.currentEngineRPM * cfg.accelRateMultiplier
        : cfg.coastBaseRate + this.currentEngineRPM * cfg.coastRateMultiplier;
      this.engineSampleSource.playbackRate.setTargetAtTime(targetRate, t, 0.08);

      // Warm frequency contour: opens low-pass filter gently without harsh ear-piercing frequencies
      const targetCutoff = isAccelerating
        ? cfg.accelBaseCutoff + this.currentEngineRPM * cfg.accelCutoffMultiplier
        : cfg.coastBaseCutoff + this.currentEngineRPM * cfg.coastCutoffMultiplier;
      this.engineFilter.frequency.setTargetAtTime(targetCutoff, t, 0.08);

      // Bass & vibration: steady soothing low-shelf thrum
      if (this.engineBassBoost) {
        const targetBassBoost = isAccelerating ? cfg.accelBassBoostGain : cfg.coastBassBoostGain;
        this.engineBassBoost.gain.setTargetAtTime(targetBassBoost, t, 0.08);
      }

      // Smooth, soothing car volume (with subtle ducking during drift so tire screeches take center stage)
      const driftDucking = this.isDriftActive ? 0.78 : 1.0;
      const targetGain = (isAccelerating
        ? cfg.accelBaseGain + this.currentEngineRPM * cfg.accelGainMultiplier
        : cfg.coastBaseGain + this.currentEngineRPM * cfg.coastGainMultiplier) * this.engineConfig.masterEngineGain * driftDucking;
      this.engineGain.gain.setTargetAtTime(targetGain, t, 0.08);

      this.wasAccelerating = isAccelerating;
      this.lastSpeedFraction = clampedSpeed;
      return;
    }

    // ── CASE 2: PROCEDURAL SYNTH FALLBACK (WHILE SAMPLE DECODES) ──
    if (!this.engineMainOsc || !this.engineGain || !this.engineFilter) return;

    // Fundamental Frequency Calculation:
    // Pure, steady pitch glide from 55 Hz (idle) to 175 Hz (top speed)
    const { baseFrequency, maxFrequency, filterCutoffIdle, filterCutoffMax, masterEngineGain } = this.engineConfig;
    const currentF0 = baseFrequency + this.currentEngineRPM * (maxFrequency - baseFrequency);

    // 1. Primary Engine Oscillator (Clean steady pitch, zero detune)
    this.engineMainOsc.frequency.setTargetAtTime(currentF0, t, 0.04);

    // 2. Sub-Bass Chassis Tone (0.5x f0)
    if (this.engineSubOsc) {
      this.engineSubOsc.frequency.setTargetAtTime(currentF0 * 0.5, t, 0.04);
    }

    // 3. Upper Harmonic (2.0x f0, exact octave)
    if (this.engineHarmonicOsc) {
      this.engineHarmonicOsc.frequency.setTargetAtTime(currentF0 * 2.0, t, 0.04);
    }

    // 4. Warm Lowpass Filter (Opens under load to unleash clean racing roar)
    const targetCutoff = isAccelerating
      ? filterCutoffIdle + this.currentEngineRPM * (filterCutoffMax - filterCutoffIdle)
      : filterCutoffIdle + this.currentEngineRPM * (filterCutoffMax - filterCutoffIdle) * 0.55;
    this.engineFilter.frequency.setTargetAtTime(targetCutoff, t, 0.05);

    // 5. Aerodynamic Intake Airflow
    if (this.engineIntakeGain && this.engineIntakeFilter) {
      const intakeGain = isAccelerating
        ? (this.engineConfig.noiseGain * 0.6) + this.currentEngineRPM * (this.engineConfig.noiseGain * 1.4)
        : this.engineConfig.noiseGain * 0.3;
      const intakeFreq = 420 + this.currentEngineRPM * 550;
      this.engineIntakeGain.gain.setTargetAtTime(intakeGain, t, 0.05);
      this.engineIntakeFilter.frequency.setTargetAtTime(intakeFreq, t, 0.05);
    }

    // 6. Master Engine Gain Automation (Solid volume climb under gas)
    const targetGain = isAccelerating
      ? (0.22 + this.currentEngineRPM * 0.26) * masterEngineGain
      : (0.16 + this.currentEngineRPM * 0.16) * masterEngineGain;
    this.engineGain.gain.setTargetAtTime(targetGain, t, 0.05);

    this.wasAccelerating = isAccelerating;
    this.lastSpeedFraction = clampedSpeed;
  }

  // ── DYNAMIC ASPHALT TIRE DRIFT / SKID SOUND ──
  private initDriftSound() {
    if (!this.ctx) return;
    this.loadDriftSample();

    if (!this.driftGain) {
      this.driftGain = this.ctx.createGain();
      this.driftGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.driftGain.connect(this.getMasterDestination());
    }
  }

  /**
   * Modulate realistic tire screeching on asphalt during drifts
   * Uses user-provided drift.mp3 when loaded, with dynamic slip-angle pitch & gain modulation
   * @param isDrifting Whether player kart is in an active drift
   * @param intensity Drift slip intensity (0.0 to 1.0)
   */
  public updateDrift(isDrifting: boolean, intensity: number = 1.0) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    if (!this.driftGain) {
      this.driftGain = this.ctx.createGain();
      this.driftGain.gain.setValueAtTime(0, t);
      this.driftGain.connect(this.getMasterDestination());
    }

    if (isDrifting && intensity > 0.01) {
      if (!this.isDriftActive) {
        this.driftStartTime = performance.now();
      }
      this.isDriftActive = true;
      if (this.driftStopTimeout) {
        clearTimeout(this.driftStopTimeout);
        this.driftStopTimeout = null;
      }

      const clamped = Math.min(1.0, Math.max(0.0, intensity));
      const driftElapsed = Math.max(0, (performance.now() - this.driftStartTime) / 1000);

      // 1. Primary: High-fidelity user-provided /src/sounds/drift.mp3
      if (this.driftSampleBuffer) {
        const bufDuration = this.driftSampleBuffer.duration;
        const baseLoopStart = Math.min(0.38, bufDuration * 0.25);
        const baseLoopEnd = Math.max(baseLoopStart + 0.45, bufDuration - 0.08);

        // Voice 1: Starts at 0.0s on drift initiation (crisp, aggressive tire bite screech).
        // Once past baseLoopStart, continuous 360 drift loops only the sustained friction body,
        // so the initial tire bite NEVER repeats unnaturally!
        if (!this.driftSampleSource) {
          this.driftSampleSource = this.ctx.createBufferSource();
          this.driftSampleSource.buffer = this.driftSampleBuffer;
          this.driftSampleSource.loop = true;
          this.driftSampleSource.loopStart = baseLoopStart;
          this.driftSampleSource.loopEnd = baseLoopEnd;
          this.driftSampleSource.connect(this.driftGain);
          this.driftSampleSource.start(t, 0.0);
        }

        // Voice 2: Sustained organic cross-layer for extended drifts & 360 donuts (> 0.70s).
        // Layered with an offset loop window & micro-detune so long donuts NEVER feel like a static loop!
        if (driftElapsed > 0.70 && !this.driftSampleSource2) {
          if (!this.driftGain2) {
            this.driftGain2 = this.ctx.createGain();
            this.driftGain2.gain.setValueAtTime(0, t);
            this.driftGain2.connect(this.getMasterDestination());
          }
          this.driftSampleSource2 = this.ctx.createBufferSource();
          this.driftSampleSource2.buffer = this.driftSampleBuffer;
          this.driftSampleSource2.loop = true;
          const offsetLoopStart = Math.min(0.52, bufDuration * 0.35);
          const offsetLoopEnd = Math.max(offsetLoopStart + 0.40, bufDuration - 0.16);
          this.driftSampleSource2.loopStart = offsetLoopStart;
          this.driftSampleSource2.loopEnd = offsetLoopEnd;
          this.driftSampleSource2.connect(this.driftGain2);
          this.driftSampleSource2.start(t, offsetLoopStart);
          this.driftGain2.gain.setValueAtTime(0, t);
        }

        // Dynamic centrifugal tire scrub & organic pitch flutter during 360 spins
        const flutter = Math.sin(driftElapsed * 3.6) * 0.024 + Math.cos(driftElapsed * 2.2) * 0.016;
        const targetRate1 = 0.98 + clamped * 0.22 + flutter;
        this.driftSampleSource.playbackRate.setTargetAtTime(targetRate1, t, 0.04);

        if (this.driftSampleSource2 && this.driftGain2) {
          const targetRate2 = (0.98 + clamped * 0.22) * 1.025 - flutter * 0.8;
          this.driftSampleSource2.playbackRate.setTargetAtTime(targetRate2, t, 0.04);

          // Smoothly cross-fade Voice 2 in during continuous donuts
          const voice2Weight = Math.min(0.65, (driftElapsed - 0.70) * 0.80);
          const baseGain = 1.45 + clamped * 0.95;
          this.driftGain.gain.setTargetAtTime(baseGain * (1.0 - voice2Weight * 0.35), t, 0.04);
          this.driftGain2.gain.setTargetAtTime(baseGain * voice2Weight, t, 0.04);
        } else {
          const targetGain = 1.45 + clamped * 0.95;
          this.driftGain.gain.setTargetAtTime(targetGain, t, 0.04);
        }
        return;
      }

      // 2. Procedural multi-layer fallback if sample is still loading
      if (!this.driftNoiseNode) {
        const noiseBuffer = this.getNoiseBuffer();
        this.driftNoiseNode = this.ctx.createBufferSource();
        this.driftNoiseNode.buffer = noiseBuffer;
        this.driftNoiseNode.loop = true;

        this.driftScreechFilter = this.ctx.createBiquadFilter();
        this.driftScreechFilter.type = 'bandpass';
        this.driftScreechFilter.frequency.setValueAtTime(2600, t);
        this.driftScreechFilter.Q.setValueAtTime(4.2, t);

        this.driftGritFilter = this.ctx.createBiquadFilter();
        this.driftGritFilter.type = 'bandpass';
        this.driftGritFilter.frequency.setValueAtTime(540, t);
        this.driftGritFilter.Q.setValueAtTime(2.2, t);

        this.driftFlutterOsc = this.ctx.createOscillator();
        this.driftFlutterOsc.type = 'sine';
        this.driftFlutterOsc.frequency.setValueAtTime(34, t);

        this.driftFlutterGain = this.ctx.createGain();
        this.driftFlutterGain.gain.setValueAtTime(240, t);

        this.driftFlutterOsc.connect(this.driftFlutterGain);
        this.driftFlutterGain.connect(this.driftScreechFilter.frequency);

        this.driftNoiseNode.connect(this.driftScreechFilter);
        this.driftNoiseNode.connect(this.driftGritFilter);
        this.driftScreechFilter.connect(this.driftGain);
        this.driftGritFilter.connect(this.driftGain);

        this.driftNoiseNode.start(t);
        this.driftFlutterOsc.start(t);
      }

      const targetGain = 0.22 + clamped * 0.30;
      const screechFreq = 2400 + clamped * 1100;
      const gritFreq = 480 + clamped * 340;

      this.driftGain.gain.setTargetAtTime(targetGain, t, 0.03);
      if (this.driftScreechFilter) this.driftScreechFilter.frequency.setTargetAtTime(screechFreq, t, 0.03);
      if (this.driftGritFilter) this.driftGritFilter.frequency.setTargetAtTime(gritFreq, t, 0.03);
    } else {
      this.isDriftActive = false;
      this.driftGain.gain.setTargetAtTime(0.0, t, 0.06);
      if (this.driftGain2) {
        this.driftGain2.gain.setTargetAtTime(0.0, t, 0.06);
      }

      if (!this.driftStopTimeout) {
        this.driftStopTimeout = window.setTimeout(() => {
          this.driftStopTimeout = null;
          if (!this.isDriftActive) {
            if (this.driftSampleSource) {
              try {
                this.driftSampleSource.stop();
                this.driftSampleSource.disconnect();
              } catch {}
              this.driftSampleSource = null;
            }
            if (this.driftSampleSource2) {
              try {
                this.driftSampleSource2.stop();
                this.driftSampleSource2.disconnect();
              } catch {}
              this.driftSampleSource2 = null;
            }
          }
        }, 120);
      }
    }
  }

  /**
   * Immediately silences and halts all tire drift screech audio voices
   */
  public stopDrift() {
    this.isDriftActive = false;
    if (this.driftStopTimeout) {
      clearTimeout(this.driftStopTimeout);
      this.driftStopTimeout = null;
    }
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.driftGain) {
      try {
        this.driftGain.gain.cancelScheduledValues(t);
        this.driftGain.gain.setValueAtTime(0, t);
      } catch {}
    }
    if (this.driftGain2) {
      try {
        this.driftGain2.gain.cancelScheduledValues(t);
        this.driftGain2.gain.setValueAtTime(0, t);
      } catch {}
    }
    if (this.driftSampleSource) {
      try {
        this.driftSampleSource.stop();
        this.driftSampleSource.disconnect();
      } catch {}
      this.driftSampleSource = null;
    }
    if (this.driftSampleSource2) {
      try {
        this.driftSampleSource2.stop();
        this.driftSampleSource2.disconnect();
      } catch {}
      this.driftSampleSource2 = null;
    }
    if (this.driftFlutterOsc) {
      try {
        this.driftFlutterOsc.stop();
        this.driftFlutterOsc.disconnect();
      } catch {}
      this.driftFlutterOsc = null;
    }
    if (this.driftNoiseNode) {
      try {
        this.driftNoiseNode.stop();
        this.driftNoiseNode.disconnect();
      } catch {}
      this.driftNoiseNode = null;
    }
  }

  /**
   * Smoothly spins down engine flywheel RPM and fades out volume over ~1.0s
   * Used when displaying match finish scoreboard for an organic, cinematic audio transition.
   * "jaise scoreboard aagya tb slow krna chalu krdo"
   */
  public fadeEngineOut(duration: number = 1.0) {
    this.isScoreboardActive = true;
    this.isEngineStoppedManually = true;

    // Idempotent: If already in the middle of fading out, let the active fade curve run to completion!
    if (this.isFadingOut) {
      return;
    }

    if (!this.ctx || !this.engineRunning) {
      this.stopEngine();
      return;
    }

    this.isFadingOut = true;

    if (this.engineFadeTimeout) {
      clearTimeout(this.engineFadeTimeout);
      this.engineFadeTimeout = null;
    }

    const t = this.ctx.currentTime;

    // 1. Smoothly fade out any active tire drift screech immediately
    if (this.driftGain) {
      try {
        this.driftGain.gain.cancelScheduledValues(t);
        const curDrift = Math.max(0.0001, this.driftGain.gain.value);
        this.driftGain.gain.setValueAtTime(curDrift, t);
        this.driftGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      } catch {}
    }
    if (this.driftGain2) {
      try {
        this.driftGain2.gain.cancelScheduledValues(t);
        const curDrift2 = Math.max(0.0001, this.driftGain2.gain.value);
        this.driftGain2.gain.setValueAtTime(curDrift2, t);
        this.driftGain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      } catch {}
    }
    this.isDriftActive = false;

    // 2. Smoothly spin down flywheel RPM & low-pass filter (authentic engine decelerating / spin-down)
    const targetIdleRate = ACTIVE_ENGINE_CONFIG.idlePlaybackRate * 0.85;
    if (this.engineSampleSource) {
      try {
        this.engineSampleSource.playbackRate.cancelScheduledValues(t);
        const curRate = this.engineSampleSource.playbackRate.value;
        this.engineSampleSource.playbackRate.setValueAtTime(curRate, t);
        this.engineSampleSource.playbackRate.exponentialRampToValueAtTime(
          Math.max(0.35, targetIdleRate),
          t + duration
        );
      } catch {
        try {
          this.engineSampleSource.playbackRate.setTargetAtTime(targetIdleRate, t, duration * 0.35);
        } catch {}
      }
    }
    if (this.engineFilter) {
      try {
        this.engineFilter.frequency.cancelScheduledValues(t);
        const curCutoff = this.engineFilter.frequency.value;
        this.engineFilter.frequency.setValueAtTime(curCutoff, t);
        this.engineFilter.frequency.exponentialRampToValueAtTime(
          Math.max(400, ACTIVE_ENGINE_CONFIG.initialFilterCutoff * 0.65),
          t + duration
        );
      } catch {}
    }

    // Procedural synth fallback spin-down
    if (this.engineMainOsc) {
      try {
        this.engineMainOsc.frequency.cancelScheduledValues(t);
        this.engineMainOsc.frequency.setValueAtTime(this.engineMainOsc.frequency.value, t);
        this.engineMainOsc.frequency.exponentialRampToValueAtTime(
          Math.max(20, this.engineConfig.baseFrequency * 0.5),
          t + duration
        );
      } catch {}
    }
    if (this.engineSubOsc) {
      try {
        this.engineSubOsc.frequency.cancelScheduledValues(t);
        this.engineSubOsc.frequency.setValueAtTime(this.engineSubOsc.frequency.value, t);
        this.engineSubOsc.frequency.exponentialRampToValueAtTime(
          Math.max(15, this.engineConfig.baseFrequency * 0.25),
          t + duration
        );
      } catch {}
    }

    // 3. Smooth exponential volume fade-out to zero over duration
    if (this.engineGain) {
      try {
        this.engineGain.gain.cancelScheduledValues(t);
        const currentGain = Math.max(0.001, this.engineGain.gain.value);
        this.engineGain.gain.setValueAtTime(currentGain, t);
        this.engineGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      } catch {}
    }

    this.currentEngineRPM = 0.0;
    this.wasAccelerating = false;
    this.lastSpeedFraction = 0.0;

    // 4. Safely disconnect nodes once the fade finishes to free audio resources
    this.engineFadeTimeout = window.setTimeout(() => {
      this.engineFadeTimeout = null;
      this.isFadingOut = false;
      this.engineRunning = false;
      this.stopEngine();
    }, Math.floor(duration * 1000) + 60);
  }

  public stopEngine() {
    if (this.engineSampleSource) {
      try {
        this.engineSampleSource.stop();
        this.engineSampleSource.disconnect();
      } catch {}
      this.engineSampleSource = null;
    }
    if (this.engineSubOsc) {
      try {
        this.engineSubOsc.stop();
        this.engineSubOsc.disconnect();
      } catch {}
      this.engineSubOsc = null;
    }
    if (this.engineMainOsc) {
      try {
        this.engineMainOsc.stop();
        this.engineMainOsc.disconnect();
      } catch {}
      this.engineMainOsc = null;
    }
    if (this.engineHarmonicOsc) {
      try {
        this.engineHarmonicOsc.stop();
        this.engineHarmonicOsc.disconnect();
      } catch {}
      this.engineHarmonicOsc = null;
    }
    if (this.engineIntakeNoiseNode) {
      try {
        this.engineIntakeNoiseNode.stop();
        this.engineIntakeNoiseNode.disconnect();
      } catch {}
      this.engineIntakeNoiseNode = null;
    }
    if (this.engineHarmonicGain) {
      try { this.engineHarmonicGain.disconnect(); } catch {}
      this.engineHarmonicGain = null;
    }
    if (this.engineMainGain) {
      try { this.engineMainGain.disconnect(); } catch {}
      this.engineMainGain = null;
    }
    if (this.engineSubGain) {
      try { this.engineSubGain.disconnect(); } catch {}
      this.engineSubGain = null;
    }
    if (this.engineIntakeFilter) {
      try { this.engineIntakeFilter.disconnect(); } catch {}
      this.engineIntakeFilter = null;
    }
    if (this.engineIntakeGain) {
      try { this.engineIntakeGain.disconnect(); } catch {}
      this.engineIntakeGain = null;
    }
    if (this.engineFilter) {
      try { this.engineFilter.disconnect(); } catch {}
      this.engineFilter = null;
    }
    if (this.engineBassBoost) {
      try { this.engineBassBoost.disconnect(); } catch {}
      this.engineBassBoost = null;
    }
    if (this.engineGain) {
      try { this.engineGain.disconnect(); } catch {}
      this.engineGain = null;
    }
    if (this.driftFlutterOsc) {
      try {
        this.driftFlutterOsc.stop();
        this.driftFlutterOsc.disconnect();
      } catch {}
      this.driftFlutterOsc = null;
    }
    if (this.driftNoiseNode) {
      try {
        this.driftNoiseNode.stop();
        this.driftNoiseNode.disconnect();
      } catch {}
      this.driftNoiseNode = null;
      this.isDriftActive = false;
    }
    if (this.driftSampleSource) {
      try {
        this.driftSampleSource.stop();
        this.driftSampleSource.disconnect();
      } catch {}
      this.driftSampleSource = null;
    }
    if (this.driftSampleSource2) {
      try {
        this.driftSampleSource2.stop();
        this.driftSampleSource2.disconnect();
      } catch {}
      this.driftSampleSource2 = null;
    }
    if (this.driftStopTimeout) {
      clearTimeout(this.driftStopTimeout);
      this.driftStopTimeout = null;
    }
    if (this.driftGain && this.ctx) {
      try {
        this.driftGain.gain.setValueAtTime(0, this.ctx.currentTime);
      } catch {}
    }
    if (this.driftGain2 && this.ctx) {
      try {
        this.driftGain2.gain.setValueAtTime(0, this.ctx.currentTime);
      } catch {}
    }
    this.isDriftActive = false;
    this.currentEngineRPM = 0.0;
    this.wasAccelerating = false;
    this.lastSpeedFraction = 0.0;
    this.isEngineStoppedManually = true;
    this.engineRunning = false;
    this.isFadingOut = false;
    if (this.engineFadeTimeout) {
      clearTimeout(this.engineFadeTimeout);
      this.engineFadeTimeout = null;
    }
  }

  // High-fidelity pre-synthesized crash impact buffer (0.36s)
  // Deep automotive bumper impact: warm bass thud (190Hz -> 78Hz) + sub-chassis punch + smooth low-passed friction
  // Zero harsh treble, zero synthetic sine chimes, rich satisfying low-end weight
  private getCrashBuffer(): AudioBuffer {
    if (!this.ctx) this.initCtx();
    if (!this.cachedCrashBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const duration = 0.36;
      const numFrames = Math.floor(sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, numFrames, sampleRate);
      const data = buffer.getChannelData(0);

      let phaseThump = 0;
      let phaseSub = 0;
      let phaseBody = 0;
      let noiseLP1 = 0;
      let noiseLP2 = 0;

      for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const progress = t / duration;

        // 1. Primary Warm Bumper Thud (Smooth sweep from 190 Hz down to 78 Hz)
        const fThump = 78 + (190 - 78) * Math.exp(-progress * 10.0);
        phaseThump += (2 * Math.PI * fThump) / sampleRate;
        const thumpEnv = Math.exp(-progress * 6.5);
        const thumpSample = Math.sin(phaseThump) * thumpEnv * 0.85;

        // 2. Deep Sub-Bass Chassis Weight (Drops from 110 Hz down to 58 Hz for solid physical thump)
        const fSub = 58 + (110 - 58) * Math.exp(-progress * 8.5);
        phaseSub += (2 * Math.PI * fSub) / sampleRate;
        const subEnv = Math.exp(-progress * 6.0);
        const subSample = Math.sin(phaseSub) * subEnv * 0.55;

        // 3. Warm Low-Mid Kart Frame Body (Centered at 135 Hz)
        phaseBody += (2 * Math.PI * 135) / sampleRate;
        const bodyEnv = Math.exp(-progress * 11.0);
        const bodySample = Math.sin(phaseBody) * bodyEnv * 0.35;

        // 4. Smooth Low-Passed Contact Friction (2-pole filter under 550 Hz, 100% zero harsh treble sizzle)
        const rawNoise = Math.random() * 2 - 1;
        noiseLP1 = 0.10 * rawNoise + 0.90 * noiseLP1;
        noiseLP2 = 0.10 * noiseLP1 + 0.90 * noiseLP2;
        const crunchEnv = Math.exp(-progress * 15.0);
        const crunchSample = noiseLP2 * crunchEnv * 0.35;

        // Warm analog saturation (rich, heavy, smooth feel)
        const composite = thumpSample + subSample + bodySample + crunchSample;
        data[i] = Math.tanh(composite * 1.15);
      }
      this.cachedCrashBuffer = buffer;
    }
    return this.cachedCrashBuffer!;
  }

  // High-fidelity pre-synthesized Nitro jet turbo boost buffer (0.48s)
  // Combines sub NOS ignition punch + rising turbine scream + jet air-rush whoosh
  private getBoostBuffer(): AudioBuffer {
    if (!this.ctx) this.initCtx();
    if (!this.cachedBoostBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const duration = 0.48;
      const numFrames = Math.floor(sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, numFrames, sampleRate);
      const data = buffer.getChannelData(0);

      let phaseSub = 0;
      let phaseTurbine = 0;
      let noiseBP = 0;

      for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const progress = t / duration;

        // 1. Sub NOS blast (140Hz -> 32Hz)
        const fSub = 32 + (140 - 32) * Math.exp(-progress * 8.0);
        phaseSub += (2 * Math.PI * fSub) / sampleRate;
        const subEnv = Math.exp(-progress * 6.5);
        const subSample = Math.sin(phaseSub) * subEnv * 0.65;

        // 2. Smooth rising turbine jet tone (240Hz -> 850Hz)
        const fTurbine = 240 + (850 - 240) * (progress * progress);
        phaseTurbine += (2 * Math.PI * fTurbine) / sampleRate;
        const turbineEnv = Math.sin(Math.min(1.0, progress * 3.0) * Math.PI * 0.5) * (1.0 - progress);
        const turbineSample = (Math.sin(phaseTurbine) + 0.3 * Math.sin(phaseTurbine * 2)) * turbineEnv * 0.22;

        // 3. Sweeping jet air whoosh (filtered noise)
        const rawNoise = Math.random() * 2 - 1;
        noiseBP = 0.20 * rawNoise + 0.80 * noiseBP;
        const airEnv = Math.sin(Math.min(1.0, progress * 2.5) * Math.PI * 0.5) * (1.0 - progress * 0.85);
        const airSample = noiseBP * airEnv * 0.44;

        const composite = subSample + turbineSample + airSample;
        data[i] = Math.tanh(composite * 1.05);
      }
      this.cachedBoostBuffer = buffer;
    }
    return this.cachedBoostBuffer!;
  }

  // ── PRE-RENDERED ZERO-GC JET TURBO NITRO BOOST ──
  // Instant trigger, silky smooth 60fps playback without audio worklet stall
  public playBoost() {
    this.initCtx();
    if (!this.ctx || this.isMuted) return;

    try {
      const buffer = this.getBoostBuffer();
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 0.98 + Math.random() * 0.04;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.52; // Exact 20% reduction from 0.65 (smooth & powerful)

      source.connect(gain);
      gain.connect(this.getMasterDestination());

      source.start();
      source.onended = () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  // ── PRE-RENDERED ZERO-GC HIGH-FIDELITY CRASH IMPACT ──
  // Zero graph mutations on main thread -> 100% immune to audio buffer underruns & collision frame drops
  public playCrash(impactStrength: number = 1.0) {
    this.initCtx();
    if (!this.ctx || this.isMuted) return;

    const now = performance.now();
    if (now - this.lastCrashSoundTime < 400) return;
    this.lastCrashSoundTime = now;

    const clampedStrength = Math.min(2.0, Math.max(0.4, impactStrength));
    if (clampedStrength < 0.05) return;

    try {
      const buffer = this.getCrashBuffer();
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      // Deep acoustic pitch spread (keeps pitch grounded in satisfying bass territory)
      source.playbackRate.value = 0.90 + Math.random() * 0.10;

      const gain = this.ctx.createGain();
      // Smooth, warm bass impact volume:
      gain.gain.value = Math.min(0.82, 0.48 + clampedStrength * 0.22);

      source.connect(gain);
      gain.connect(this.getMasterDestination());

      source.start();
      source.onended = () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }

  // Nitro Canister Refill / Collect Chime (Crisp double high ping)
  public playNitro() {
    this.initCtx();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, t); // D5
    osc.frequency.exponentialRampToValueAtTime(1174.66, t + 0.18); // D6

    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    osc.connect(gain);
    gain.connect(this.getMasterDestination());

    osc.start(t);
    osc.stop(t + 0.33);
  }

  // Fall off track - 100% silent (no sound while falling into abyss)
  public playFall() {}

  // Quantum Respawn Teleport Shimmer
  public playRespawn() {
    this.initCtx();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;
    const notes = [392, 523.25, 783.99, 1046.5]; // G4, C5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.06);

      gain.gain.setValueAtTime(0.17, t + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 0.22);

      osc.connect(gain);
      gain.connect(this.getMasterDestination());

      osc.start(t + idx * 0.06);
      osc.stop(t + idx * 0.06 + 0.24);
    });
  }

  // Countdown Beeps (3, 2, 1, GO!)
  public playCountdown(isGo: boolean = false) {
    this.initCtx();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;

    if (isGo) {
      // Powerful two-tone fanfare for GO!
      const chord = [523.25, 1046.5]; // C5 + C6
      chord.forEach((freq) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);

        const filter = this.ctx!.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, t);

        gain.gain.setValueAtTime(0.24, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.70);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.getMasterDestination());

        osc.start(t);
        osc.stop(t + 0.72);
      });
    } else {
      // Snappy metallic blip for 3, 2, 1
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, t);

      gain.gain.setValueAtTime(0.27, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.connect(gain);
      gain.connect(this.getMasterDestination());

      osc.start(t);
      osc.stop(t + 0.24);
    }
  }

  // Snappy arcade select chirp for UI carousel navigation
  public playSelect() {
    this.initCtx();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, t); // E5
    osc.frequency.exponentialRampToValueAtTime(987.77, t + 0.07); // B5

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.getMasterDestination());

    osc.start(t);
    osc.stop(t + 0.085);
  }

  // Crystal-clear arcade coin collect chime
  public playCoin() {
    this.initCtx();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987.77, t); // B5
    osc1.frequency.setValueAtTime(1318.51, t + 0.07); // E6

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1975.53, t + 0.07); // B6

    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.getMasterDestination());

    osc1.start(t);
    osc2.start(t + 0.07);
    osc1.stop(t + 0.36);
    osc2.stop(t + 0.36);
  }

  // Grand victory fanfare chime
  public playVictory() {
    this.initCtx();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;
    const fanfare = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    fanfare.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + idx * 0.11);

      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, t + idx * 0.11);

      gain.gain.setValueAtTime(0.24, t + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.11 + 0.36);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getMasterDestination());

      osc.start(t + idx * 0.11);
      osc.stop(t + idx * 0.11 + 0.38);
    });
  }

  // Low-frequency warning thud sound for UI feedback / AFK / invalid actions
  public playRecoil() {
    this.initCtx();
    if (!this.ctx || this.isMuted) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(this.getMasterDestination());
      osc.start(t);
      osc.stop(t + 0.20);
    } catch (e) {}
  }

  // High-energy combat hit confirm / smash sound
  public playSmash() {
    this.initCtx();
    if (!this.ctx || this.isMuted) return;

    try {
      const t = this.ctx.currentTime;
      // Punchy sub drop
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.22);
      gain.gain.setValueAtTime(0.30, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain);
      gain.connect(this.getMasterDestination());
      osc.start(t);
      osc.stop(t + 0.26);

      // Bright arcade hit confirmation harmonic
      const bell = this.ctx.createOscillator();
      const bellGain = this.ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(880, t); // A5
      bell.frequency.setValueAtTime(1320, t + 0.06); // E6
      bellGain.gain.setValueAtTime(0.21, t);
      bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      bell.connect(bellGain);
      bellGain.connect(this.getMasterDestination());
      bell.start(t);
      bell.stop(t + 0.29);
    } catch (e) {}
  }
}

export const sounds = new SoundEngine();
