// Web Audio API procedural sound engine - Advanced Multi-Harmonic Racing Synthesizer
// Features: Dual-saw piston firing + sub-bass rumble + waveshaper combustion rasp +
// exhaust resonance + throttle overrun crackle + dynamic tire drift screech + multi-layer jet nitro.
// Zero external asset downloads, zero loading latency, 100% real-time responsive.

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.8;

  // ── RACING ENGINE NODES ──
  private engineRunning: boolean = false;
  private engineSubOsc: OscillatorNode | null = null;
  private engineMainOsc: OscillatorNode | null = null;
  private engineHarmonicOsc: OscillatorNode | null = null;
  private engineDistortion: WaveShaperNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private wasAccelerating: boolean = false;
  private lastSpeedFraction: number = 0;
  private lastExhaustPopTime: number = 0;

  // ── DYNAMIC TIRE DRIFT / SKID NODES ──
  private driftNoiseNode: AudioBufferSourceNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;
  private isDriftActive: boolean = false;

  // ── CACHED BUFFERS ──
  private cachedNoiseBuffer: AudioBuffer | null = null;
  private cachedCrashBuffer: AudioBuffer | null = null;
  private cachedBoostBuffer: AudioBuffer | null = null;
  private distortionCurve: Float32Array<ArrayBuffer> | null = null;
  private lastCrashSoundTime: number = 0;

  constructor() {
    // Initialized on first user gesture to comply with browser autoplay policies
  }

  public getMasterDestination(): AudioNode {
    if (!this.ctx) this.initCtx();
    if (!this.masterGain && this.ctx) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
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
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.masterGain && this.ctx) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    // Pre-warm boost & crash buffers in background so first in-game triggers have zero synthesis latency
    if (!this.cachedBoostBuffer) {
      setTimeout(() => {
        try {
          this.getBoostBuffer();
          this.getCrashBuffer();
        } catch {}
      }, 100);
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

  // Soft-clipping saturation curve for realistic 2-stroke cylinder combustion distortion
  private getDistortionCurve(): Float32Array<ArrayBuffer> {
    if (!this.distortionCurve) {
      const samples = 256;
      const curve = new Float32Array(samples);
      const deg = Math.PI / 180;
      const k = 18; // Saturation drive
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      }
      this.distortionCurve = curve;
    }
    return this.distortionCurve;
  }

  // ── HIGH-OCTANE RACING GO-KART ENGINE ──
  public startEngine() {
    this.initCtx();
    if (!this.ctx || this.engineRunning || this.isMuted) return;

    try {
      const t = this.ctx.currentTime;

      // 1. Sub-Bass Chassis Vibration (32Hz idle)
      this.engineSubOsc = this.ctx.createOscillator();
      this.engineSubOsc.type = 'triangle';
      this.engineSubOsc.frequency.setValueAtTime(32, t);

      // 2. Primary Cylinder Firing (Sawtooth)
      this.engineMainOsc = this.ctx.createOscillator();
      this.engineMainOsc.type = 'sawtooth';
      this.engineMainOsc.frequency.setValueAtTime(46, t);

      // 3. Second Piston Harmonic (Detuned Sawtooth for realistic mechanical acoustic beating)
      this.engineHarmonicOsc = this.ctx.createOscillator();
      this.engineHarmonicOsc.type = 'sawtooth';
      this.engineHarmonicOsc.frequency.setValueAtTime(92.4, t);

      // 4. WaveShaper Distortion (Converts electronic buzz into aggressive combustion rasp)
      this.engineDistortion = this.ctx.createWaveShaper();
      this.engineDistortion.curve = this.getDistortionCurve();
      this.engineDistortion.oversample = '2x';

      // 5. Tuned Expansion Chamber Exhaust Pipe (Resonant bandpass + lowpass)
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(380, t);
      this.engineFilter.Q.setValueAtTime(2.8, t); // Expansion pipe throat resonance

      // 6. Master Engine Gain
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.09, t);

      // Routing:
      // Sub -> Filter -> Gain
      this.engineSubOsc.connect(this.engineFilter);
      // Main & Harmonic -> Distortion -> Filter -> Gain
      this.engineMainOsc.connect(this.engineDistortion);
      this.engineHarmonicOsc.connect(this.engineDistortion);
      this.engineDistortion.connect(this.engineFilter);

      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.getMasterDestination());

      this.engineSubOsc.start(t);
      this.engineMainOsc.start(t);
      this.engineHarmonicOsc.start(t);

      this.engineRunning = true;
      this.initDriftSound();
    } catch {
      // AudioContext policy handled
    }
  }

  // Continuous dynamic pitch and throttle load simulation
  public updateEnginePitch(speedFraction: number, isAccelerating: boolean) {
    if (!this.ctx || !this.engineMainOsc || !this.engineGain || !this.engineFilter || this.isMuted) return;
    const t = this.ctx.currentTime;

    const clampedSpeed = Math.min(1.0, Math.max(0.0, speedFraction));

    // Dynamic RPM Scaling:
    // Idle = ~44 Hz (125cc kart 2-stroke idle)
    // Redline = ~230 Hz (high rev screaming apex)
    const baseFreq = 44;
    const maxFreq = 220;
    const throttleBoost = isAccelerating ? 22 : 0;
    const targetFreq = baseFreq + Math.pow(clampedSpeed, 0.95) * (maxFreq - baseFreq) + throttleBoost;

    // Sub-bass tracks half-speed engine thump
    if (this.engineSubOsc) {
      this.engineSubOsc.frequency.setTargetAtTime(targetFreq * 0.65, t, 0.08);
    }

    // Main cylinder firing
    this.engineMainOsc.frequency.setTargetAtTime(targetFreq, t, 0.08);

    // Harmonic detune for combustion chug
    if (this.engineHarmonicOsc) {
      this.engineHarmonicOsc.frequency.setTargetAtTime(targetFreq * 2.01, t, 0.08);
    }

    // Dynamic Exhaust Filter Cutoff:
    // Opens wide when throttle is mashed to unleash raspy roar (1200 Hz)
    // Muffles down to deep rumble when coasting (320 Hz)
    const filterCutoff = isAccelerating
      ? 450 + clampedSpeed * 950
      : 300 + clampedSpeed * 400;
    this.engineFilter.frequency.setTargetAtTime(filterCutoff, t, 0.09);

    // Dynamic Volume based on engine load
    const targetGain = isAccelerating
      ? 0.11 + clampedSpeed * 0.07
      : 0.05 + clampedSpeed * 0.04;
    this.engineGain.gain.setTargetAtTime(targetGain, t, 0.08);

    // Throttle Overrun Backfire / Exhaust Pop
    // Triggers when you suddenly lift off gas at high speed going into corners
    if (this.wasAccelerating && !isAccelerating && this.lastSpeedFraction > 0.4) {
      const now = performance.now();
      if (now - this.lastExhaustPopTime > 420) {
        this.playExhaustPop(this.lastSpeedFraction);
        this.lastExhaustPopTime = now;
      }
    }

    this.wasAccelerating = isAccelerating;
    this.lastSpeedFraction = clampedSpeed;
  }

  // Authentic rally/kart exhaust pop / backfire crackle on throttle lift
  private playExhaustPop(intensity: number) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const popCount = Math.random() > 0.5 ? 2 : 1;
    for (let i = 0; i < popCount; i++) {
      const popTime = t + i * (0.06 + Math.random() * 0.05);

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110 + Math.random() * 40, popTime);
      osc.frequency.exponentialRampToValueAtTime(35, popTime + 0.05);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(350 + Math.random() * 200, popTime);

      const vol = 0.09 * intensity * (1.0 - i * 0.3);
      gain.gain.setValueAtTime(vol, popTime);
      gain.gain.exponentialRampToValueAtTime(0.001, popTime + 0.06);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getMasterDestination());

      osc.start(popTime);
      osc.stop(popTime + 0.065);
    }
  }

  // ── DYNAMIC TIRE DRIFT / ASPHALT FRICTION SOUND ──
  private initDriftSound() {
    if (!this.ctx || this.driftNoiseNode) return;

    try {
      const noiseBuffer = this.getNoiseBuffer();
      this.driftNoiseNode = this.ctx.createBufferSource();
      this.driftNoiseNode.buffer = noiseBuffer;
      this.driftNoiseNode.loop = true;

      // Resonant bandpass filter focused on tire tread bite
      this.driftFilter = this.ctx.createBiquadFilter();
      this.driftFilter.type = 'bandpass';
      this.driftFilter.frequency.setValueAtTime(1600, this.ctx.currentTime);
      this.driftFilter.Q.setValueAtTime(3.2, this.ctx.currentTime);

      this.driftGain = this.ctx.createGain();
      this.driftGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.driftNoiseNode.connect(this.driftFilter);
      this.driftFilter.connect(this.driftGain);
      this.driftGain.connect(this.getMasterDestination());

      this.driftNoiseNode.start();
      this.isDriftActive = true;
    } catch {}
  }

  /**
   * Modulate realistic tire screeching on asphalt during drifts
   * @param isDrifting Whether player kart is in an active drift
   * @param intensity Drift slip intensity (0.0 to 1.0)
   */
  public updateDrift(isDrifting: boolean, intensity: number = 1.0) {
    if (!this.ctx || !this.driftGain || !this.driftFilter || this.isMuted) return;
    const t = this.ctx.currentTime;

    if (isDrifting && intensity > 0.05) {
      const clamped = Math.min(1.0, intensity);
      // Sharp, visceral tire screech volume
      const targetGain = 0.06 + clamped * 0.12;
      // High-friction frequency shifts with turning aggression
      const targetFreq = 1400 + clamped * 850;

      this.driftGain.gain.setTargetAtTime(targetGain, t, 0.06);
      this.driftFilter.frequency.setTargetAtTime(targetFreq, t, 0.06);
    } else {
      // Smooth fade out when drift ends
      this.driftGain.gain.setTargetAtTime(0.0, t, 0.08);
    }
  }

  public stopEngine() {
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
    if (this.driftNoiseNode) {
      try {
        this.driftNoiseNode.stop();
        this.driftNoiseNode.disconnect();
      } catch {}
      this.driftNoiseNode = null;
      this.isDriftActive = false;
    }
    this.engineRunning = false;
  }

  // High-fidelity pre-synthesized crash impact buffer (0.36s)
  // Combines sub-chassis thud + metallic resonance chime + filtered crunch noise
  // Pre-rendered once to guarantee ZERO main-thread stall and ZERO audio buffer underruns
  private getCrashBuffer(): AudioBuffer {
    if (!this.ctx) this.initCtx();
    if (!this.cachedCrashBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const duration = 0.36;
      const numFrames = Math.floor(sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, numFrames, sampleRate);
      const data = buffer.getChannelData(0);

      let phaseSub = 0;
      let phaseMetal1 = 0;
      let phaseMetal2 = 0;
      let noiseLP = 0;

      for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const progress = t / duration;

        // Sub thud frequency drops exponentially from 160Hz to 28Hz
        const fSub = 28 + (160 - 28) * Math.exp(-progress * 8.5);
        phaseSub += (2 * Math.PI * fSub) / sampleRate;
        const subEnv = Math.exp(-progress * 7.5);
        const subSample = Math.sin(phaseSub) * subEnv * 0.72;

        // Metallic resonance chime (340Hz + 512Hz)
        phaseMetal1 += (2 * Math.PI * 340) / sampleRate;
        phaseMetal2 += (2 * Math.PI * 512) / sampleRate;
        const metalEnv = Math.exp(-progress * 13.0);
        const metalSample = (Math.sin(phaseMetal1) * 0.55 + Math.sin(phaseMetal2) * 0.45) * metalEnv * 0.32;

        // Bandpass/Lowpass friction crunch noise
        const rawNoise = Math.random() * 2 - 1;
        noiseLP = 0.30 * rawNoise + 0.70 * noiseLP;
        const noiseEnv = Math.exp(-progress * 10.0);
        const noiseSample = noiseLP * noiseEnv * 0.40;

        // Soft-clipping composite
        const composite = subSample + metalSample + noiseSample;
        data[i] = Math.max(-1.0, Math.min(1.0, composite * 1.2));
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

        // 2. Rising turbine scream (280Hz -> 1200Hz)
        const fTurbine = 280 + (1200 - 280) * (progress * progress);
        phaseTurbine += (2 * Math.PI * fTurbine) / sampleRate;
        const turbineEnv = Math.sin(Math.min(1.0, progress * 3.0) * Math.PI * 0.5) * (1.0 - progress);
        const saw = Math.sin(phaseTurbine) + 0.5 * Math.sin(phaseTurbine * 2) + 0.25 * Math.sin(phaseTurbine * 3);
        const turbineSample = saw * turbineEnv * 0.28;

        // 3. Sweeping jet air whoosh (filtered noise)
        const rawNoise = Math.random() * 2 - 1;
        noiseBP = 0.25 * rawNoise + 0.75 * noiseBP;
        const airEnv = Math.sin(Math.min(1.0, progress * 2.5) * Math.PI * 0.5) * (1.0 - progress * 0.85);
        const airSample = noiseBP * airEnv * 0.35;

        const composite = subSample + turbineSample + airSample;
        data[i] = Math.max(-1.0, Math.min(1.0, composite * 1.15));
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
      gain.gain.value = 0.65;

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
    if (now - this.lastCrashSoundTime < 80) return;
    this.lastCrashSoundTime = now;

    const clampedStrength = Math.min(1.8, Math.max(0.2, impactStrength));
    if (clampedStrength < 0.05) return;

    try {
      const buffer = this.getCrashBuffer();
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      // Realistic acoustic pitch spread (+/- 9%)
      source.playbackRate.value = 0.91 + Math.random() * 0.18;

      const gain = this.ctx.createGain();
      gain.gain.value = Math.min(0.85, clampedStrength * 0.58);

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

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    osc.connect(gain);
    gain.connect(this.getMasterDestination());

    osc.start(t);
    osc.stop(t + 0.33);
  }

  // Fall off track whoosh / abyss Doppler drop
  public playFall() {
    this.initCtx();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.85);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.90);

    osc.connect(gain);
    gain.connect(this.getMasterDestination());

    osc.start(t);
    osc.stop(t + 0.92);
  }

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

      gain.gain.setValueAtTime(0.20, t + idx * 0.06);
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

        gain.gain.setValueAtTime(0.28, t);
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

      gain.gain.setValueAtTime(0.32, t);
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
      gain.gain.setValueAtTime(0.35, t);
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
      bellGain.gain.setValueAtTime(0.25, t);
      bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      bell.connect(bellGain);
      bellGain.connect(this.getMasterDestination());
      bell.start(t);
      bell.stop(t + 0.29);
    } catch (e) {}
  }
}

export const sounds = new SoundEngine();
