/**
 * EngineSound.ts
 * Centralized Engine Sound Configuration for Airskido.
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
  idlePlaybackRate: 0.74,
  accelBaseRate: 0.77,
  accelRateMultiplier: 0.55,
  coastBaseRate: 0.72,
  coastRateMultiplier: 0.35,

  initialFilterCutoff: 2400,
  filterQ: 0.7,
  accelBaseCutoff: 2400,
  accelCutoffMultiplier: 2200,
  coastBaseCutoff: 2100,
  coastCutoffMultiplier: 1200,

  bassBoostFreq: 110,
  initialBassBoostGain: 4.5,
  accelBassBoostGain: 5.5,
  coastBassBoostGain: 4.0,

  initialGain: 0.14,
  accelBaseGain: 0.17,
  accelGainMultiplier: 0.15,
  coastBaseGain: 0.14,
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
