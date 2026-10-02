import * as THREE from 'three';
import { TrackDefinition, BoostPadConfig, KickerRampConfig } from './TrackTypes';

export class RumbleArenaConfig implements TrackDefinition {
  public id = 'rumble';
  public name = 'CYBER SKY COLISEUM';
  public isHardcore = false;
  public isArena = true;
  public arenaRadius = 98.0; // Expanded 196m diameter grand sky battle coliseum
  public archTitle = 'AIRSKID // GRAND SKY COLISEUM';
  public curve: THREE.CatmullRomCurve3;

  public static readonly SAMPLES = 100;

  constructor() {
    // 16-point circular boundary curve around the arena perimeter (R = 98m)
    // Ensures CatmullRomCurve3 interface remains 100% valid for any spline math
    const points: THREE.Vector3[] = [];
    const numPoints = 16;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.cos(angle) * this.arenaRadius,
        0,
        Math.sin(angle) * this.arenaRadius
      ));
    }
    this.curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
  }

  public getSliceProperties(_normT: number, _sliceIdx: number, baseHalfWidth: number) {
    return {
      extraY: 0,
      halfWidth: baseHalfWidth,
      isRamp: false,
      isGap: false,
    };
  }

  // Tactical Surge Pads in the Arena
  public boostPads: BoostPadConfig[] = [
    { t: 0.0, isRamp: false },   // East edge surge pad
    { t: 0.25, isRamp: false },  // North edge surge pad
    { t: 0.50, isRamp: false },  // West edge surge pad
    { t: 0.75, isRamp: false },  // South edge surge pad
  ];

  // 4 Mini Kicker Ramps positioned symmetrically around the arena
  public kickerRamps: KickerRampConfig[] = [
    { t: 0.125, offsetLat: 0 },  // North-East aerial hop
    { t: 0.375, offsetLat: 0 },  // North-West aerial hop
    { t: 0.625, offsetLat: 0 },  // South-West aerial hop
    { t: 0.875, offsetLat: 0 },  // South-East aerial hop
  ];

  public jumpZones = [];
  public hazardBlocks = [];
  public turbines = [];
  public pendulums = [];

  /**
   * Authoritative Team Spawn Locations & Orientations (3... 2... 1... Faceoff)
   * Team Frost spawns North facing South (towards center)
   * Team Blaze spawns South facing North (towards center)
   */
  public getSpawn(team: 'frost' | 'blaze' | 'cyan' | 'crimson', slotIndex: number): { pos: THREE.Vector3; rot: THREE.Quaternion } {
    const spacing = 10.5;
    const xOffset = (slotIndex - 1.5) * spacing; // Symmetrically centered

    if (team === 'frost' || team === 'cyan') {
      // North rim facing South (+Z direction, yaw = 0)
      const pos = new THREE.Vector3(xOffset, 0.1, -62.0);
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0); // Facing +Z
      return { pos, rot };
    } else {
      // South rim facing North (-Z direction, yaw = Math.PI)
      const pos = new THREE.Vector3(xOffset, 0.1, 62.0);
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // Facing -Z
      return { pos, rot };
    }
  }

  /**
   * Solo Free-For-All Spawn (Radial circle around the arena facing inward)
   */
  public getSoloSpawn(slotIndex: number, totalSlots: number = 8): { pos: THREE.Vector3; rot: THREE.Quaternion } {
    const angle = (slotIndex / totalSlots) * Math.PI * 2;
    const spawnR = 60.0;
    const pos = new THREE.Vector3(Math.cos(angle) * spawnR, 0.1, Math.sin(angle) * spawnR);
    // Face towards center (0, 0, 0)
    const inwardAngle = angle + Math.PI;
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -inwardAngle + Math.PI / 2);
    return { pos, rot };
  }
}
