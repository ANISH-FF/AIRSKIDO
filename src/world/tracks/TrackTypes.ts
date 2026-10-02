import * as THREE from 'three';

export interface CyberRingData {
  id: string;
  t: number;
  color: number;
  scale: number;
  altitude: number;
}

export interface JumpZoneConfig {
  id: string;
  name: string;
  startSlice: number;     // Start of launch incline
  launchSlice: number;    // Lip / peak crest of jump
  landingSlice: number;   // Touchdown receiving deck start
  endSlice: number;       // Smooth blend back to standard highway
  rampHeight: number;     // Incline elevation crest (e.g. +6.5m)
  catchHeight: number;    // Receiving deck initial elevation (e.g. +3.2m)
  flaredWidth?: number;   // Extra road half-width for safe catch
  rings: CyberRingData[]; // Holographic rings suspended in the air
}

export interface BoostPadConfig {
  t: number;
  isRamp: boolean;
}

export interface KickerRampConfig {
  t: number;
  offsetLat: number;
}

export interface HazardBlockConfig {
  id: string;
  t: number;
  offsetLat: number;
}

export interface TurbineConfig {
  id: string;
  t: number;
  bladeRadius: number;
  speed: number;
  angleOffset: number;
}

export interface PendulumConfig {
  id: string;
  t: number;
  armLength: number;
  speed: number;
  maxAngle: number;
  phaseOffset: number;
}

export interface AntiGravTubeConfig {
  enabled: boolean;
  startSlice: number;
  endSlice: number;
  radius: number;
  name: string;
}

export interface TrackDefinition {
  id: string;
  name: string;
  isHardcore: boolean;
  isArena?: boolean;
  arenaRadius?: number;
  archTitle: string;
  curve: THREE.CatmullRomCurve3;
  getSliceProperties(normT: number, sliceIdx: number, baseHalfWidth: number): {
    extraY: number;
    halfWidth: number;
    isRamp: boolean;
    isGap: boolean;
  };
  boostPads: BoostPadConfig[];
  jumpZones: JumpZoneConfig[];
  kickerRamps: KickerRampConfig[];
  hazardBlocks: HazardBlockConfig[];
  turbines: TurbineConfig[];
  pendulums: PendulumConfig[];
  antiGravTube?: AntiGravTubeConfig;
}
