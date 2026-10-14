import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsEngine } from '../core/Physics';
import { sounds } from '../core/Sound';
import { Track } from '../world/Track';
import { economy } from '../core/Economy';

import { buildApexChassis } from './kartBuilders/ApexBuilder';
import { buildGlassesMesh } from './GlassesBuilder';
import { buildHatMesh } from './HatBuilder';

export interface KartStats {
  name: string;
  color: number;
  secondaryColor: number;
  topSpeed: number;     // max forward speed (units/s)
  acceleration: number; // engine power
  handling: number;     // turn rate
  weight: number;       // mass (affects ramming power and knockback resistance)
  driftGrip: number;    // lateral grip multiplier
}

export const KART_CONFIGS: KartStats[] = [
  {
    name: 'APEX',
    color: 0xff2244,          // Crimson Red
    secondaryColor: 0xffffff, // Crisp White
    topSpeed: 50.0,           // ~180 km/h - Balanced Championship Velocity
    acceleration: 48.0,
    handling: 3.0,            // Sharp & responsive
    weight: 1.0,              // Standard competition weight
    driftGrip: 1.5,           // Smooth, rewarding arcade drift
  },
];

const tireTextureCache = new Map<string, THREE.CanvasTexture>();

function getTireTextureForAccent(colorHex: string = '#ff2244'): THREE.CanvasTexture {
  const cached = tireTextureCache.get(colorHex);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // 1. Dark matte vulcanized rubber
  ctx.fillStyle = '#141518';
  ctx.fillRect(0, 0, 256, 64);

  // 2. High-contrast sports directional racing treads across circumference
  ctx.fillStyle = '#060709';
  ctx.fillRect(0, 27, 256, 10); // Center deep water channel

  // Deep tread grooves every 16 pixels (forward rolling indicator)
  ctx.fillStyle = '#2c2f35';
  for (let x = 0; x < 256; x += 16) {
    // Upper angled tread chevron
    ctx.beginPath();
    ctx.moveTo(x, 5);
    ctx.lineTo(x + 10, 25);
    ctx.lineTo(x + 5, 25);
    ctx.lineTo(x - 5, 5);
    ctx.closePath();
    ctx.fill();

    // Lower angled tread chevron
    ctx.beginPath();
    ctx.moveTo(x, 59);
    ctx.lineTo(x + 10, 39);
    ctx.lineTo(x + 5, 39);
    ctx.lineTo(x - 5, 59);
    ctx.closePath();
    ctx.fill();
  }

  // 3. High-visibility white racing sidewall hash stripes every 32px (sidewall spin indicator)
  ctx.fillStyle = '#ffffff';
  for (let x = 0; x < 256; x += 32) {
    ctx.fillRect(x + 4, 1, 16, 3.5);
    ctx.fillRect(x + 4, 59.5, 16, 3.5);
  }

  // 4. High-contrast dynamic theme racing compound markers every 64px
  ctx.fillStyle = colorHex;
  for (let x = 0; x < 256; x += 64) {
    ctx.fillRect(x + 22, 1, 8, 4);
    ctx.fillRect(x + 22, 59, 8, 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tireTextureCache.set(colorHex, tex);
  return tex;
}

export class Kart {
  public id: string;
  public stats: KartStats;
  public group: THREE.Group;
  public rigidBody!: RAPIER.RigidBody;
  public collider!: RAPIER.Collider;
  public track?: Track;
  public team?: 'frost' | 'blaze' | 'cyan' | 'crimson';
  public isPlayer: boolean = false;

  // Visual sub-meshes
  public wheels: (THREE.Mesh | THREE.Group)[] = [];
  public driverGroup!: THREE.Group;
  public steeringWheel!: THREE.Group;
  public exhaustLeft!: THREE.Mesh;
  public exhaustRight!: THREE.Mesh;
  public flames: THREE.Mesh[] = [];
  public bodyMat!: THREE.MeshStandardMaterial;
  public secondaryMat!: THREE.MeshStandardMaterial;
  public driverSuitMat!: THREE.MeshStandardMaterial;
  public driverHeadMat!: THREE.MeshStandardMaterial;
  public bandanaMat!: THREE.MeshStandardMaterial;
  public tireRubberMat!: THREE.MeshStandardMaterial;
  public sidewallStripeMat!: THREE.MeshStandardMaterial;
  public equippedSkinId: string = 'skin_default';
  private materialsToFlash: THREE.Material[] = [];

  // Arcade vehicle states
  public currentSpeed: number = 0;
  public steerAngle: number = 0;
  public smoothedSteer: number = 0;
  public isDrifting: boolean = false;
  public driftTime: number = 0;
  public boostTime: number = 0;
  public nitroCharges: number = 3;
  public readonly maxNitroCharges: number = 3;
  public driftChargeMeter: number = 0;
  public visualSlipAngle: number = 0;
  public visualRollAngle: number = 0;
  public isGrounded: boolean = true;
  public isGhost: boolean = false;
  public ghostTimer: number = 0;
  public isBot: boolean = false;

  // 360° Anti-Gravity Vortex Parkour Tube State
  public isInAntiGravTube: boolean = false;
  public tubeAngle: number = 0; // 0 = floor, PI/2 = right wall, PI = ceiling, -PI/2 = left wall
  public splineT: number = 0;
  private wasInAntiGravTube: boolean = false;
  public onTubeBarrierHit?: () => void;
  public onTubeBarrierCleared?: () => void;
  public lastTubeBarrierHit: number = 0;
  public hasClearedTubeBarrier: boolean = false;

  // Protection Shield ("Kawach") Visual Effect - Sleek Semi-Transparent Energy Bubble
  public shieldGroup!: THREE.Group;
  private shieldBubble!: THREE.Mesh;
  private shieldHex!: THREE.Mesh;
  private shieldRing!: THREE.Mesh;
  private shieldBubbleMat!: THREE.MeshBasicMaterial;
  private shieldHexMat!: THREE.MeshBasicMaterial;

  // Track collision recoil cooldown
  public lastImpactTime: number = 0;

  // ── Per-kart scratch objects — allocated ONCE at construction, reused every frame (zero GC) ──
  private readonly _kq = new THREE.Quaternion();
  private readonly _kForward = new THREE.Vector3();
  private readonly _kRight = new THREE.Vector3();
  private readonly _kPosVec = new THREE.Vector3();
  private readonly _kVelVec = new THREE.Vector3();
  private readonly _kRoadNormal = new THREE.Vector3();
  private readonly _kDriveForward = new THREE.Vector3();
  private readonly _kDriveRight = new THREE.Vector3();
  private readonly _kYawQuat = new THREE.Quaternion();
  private readonly _kFwd = new THREE.Vector3();
  private readonly _kTangent = new THREE.Vector3();
  private readonly _kBinormal = new THREE.Vector3();
  private readonly _kBasisMat = new THREE.Matrix4();
  private readonly _kTargetMeshQuat = new THREE.Quaternion();
  private readonly _kDriftQuat = new THREE.Quaternion();
  private readonly _kDriftEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly _kIdentQuat = new THREE.Quaternion(); // identity — never mutated
  private readonly _kTargetPos = new THREE.Vector3();

  // Character Accessories / Sunglasses & Hats
  private driverHeadMesh?: THREE.Mesh;
  private driverEarsMesh?: THREE.Mesh;
  private glassesGroup?: THREE.Group;
  private equippedGlassesId: string = 'glasses_none';
  private hatGroup?: THREE.Group;
  private equippedHatId: string = 'hat_none';

  public readonly wheelIdL: string;
  public readonly wheelIdR: string;

  constructor(
    id: string,
    kartTypeIndex: number,
    scene: THREE.Scene | THREE.Group,
    physics?: PhysicsEngine,
    startPos: THREE.Vector3 = new THREE.Vector3(),
    startRot: THREE.Quaternion = new THREE.Quaternion()
  ) {
    this.id = id;
    this.wheelIdL = id + '_L';
    this.wheelIdR = id + '_R';
    this.stats = KART_CONFIGS[kartTypeIndex % KART_CONFIGS.length];
    this.group = new THREE.Group();

    this.buildKartMesh();
    this.setCastShadow(false); // Default: opponent & bot karts do not cast shadows; only local player explicitly enables it
    this.group.position.copy(startPos);
    this.group.quaternion.copy(startRot);
    scene.add(this.group);

    if (physics) {
      this.buildPhysics(physics, startPos, startRot);
    }
  }

  public setCastShadow(enabled: boolean) {
    this.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = enabled;
      }
    });
  }

  private buildKartMesh() {
    // 1. Chassis Main Body
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: this.stats.color,
      roughness: 0.3,
      metalness: 0.6,
    });
    this.materialsToFlash.push(this.bodyMat);

    this.secondaryMat = new THREE.MeshStandardMaterial({
      color: this.stats.secondaryColor,
      roughness: 0.4,
      metalness: 0.4,
    });
    this.materialsToFlash.push(this.secondaryMat);

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a24,
      roughness: 0.6,
      metalness: 0.8,
    });
    this.materialsToFlash.push(darkMetalMat);
    // ── APEX UNIVERSAL CHAMPIONSHIP CHASSIS BUILDER ──
    const builderCtx = {
      group: this.group,
      stats: this.stats,
      bodyMat: this.bodyMat,
      secondaryMat: this.secondaryMat,
      darkMetalMat,
      materialsToFlash: this.materialsToFlash,
    };
    buildApexChassis(builderCtx);

    // ── GEOMETRY HELPERS FOR ZERO-LAG MESH BATCHING ──
    const addBox = (list: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      if (rx !== 0 || ry !== 0 || rz !== 0) {
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
      }
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
      list.push(g);
    };

    const addCylinder = (list: THREE.BufferGeometry[], rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg);
      if (rx !== 0 || ry !== 0 || rz !== 0) {
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
      }
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
      list.push(g);
    };

    const addSegment = (list: THREE.BufferGeometry[], rt: number, rb: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, seg = 8) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.001) return;
      const g = new THREE.CylinderGeometry(rt, rb, len, seg);
      const vSource = new THREE.Vector3(0, 1, 0);
      const vTarget = new THREE.Vector3(dx, dy, dz).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(vSource, vTarget);
      g.applyQuaternion(q);
      g.applyMatrix4(new THREE.Matrix4().makeTranslation((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2));
      list.push(g);
    };

    const addSphere = (list: THREE.BufferGeometry[], r: number, wSeg: number, hSeg: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const g = new THREE.SphereGeometry(r, wSeg, hSeg);
      if (sx !== 1 || sy !== 1 || sz !== 1) {
        g.applyMatrix4(new THREE.Matrix4().makeScale(sx, sy, sz));
      }
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
      list.push(g);
    };

    const addCone = (list: THREE.BufferGeometry[], r: number, h: number, seg: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const g = new THREE.ConeGeometry(r, h, seg);
      if (rx !== 0 || ry !== 0 || rz !== 0) {
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
      }
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
      list.push(g);
    };

    const addTorus = (list: THREE.BufferGeometry[], r: number, tube: number, radSeg: number, tubSeg: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const g = new THREE.TorusGeometry(r, tube, radSeg, tubSeg);
      if (rx !== 0 || ry !== 0 || rz !== 0) {
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
      }
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
      list.push(g);
    };

    // ── DRIVER GROUP ─────────────────────────────────────────────
    this.driverGroup = new THREE.Group();
    this.driverGroup.position.set(0, 0.50, 0.08);

    // 1. Racing Seat & Steering Column (Merged)
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x14151e, roughness: 0.7 });
    const seatGeoms: THREE.BufferGeometry[] = [];
    addBox(seatGeoms, 0.65, 0.46, 0.10, 0, 0.20, -0.22, -0.12, 0, 0);
    addBox(seatGeoms, 0.58, 0.07, 0.30, 0, 0.01, -0.08);
    addBox(seatGeoms, 0.42, 0.16, 0.09, 0, 0.44, -0.23, -0.12, 0, 0);
    addCylinder(seatGeoms, 0.028, 0.028, 0.30, 8, 0, 0.18, 0.40, -Math.PI / 5, 0, 0);
    const mergedSeat = mergeGeometries(seatGeoms, false);
    const seatMesh = new THREE.Mesh(mergedSeat, seatMat);
    this.driverGroup.add(seatMesh);

    // 2. Torso, Suit & Arms (Merged into 1 clean anatomical body)
    this.driverSuitMat = new THREE.MeshStandardMaterial({ color: this.stats.color, roughness: 0.45 });
    const suitGeoms: THREE.BufferGeometry[] = [];
    addCylinder(suitGeoms, 0.25, 0.30, 0.40, 12, 0, 0.20, 0);
    for (const side of [-1, 1]) {
      // Shoulder joint
      addSphere(suitGeoms, 0.075, 8, 8, side * 0.255, 0.31, 0.02);
      // Seamless Upper Arm (Shoulder -> Elbow)
      addSegment(suitGeoms, 0.062, 0.054, side * 0.255, 0.31, 0.02, side * 0.22, 0.175, 0.19, 10);
      // Seamless Elbow Joint
      addSphere(suitGeoms, 0.056, 8, 8, side * 0.22, 0.175, 0.19);
      // Seamless Forearm (Elbow -> Wrist)
      addSegment(suitGeoms, 0.054, 0.046, side * 0.22, 0.175, 0.19, side * 0.155, 0.265, 0.38, 10);
    }
    const mergedSuit = mergeGeometries(suitGeoms, false);
    const suitMesh = new THREE.Mesh(mergedSuit, this.driverSuitMat);
    this.driverGroup.add(suitMesh);

    // 3. Driver Head (Sphere only)
    this.driverHeadMat = new THREE.MeshStandardMaterial({ color: this.stats.color, roughness: 0.35 });
    this.materialsToFlash.push(this.driverHeadMat);
    const headGeoms: THREE.BufferGeometry[] = [];
    addSphere(headGeoms, 0.36, 16, 16, 0, 0.70, 0.02, 1.05, 0.97, 1.0);
    const mergedHead = mergeGeometries(headGeoms, false);
    this.driverHeadMesh = new THREE.Mesh(mergedHead, this.driverHeadMat);
    this.driverGroup.add(this.driverHeadMesh);

    // 3b. Driver Ears (Separated so full hats don't suffer ugly clipping!)
    const earGeoms: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      addCone(earGeoms, 0.13, 0.28, 4, side * 0.245, 0.995, 0.02, -0.10, Math.PI / 4, -side * 0.28);
    }
    const mergedEars = mergeGeometries(earGeoms, false);
    this.driverEarsMesh = new THREE.Mesh(mergedEars, this.driverHeadMat);
    this.driverGroup.add(this.driverEarsMesh);

    // 4. Bandana
    this.bandanaMat = new THREE.MeshStandardMaterial({ color: 0xffde59, roughness: 0.4 });
    const bandanaGeom = new THREE.TorusGeometry(0.19, 0.048, 8, 14);
    bandanaGeom.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    bandanaGeom.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.42, 0.02));
    const bandanaMesh = new THREE.Mesh(bandanaGeom, this.bandanaMat);
    this.driverGroup.add(bandanaMesh);

    // 5. White Accents: Bib & Gloves (Merged)
    const bibMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const whiteAccentsGeoms: THREE.BufferGeometry[] = [];
    addBox(whiteAccentsGeoms, 0.22, 0.28, 0.04, 0, 0.20, 0.29);
    for (const side of [-1, 1]) {
      // Glove cuff collar
      addSphere(whiteAccentsGeoms, 0.052, 8, 8, side * 0.155, 0.265, 0.38);
      // Glove palm gripping steering wheel
      addSphere(whiteAccentsGeoms, 0.065, 8, 8, side * 0.155, 0.285, 0.42, 1.05, 0.85, 1.15);
      // Wrapped glove fingers gripping steering wheel rim
      addBox(whiteAccentsGeoms, 0.038, 0.048, 0.075, side * 0.155, 0.295, 0.435, -Math.PI / 6, 0, side * 0.15);
    }
    const mergedWhiteAccents = mergeGeometries(whiteAccentsGeoms, false);
    const whiteAccentsMesh = new THREE.Mesh(mergedWhiteAccents, bibMat);
    this.driverGroup.add(whiteAccentsMesh);

    // 6. Cute Face Details: Muzzle, Nose, Mouth, Eyes (Merged)
    const muzzleMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.5 });
    const muzzleGeom = new THREE.SphereGeometry(0.18, 12, 12);
    muzzleGeom.applyMatrix4(new THREE.Matrix4().makeScale(1.1, 0.72, 0.82));
    muzzleGeom.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.61, 0.25));
    const muzzle = new THREE.Mesh(muzzleGeom, muzzleMat);
    this.driverGroup.add(muzzle);

    const faceDarkGeoms: THREE.BufferGeometry[] = [];
    addSphere(faceDarkGeoms, 0.042, 8, 8, 0, 0.66, 0.40);
    // Subtle black mouth & lips below nose
    addBox(faceDarkGeoms, 0.014, 0.032, 0.024, 0, 0.615, 0.402);
    addBox(faceDarkGeoms, 0.060, 0.018, 0.024, 0, 0.585, 0.398);
    for (const side of [-1, 1]) {
      addBox(faceDarkGeoms, 0.028, 0.016, 0.024, side * 0.042, 0.592, 0.393, 0, 0, -side * 0.35);
      addSphere(faceDarkGeoms, 0.062, 8, 8, side * 0.135, 0.72, 0.35, 0.9, 1.05, 0.55);
      addBox(faceDarkGeoms, 0.11, 0.028, 0.035, side * 0.135, 0.855, 0.295, 0, 0, -side * 0.12);
    }
    const faceDarkMesh = new THREE.Mesh(mergeGeometries(faceDarkGeoms, false), new THREE.MeshBasicMaterial({ color: 0x111118 }));
    this.driverGroup.add(faceDarkMesh);

    const eyeWhitesGeoms: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      addSphere(eyeWhitesGeoms, 0.115, 10, 10, side * 0.135, 0.72, 0.26, 0.95, 1.1, 0.75);
      addSphere(eyeWhitesGeoms, 0.024, 6, 6, side * 0.135 + 0.022, 0.745, 0.395);
    }
    const eyeWhitesMesh = new THREE.Mesh(mergeGeometries(eyeWhitesGeoms, false), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.driverGroup.add(eyeWhitesMesh);

    // 7. Steering Wheel (1 merged mesh)
    this.steeringWheel = new THREE.Group();
    this.steeringWheel.position.set(0, 0.30, 0.46);
    this.steeringWheel.rotation.x = -Math.PI / 5;

    const rimGeoms: THREE.BufferGeometry[] = [];
    addTorus(rimGeoms, 0.155, 0.026, 8, 20, 0, 0, 0);
    addCylinder(rimGeoms, 0.048, 0.048, 0.022, 10, 0, 0, 0, Math.PI / 2, 0, 0);
    [[-0.075, 0], [0.075, 0], [0, -0.065]].forEach(([sx, sy]) => {
      addBox(rimGeoms, Math.abs(sx) > 0 ? 0.13 : 0.028, Math.abs(sy) > 0 ? 0.11 : 0.030, 0.014, sx, sy, 0);
    });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.75, metalness: 0.3 });
    const mergedWheelRim = mergeGeometries(rimGeoms, false);
    const wheelMesh = new THREE.Mesh(mergedWheelRim, rimMat);
    this.steeringWheel.add(wheelMesh);
    this.driverGroup.add(this.steeringWheel);

    this.group.add(this.driverGroup);

    // ── MERGED CHASSIS HARDWARE (Engine V8, Suspensions, Rear Axle, Exhausts) ──
    const chassisHwGeoms: THREE.BufferGeometry[] = [];
    const valveGeoms: THREE.BufferGeometry[] = [];

    // Engine Block
    addBox(chassisHwGeoms, 0.9, 0.5, 0.7, 0, 0.55, -0.75);

    // Dual Valve Covers with Red Accent
    addBox(valveGeoms, 0.28, 0.16, 0.65, -0.32, 0.55 + 0.28, -0.75, 0, 0, -0.25);
    addBox(valveGeoms, 0.28, 0.16, 0.65, 0.32, 0.55 + 0.28, -0.75, 0, 0, 0.25);

    // 6 Velocity Stacks
    for (let row = -1; row <= 1; row++) {
      addCylinder(chassisHwGeoms, 0.05, 0.075, 0.26, 8, -0.16, 0.55 + 0.36, -0.75 + row * 0.22, 0, 0, -0.15);
      addCylinder(chassisHwGeoms, 0.05, 0.075, 0.26, 8, 0.16, 0.55 + 0.36, -0.75 + row * 0.22, 0, 0, 0.15);
    }

    // Heavy Exhaust Headers
    addCylinder(chassisHwGeoms, 0.08, 0.08, 0.65, 8, -0.46, 0.55 + 0.15, -0.75 - 0.25, 0.6, 0, -0.4);
    addCylinder(chassisHwGeoms, 0.08, 0.08, 0.65, 8, 0.46, 0.55 + 0.15, -0.75 - 0.25, 0.6, 0, 0.4);

    // Front Suspensions
    for (const side of [-1, 1]) {
      addCylinder(chassisHwGeoms, 0.024, 0.024, 0.32, 8, side * 0.64 + side * 0.14, 0.44 + 0.04, 1.05, 0, 0, side * (Math.PI / 2 - 0.08));
      addCylinder(chassisHwGeoms, 0.028, 0.028, 0.32, 8, side * 0.64 + side * 0.14, 0.44 - 0.06, 1.05, 0, 0, side * (Math.PI / 2 + 0.05));
      addCylinder(chassisHwGeoms, 0.018, 0.018, 0.31, 8, side * 0.64 + side * 0.14, 0.44 - 0.02, 1.05 - 0.09, 0, 0, side * Math.PI / 2);
      addCylinder(chassisHwGeoms, 0.044, 0.044, 0.22, 8, side * 0.64 + side * 0.04, 0.44 + 0.08, 1.05 + 0.03, 0, 0, -side * 0.42);
    }

    // Rear Axle, Bearings & Drive Sprocket
    addCylinder(chassisHwGeoms, 0.045, 0.045, 1.86, 8, 0, 0.435, -1.05, 0, 0, Math.PI / 2);
    addBox(chassisHwGeoms, 0.12, 0.16, 0.14, -0.74, 0.435, -1.05);
    addBox(chassisHwGeoms, 0.12, 0.16, 0.14, 0.74, 0.435, -1.05);
    addCylinder(chassisHwGeoms, 0.18, 0.18, 0.025, 12, -0.24, 0.435, -1.05, 0, 0, Math.PI / 2);

    // Dual Exhaust Pipes
    addCylinder(chassisHwGeoms, 0.12, 0.15, 0.5, 8, -0.45, 0.45, -1.6, Math.PI / 2, 0, 0);
    addCylinder(chassisHwGeoms, 0.12, 0.15, 0.5, 8, 0.45, 0.45, -1.6, Math.PI / 2, 0, 0);

    const mergedHw = mergeGeometries(chassisHwGeoms, false);
    const hwMesh = new THREE.Mesh(mergedHw, darkMetalMat);
    hwMesh.receiveShadow = true;
    this.group.add(hwMesh);

    const valveMat = new THREE.MeshStandardMaterial({ color: 0xcc1122, roughness: 0.3, metalness: 0.6 });
    const mergedValves = mergeGeometries(valveGeoms, false);
    const valveMesh = new THREE.Mesh(mergedValves, valveMat);
    this.group.add(valveMesh);

    // ── 4 WHEELS WITH ALLOY SPOKES & SPINNING TIRES (Batched into 2 meshes per wheel) ──
    const wheelOffsets = [
      { x: -0.98, y: 0.435, z: 1.05, isFront: true, isLeft: true },   // Front Left
      { x: 0.98, y: 0.435, z: 1.05, isFront: true, isLeft: false },   // Front Right
      { x: -1.02, y: 0.435, z: -1.05, isFront: false, isLeft: true }, // Rear Left
      { x: 1.02, y: 0.435, z: -1.05, isFront: false, isLeft: false }, // Rear Right
    ];

    const tireTex = getTireTextureForAccent('#ff2244');
    this.tireRubberMat = new THREE.MeshStandardMaterial({
      map: tireTex,
      roughness: 0.85,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    this.sidewallStripeMat = new THREE.MeshStandardMaterial({
      color: 0xff2244,
      roughness: 0.3,
      emissive: 0x440811,
    });
    const alloyRimMat = new THREE.MeshStandardMaterial({
      color: 0xf5f7fa,
      roughness: 0.15,
      metalness: 0.92,
    });

    wheelOffsets.forEach((cfg) => {
      const wheelHub = new THREE.Group();
      wheelHub.position.set(cfg.x, cfg.y, cfg.z);

      // Stationary Hub: Brake Rotor & Caliper Merged into 1 mesh
      const hubGeoms: THREE.BufferGeometry[] = [];
      const rotorGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.035, 14);
      rotorGeom.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
      rotorGeom.applyMatrix4(new THREE.Matrix4().makeTranslation(cfg.isLeft ? 0.04 : -0.04, 0, 0));
      hubGeoms.push(rotorGeom);

      const caliperGeom = new THREE.BoxGeometry(0.06, 0.14, 0.08);
      caliperGeom.applyMatrix4(new THREE.Matrix4().makeTranslation(cfg.isLeft ? 0.04 : -0.04, 0.16, -0.04));
      hubGeoms.push(caliperGeom);

      const hubMesh = new THREE.Mesh(mergeGeometries(hubGeoms, false), darkMetalMat);
      wheelHub.add(hubMesh);

      // Spinning Wheel Assembly
      const wheelSpinner = new THREE.Group();

      const outDir = cfg.isLeft ? -1 : 1;
      const outX = outDir * 0.19;
      const inX = -outDir * 0.19;

      // ── 1. Hollow Tire Rubber (Batched into 1 mesh, casts shadow) ──
      const tireGeoms: THREE.BufferGeometry[] = [];
      // Tread surface around circumference (open-ended cylinder)
      const treadGeom = new THREE.CylinderGeometry(0.44, 0.44, 0.38, 20, 1, true);
      treadGeom.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
      tireGeoms.push(treadGeom);

      // Outside sidewall doughnut ring (radius 0.27 to 0.44)
      const outerWall = new THREE.RingGeometry(0.27, 0.44, 20);
      outerWall.applyMatrix4(new THREE.Matrix4().makeRotationY(outDir * Math.PI / 2));
      outerWall.applyMatrix4(new THREE.Matrix4().makeTranslation(outX, 0, 0));
      tireGeoms.push(outerWall);

      // Inside sidewall doughnut ring (facing kart chassis)
      const innerWall = new THREE.RingGeometry(0.27, 0.44, 16);
      innerWall.applyMatrix4(new THREE.Matrix4().makeRotationY(-outDir * Math.PI / 2));
      innerWall.applyMatrix4(new THREE.Matrix4().makeTranslation(inX, 0, 0));
      tireGeoms.push(innerWall);

      const mergedTire = mergeGeometries(tireGeoms, false);
      const tire = new THREE.Mesh(mergedTire, this.tireRubberMat);
      tire.castShadow = true;
      tire.receiveShadow = true;
      wheelSpinner.add(tire);

      // ── 2. Deep-Dish 5-Spoke Alloy Rim (Batched into 1 mesh per wheel) ──
      const rimGeoms: THREE.BufferGeometry[] = [];

      // A. Outer Polished Alloy Rim Lip (The Wheel Bezel / Rim Edge)
      const rimLip = new THREE.TorusGeometry(0.272, 0.014, 8, 24);
      rimLip.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      rimLip.applyMatrix4(new THREE.Matrix4().makeTranslation(outX, 0, 0));
      rimGeoms.push(rimLip);

      // B. Inner Rim Barrel (Cylinder drum going inwards)
      const rimBarrel = new THREE.CylinderGeometry(0.27, 0.27, 0.36, 20, 1, true);
      rimBarrel.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
      rimGeoms.push(rimBarrel);

      // C. Deep-Dish Recessed Spokes & Center Hub (recessed 3.5cm inside rim lip)
      const dishX = outX - outDir * 0.035;

      // 5 Bold High-Spec Racing Alloy Spokes
      for (let s = 0; s < 5; s++) {
        const spokeAngle = (s * Math.PI * 2) / 5;
        const spokeGeom = new THREE.BoxGeometry(0.026, 0.21, 0.044);
        spokeGeom.applyMatrix4(new THREE.Matrix4().makeRotationX(-spokeAngle));
        spokeGeom.applyMatrix4(
          new THREE.Matrix4().makeTranslation(
            dishX,
            Math.cos(spokeAngle) * 0.155,
            Math.sin(spokeAngle) * 0.155
          )
        );
        rimGeoms.push(spokeGeom);
      }

      // Center Hub Cap (recessed cylinder)
      const centerHub = new THREE.CylinderGeometry(0.082, 0.082, 0.036, 16);
      centerHub.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
      centerHub.applyMatrix4(new THREE.Matrix4().makeTranslation(dishX, 0, 0));
      rimGeoms.push(centerHub);

      // Center Hex Nut
      const centerNut = new THREE.CylinderGeometry(0.038, 0.038, 0.048, 6);
      centerNut.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
      centerNut.applyMatrix4(new THREE.Matrix4().makeTranslation(dishX + outDir * 0.008, 0, 0));
      rimGeoms.push(centerNut);

      // 5 Miniature Lug Bolts around center hub
      for (let b = 0; b < 5; b++) {
        const bAngle = (b * Math.PI * 2) / 5 + Math.PI / 5;
        const bolt = new THREE.CylinderGeometry(0.012, 0.012, 0.042, 6);
        bolt.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
        bolt.applyMatrix4(
          new THREE.Matrix4().makeTranslation(
            dishX + outDir * 0.004,
            Math.cos(bAngle) * 0.055,
            Math.sin(bAngle) * 0.055
          )
        );
        rimGeoms.push(bolt);
      }

      const mergedRim = mergeGeometries(rimGeoms, false);
      const rimMesh = new THREE.Mesh(mergedRim, alloyRimMat);
      wheelSpinner.add(rimMesh);

      wheelHub.add(wheelSpinner);
      this.group.add(wheelHub);
      this.wheels.push(wheelSpinner);
    });

    // Nitro Rocket Flames (scaled dynamically during boost)
    const flameGeom = new THREE.ConeGeometry(0.2, 0.9, 6);
    flameGeom.rotateX(-Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });

    const flameL = new THREE.Mesh(flameGeom, flameMat);
    flameL.position.set(-0.45, 0.45, -2.1);
    flameL.scale.set(0.001, 0.001, 0.001);
    this.group.add(flameL);
    this.flames.push(flameL);

    const flameR = new THREE.Mesh(flameGeom, flameMat);
    flameR.position.set(0.45, 0.45, -2.1);
    flameR.scale.set(0.001, 0.001, 0.001);
    this.group.add(flameR);
    this.flames.push(flameR);

    // Collect solid car materials across kart for shield ghosting (exclude transparent FX & flames)
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material && !this.flames.includes(mesh)) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m.transparent && !this.materialsToFlash.includes(m)) {
            this.materialsToFlash.push(m);
          }
        }
      }
    });

    // ── 3D SLEEK ULTRA-TRANSPARENT SHIELD BUBBLE ("KAWACH") ────
    this.shieldGroup = new THREE.Group();
    this.shieldGroup.position.set(0, 0.55, 0);
    this.shieldGroup.visible = false;

    // 1. Crystal-clear glowing hologram bubble (vibrant 0.32 opacity - easily visible!)
    const bubbleGeom = new THREE.SphereGeometry(2.15, 28, 20);
    this.shieldBubbleMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.shieldBubble = new THREE.Mesh(bubbleGeom, this.shieldBubbleMat);
    this.shieldGroup.add(this.shieldBubble);

    // 2. Ultra-delicate thin hex lattice wireframe (0.35 opacity)
    const hexGeom = new THREE.IcosahedronGeometry(2.17, 2);
    this.shieldHexMat = new THREE.MeshBasicMaterial({
      color: 0x33e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.shieldHex = new THREE.Mesh(hexGeom, this.shieldHexMat);
    this.shieldGroup.add(this.shieldHex);

    // 3. Thin, elegant golden orbital energy ring revolving around the bubble
    const ringGeom = new THREE.TorusGeometry(2.28, 0.026, 8, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.shieldRing = new THREE.Mesh(ringGeom, ringMat);
    this.shieldRing.rotation.x = Math.PI / 3;
    this.shieldGroup.add(this.shieldRing);

    this.group.add(this.shieldGroup);

    // Apply currently equipped skin, character glasses & hat
    this.applySkin(economy.getEquippedSkin());
    this.applyGlasses(economy.getEquippedGlasses());
    this.applyHat(economy.getEquippedHat());
  }

  public applyGlasses(glassesId: string) {
    this.equippedGlassesId = glassesId || 'glasses_none';
    if (this.glassesGroup && this.driverGroup) {
      this.driverGroup.remove(this.glassesGroup);
      this.glassesGroup = undefined;
    }

    const mesh = buildGlassesMesh(this.equippedGlassesId);
    if (mesh && this.driverGroup) {
      this.glassesGroup = mesh;
      this.driverGroup.add(this.glassesGroup);
    }
  }

  public getEquippedGlasses(): string {
    return this.equippedGlassesId;
  }

  public applyHat(hatId: string) {
    this.equippedHatId = hatId || 'hat_none';
    if (this.hatGroup && this.driverGroup) {
      this.driverGroup.remove(this.hatGroup);
      this.hatGroup = undefined;
    }

    const mesh = buildHatMesh(this.equippedHatId);
    if (mesh && this.driverGroup) {
      this.hatGroup = mesh;
      this.driverGroup.add(this.hatGroup);
    }

    // Toggle ears visibility: Full hats cleanly tuck ears inside to eliminate clipping through brim/crown!
    if (this.driverEarsMesh) {
      const hidesEars = [
        'hat_cowboy',
        'hat_tophat',
        'hat_beanie',
        'hat_police',
        'hat_viking',
        'hat_santa',
        'hat_sombrero',
        'hat_chef',
        'hat_propeller',
        'hat_pirate',
        'hat_frog',
        'hat_wizard',
        'hat_cat_ears',
      ].includes(this.equippedHatId);

      this.driverEarsMesh.visible = !hidesEars;
    }
  }

  public getEquippedHat(): string {
    return this.equippedHatId;
  }

  public applySkin(skinId: string) {
    this.equippedSkinId = skinId;
    if (!this.bodyMat || !this.secondaryMat) return;

    let tireAccent = '#ff2244';
    let sidewallColor = 0xff2244;
    let sidewallEmissive = 0x440811;

    switch (skinId) {
      // ── FACTORY STOCK PAINTS (FREE) ──
      case 'paint_frost':
      case 'paint_cyan':
        this.bodyMat.color.setHex(0x00F0FF);
        this.bodyMat.metalness = 0.55;
        this.bodyMat.roughness = 0.22;
        this.secondaryMat.color.setHex(0x10B981);
        this.secondaryMat.metalness = 0.50;
        this.secondaryMat.roughness = 0.28;
        if (this.driverSuitMat) {
          this.driverSuitMat.color.setHex(0x00F0FF);
          this.driverSuitMat.metalness = 0.45;
          this.driverSuitMat.roughness = 0.40;
        }
        if (this.driverHeadMat) {
          this.driverHeadMat.color.setHex(0x00F0FF);
          this.driverHeadMat.metalness = 0.35;
          this.driverHeadMat.roughness = 0.35;
        }
        if (this.bandanaMat) this.bandanaMat.color.setHex(0x10B981);
        tireAccent = '#00f0ff';
        sidewallColor = 0x00f0ff;
        sidewallEmissive = 0x003344;
        this.setUnderglow(0x00f0ff);
        break;

      case 'paint_gold':
        this.bodyMat.color.setHex(0xF59E0B);
        this.bodyMat.metalness = 0.70;
        this.bodyMat.roughness = 0.22;
        this.secondaryMat.color.setHex(0x1E293B);
        this.secondaryMat.metalness = 0.80;
        this.secondaryMat.roughness = 0.28;
        if (this.driverSuitMat) {
          this.driverSuitMat.color.setHex(0xF59E0B);
          this.driverSuitMat.metalness = 0.45;
          this.driverSuitMat.roughness = 0.40;
        }
        if (this.driverHeadMat) {
          this.driverHeadMat.color.setHex(0xF59E0B);
          this.driverHeadMat.metalness = 0.35;
          this.driverHeadMat.roughness = 0.35;
        }
        if (this.bandanaMat) this.bandanaMat.color.setHex(0x1E293B);
        tireAccent = '#f59e0b';
        sidewallColor = 0xf59e0b;
        sidewallEmissive = 0x332000;
        break;

      case 'paint_purple':
        this.bodyMat.color.setHex(0x9333EA);
        this.bodyMat.metalness = 0.60;
        this.bodyMat.roughness = 0.24;
        this.secondaryMat.color.setHex(0x00F0FF);
        this.secondaryMat.metalness = 0.50;
        this.secondaryMat.roughness = 0.28;
        if (this.driverSuitMat) {
          this.driverSuitMat.color.setHex(0x9333EA);
          this.driverSuitMat.metalness = 0.45;
          this.driverSuitMat.roughness = 0.40;
        }
        if (this.driverHeadMat) {
          this.driverHeadMat.color.setHex(0x9333EA);
          this.driverHeadMat.metalness = 0.35;
          this.driverHeadMat.roughness = 0.35;
        }
        if (this.bandanaMat) this.bandanaMat.color.setHex(0x00F0FF);
        tireAccent = '#9333ea';
        sidewallColor = 0x9333ea;
        sidewallEmissive = 0x220033;
        break;

      case 'paint_white':
        this.bodyMat.color.setHex(0xF8FAFC);
        this.bodyMat.metalness = 0.35;
        this.bodyMat.roughness = 0.18;
        this.secondaryMat.color.setHex(0xFF2244);
        this.secondaryMat.metalness = 0.50;
        this.secondaryMat.roughness = 0.28;
        if (this.driverSuitMat) {
          this.driverSuitMat.color.setHex(0xF8FAFC);
          this.driverSuitMat.metalness = 0.35;
          this.driverSuitMat.roughness = 0.40;
        }
        if (this.driverHeadMat) {
          this.driverHeadMat.color.setHex(0xFFFFFF);
          this.driverHeadMat.metalness = 0.25;
          this.driverHeadMat.roughness = 0.35;
        }
        if (this.bandanaMat) this.bandanaMat.color.setHex(0xFF2244);
        tireAccent = '#ffffff';
        sidewallColor = 0xffffff;
        sidewallEmissive = 0x222222;
        break;

      // ── ROYAL & LEGENDARY STORE SKINS ──
      case 'skin_gold':
        // 24K Royal Gold - Reflective Mirror Gold with Gilded Knight Mascot
        this.bodyMat.color.setHex(0xFFD700);
        this.bodyMat.metalness = 0.98;
        this.bodyMat.roughness = 0.08;
        this.secondaryMat.color.setHex(0xFFFFFF);
        this.secondaryMat.metalness = 0.95;
        this.secondaryMat.roughness = 0.06;
        if (this.driverSuitMat) {
          this.driverSuitMat.color.setHex(0xFFD700);
          this.driverSuitMat.metalness = 0.85;
          this.driverSuitMat.roughness = 0.18;
        }
        if (this.driverHeadMat) {
          this.driverHeadMat.color.setHex(0xFFDF70);
          this.driverHeadMat.metalness = 0.60;
          this.driverHeadMat.roughness = 0.25;
        }
        if (this.bandanaMat) this.bandanaMat.color.setHex(0xFFFFFF);
        tireAccent = '#ffd700';
        sidewallColor = 0xffd700;
        sidewallEmissive = 0x554400;
        break;

      case 'skin_neon_cyber':
        // Synthwave Cyber - Radiant Electric Cyan + Hot Magenta with Cyber Mascot
        this.bodyMat.color.setHex(0x00F0FF);
        this.bodyMat.metalness = 0.50;
        this.bodyMat.roughness = 0.15;
        this.secondaryMat.color.setHex(0xFF00AA);
        this.secondaryMat.metalness = 0.50;
        this.secondaryMat.roughness = 0.15;
        if (this.driverSuitMat) {
          this.driverSuitMat.color.setHex(0x00F0FF);
          this.driverSuitMat.metalness = 0.40;
          this.driverSuitMat.roughness = 0.20;
        }
        if (this.driverHeadMat) {
          this.driverHeadMat.color.setHex(0x00D8EA);
          this.driverHeadMat.metalness = 0.35;
          this.driverHeadMat.roughness = 0.30;
        }
        if (this.bandanaMat) this.bandanaMat.color.setHex(0xFF00AA);
        tireAccent = '#ff00aa';
        sidewallColor = 0xff00aa;
        sidewallEmissive = 0x550033;
        break;

      case 'skin_lava':
        // Magma Inferno - Molten Ember Core + Charred Obsidian Mascot
        this.bodyMat.color.setHex(0xFF2200);
        this.bodyMat.metalness = 0.65;
        this.bodyMat.roughness = 0.25;
        this.secondaryMat.color.setHex(0xFFAA00);
        this.secondaryMat.metalness = 0.70;
        this.secondaryMat.roughness = 0.20;
        if (this.driverSuitMat) {
          this.driverSuitMat.color.setHex(0xFF2200);
          this.driverSuitMat.metalness = 0.55;
          this.driverSuitMat.roughness = 0.28;
        }
        if (this.driverHeadMat) {
          this.driverHeadMat.color.setHex(0x2B1515);
          this.driverHeadMat.metalness = 0.20;
          this.driverHeadMat.roughness = 0.60;
        }
        if (this.bandanaMat) this.bandanaMat.color.setHex(0xFF7700);
        tireAccent = '#ff4400';
        sidewallColor = 0xff4400;
        sidewallEmissive = 0x551100;
        break;

      case 'skin_stealth':
        // Obsidian Carbon - Murdered-out Spec Ops Stealth
        this.bodyMat.color.setHex(0x141418);
        this.bodyMat.metalness = 0.90;
        this.bodyMat.roughness = 0.38;
        this.secondaryMat.color.setHex(0x060608);
        this.secondaryMat.metalness = 0.95;
        this.secondaryMat.roughness = 0.15;
        if (this.driverSuitMat) {
          this.driverSuitMat.color.setHex(0x18181B);
          this.driverSuitMat.metalness = 0.75;
          this.driverSuitMat.roughness = 0.35;
        }
        if (this.driverHeadMat) {
          this.driverHeadMat.color.setHex(0x222226);
          this.driverHeadMat.metalness = 0.30;
          this.driverHeadMat.roughness = 0.50;
        }
        if (this.bandanaMat) this.bandanaMat.color.setHex(0x3F3F46);
        tireAccent = '#71717a';
        sidewallColor = 0x52525b;
        sidewallEmissive = 0x111114;
        break;

      case 'skin_arcadia':
        // Diamond Pearl - Pearlescent Diamond with Laser Cyan
        this.bodyMat.color.setHex(0xFFFFFF);
        this.bodyMat.metalness = 0.75;
        this.bodyMat.roughness = 0.10;
        this.secondaryMat.color.setHex(0x00D2FF);
        this.secondaryMat.metalness = 0.65;
        this.secondaryMat.roughness = 0.18;
        if (this.driverSuitMat) {
          this.driverSuitMat.color.setHex(0xFFFFFF);
          this.driverSuitMat.metalness = 0.60;
          this.driverSuitMat.roughness = 0.15;
        }
        if (this.driverHeadMat) {
          this.driverHeadMat.color.setHex(0xF0FDFA);
          this.driverHeadMat.metalness = 0.40;
          this.driverHeadMat.roughness = 0.25;
        }
        if (this.bandanaMat) this.bandanaMat.color.setHex(0x00D2FF);
        tireAccent = '#00e5ff';
        sidewallColor = 0x00e5ff;
        sidewallEmissive = 0x003344;
        break;

      case 'paint_blaze':
      case 'paint_crimson':
      case 'skin_default':
      default:
        this.bodyMat.color.setHex(0xFF2244);
        this.bodyMat.metalness = 0.65;
        this.bodyMat.roughness = 0.28;
        this.secondaryMat.color.setHex(0xFFFFFF);
        this.secondaryMat.metalness = 0.40;
        this.secondaryMat.roughness = 0.35;
        if (this.driverSuitMat) {
          this.driverSuitMat.color.setHex(0xFF2244);
          this.driverSuitMat.metalness = 0.45;
          this.driverSuitMat.roughness = 0.45;
        }
        if (this.driverHeadMat) {
          this.driverHeadMat.color.setHex(0xFF2244);
          this.driverHeadMat.metalness = 0.35;
          this.driverHeadMat.roughness = 0.35;
        }
        if (this.bandanaMat) this.bandanaMat.color.setHex(0xFFDE59);
        tireAccent = '#ff2244';
        sidewallColor = 0xff2244;
        sidewallEmissive = 0x440811;
        this.setUnderglow(0xff2244);
        break;
    }

    // Apply matching high-contrast tire tread texture & sidewall racing ring
    if (this.sidewallStripeMat) {
      this.sidewallStripeMat.color.setHex(sidewallColor);
      this.sidewallStripeMat.emissive.setHex(sidewallEmissive);
    }
    if (this.tireRubberMat) {
      this.tireRubberMat.map = getTireTextureForAccent(tireAccent);
      this.tireRubberMat.needsUpdate = true;
    }
  }

  private underglowMesh?: THREE.Mesh;
  public setUnderglow(colorHex: number, enabled: boolean = true) {
    if (!this.underglowMesh) {
      const geom = new THREE.PlaneGeometry(1.6, 2.4);
      geom.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      this.underglowMesh = new THREE.Mesh(geom, mat);
      this.underglowMesh.position.set(0, 0.04, 0);
      this.group.add(this.underglowMesh);
    } else {
      (this.underglowMesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
      this.underglowMesh.visible = enabled;
    }
  }

  public groundCollider!: RAPIER.Collider;
  public isDrafting: boolean = false;
  public draftIntensity: number = 0;
  public setDraft(intensity: number) {
    this.draftIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
    this.isDrafting = this.draftIntensity > 0.08;
  }

  private buildPhysics(
    physics: PhysicsEngine,
    startPos: THREE.Vector3,
    startRot: THREE.Quaternion
  ) {
    const R = PhysicsEngine.RAPIER;

    // Dynamic RigidBody: origin sits at road surface level (y = startPos.y)
    const rbDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(startPos.x, startPos.y, startPos.z)
      .setRotation({ x: startRot.x, y: startRot.y, z: startRot.z, w: startRot.w })
      .setLinearDamping(0.32) // Low damping so car easily cruises at 100-150+ km/h
      .setAngularDamping(4.0)
      .setAdditionalMass(this.stats.weight * 50)
      .enabledRotations(false, true, false); // Lock pitch & roll; allow only yaw

    this.rigidBody = physics.world.createRigidBody(rbDesc);

    // 1. Kart-to-Kart Bumper Cuboid (Signature "Newton's Chaos" ramming):
    // Group 4 (membership 0x0004), interacts only with other karts' bumpers (filter 0x0004).
    // Mathematically isolated from the track trimesh so it never clips or snags on road geometry!
    const bumperColDesc = R.ColliderDesc.cuboid(0.85, 0.3, 1.35)
      .setTranslation(0, 0.55, 0)
      .setFriction(0.0)
      .setRestitution(0.2)
      .setCollisionGroups((0x0004 << 16) | 0x0004)
      .setSolverGroups((0x0000 << 16) | 0x0000) // Solver disabled: Newton's Chaos handles all impulses cleanly without engine penetration glitches
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    this.collider = physics.world.createCollider(bumperColDesc, this.rigidBody);

    // 2. Chassis Core Sphere (Backup safety):
    // Positioned safely above road level so it never drags or bounces on triangle seams
    const groundColDesc = R.ColliderDesc.ball(0.35)
      .setTranslation(0, 0.50, 0)
      .setFriction(0.0)
      .setRestitution(0.0)
      .setCollisionGroups((0x0002 << 16) | 0x0000);
    this.groundCollider = physics.world.createCollider(groundColDesc, this.rigidBody);
  }

  public airLaunchTimer: number = 0;
  public visualTumble: THREE.Vector3 = new THREE.Vector3();
  public tumbleAngularVel: THREE.Vector3 = new THREE.Vector3();
  public tumbleQuat: THREE.Quaternion = new THREE.Quaternion();

  public applyInput(
    throttle: number,
    steer: number,
    drift: boolean,
    dt: number,
    physics: PhysicsEngine
  ) {
    this.updateGhost(dt);

    const pos = this.rigidBody.translation();
    const rot = this.rigidBody.rotation();
    this._kq.set(rot.x, rot.y, rot.z, rot.w);
    const forward = this._kForward.set(0, 0, 1).applyQuaternion(this._kq);
    const right = this._kRight.set(1, 0, 0).applyQuaternion(this._kq);

    // ── 360° ANTI-GRAVITY VORTEX PARKOUR TUBE PHYSICS ──────────────────
    if (this.track && this.track.config.antiGravTube?.enabled) {
      const tube = this.track.config.antiGravTube;
      const tStart = tube.startSlice / Track.SAMPLES;
      const tEnd = tube.endSlice / Track.SAMPLES;
      const kartPosVec = this._kPosVec.set(pos.x, pos.y, pos.z);
      const trackLength = this.track.curve.getLength();

      if (!this.isInAntiGravTube) {
        // Outside the tube: check if approaching / entering the entrance portal
        this.splineT = this.track.getClosestT(kartPosVec, this.splineT >= 0 ? this.splineT : 0);
        const inEntryWindow = (this.splineT >= (tStart - 0.005) && this.splineT <= (tStart + 0.015));

        if (inEntryWindow) {
          this.isInAntiGravTube = true;
          this.wasInAntiGravTube = true;
          this.splineT = Math.max(tStart, this.splineT);
          const normT = ((this.splineT % 1.0) + 1.0) % 1.0;
          const curvePt = this.track.curve.getPointAt(normT);
          const curveTangent = this.track.curve.getTangentAt(normT).normalize();
          const worldUp = this._kRoadNormal.set(0, 1, 0);
          let binormal = this._kBinormal.crossVectors(worldUp, curveTangent);
          if (binormal.lengthSq() < 0.0001) binormal.set(1, 0, 0);
          else binormal.normalize();
          const normal = this._kTangent.crossVectors(curveTangent, binormal).normalize();
          const tubeCenter = curvePt.clone().addScaledVector(normal, tube.radius);
          const toEntry = kartPosVec.clone().sub(tubeCenter);
          const latDist = toEntry.dot(binormal);
          this.tubeAngle = Math.asin(THREE.MathUtils.clamp(latDist / tube.radius, -0.65, 0.65));
        }
      }

      if (this.isInAntiGravTube) {
        // 1. Boost decay & flames
        if (this.boostTime > 0) {
          this.boostTime -= dt;
          const flameScale = Math.min(1.0, this.boostTime * 1.5);
          for (let i = 0; i < this.flames.length; i++) {
            this.flames[i].scale.set(flameScale, flameScale, flameScale * 2.0);
          }
        } else if (this.flames.length > 0 && this.flames[0].scale.x > 0.002) {
          for (let i = 0; i < this.flames.length; i++) {
            this.flames[i].scale.set(0.001, 0.001, 0.001);
          }
        }

        // 2. Speed & Acceleration (Instant Anti-Grav Surge, Never Stalls)
        const draftSpeedBonus = this.isDrafting ? (1.0 + 0.12 * this.draftIntensity) : 1.0;
        const topSpeedMultiplier = (this.boostTime > 0 ? 1.55 : 1.25) * draftSpeedBonus;
        const targetTopSpeed = this.stats.topSpeed * topSpeedMultiplier;

        if (throttle > 0 && this.currentSpeed < targetTopSpeed) {
          this.currentSpeed = Math.min(
            targetTopSpeed,
            this.currentSpeed + this.stats.acceleration * dt * 2.5
          );
        } else if (throttle < 0) {
          this.currentSpeed = Math.max(12.0, this.currentSpeed - this.stats.acceleration * dt * 2.5);
        } else {
          this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetTopSpeed * 0.75, dt * 0.15);
        }

        // Anti-gravity magnetic surge ensures car keeps cruising through the vortex smoothly with zero stall
        if (this.currentSpeed < 26.0) {
          this.currentSpeed = Math.max(this.currentSpeed, 26.0);
        }

        // 3. CONTINUOUS SPLINE PROGRESSION: Advance splineT smoothly by physical distance traveled
        const dT = (this.currentSpeed * dt) / trackLength;
        this.splineT += dT;

        // 3b. Anti-Gravity Tube Floor Barrier Collision (Slice 174)
        // Requires driver to rotate onto the wall / ceiling (|tubeAngle| >= 1.10 rad ~ 63°) to clear the obstacle!
        const barrierT = 174 / Track.SAMPLES;
        const distToBarrier = this.splineT - barrierT;
        if (!this.isBot && distToBarrier >= -0.0035 && distToBarrier <= 0.0025) {
          if (Math.abs(this.tubeAngle) < 1.10) {
            // Block forward progression: clamp splineT before barrier
            this.splineT = Math.min(this.splineT, barrierT - 0.0035);
            // Rebound bounce back slightly
            this.currentSpeed = Math.min(this.currentSpeed, -4.0);
            const now = performance.now();
            if (!this.lastTubeBarrierHit || now - this.lastTubeBarrierHit > 500) {
              this.lastTubeBarrierHit = now;
              sounds.playRecoil();
              if (this.onTubeBarrierHit) this.onTubeBarrierHit();
            }
          }
        }

        // Reward clearance when crossing barrierT on ceiling/wall
        if (!this.hasClearedTubeBarrier && this.splineT > barrierT && this.splineT < barrierT + 0.015) {
          if (Math.abs(this.tubeAngle) >= 1.10) {
            this.hasClearedTubeBarrier = true;
            sounds.playBoost();
            if (this.onTubeBarrierCleared) this.onTubeBarrierCleared();
          }
        }

        // Check for Tube Exit
        if (this.splineT >= tEnd) {
          this.isInAntiGravTube = false;
          this.wasInAntiGravTube = false;
          this.tubeAngle = 0;
          const exitT = ((tEnd % 1.0) + 1.0) % 1.0;
          const exitPt = this.track.curve.getPointAt(exitT);
          const exitTangent = this.track.curve.getTangentAt(exitT).normalize();
          this.rigidBody.setTranslation({ x: exitPt.x, y: exitPt.y + 0.35, z: exitPt.z }, true);
          const exitVel = exitTangent.clone().multiplyScalar(Math.max(this.currentSpeed, 28.0));
          this.rigidBody.setLinvel({ x: exitVel.x, y: exitVel.y, z: exitVel.z }, true);
          this.group.position.set(exitPt.x, exitPt.y + 0.35, exitPt.z);
          return;
        }

        // 4. Analog Wall-Ride Steering around circumference
        const rollRate = this.stats.handling * 1.65;
        this.tubeAngle += steer * rollRate * dt;

        // Wrap tubeAngle in [-PI, PI]
        while (this.tubeAngle > Math.PI) this.tubeAngle -= Math.PI * 2;
        while (this.tubeAngle < -Math.PI) this.tubeAngle += Math.PI * 2;

        // Smooth auto-righting in the final 15% of the tube so the car exits upright
        const blendStart = tEnd - 0.020;
        if (this.splineT >= blendStart) {
          const blendProgress = (this.splineT - blendStart) / 0.020;
          this.tubeAngle = THREE.MathUtils.lerp(this.tubeAngle, 0, blendProgress * Math.min(1.0, dt * 7.5));
        }

        // 5. Continuous Smooth Curve Position & Orientation (Zero Discrete Slice Snapping / Zero Jitter!)
        const normT = ((this.splineT % 1.0) + 1.0) % 1.0;
        const curvePt = this.track.curve.getPointAt(normT);
        const driveForward = this.track.curve.getTangentAt(normT).normalize();
        const worldUp = this._kRoadNormal.set(0, 1, 0);
        let binormal = this._kBinormal.crossVectors(worldUp, driveForward);
        if (binormal.lengthSq() < 0.0001) binormal.set(1, 0, 0);
        else binormal.normalize();
        const normal = this._kTangent.crossVectors(driveForward, binormal).normalize();

        const tubeCenter = curvePt.clone().addScaledVector(normal, tube.radius);
        const effectiveRadius = tube.radius - 0.40;

        const targetPos = tubeCenter.clone()
          .addScaledVector(binormal, effectiveRadius * Math.sin(this.tubeAngle))
          .addScaledVector(normal, -effectiveRadius * Math.cos(this.tubeAngle));

        const kartUp = normal.clone().multiplyScalar(Math.cos(this.tubeAngle))
          .addScaledVector(binormal, -Math.sin(this.tubeAngle)).normalize();
        const driveRight = binormal.clone().multiplyScalar(Math.cos(this.tubeAngle))
          .addScaledVector(normal, Math.sin(this.tubeAngle)).normalize();

        const basisMat = new THREE.Matrix4().makeBasis(driveRight, kartUp, driveForward);
        const tubeQuat = new THREE.Quaternion().setFromRotationMatrix(basisMat);

        const steerOffsetQuat = new THREE.Quaternion().setFromAxisAngle(kartUp, -steer * 0.16);
        tubeQuat.multiply(steerOffsetQuat);

        // 6. Direct rigidBody & visual mesh update
        this.rigidBody.setTranslation({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, true);
        const fwdVel = driveForward.clone().multiplyScalar(this.currentSpeed);
        this.rigidBody.setLinvel({ x: fwdVel.x, y: fwdVel.y, z: fwdVel.z }, true);

        this.group.position.copy(targetPos);
        this.group.quaternion.slerp(tubeQuat, Math.min(1.0, dt * 25.0));

        this.isGrounded = true;
        this.airLaunchTimer = 0;

        // Animate wheels & driver lean
        const targetWheelSteer = steer * 0.45;
        this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetWheelSteer, dt * 12);
        const spinDelta = (this.currentSpeed * dt) / 0.44;
        this.wheels.forEach((wheel, idx) => {
          wheel.rotation.x += spinDelta;
          if (idx < 2) {
            wheel.parent!.rotation.y = -this.steerAngle;
          }
        });

        if (this.driverGroup) {
          this.driverGroup.rotation.z = THREE.MathUtils.lerp(this.driverGroup.rotation.z, -this.steerAngle * 0.38, dt * 10);
          this.driverGroup.rotation.y = THREE.MathUtils.lerp(this.driverGroup.rotation.y, this.steerAngle * 0.28, dt * 10);
        }
        if (this.steeringWheel) {
          this.steeringWheel.rotation.z = -this.steerAngle * 2.2;
        }

        return;
      }
    } else {
      this.isInAntiGravTube = false;
      this.wasInAntiGravTube = false;
      this.tubeAngle = 0;
    }


    // Ground raycast check (from 3.5m above kart origin straight down 12.0m)
    // Filter group (0x0002 << 16) | 0x0001 ensures ray ONLY tests against Track collider (never hits other karts or bumpers!)
    const rayOrigin = { x: pos.x, y: pos.y + 3.5, z: pos.z };
    const trackFilterGroup = (0x0002 << 16) | 0x0001;
    const hit = physics.castRay(
      rayOrigin,
      { x: 0, y: -1, z: 0 },
      12.0,
      true,
      this.rigidBody,
      trackFilterGroup
    );

    let roadY = hit ? rayOrigin.y - hit.toi : -999;
    let normalY = hit ? hit.normal.y : 0;

    // Arena exact surface height computation (Center dais: 0.35m, gradual ramp: 11.5m -> 16.8m)
    let arenaFloorY = 0.0;
    const isArena = !!(this.track && this.track.isArena);
    const dCenter = isArena ? Math.hypot(pos.x, pos.z) : 0;
    if (isArena) {
      if (dCenter <= 11.5) {
        arenaFloorY = 0.35;
      } else if (dCenter < 16.8) {
        // Smooth Hermite cubic ease from 0.35 down to 0.0
        const t = (16.8 - dCenter) / (16.8 - 11.5);
        arenaFloorY = 0.35 * (t * t * (3 - 2 * t));
      } else {
        arenaFloorY = 0.0;
      }
    }

    // Mathematical spline fallback if raycast missed or hit vertical/invalid normal
    if (this.track && (roadY < -900 || normalY <= 0.25)) {
      if (isArena) {
        // In Arena mode: strictly provide fallback only while on the 96.0m arena deck
        if (dCenter <= 96.0 && pos.y >= -0.5) {
          roadY = arenaFloorY;
          normalY = 1.0;
        }
      } else {
        // Prevent false road snap if kart is actively traversing an aerial stunt jump gap
        const trk = this.track;
        const inJumpGap = !!(trk && trk.config.jumpZones && trk.config.jumpZones.some(j => {
          const normLaunch = (j.launchSlice % Track.SAMPLES) / Track.SAMPLES;
          const sLaunch = trk.getTrackSlice(normLaunch);
          const fwdLaunch = (pos.x - sLaunch.position.x) * sLaunch.tangent.x + (pos.z - sLaunch.position.z) * sLaunch.tangent.z;

          const normLand = (j.landingSlice % Track.SAMPLES) / Track.SAMPLES;
          const sLand = trk.getTrackSlice(normLand);
          const fwdLand = (pos.x - sLand.position.x) * sLand.tangent.x + (pos.z - sLand.position.z) * sLand.tangent.z;

          return fwdLaunch > 0.05 && fwdLand < -0.05;
        }));

        if (!inJumpGap) {
          const posVec = this._kPosVec.set(pos.x, pos.y, pos.z);
          const t = this.track.getClosestT(posVec);
          const slice = this.track.getTrackSlice(t);
          if (!slice.isGap) {
            const distToSlice = Math.hypot(pos.x - slice.position.x, pos.z - slice.position.z);
            // Strict vertical clearance: Only match track slice if kart is near actual road elevation!
            // Prevents falling karts under the sky track from falsely locking onto road height at pillars.
            const vertDelta = pos.y - slice.position.y;
            if (distToSlice <= slice.halfWidth + 1.4 && vertDelta >= -1.8 && vertDelta <= 3.5) {
              roadY = slice.position.y;
              normalY = slice.normal.y;
            }
          }
        }
      }
    }

    // Rock-Solid Arena Deck Surface Floor:
    // If the kart is inside the 95.5m arena coliseum, roadY must NEVER be below the actual arena floor!
    if (isArena && dCenter <= 95.5) {
      if (roadY < arenaFloorY) {
        roadY = arenaFloorY;
        normalY = 1.0;
      }
    }

    let distToRoad = pos.y - roadY;

    // ABSOLUTE ANTI-SINK ROAD FLOOR:
    // Only applies if kart touches or penetrates slightly below road level (suspension bottoming out: -0.75 <= distToRoad < 0.0)
    if (roadY > -900 && normalY > 0.25 && distToRoad < 0.0 && distToRoad >= -0.75) {
      this.rigidBody.setTranslation({ x: pos.x, y: roadY, z: pos.z }, true);
      pos.y = roadY;
      distToRoad = 0.0;

      const curLv = this.rigidBody.linvel();
      if (curLv.y < 0) {
        this.rigidBody.setLinvel({ x: curLv.x, y: 0, z: curLv.z }, true);
      }

      this.isGrounded = true;
      this.airLaunchTimer = 0;
    }

    // In Arena mode: if kart ever dips below arena floor while inside coliseum, immediately lock to floor!
    if (isArena && dCenter <= 95.5 && pos.y < arenaFloorY) {
      this.rigidBody.setTranslation({ x: pos.x, y: arenaFloorY, z: pos.z }, true);
      pos.y = arenaFloorY;
      distToRoad = 0.0;
      const curLv = this.rigidBody.linvel();
      if (curLv.y < 0) {
        this.rigidBody.setLinvel({ x: curLv.x, y: 0, z: curLv.z }, true);
      }
      this.isGrounded = true;
      this.airLaunchTimer = 0;
    } else if (this.airLaunchTimer > 0) {
      this.airLaunchTimer -= dt;
      const curLv = this.rigidBody.linvel();
      // Strict touchdown: ONLY ground when tires physically touch road deck while settling downwards
      if (roadY > -900 && distToRoad <= 0.20 && normalY > 0.30 && curLv.y <= 0.35 && curLv.y >= -2.5) {
        this.airLaunchTimer = 0;
        this.isGrounded = true;
      } else {
        this.isGrounded = false;
      }
    } else {
      // Normal grounded check: car is within suspension travel on walkable road surface
      this.isGrounded = roadY > -900 && distToRoad >= -0.35 && distToRoad <= 0.85 && normalY > 0.25;
    }

    const linVel = this.rigidBody.linvel();
    const velVec = this._kVelVec.set(linVel.x, linVel.y, linVel.z);

    // Boost timer decay
    if (this.boostTime > 0) {
      this.boostTime -= dt;
      const flameScale = Math.min(1.0, this.boostTime * 1.5);
      for (let i = 0; i < this.flames.length; i++) {
        this.flames[i].scale.set(flameScale, flameScale, flameScale * 2.0);
      }
    } else if (this.flames.length > 0 && this.flames[0].scale.x > 0.002) {
      for (let i = 0; i < this.flames.length; i++) {
        this.flames[i].scale.set(0.001, 0.001, 0.001);
      }
    }

    // Handle Natural Momentum Drifting (Initiates on firm cornering at 85+ km/h; 40+ km/h in Battle Arena)
    const speedKmh = Math.abs(this.currentSpeed) * 3.6;
    const minDriftKmh = isArena ? 40 : 85;
    const sustainDriftKmh = isArena ? 28 : 55;
    let shouldDrift = false;

    if (this.isGrounded) {
      if (this.isDrifting) {
        // Sustain active drift through the corner as long as turning is held
        if (Math.abs(steer) >= 0.15 && speedKmh >= sustainDriftKmh) {
          shouldDrift = true;
        }
      } else {
        // Natural initiate: On firm steer (>= 0.45) at speed or brake-flick
        if (speedKmh >= minDriftKmh && (Math.abs(steer) >= 0.45 || (throttle < -0.1 && Math.abs(steer) >= 0.28))) {
          shouldDrift = true;
        }
      }
    }

    if (shouldDrift) {
      this.isDrifting = true;
      this.driftTime += dt;
    } else {
      // Natural Mini-Turbo boost release upon ending a solid corner drift!
      if (this.isDrifting && this.driftTime >= 0.7) {
        this.applyBoost(0.65, 1.25);
        sounds.playBoost();
      }
      this.isDrifting = false;
      this.driftTime = 0;
      this.driftChargeMeter = 0;
    }

    const mass = this.rigidBody.mass();

    if (this.isGrounded && hit) {
      const roadNormal = this._kRoadNormal.set(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
      const driveForward = this._kDriveForward.copy(forward).projectOnPlane(roadNormal).normalize();
      const driveRight = this._kDriveRight.copy(right).projectOnPlane(roadNormal).normalize();

      this.currentSpeed = velVec.dot(driveForward);

      // 1. Throttle / Brake Force along the Road Incline + Slipstream (Drafting) Boost
      // NOTE: In Rumble Arena, speed and acceleration are scaled down so brawling is tactical and controllable!
      // In Classic Track & Hardcore Track, speed & power are 100% full original racing speed!
      const draftSpeedBonus = this.isDrafting ? (1.0 + 0.12 * this.draftIntensity) : 1.0;
      const arenaSpeedScale = 0.50; // ~85 km/h top speed in arena vs 175 km/h on racing highway
      const topSpeedMultiplier = isArena
        ? (this.boostTime > 0 ? 1.32 : 1.0) * arenaSpeedScale * draftSpeedBonus
        : (this.boostTime > 0 ? 1.5 : 1.0) * draftSpeedBonus;
      let targetTopSpeed = this.stats.topSpeed * topSpeedMultiplier;

      const accelScale = isArena ? 0.65 : 1.0;

      // Auto-Throttle on Nitro: When boost is actively firing, lock throttle to 100% driving power
      const effectiveThrottle = this.boostTime > 0 ? Math.max(1.0, throttle) : throttle;

      if (effectiveThrottle > 0 && this.currentSpeed < targetTopSpeed) {
        let forceMag = this.stats.acceleration * accelScale * mass * 2.5 * effectiveThrottle;
        if (this.isDrafting) {
          forceMag += mass * 12.0 * this.draftIntensity; // Dynamic aerodynamic forward pull
        }
        this.rigidBody.applyImpulse(
          { x: driveForward.x * forceMag * dt, y: driveForward.y * forceMag * dt, z: driveForward.z * forceMag * dt },
          true
        );
      } else if (throttle < 0 && this.boostTime <= 0) {
        // Reverse or Brake (disabled during active rocket boost)
        if (this.currentSpeed > 1.2) {
          // 1. Moving forward: Apply strong, controlled braking deceleration
          const brakeForce = this.stats.acceleration * accelScale * 2.2 * mass * throttle;
          this.rigidBody.applyImpulse(
            { x: driveForward.x * brakeForce * dt, y: driveForward.y * brakeForce * dt, z: driveForward.z * brakeForce * dt },
            true
          );
        } else {
          // 2. Stopped or reversing: Punchy arcade reverse gear (~60-70 km/h top speed)
          const maxReverseSpeed = isArena ? -16.5 : -19.0;
          if (this.currentSpeed > maxReverseSpeed) {
            const reverseForce = this.stats.acceleration * accelScale * 1.5 * mass * throttle;
            this.rigidBody.applyImpulse(
              { x: driveForward.x * reverseForce * dt, y: driveForward.y * reverseForce * dt, z: driveForward.z * reverseForce * dt },
              true
            );
          }
        }
      }

      // 2. Lateral Tire Grip along Road Surface
      const lateralVel = velVec.dot(driveRight);
      const driftGripRatio = THREE.MathUtils.clamp(this.stats.driftGrip / 1.3, 0.75, 1.45);
      // High momentum slide when drifting (0.28 vs 0.95 normal)
      const gripFactor = this.isDrifting ? (0.28 * driftGripRatio) : 0.95;
      const lateralImpulse = -lateralVel * gripFactor * mass * Math.min(1.0, dt * 18.0);
      this.rigidBody.applyImpulse(
        { x: driveRight.x * lateralImpulse, y: driveRight.y * lateralImpulse, z: driveRight.z * lateralImpulse },
        true
      );

      // 3. Steering Torque with High-Speed Weight / Understeer:
      const speedFactor = Math.max(0.35, Math.min(1.0, Math.abs(this.currentSpeed) / 7.0));
      const steerDirection = this.currentSpeed >= -0.5 ? -1 : 1;
      const handlingMultiplier = isArena ? 1.25 : 1.0;

      // Smooth steering micro-ramp to eliminate digital 0ms twitch on keyboard/touch:
      // Reaches target in ~60-70ms (dt * 18.0) - feels ultra responsive with zero lag, but eliminates 0ms violent jerk!
      this.smoothedSteer = THREE.MathUtils.lerp(this.smoothedSteer, steer, Math.min(1.0, dt * 18.0));

      // High-speed steering weight:
      // 0 - 50 km/h: 100% response (crisp agility)
      // 50 - 110 km/h: ~95% response
      // 110 - 180 km/h: 90% response (exact 90% requested by user)
      // In drift mode, preserve full turning boost (1.55x) so car can spin and carve freely!
      const highSpeedWeight = this.isDrifting
        ? 1.55
        : THREE.MathUtils.lerp(1.0, 0.90, THREE.MathUtils.clamp((speedKmh - 45) / 125, 0, 1));

      const turnRate = this.stats.handling * handlingMultiplier * highSpeedWeight * this.smoothedSteer * speedFactor * steerDirection;
      this.rigidBody.setAngvel({ x: 0, y: turnRate, z: 0 }, true);

      // 4. Smooth Road Height Lock (Zero Bounce, Zero Hopping, Zero Sinking)
      const targetY = roadY;
      let newY = THREE.MathUtils.lerp(pos.y, targetY, Math.min(1.0, dt * 25.0));
      // Hard suspension floor: NEVER allow kart to sink below road surface!
      if (newY < roadY) {
        newY = roadY;
      }
      this.rigidBody.setTranslation({ x: pos.x, y: newY, z: pos.z }, true);

      // Align vertical linear velocity with slope climbing velocity
      const slopeVy = this.currentSpeed * driveForward.y;
      const curLv = this.rigidBody.linvel();
      const newVy = curLv.y < slopeVy && slopeVy > 0 ? slopeVy : (curLv.y < 0 && distToRoad <= 0.05 ? Math.max(curLv.y, slopeVy) : curLv.y);
      this.rigidBody.setLinvel({ x: curLv.x, y: newVy, z: curLv.z }, true);

    } else {
      // Airborne (Canyon jump, sky launch, or falling)
      // Safety road surface clamp: if kart reaches road elevation while landing from air, land cleanly!
      if (roadY > -900 && normalY > 0.25 && pos.y <= roadY && pos.y >= roadY - 0.75) {
        this.rigidBody.setTranslation({ x: pos.x, y: roadY, z: pos.z }, true);
        const curLv = this.rigidBody.linvel();
        if (curLv.y < 0) {
          this.rigidBody.setLinvel({ x: curLv.x, y: 0, z: curLv.z }, true);
        }
        this.isGrounded = true;
        this.airLaunchTimer = 0;
      }

      this.currentSpeed = velVec.dot(forward);

      if (pos.y > -22) {
        const speedFactor = 0.5;
        const turnRate = this.stats.handling * steer * speedFactor * -1;
        this.rigidBody.setAngvel({ x: 0, y: turnRate, z: 0 }, true);

        const lateralVel = velVec.dot(right);
        const airGrip = -lateralVel * 0.05 * mass * Math.min(1.0, dt * 5.0);
        this.rigidBody.applyImpulse({ x: right.x * airGrip, y: 0, z: right.z * airGrip }, true);
      }
    }

    // Direct 1:1 mesh position sync (eliminates double-lerp camera oscillation)
    const p = this.rigidBody.translation();
    const r = this.rigidBody.rotation();
    this.group.position.set(p.x, p.y, p.z);

    // Visual rotation: Align smoothly with road banking/pitch when grounded
    if (this.isGrounded && hit) {
      const roadNormal = this._kRoadNormal.set(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
      this._kYawQuat.set(r.x, r.y, r.z, r.w);
      const fwd = this._kFwd.set(0, 0, 1).applyQuaternion(this._kYawQuat);
      const tangent = this._kTangent.copy(fwd).projectOnPlane(roadNormal).normalize();
      const binormal = this._kBinormal.crossVectors(roadNormal, tangent).normalize();
      this._kBasisMat.makeBasis(binormal, roadNormal, tangent);
      const targetMeshQuat = this._kTargetMeshQuat.setFromRotationMatrix(this._kBasisMat);

      // Realistic Drift Visuals: Oversteer slip angle + chassis roll weight transfer
      const targetSlip = this.isDrifting ? (-Math.sign(steer) * 0.35) : 0.0;
      const targetRoll = this.isDrifting ? (Math.sign(steer) * 0.09) : 0.0;
      this.visualSlipAngle = THREE.MathUtils.lerp(this.visualSlipAngle, targetSlip, Math.min(1.0, dt * 10.0));
      this.visualRollAngle = THREE.MathUtils.lerp(this.visualRollAngle, targetRoll, Math.min(1.0, dt * 10.0));

      if (Math.abs(this.visualSlipAngle) > 0.001 || Math.abs(this.visualRollAngle) > 0.001) {
        this._kDriftEuler.set(0, this.visualSlipAngle, this.visualRollAngle, 'YXZ');
        this._kDriftQuat.setFromEuler(this._kDriftEuler);
        targetMeshQuat.multiply(this._kDriftQuat);
      }

      this.group.quaternion.slerp(targetMeshQuat, Math.min(1.0, dt * 16.0));
      // Auto-recover from any tumble smoothly once grounded back on asphalt
      this.tumbleQuat.slerp(this._kIdentQuat, Math.min(1.0, dt * 14.0));
      this.tumbleAngularVel.set(0, 0, 0);
    } else {
      this.visualSlipAngle = THREE.MathUtils.lerp(this.visualSlipAngle, 0, dt * 8.0);
      this.visualRollAngle = THREE.MathUtils.lerp(this.visualRollAngle, 0, dt * 8.0);

      this._kYawQuat.set(r.x, r.y, r.z, r.w);

      // Directional 3D Tumble and Flip Dynamics while airborne
      if (this.airLaunchTimer > 0 || this.tumbleAngularVel.lengthSq() > 0.05) {
        this._kDriftEuler.set(
          this.tumbleAngularVel.x * dt,
          this.tumbleAngularVel.y * dt,
          this.tumbleAngularVel.z * dt,
          'YXZ'
        );
        this._kDriftQuat.setFromEuler(this._kDriftEuler);
        this.tumbleQuat.multiply(this._kDriftQuat).normalize();
        this.tumbleAngularVel.multiplyScalar(Math.max(0, 1.0 - dt * 0.45)); // Air drag

        this.group.quaternion.copy(this._kYawQuat).multiply(this.tumbleQuat);
      } else {
        // Natural self-righting when air launch has expired
        this.tumbleQuat.slerp(this._kIdentQuat, Math.min(1.0, dt * 8.0));
        this.group.quaternion.copy(this._kYawQuat).multiply(this.tumbleQuat);
      }
    }

    // Animate wheel spinning and front steering (Dynamic counter-steering during drift)
    const targetWheelSteer = this.isDrifting ? (-Math.sign(steer) * 0.22 + steer * 0.16) : (steer * 0.45);
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetWheelSteer, dt * 12);
    const spinDelta = (this.currentSpeed * dt) / 0.44;
    this.wheels.forEach((wheel, idx) => {
      wheel.rotation.x += spinDelta;
      if (idx < 2) {
        wheel.parent!.rotation.y = -this.steerAngle;
      }
    });

    // Dynamic driver lean into cornering turns & steering wheel rotation
    if (this.driverGroup) {
      this.driverGroup.rotation.z = THREE.MathUtils.lerp(this.driverGroup.rotation.z, -this.steerAngle * 0.38, dt * 10);
      this.driverGroup.rotation.y = THREE.MathUtils.lerp(this.driverGroup.rotation.y, this.steerAngle * 0.28, dt * 10);
    }
    if (this.steeringWheel) {
      this.steeringWheel.rotation.z = -this.steerAngle * 2.2;
    }
  }

  /**
   * Tactical manual Nitro boost (Consumes 1 of 3 nitro charges)
   */
  public useNitro(): boolean {
    // Manual Nitro is strictly disabled in Sky Rumble Arena (boost ONLY from ground boost chevrons/pads)
    if (this.track && this.track.isArena) return false;
    if (this.nitroCharges <= 0 || this.boostTime > 0.8) return false;
    this.nitroCharges--;
    this.applyBoost(1.8, 1.65);
    sounds.playBoost();
    return true;
  }

  /**
   * Refill tactical Nitro canister (e.g. on crossing Start/Finish lap arch, capped at 3)
   */
  public refillNitro(amount: number = 1): number {
    this.nitroCharges = Math.min(this.maxNitroCharges, this.nitroCharges + amount);
    return this.nitroCharges;
  }

  // Boost strip / Mini-turbo trigger
  public applyBoost(duration: number = 1.2, speedMultiplier: number = 1.35) {
    this.boostTime = Math.max(this.boostTime, duration);
    const rot = this.rigidBody.rotation();
    this._kq.set(rot.x, rot.y, rot.z, rot.w);
    const forward = this._kForward.set(0, 0, 1).applyQuaternion(this._kq);

    // Instant forward surge
    const surge = 18.0 * this.stats.weight * speedMultiplier;
    this.rigidBody.applyImpulse({ x: forward.x * surge, y: 2.0, z: forward.z * surge }, true);
  }

  // High-Energy Skyward Launch and Directional Tumble Mechanics
  public launchIntoAir(velocity: THREE.Vector3, isAttacker: boolean, torque?: THREE.Vector3) {
    const now = performance.now();
    const isHardImpact = velocity.lengthSq() > 120;
    if (!isHardImpact && now - this.lastImpactTime < 80) return;
    this.lastImpactTime = now;

    const isVerticalLaunch = velocity.y > 1.5;
    this.airLaunchTimer = isVerticalLaunch ? (isAttacker ? 0.35 : 1.4) : 0;
    this.isGrounded = !isVerticalLaunch;

    // Directly set upward and horizontal velocity
    const curVel = this.rigidBody.linvel();
    const upwardVel = isVerticalLaunch ? (Math.max(0, curVel.y) + velocity.y) : curVel.y;
    this.rigidBody.setLinvel({
      x: curVel.x * 0.2 + velocity.x,
      y: upwardVel,
      z: curVel.z * 0.2 + velocity.z,
    }, true);

    // Directional Stunt Tumble & Flip
    if (torque) {
      this.tumbleAngularVel.copy(torque);
    } else {
      const spinMag = isAttacker ? 2.5 : 8.0;
      this.tumbleAngularVel.set(
        (Math.random() - 0.5) * spinMag,
        (Math.random() - 0.5) * spinMag * 1.5,
        (Math.random() - 0.5) * spinMag
      );
    }

    // Zero angular velocity on physics rigidBody (visual mesh tumbleQuat handles all 3D stunt rotation)
    this.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  public applyNitroSmash(launchVel: THREE.Vector3, isAttacker: boolean) {
    this.launchIntoAir(launchVel, isAttacker);
  }

  public applyNitroClash(reboundVel: THREE.Vector3) {
    this.launchIntoAir(reboundVel, true);
  }

  public applyBumperBump(impulse: THREE.Vector3, speedDamp: number = 0.85) {
    const lv = this.rigidBody.linvel();
    this.rigidBody.setLinvel({
      x: lv.x * speedDamp,
      y: lv.y,
      z: lv.z * speedDamp,
    }, true);
    this.currentSpeed *= speedDamp;

    const mass = this.rigidBody.mass();
    this.rigidBody.applyImpulse({ x: impulse.x * mass, y: 0, z: impulse.z * mass }, true);
  }

  public applyCollisionImpulse(impulse: THREE.Vector3, isAttacker: boolean) {
    const mass = this.rigidBody.mass();
    const vel = new THREE.Vector3(
      impulse.x / mass,
      impulse.y / mass,
      impulse.z / mass
    );
    this.launchIntoAir(vel, isAttacker);
  }

  public updateGhost(dt: number) {
    if (this.isGhost) {
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) {
        this.setGhost(false);
      } else {
        if (this.shieldGroup && this.shieldGroup.visible) {
          // Smooth rotation of thin energy ring and subtle hex lattice
          if (this.shieldRing) {
            this.shieldRing.rotation.z += dt * 4.5;
            this.shieldRing.rotation.y += dt * 1.8;
          }
          if (this.shieldHex) {
            this.shieldHex.rotation.y += dt * 0.8;
          }

          // Gentle breathing pulse
          const pulse = Math.sin(performance.now() * 0.008);
          if (this.shieldBubbleMat) {
            this.shieldBubbleMat.opacity = 0.32 + pulse * 0.08;
          }
          if (this.shieldBubble) {
            const s = 1.0 + pulse * 0.02;
            this.shieldBubble.scale.set(s, s, s);
          }

          // Fast pulse in the final 0.6s to warn it is expiring, NEVER turning completely invisible!
          if (this.ghostTimer < 0.60) {
            const flash = Math.floor(this.ghostTimer * 12) % 2 === 0;
            if (this.shieldBubbleMat) {
              this.shieldBubbleMat.opacity = flash ? 0.45 : 0.18;
            }
          }
        }
      }
    }
  }

  // Ghost Mode (during checkpoint respawn or clean race start)
  public setGhost(enabled: boolean, duration: number = 3.5) {
    this.isGhost = enabled;
    this.ghostTimer = enabled ? duration : 0;

    if (this.shieldGroup) {
      this.shieldGroup.visible = enabled;
      if (enabled) {
        this.shieldGroup.scale.set(1, 1, 1);
        if (this.shieldRing) this.shieldRing.rotation.set(Math.PI / 3, 0, 0);
        if (this.shieldBubbleMat) this.shieldBubbleMat.opacity = 0.32;
      }
    }

    // Keep car body visibly translucent during ghost phase so players instantly see it's invincible!
    this.materialsToFlash.forEach(m => {
      m.transparent = enabled;
      m.opacity = enabled ? 0.55 : 1.0;
    });
  }

  // Reset to Checkpoint (Guaranteed upright, level, zero tumble, locked to road surface)
  public resetTo(pos: THREE.Vector3, rot: THREE.Quaternion, physics?: PhysicsEngine) {
    this.airLaunchTimer = 0;
    this.visualTumble.set(0, 0, 0);
    this.tumbleAngularVel.set(0, 0, 0);
    this.tumbleQuat.identity();
    this.hasClearedTubeBarrier = false;
    this.isInAntiGravTube = false;
    this.wasInAntiGravTube = false;
    this.tubeAngle = 0;
    this.group.rotation.set(0, 0, 0);
    if (this.driverGroup) this.driverGroup.rotation.set(0, 0, 0);
    if (this.steeringWheel) this.steeringWheel.rotation.set(-Math.PI / 6, 0, 0);

    // Extract strictly yaw rotation so kart is mathematically impossible to be upside down
    const euler = new THREE.Euler().setFromQuaternion(rot, 'YXZ');
    const uprightRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), euler.y);

    // Raycast downward from 4m above pos to find exact road surface height
    let spawnY = pos.y;
    if (physics) {
      const rayHit = physics.castRay(
        { x: pos.x, y: pos.y + 4.0, z: pos.z },
        { x: 0, y: -1, z: 0 },
        10.0,
        true,
        this.rigidBody
      );
      if (rayHit) {
        spawnY = (pos.y + 4.0) - rayHit.toi;
      }
    }

    this.rigidBody.setTranslation({ x: pos.x, y: spawnY + 0.05, z: pos.z }, true);
    this.rigidBody.setRotation({ x: 0, y: uprightRot.y, z: 0, w: uprightRot.w }, true);
    this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

    this.group.position.set(pos.x, spawnY + 0.05, pos.z);
    this.group.quaternion.set(0, uprightRot.y, 0, uprightRot.w);

    this.currentSpeed = 0;
    this.isGrounded = true;
    this.setGhost(true, 3.5);
  }

  public getSpeedKmh(): number {
    return Math.max(0, Math.round(Math.abs(this.currentSpeed) * 3.6));
  }

  public dispose(parentGroupOrScene?: THREE.Object3D, physics?: PhysicsEngine) {
    if (this.group) {
      if (parentGroupOrScene) {
        parentGroupOrScene.remove(this.group);
      }
      this.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m) continue;
            // Dispose non-cached textures (tire textures are shared in tireTextureCache so keep them)
            if (m.map && !Array.from(tireTextureCache.values()).includes(m.map)) {
              m.map.dispose();
            }
            m.dispose();
          }
        }
      });
    }

    if (this.rigidBody && physics) {
      try {
        physics.world.removeRigidBody(this.rigidBody);
      } catch {}
    }
  }
}
