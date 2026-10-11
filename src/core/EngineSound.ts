/**
 * EngineSound.ts
 * Centralized Engine Sound Configuration for AIRSKIDO.
 */

export interface SampleEngineAudioConfig {
  /** Initial playback rate when stationary / idling */
  idlePlaybackRate: number;
  /** Base playback rate multiplier under throttle */
  accelBaseRate: number;
  /** RPM multiplier for playback rate rev climb under throttle (top speed rev) */
  accelRateMultiplier: number;
  /** Base playback rate multiplier while coasting / decelerating */
  coastBaseRate: number;
  /** RPM multiplier for playback rate while coasting */
  coastRateMultiplier: number;

  /** Low-pass filter cutoff at stationary / initial engine start in Hz */
  initialFilterCutoff: number;
  /** Filter resonance Q factor */
  filterQ: number;
  /** Base low-pass cutoff under throttle in Hz */
  accelBaseCutoff: number;
  /** RPM multiplier opening up low-pass cutoff under throttle in Hz (max treble) */
  accelCutoffMultiplier: number;
  /** Base low-pass cutoff while coasting in Hz */
  coastBaseCutoff: number;
  /** RPM multiplier for low-pass cutoff while coasting in Hz */
  coastCutoffMultiplier: number;

  /** Low-shelf bass boost center frequency in Hz */
  bassBoostFreq: number;
  /** Initial low-shelf gain in dB at engine start */
  initialBassBoostGain: number;
  /** Low-shelf gain in dB under active acceleration */
  accelBassBoostGain: number;
  /** Low-shelf gain in dB while coasting */
  coastBassBoostGain: number;

  /** Initial master engine gain factor at stationary start */
  initialGain: number;
  /** Base master engine gain factor under throttle */
  accelBaseGain: number;
  /** RPM gain scaling under throttle */
  accelGainMultiplier: number;
  /** Base master engine gain factor while coasting */
  coastBaseGain: number;
  /** RPM gain scaling while coasting */
  coastGainMultiplier: number;
}

/**
 * Default engine audio configuration (smooth, soothing, non-fatiguing mix).
 */
export const DEFAULT_ENGINE_AUDIO_CONFIG: Readonly<SampleEngineAudioConfig> = Object.freeze({
  idlePlaybackRate: 0.68,
  accelBaseRate: 0.72,
  accelRateMultiplier: 0.32,
  coastBaseRate: 0.68,
  coastRateMultiplier: 0.22,

  initialFilterCutoff: 3600,
  filterQ: 0.5,
  accelBaseCutoff: 3800,
  accelCutoffMultiplier: 1200,
  coastBaseCutoff: 3600,
  coastCutoffMultiplier: 800,

  bassBoostFreq: 90,
  initialBassBoostGain: 1.5,
  accelBassBoostGain: 2.5,
  coastBassBoostGain: 1.0,

  initialGain: 0.18,
  accelBaseGain: 0.22,
  accelGainMultiplier: 0.16,
  coastBaseGain: 0.18,
  coastGainMultiplier: 0.10,
});

/**
 * Active engine configuration used by SoundEngine.
 */
export let ACTIVE_ENGINE_CONFIG: SampleEngineAudioConfig = {
  ...DEFAULT_ENGINE_AUDIO_CONFIG,
};

export function resetEngineConfigToDefaults(): void {
  ACTIVE_ENGINE_CONFIG = { ...DEFAULT_ENGINE_AUDIO_CONFIG };
}
