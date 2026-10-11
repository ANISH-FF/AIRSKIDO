import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsEngine } from '../core/Physics';
import { KineticHazardManager } from './KineticHazards';
import { TrackDefinition, JumpZoneConfig } from './tracks/TrackTypes';
import { ClassicTrackConfig } from './tracks/ClassicTrackConfig';
import { HardcoreTrackConfig } from './tracks/HardcoreTrackConfig';
import { RumbleArenaConfig } from './tracks/RumbleArenaConfig';

export interface BoostPadData {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  mesh: THREE.Mesh;
  isRampPad?: boolean;
}

export interface TrackSliceData {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  binormal: THREE.Vector3;
  normal: THREE.Vector3;
  halfWidth: number;
  isGap: boolean;
  isRamp: boolean;
  extraY: number;
}

export interface MiniKickerRamp {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  mesh: THREE.Group;
  triggerRadius: number;
}

export interface HazardBlock {
  id: string;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  binormal: THREE.Vector3;
  halfWidth: number;
  halfDepth: number;
  mesh: THREE.Group;
  radius: number;
  isDestroyed: boolean;
  respawnTimer: number;
}

export interface CyberJumpRing {
  id: string;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  binormal: THREE.Vector3;
  normal: THREE.Vector3;
  radius: number;
  rimThickness: number;
  lastHitTimes: Map<string, number>;
  lastPassTimes: Map<string, number>;
}

export class Track {
  public config: TrackDefinition;
  public curve: THREE.CatmullRomCurve3;
  public isHardcore: boolean = false;
  public isArena: boolean = false;

  public trackMesh!: THREE.Mesh;
  public curbMesh!: THREE.Mesh;
  public underbodyMesh!: THREE.Mesh;
  public boostPads: BoostPadData[] = [];
  public kickerRamps: MiniKickerRamp[] = [];
  public hazardBlocks: HazardBlock[] = [];
  public kineticHazards!: KineticHazardManager;
  public cyberRings: CyberJumpRing[] = [];
  public collider!: RAPIER.Collider;
  public propColliders: RAPIER.Collider[] = [];
  public boulders: { position: THREE.Vector3; radius: number; lastHitTimes: Map<string, number> }[] = [];

  public static readonly TRACK_WIDTH = 18.0; // Standard 18m highway
  public static readonly CURB_WIDTH = 1.4;
  public static readonly TRACK_THICKNESS = 1.2;
  public static readonly SAMPLES = 400; // High-definition 400-slice polygon detail
  public static readonly GAP_START_SLICE = 86;
  public static readonly GAP_END_SLICE = 104;

  private sceneObjects: THREE.Object3D[] = [];

  constructor(
    scene: THREE.Scene,
    physics: PhysicsEngine,
    mode: 'classic' | 'hardcore' | 'rumble' | boolean = false
  ) {
    if (mode === 'rumble') {
      this.isArena = true;
      this.isHardcore = false;
      this.config = new RumbleArenaConfig();
    } else if (mode === 'hardcore' || mode === true) {
      this.isArena = false;
      this.isHardcore = true;
      this.config = new HardcoreTrackConfig();
    } else {
      this.isArena = false;
      this.isHardcore = false;
      this.config = new ClassicTrackConfig();
    }
    this.curve = this.config.curve;
    this.initCachedSlices();

    if (this.isArena) {
      this.buildArenaMeshes(scene, physics);
      this.createArenaProps(scene, physics);
    } else {
      this.buildTrackMeshes(scene, physics);
      this.createStartFinishArch(scene);
      this.createBoostPads(scene);
      this.createJumpZones(scene);
      this.createAntiGravTube(scene);
      this.createKickerRamps(scene);
      this.createHazardBlocks(scene);
      this.createUnderTrackPillars(scene);
      this.kineticHazards = new KineticHazardManager(
        scene,
        this,
        this.config.turbines,
        this.config.pendulums
      );
    }
  }

  private addToScene(scene: THREE.Scene, obj: THREE.Object3D) {
    this.sceneObjects.push(obj);
    scene.add(obj);
  }

  public dispose(scene: THREE.Scene, physics: PhysicsEngine) {
    for (const obj of this.sceneObjects) {
      scene.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m) continue;
            if (m.map) m.map.dispose();
            if (m.lightMap) m.lightMap.dispose();
            if (m.bumpMap) m.bumpMap.dispose();
            if (m.normalMap) m.normalMap.dispose();
            if (m.specularMap) m.specularMap.dispose();
            if (m.roughnessMap) m.roughnessMap.dispose();
            if (m.metalnessMap) m.metalnessMap.dispose();
            if (m.alphaMap) m.alphaMap.dispose();
            m.dispose();
          }
        }
      });
    }
    this.sceneObjects = [];

    if (this.collider) {
      physics.world.removeCollider(this.collider, false);
    }
    for (const c of this.propColliders) {
      physics.world.removeCollider(c, false);
    }
    this.propColliders = [];
    if (this.kineticHazards) {
      this.kineticHazards.dispose(scene);
    }
  }

  private cachedSlices: TrackSliceData[] = [];

  // ── UNIFIED AUTHORITATIVE SLICE EVALUATION (O(1) Cached Lookup) ──────
  private initCachedSlices() {
    this.cachedSlices = [];
    const samples = Track.SAMPLES;
    for (let i = 0; i < samples; i++) {
      this.cachedSlices.push(this.computeTrackSlice(i / samples));
    }
  }

  public getTrackSlice(t: number): TrackSliceData {
    if (this.cachedSlices.length === Track.SAMPLES) {
      const normT = ((t % 1.0) + 1.0) % 1.0;
      const sliceIdx = Math.round(normT * Track.SAMPLES) % Track.SAMPLES;
      return this.cachedSlices[sliceIdx];
    }
    return this.computeTrackSlice(t);
  }

  public computeTrackSlice(t: number): TrackSliceData {
    if (this.isArena) {
      const normT = ((t % 1.0) + 1.0) % 1.0;
      const angle = normT * Math.PI * 2;
      const arenaRadius = (this.config as RumbleArenaConfig).arenaRadius || 38.0;
      const pt = new THREE.Vector3(Math.cos(angle) * arenaRadius, 0, Math.sin(angle) * arenaRadius);
      const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).normalize();
      const normal = new THREE.Vector3(0, 1, 0);
      const binormal = new THREE.Vector3().crossVectors(normal, tangent).normalize();

      return {
        position: pt,
        tangent,
        binormal,
        normal,
        halfWidth: 12.0,
        isGap: false,
        isRamp: false,
        extraY: 0,
      };
    }

    const normT = ((t % 1.0) + 1.0) % 1.0;
    const sliceIdx = Math.round(normT * Track.SAMPLES) % Track.SAMPLES;
    const pt = this.curve.getPointAt(normT);
    const tangent = this.curve.getTangentAt(normT).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);

    const baseHalfWidth = Track.TRACK_WIDTH / 2;
    const props = this.config.getSliceProperties(normT, sliceIdx, baseHalfWidth);

    pt.y += props.extraY;

    // Safe orthogonal reference frame
    let binormal = new THREE.Vector3().crossVectors(worldUp, tangent);
    if (binormal.lengthSq() < 0.0001) binormal = new THREE.Vector3(1, 0, 0);
    else binormal.normalize();
    const normal = new THREE.Vector3().crossVectors(tangent, binormal).normalize();

    return {
      position: pt,
      tangent,
      binormal,
      normal,
      halfWidth: props.halfWidth,
      isGap: props.isGap,
      isRamp: props.isRamp,
      extraY: props.extraY,
    };
  }

  private buildTrackMeshes(scene: THREE.Scene, physics: PhysicsEngine) {
    const samples = Track.SAMPLES;
    const curbWidth = Track.CURB_WIDTH;
    const thickness = Track.TRACK_THICKNESS;

    const roadVerts: number[] = [];
    const roadNorms: number[] = [];
    const roadUvs: number[] = [];
    const roadIndices: number[] = [];

    const curbVerts: number[] = [];
    const curbNorms: number[] = [];
    const curbColors: number[] = [];
    const curbIndices: number[] = [];

    const underVerts: number[] = [];
    const underNorms: number[] = [];
    const underIndices: number[] = [];

    const colliderVerts: number[] = [];
    const colliderIndices: number[] = [];

    for (let i = 0; i <= samples; i++) {
      const slice = this.getTrackSlice(i / samples);
      const pt = slice.position;
      const normal = slice.normal;
      const binormal = slice.binormal;
      const currentHalfWidth = slice.halfWidth;

      const roadLeft = pt.clone().addScaledVector(binormal, -currentHalfWidth);
      const roadRight = pt.clone().addScaledVector(binormal, currentHalfWidth);

      const curbLeftOuter = pt.clone().addScaledVector(binormal, -(currentHalfWidth + curbWidth));
      const curbRightOuter = pt.clone().addScaledVector(binormal, currentHalfWidth + curbWidth);

      const underLeft = curbLeftOuter.clone().addScaledVector(normal, -thickness);
      const underRight = curbRightOuter.clone().addScaledVector(normal, -thickness);

      // Road Vertices
      roadVerts.push(roadLeft.x, roadLeft.y, roadLeft.z);
      roadVerts.push(roadRight.x, roadRight.y, roadRight.z);
      roadNorms.push(normal.x, normal.y, normal.z);
      roadNorms.push(normal.x, normal.y, normal.z);
      const uvY = (i / Track.SAMPLES) * (this.isHardcore ? 110 : 85);
      roadUvs.push(0, uvY);
      roadUvs.push(1, uvY);

      // Curbs Vertices
      curbVerts.push(curbLeftOuter.x, curbLeftOuter.y + 0.04, curbLeftOuter.z);
      curbVerts.push(roadLeft.x, roadLeft.y + 0.04, roadLeft.z);
      curbVerts.push(roadRight.x, roadRight.y + 0.04, roadRight.z);
      curbVerts.push(curbRightOuter.x, curbRightOuter.y + 0.04, curbRightOuter.z);

      for (let k = 0; k < 4; k++) {
        curbNorms.push(normal.x, normal.y, normal.z);
      }

      const isRed = Math.floor(i / 3) % 2 === 0;
      const cColor = isRed ? [0.95, 0.15, 0.2] : [0.95, 0.95, 0.95];
      curbColors.push(...cColor, ...cColor, ...cColor, ...cColor);

      // Underbody Vertices
      underVerts.push(underLeft.x, underLeft.y, underLeft.z);
      underVerts.push(underRight.x, underRight.y, underRight.z);
      const downNormal = normal.clone().negate();
      underNorms.push(downNormal.x, downNormal.y, downNormal.z);
      underNorms.push(downNormal.x, downNormal.y, downNormal.z);

      // Collider Vertices
      const colBaseIdx = colliderVerts.length / 3;
      colliderVerts.push(curbLeftOuter.x, curbLeftOuter.y, curbLeftOuter.z);
      colliderVerts.push(curbRightOuter.x, curbRightOuter.y, curbRightOuter.z);

      // Quads
      const isInsideGap = slice.isGap;
      const prevWasInsideGap = i > 0 && this.getTrackSlice((i - 1) / samples).isGap;

      if (i > 0 && !isInsideGap && !prevWasInsideGap) {
        const pR_L = (i - 1) * 2;
        const pR_R = (i - 1) * 2 + 1;
        const cR_L = i * 2;
        const cR_R = i * 2 + 1;
        roadIndices.push(pR_L, cR_L, pR_R);
        roadIndices.push(cR_L, cR_R, pR_R);

        const pC = (i - 1) * 4;
        const cC = i * 4;
        curbIndices.push(pC, cC, pC + 1);
        curbIndices.push(cC, cC + 1, pC + 1);
        curbIndices.push(pC + 2, cC + 2, pC + 3);
        curbIndices.push(cC + 2, cC + 3, pC + 3);

        const pU_L = (i - 1) * 2;
        const pU_R = (i - 1) * 2 + 1;
        const cU_L = i * 2;
        const cU_R = i * 2 + 1;
        underIndices.push(pU_L, pU_R, cU_L);
        underIndices.push(cU_L, pU_R, cU_R);

        const pCol = colBaseIdx - 2;
        const cCol = colBaseIdx;
        colliderIndices.push(pCol, cCol, pCol + 1);
        colliderIndices.push(cCol, cCol + 1, pCol + 1);
      }
    }

    // Road Texture
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#141822';
    ctx.fillRect(0, 0, 1024, 1024);

    ctx.fillStyle = '#1c2230';
    for (let py = 0; py < 1024; py += 8) {
      for (let px = 0; px < 1024; px += 8) {
        if ((px + py) % 16 === 0) ctx.fillRect(px, py, 6, 6);
      }
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(55, 0); ctx.lineTo(55, 1024);
    ctx.moveTo(969, 0); ctx.lineTo(969, 1024);
    ctx.stroke();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(22, 0); ctx.lineTo(22, 1024);
    ctx.moveTo(1002, 0); ctx.lineTo(1002, 1024);
    ctx.stroke();

    ctx.strokeStyle = '#0a0d14';
    ctx.lineWidth = 22;
    ctx.setLineDash([560, 464]);
    ctx.beginPath();
    ctx.moveTo(270, 0); ctx.lineTo(270, 1024);
    ctx.moveTo(754, 0); ctx.lineTo(754, 1024);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(270, 0); ctx.lineTo(270, 1024);
    ctx.moveTo(754, 0); ctx.lineTo(754, 1024);
    ctx.stroke();

    ctx.strokeStyle = '#080b12';
    ctx.lineWidth = 26;
    ctx.setLineDash([580, 444]);
    ctx.beginPath();
    ctx.moveTo(496, 0); ctx.lineTo(496, 1024);
    ctx.moveTo(528, 0); ctx.lineTo(528, 1024);
    ctx.stroke();

    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(496, 0); ctx.lineTo(496, 1024);
    ctx.moveTo(528, 0); ctx.lineTo(528, 1024);
    ctx.stroke();

    ctx.fillStyle = 'rgba(0, 240, 255, 0.55)';
    const chevronYs = [512];
    const chevronXs = [270, 754];
    for (const cy of chevronYs) {
      for (const cx of chevronXs) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 60);
        ctx.lineTo(cx + 55, cy + 20);
        ctx.lineTo(cx + 36, cy + 30);
        ctx.lineTo(cx, cy - 22);
        ctx.lineTo(cx - 36, cy + 30);
        ctx.lineTo(cx - 55, cy + 20);
        ctx.closePath();
        ctx.fill();
      }
    }

    const roadTex = new THREE.CanvasTexture(canvas);
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, 1);
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 840;
    roadTex.anisotropy = isMobile ? 8 : 16;
    roadTex.generateMipmaps = true;
    roadTex.minFilter = THREE.LinearMipmapLinearFilter;
    roadTex.magFilter = THREE.LinearFilter;
    roadTex.needsUpdate = true;

    const roadGeom = new THREE.BufferGeometry();
    roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
    roadGeom.setAttribute('normal', new THREE.Float32BufferAttribute(roadNorms, 3));
    roadGeom.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
    roadGeom.setIndex(roadIndices);

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.75,
      metalness: 0.25,
      side: THREE.DoubleSide,
    });
    this.trackMesh = new THREE.Mesh(roadGeom, roadMat);
    this.trackMesh.receiveShadow = true;
    this.addToScene(scene, this.trackMesh);

    // Curbs
    const curbGeom = new THREE.BufferGeometry();
    curbGeom.setAttribute('position', new THREE.Float32BufferAttribute(curbVerts, 3));
    curbGeom.setAttribute('normal', new THREE.Float32BufferAttribute(curbNorms, 3));
    curbGeom.setAttribute('color', new THREE.Float32BufferAttribute(curbColors, 3));
    curbGeom.setIndex(curbIndices);

    const curbMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.1,
    });
    this.curbMesh = new THREE.Mesh(curbGeom, curbMat);
    this.curbMesh.receiveShadow = true;
    this.addToScene(scene, this.curbMesh);

    // Underbody
    const underGeom = new THREE.BufferGeometry();
    underGeom.setAttribute('position', new THREE.Float32BufferAttribute(underVerts, 3));
    underGeom.setAttribute('normal', new THREE.Float32BufferAttribute(underNorms, 3));
    underGeom.setIndex(underIndices);

    const underMat = new THREE.MeshStandardMaterial({
      color: 0x0a0d14,
      roughness: 0.8,
      metalness: 0.5,
    });
    this.underbodyMesh = new THREE.Mesh(underGeom, underMat);
    this.underbodyMesh.receiveShadow = true;
    this.addToScene(scene, this.underbodyMesh);

    // Rapier Physics Collider
    const colPositions = new Float32Array(colliderVerts);
    const colIndicesUint = new Uint32Array(colliderIndices);
    const colliderDesc = RAPIER.ColliderDesc.trimesh(colPositions, colIndicesUint)
      .setFriction(0.7)
      .setRestitution(0.0)
      .setCollisionGroups((0x0001 << 16) | 0x0002)
      .setSolverGroups((0x0001 << 16) | 0x0002);

    this.collider = physics.world.createCollider(colliderDesc);
  }

  private createStartFinishArch(scene: THREE.Scene) {
    const slice0 = this.getTrackSlice(0.0);
    const archGroup = new THREE.Group();
    archGroup.position.copy(slice0.position);
    archGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(slice0.binormal, slice0.normal, slice0.tangent));

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1a233a, roughness: 0.5, metalness: 0.8 });
    const pillarGeom = new THREE.CylinderGeometry(0.7, 0.8, 12, 8);

    const halfW = slice0.halfWidth + 1.6;
    const leftPillar = new THREE.Mesh(pillarGeom, pillarMat);
    leftPillar.position.set(-halfW, 6.0, 0);
    archGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeom, pillarMat);
    rightPillar.position.set(halfW, 6.0, 0);
    archGroup.add(rightPillar);

    const headerGeom = new THREE.BoxGeometry(halfW * 2 + 3.0, 2.0, 1.6);
    const headerMat = new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0x440011, roughness: 0.4 });
    const header = new THREE.Mesh(headerGeom, headerMat);
    header.position.set(0, 11.5, 0);
    archGroup.add(header);

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sCtx = signCanvas.getContext('2d')!;
    sCtx.fillStyle = '#0a0e17';
    sCtx.fillRect(0, 0, 512, 128);
    sCtx.fillStyle = '#00f0ff';
    let fontSize = 46;
    sCtx.font = `bold ${fontSize}px Rajdhani, Arial, sans-serif`;
    while (sCtx.measureText(this.config.archTitle).width > 470 && fontSize > 20) {
      fontSize -= 2;
      sCtx.font = `bold ${fontSize}px Rajdhani, Arial, sans-serif`;
    }
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText(this.config.archTitle, 256, 64);

    const signTex = new THREE.CanvasTexture(signCanvas);

    // Front sign: clearly visible to oncoming racers approaching the finish line
    const signPlaneFront = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 3.6),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    signPlaneFront.position.set(0, 11.5, -0.85);
    signPlaneFront.rotation.y = Math.PI;
    archGroup.add(signPlaneFront);

    // Back sign: faces racers looking backward after crossing the finish line
    const signTexBack = new THREE.CanvasTexture(signCanvas);
    const signPlaneBack = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 3.6),
      new THREE.MeshBasicMaterial({ map: signTexBack })
    );
    signPlaneBack.position.set(0, 11.5, 0.85);
    archGroup.add(signPlaneBack);

    // Checkered Finish Line
    const checkCanvas = document.createElement('canvas');
    checkCanvas.width = 512;
    checkCanvas.height = 64;
    const cCtx = checkCanvas.getContext('2d')!;
    cCtx.fillStyle = '#ffffff';
    cCtx.fillRect(0, 0, 512, 64);
    cCtx.fillStyle = '#0a0a0a';
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 16; c++) {
        if ((r + c) % 2 === 0) cCtx.fillRect(c * 32, r * 32, 32, 32);
      }
    }
    const checkTex = new THREE.CanvasTexture(checkCanvas);
    const finishLine = new THREE.Mesh(
      new THREE.BoxGeometry(slice0.halfWidth * 2, 0.05, 4.0),
      new THREE.MeshBasicMaterial({ map: checkTex })
    );
    finishLine.position.set(0, 0.03, 0);
    archGroup.add(finishLine);

    this.addToScene(scene, archGroup);
  }

  private createBoostPads(scene: THREE.Scene) {
    const padGeom = new THREE.BoxGeometry(7.5, 0.05, 10);

    const bCanvas = document.createElement('canvas');
    bCanvas.width = 128;
    bCanvas.height = 256;
    const bCtx = bCanvas.getContext('2d')!;

    bCtx.fillStyle = 'rgba(0, 240, 255, 0.4)';
    bCtx.fillRect(0, 0, 128, 256);

    bCtx.strokeStyle = '#00f0ff';
    bCtx.lineWidth = 6;
    bCtx.strokeRect(3, 3, 122, 250);

    bCtx.fillStyle = '#00f0ff';
    for (let y = 60; y < 240; y += 65) {
      bCtx.beginPath();
      bCtx.moveTo(64, y + 32);
      bCtx.lineTo(110, y - 18);
      bCtx.lineTo(95, y - 23);
      bCtx.lineTo(64, y + 8);
      bCtx.lineTo(33, y - 23);
      bCtx.lineTo(18, y - 18);
      bCtx.closePath();
      bCtx.fill();
    }

    bCtx.fillStyle = '#ffffff';
    for (let y = 60; y < 240; y += 65) {
      bCtx.beginPath();
      bCtx.moveTo(64, y + 24);
      bCtx.lineTo(90, y - 12);
      bCtx.lineTo(80, y - 16);
      bCtx.lineTo(64, y + 5);
      bCtx.lineTo(48, y - 16);
      bCtx.lineTo(38, y - 12);
      bCtx.closePath();
      bCtx.fill();
    }

    const bTex = new THREE.CanvasTexture(bCanvas);
    const padMat = new THREE.MeshBasicMaterial({
      map: bTex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });

    for (const cfg of this.config.boostPads) {
      const sliceIdx = Math.round(cfg.t * Track.SAMPLES);
      const slice = this.getTrackSlice(cfg.t);
      const pt = slice.position.clone();
      const tangent = slice.tangent;
      const binormal = slice.binormal;
      const normal = slice.normal;

      const pad = new THREE.Mesh(padGeom, padMat);

      // If inside Anti-Grav Tube: mount boost pad ON THE CEILING (UPAR)!
      const isInsideTube = !!(this.config.antiGravTube?.enabled &&
        sliceIdx >= this.config.antiGravTube.startSlice &&
        sliceIdx <= this.config.antiGravTube.endSlice);

      if (isInsideTube) {
        const radius = this.config.antiGravTube!.radius;
        const center = pt.clone().addScaledVector(normal, radius);
        const ceilingPos = center.addScaledVector(normal, radius - 0.08);
        pad.position.copy(ceilingPos);

        const rotMatrix = new THREE.Matrix4().makeBasis(
          binormal.clone().negate(),
          normal.clone().negate(),
          tangent
        );
        pad.quaternion.setFromRotationMatrix(rotMatrix);

        this.addToScene(scene, pad);
        this.boostPads.push({
          position: ceilingPos.clone(),
          direction: tangent.clone(),
          mesh: pad,
          isRampPad: cfg.isRamp,
        });
      } else {
        pad.position.copy(pt).addScaledVector(normal, 0.06);

        const rotMatrix = new THREE.Matrix4().makeBasis(binormal, normal, tangent);
        pad.quaternion.setFromRotationMatrix(rotMatrix);

        this.addToScene(scene, pad);
        this.boostPads.push({
          position: pt.clone(),
          direction: tangent.clone(),
          mesh: pad,
          isRampPad: cfg.isRamp,
        });
      }
    }
  }

  private createJumpZones(scene: THREE.Scene) {
    const runwayMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
    const pMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.4, metalness: 0.8 });
    const pGeom = new THREE.BoxGeometry(1.2, 12.0, 1.2);

    for (const zone of this.config.jumpZones) {
      // 1. Warning Gantry before Incline Ramp (if spacious enough)
      const archSliceIdx = Math.max(0, zone.startSlice - 3);
      if (archSliceIdx > 2) {
        const sliceArch = this.getTrackSlice(archSliceIdx / Track.SAMPLES);
        const gantry = new THREE.Group();
        gantry.position.copy(sliceArch.position);
        gantry.quaternion.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(sliceArch.binormal, sliceArch.normal, sliceArch.tangent)
        );

        const leftP = new THREE.Mesh(pGeom, pMat);
        leftP.position.set(-(sliceArch.halfWidth + 1.5), 6.0, 0);
        gantry.add(leftP);

        const rightP = new THREE.Mesh(pGeom, pMat);
        rightP.position.set((sliceArch.halfWidth + 1.5), 6.0, 0);
        gantry.add(rightP);

        // Solid Horizontal Overhead Crossbar Header (firmly connecting both pillars)
        const spanWidth = (sliceArch.halfWidth + 1.5) * 2 + 1.4;
        const headerGeom = new THREE.BoxGeometry(spanWidth, 2.0, 1.4);
        const headerMat = new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.4, metalness: 0.85 });
        const headerMesh = new THREE.Mesh(headerGeom, headerMat);
        headerMesh.position.set(0, 11.5, 0);
        gantry.add(headerMesh);

        // Neon Hazard Border Accent Trim on Crossbar
        const accentGeom = new THREE.BoxGeometry(spanWidth + 0.1, 0.22, 1.45);
        const accentMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });
        const accentTop = new THREE.Mesh(accentGeom, accentMat);
        accentTop.position.set(0, 12.52, 0);
        gantry.add(accentTop);
        const accentBot = new THREE.Mesh(accentGeom, accentMat);
        accentBot.position.set(0, 10.48, 0);
        gantry.add(accentBot);

        const warnCanvas = document.createElement('canvas');
        warnCanvas.width = 512;
        warnCanvas.height = 128;
        const wCtx = warnCanvas.getContext('2d')!;
        wCtx.fillStyle = '#00f0ff';
        wCtx.fillRect(0, 0, 512, 128);
        wCtx.fillStyle = '#ffea00';
        for (let x = -50; x < 550; x += 40) {
          wCtx.beginPath();
          wCtx.moveTo(x, 0); wCtx.lineTo(x + 25, 0); wCtx.lineTo(x, 128); wCtx.lineTo(x - 25, 128);
          wCtx.fill();
        }
        wCtx.fillStyle = '#0a0e17';
        wCtx.fillRect(16, 16, 480, 96);
        wCtx.fillStyle = '#00f0ff';
        wCtx.font = 'bold 36px Rajdhani, Arial';
        wCtx.textAlign = 'center';
        wCtx.textBaseline = 'middle';
        wCtx.fillText(zone.name, 256, 44);
        wCtx.fillStyle = '#ffea00';
        wCtx.font = 'bold 22px Teko, Arial';
        wCtx.fillText('HIT NITRO // CLEAR THE SKY JUMP', 256, 82);

        const warnTex = new THREE.CanvasTexture(warnCanvas);
        const warnSign = new THREE.Mesh(
          new THREE.PlaneGeometry(16, 3.8),
          new THREE.MeshBasicMaterial({ map: warnTex })
        );
        warnSign.position.set(0, 11.5, -0.75);
        warnSign.rotation.y = Math.PI;
        gantry.add(warnSign);
        this.addToScene(scene, gantry);
      }

      // 2. Holographic Cyber Rings
      for (const ringCfg of zone.rings) {
        const sliceRing = this.getTrackSlice(ringCfg.t);
        const rawPt = this.curve.getPointAt(ringCfg.t);
        const ringGroup = new THREE.Group();
        ringGroup.position.set(rawPt.x, rawPt.y + ringCfg.altitude, rawPt.z);
        ringGroup.quaternion.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(sliceRing.binormal, sliceRing.normal, sliceRing.tangent)
        );

        const ringGeom = new THREE.TorusGeometry(ringCfg.scale, 0.45, 12, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: ringCfg.color });
        ringGroup.add(new THREE.Mesh(ringGeom, ringMat));

        const auraGeom = new THREE.TorusGeometry(ringCfg.scale * 1.04, 0.16, 8, 24);
        const auraMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
        });
        ringGroup.add(new THREE.Mesh(auraGeom, auraMat));
        this.addToScene(scene, ringGroup);

        this.cyberRings.push({
          id: ringCfg.id,
          position: ringGroup.position.clone(),
          tangent: sliceRing.tangent.clone(),
          binormal: sliceRing.binormal.clone(),
          normal: sliceRing.normal.clone(),
          radius: ringCfg.scale,
          rimThickness: 0.85,
          lastHitTimes: new Map(),
          lastPassTimes: new Map(),
        });
      }

      // 3. Green Landing Runway Beacons
      for (let s = zone.landingSlice; s <= zone.endSlice; s += 2) {
        const sliceB = this.getTrackSlice(s / Track.SAMPLES);
        const beaconL = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.0, 8), runwayMat);
        beaconL.position.copy(sliceB.position).addScaledVector(sliceB.binormal, -sliceB.halfWidth);
        this.addToScene(scene, beaconL);

        const beaconR = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.0, 8), runwayMat);
        beaconR.position.copy(sliceB.position).addScaledVector(sliceB.binormal, sliceB.halfWidth);
        this.addToScene(scene, beaconR);
      }
    }
  }

  private createAntiGravTube(scene: THREE.Scene) {
    if (!this.config.antiGravTube || !this.config.antiGravTube.enabled) return;
    const tubeCfg = this.config.antiGravTube;
    const { startSlice, endSlice, radius } = tubeCfg;
    const numSlices = endSlice - startSlice;
    if (numSlices <= 0) return;

    const radialSegments = 24;
    const tubePositions: number[] = [];
    const tubeNormals: number[] = [];
    const tubeUvs: number[] = [];
    const tubeIndices: number[] = [];

    // 1. Procedural Cylinder Glass Shell along Spline
    for (let s = startSlice; s <= endSlice; s++) {
      const sliceIdx = s - startSlice;
      const normT = (s % Track.SAMPLES) / Track.SAMPLES;
      const slice = this.getTrackSlice(normT);
      const center = slice.position.clone().addScaledVector(slice.normal, radius);

      for (let j = 0; j <= radialSegments; j++) {
        const phi = (j / radialSegments) * Math.PI * 2;
        // phi = 0: floor (-normal)
        // phi = PI/2: right wall (+binormal)
        // phi = PI: ceiling (+normal)
        // phi = -PI/2: left wall (-binormal)
        const radDir = slice.binormal.clone().multiplyScalar(Math.sin(phi))
          .addScaledVector(slice.normal, -Math.cos(phi));
        const pt = center.clone().addScaledVector(radDir, radius);
        const inNormal = radDir.clone().negate().normalize();

        tubePositions.push(pt.x, pt.y, pt.z);
        tubeNormals.push(inNormal.x, inNormal.y, inNormal.z);
        tubeUvs.push(j / radialSegments, (sliceIdx / numSlices) * 8.0);
      }
    }

    const vertsPerRing = radialSegments + 1;
    for (let s = 0; s < numSlices; s++) {
      for (let j = 0; j < radialSegments; j++) {
        const i0 = s * vertsPerRing + j;
        const i1 = s * vertsPerRing + (j + 1);
        const i2 = (s + 1) * vertsPerRing + j;
        const i3 = (s + 1) * vertsPerRing + (j + 1);

        tubeIndices.push(i0, i1, i2);
        tubeIndices.push(i1, i3, i2);
      }
    }

    const tubeGeom = new THREE.BufferGeometry();
    tubeGeom.setAttribute('position', new THREE.Float32BufferAttribute(tubePositions, 3));
    tubeGeom.setAttribute('normal', new THREE.Float32BufferAttribute(tubeNormals, 3));
    tubeGeom.setAttribute('uv', new THREE.Float32BufferAttribute(tubeUvs, 2));
    tubeGeom.setIndex(tubeIndices);

    // Procedural Cyber Glass Grid Canvas Texture
    const gCanvas = document.createElement('canvas');
    gCanvas.width = 256;
    gCanvas.height = 256;
    const gCtx = gCanvas.getContext('2d')!;
    gCtx.fillStyle = '#06101c';
    gCtx.fillRect(0, 0, 256, 256);
    gCtx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
    gCtx.lineWidth = 3;
    for (let x = 0; x <= 256; x += 32) {
      gCtx.beginPath();
      gCtx.moveTo(x, 0); gCtx.lineTo(x, 256); gCtx.stroke();
    }
    for (let y = 0; y <= 256; y += 32) {
      gCtx.beginPath();
      gCtx.moveTo(0, y); gCtx.lineTo(256, y); gCtx.stroke();
    }
    gCtx.strokeStyle = 'rgba(255, 0, 187, 0.35)';
    gCtx.lineWidth = 1.5;
    gCtx.beginPath();
    gCtx.moveTo(0, 0); gCtx.lineTo(256, 256);
    gCtx.moveTo(256, 0); gCtx.lineTo(0, 256);
    gCtx.stroke();

    const gTex = new THREE.CanvasTexture(gCanvas);
    gTex.wrapS = THREE.RepeatWrapping;
    gTex.wrapT = THREE.RepeatWrapping;
    gTex.repeat.set(4, 16);

    const tubeMat = new THREE.MeshStandardMaterial({
      map: gTex,
      color: 0x00f0ff,
      emissive: 0x002d44,
      roughness: 0.15,
      metalness: 0.35,
      transparent: true,
      opacity: 0.50,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const tubeMesh = new THREE.Mesh(tubeGeom, tubeMat);
    this.addToScene(scene, tubeMesh);

    // 2. Structural Reinforcement Arch Rings every 4 slices (Upper arches only, zero road intersection)
    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x141822, roughness: 0.5, metalness: 0.85 });
    const cyanNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const magentaNeonMat = new THREE.MeshBasicMaterial({ color: 0xff00bb });

    let ringCounter = 0;
    for (let s = startSlice; s <= endSlice; s += 4) {
      ringCounter++;
      const normT = (s % Track.SAMPLES) / Track.SAMPLES;
      const slice = this.getTrackSlice(normT);
      const center = slice.position.clone().addScaledVector(slice.normal, radius);

      const ringGroup = new THREE.Group();
      ringGroup.position.copy(center);
      ringGroup.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(slice.binormal, slice.normal, slice.tangent)
      );

      // Upper Arch Rib over the track (strictly arches over the top, never touches asphalt)
      const ribGeom = new THREE.TorusGeometry(radius + 0.25, 0.22, 8, 32, Math.PI);
      ringGroup.add(new THREE.Mesh(ribGeom, carbonMat));

      const neonGeom = new THREE.TorusGeometry(radius + 0.05, 0.12, 8, 32, Math.PI);
      const neonMat = ringCounter % 2 === 0 ? magentaNeonMat : cyanNeonMat;
      ringGroup.add(new THREE.Mesh(neonGeom, neonMat));

      this.addToScene(scene, ringGroup);
    }

    // 3. Longitudinal Glowing Energy Guide Rails (3 Rails: Left Wall, Ceiling, Right Wall - None on Floor)
    const railConfigs = [
      { phi: Math.PI / 2, color: 0x00f0ff, size: 0.12 },     // Right wall rail (Cyan)
      { phi: Math.PI, color: 0xff00bb, size: 0.16 },         // Ceiling center rail (Magenta)
      { phi: -Math.PI / 2, color: 0x00f0ff, size: 0.12 },    // Left wall rail (Cyan)
    ];

    railConfigs.forEach((rc) => {
      const railPts: THREE.Vector3[] = [];
      for (let s = startSlice; s <= endSlice; s++) {
        const normT = (s % Track.SAMPLES) / Track.SAMPLES;
        const slice = this.getTrackSlice(normT);
        const center = slice.position.clone().addScaledVector(slice.normal, radius);
        const radDir = slice.binormal.clone().multiplyScalar(Math.sin(rc.phi))
          .addScaledVector(slice.normal, -Math.cos(rc.phi));
        railPts.push(center.addScaledVector(radDir, radius - 0.08));
      }
      const railCurve = new THREE.CatmullRomCurve3(railPts);
      const railGeom = new THREE.TubeGeometry(railCurve, numSlices * 2, rc.size, 6, false);
      const railMesh = new THREE.Mesh(railGeom, new THREE.MeshBasicMaterial({ color: rc.color }));
      this.addToScene(scene, railMesh);
    });

    // 4. 360° Wall-Ride Gate: Floor Barrier Mesh at Slice 174
    // Blocks bottom floor, forcing riders to roll 360° onto the wall & ceiling to bypass!
    const barrierSlice = 174;
    const bNormT = (barrierSlice % Track.SAMPLES) / Track.SAMPLES;
    const bSlice = this.getTrackSlice(bNormT);
    const bCenter = bSlice.position.clone().addScaledVector(bSlice.normal, radius);

    const barrierGroup = new THREE.Group();
    barrierGroup.position.copy(bCenter);
    barrierGroup.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(bSlice.binormal, bSlice.normal, bSlice.tangent)
    );

    // Lower Barrier Semi-Cylinder Arch (Covers bottom floor)
    const lowerArchGeom = new THREE.TorusGeometry(radius - 0.15, 0.45, 8, 32, Math.PI);
    lowerArchGeom.rotateZ(Math.PI);
    const barFrameMat = new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.3, metalness: 0.85 });
    barrierGroup.add(new THREE.Mesh(lowerArchGeom, barFrameMat));

    // Glowing Neon Hazard Outline on Lower Arch
    const lowerNeonGeom = new THREE.TorusGeometry(radius - 0.05, 0.14, 8, 32, Math.PI);
    lowerNeonGeom.rotateZ(Math.PI);
    const neonBarMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    barrierGroup.add(new THREE.Mesh(lowerNeonGeom, neonBarMat));

    // Solid Lower Barricade Wall covering the floor (reaches all the way to asphalt with zero gap)
    const barricadeGeom = new THREE.BoxGeometry(radius * 1.75, radius, 1.4);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.3, metalness: 0.85 });
    const bWall = new THREE.Mesh(barricadeGeom, bMat);
    bWall.position.set(0, -radius * 0.5, 0);
    barrierGroup.add(bWall);

    // Glowing Hologram Billboard mounted on the Floor Barrier Wall
    const barCanvas = document.createElement('canvas');
    barCanvas.width = 512;
    barCanvas.height = 256;
    const barCtx = barCanvas.getContext('2d')!;
    barCtx.fillStyle = '#ff0055';
    barCtx.fillRect(0, 0, 512, 256);
    barCtx.fillStyle = '#ffea00';
    for (let x = -80; x < 600; x += 45) {
      barCtx.beginPath();
      barCtx.moveTo(x, 0); barCtx.lineTo(x + 25, 0); barCtx.lineTo(x, 256); barCtx.lineTo(x - 25, 256);
      barCtx.fill();
    }
    barCtx.fillStyle = '#080d16';
    barCtx.fillRect(16, 16, 480, 224);

    barCtx.fillStyle = '#ff0055';
    barCtx.font = 'bold 24px Rajdhani, Arial';
    barCtx.textAlign = 'center';
    barCtx.textBaseline = 'middle';
    barCtx.fillText('⚠️ FLOOR LOCKED // 360° WALL RIDE ⚠️', 256, 58);

    barCtx.fillStyle = '#00f0ff';
    barCtx.font = 'bold 20px Teko, Arial';
    barCtx.fillText('STEER 360° ONTO CEILING TO PASS', 256, 108);

    barCtx.fillStyle = '#ffea00';
    barCtx.font = 'bold 50px Arial';
    barCtx.fillText('⬆   ⬆   ⬆', 256, 180);

    const barTex = new THREE.CanvasTexture(barCanvas);
    const barSignFront = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 6.5),
      new THREE.MeshBasicMaterial({ map: barTex, side: THREE.DoubleSide })
    );
    barSignFront.position.set(0, -radius * 0.45, -0.82);
    barSignFront.rotation.y = Math.PI; // Faces oncoming racers approaching inside the tube
    barrierGroup.add(barSignFront);

    const barSignBack = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 6.5),
      new THREE.MeshBasicMaterial({ map: barTex, side: THREE.DoubleSide })
    );
    barSignBack.position.set(0, -radius * 0.45, 0.82);
    barrierGroup.add(barSignBack);

    // Upper Open Passage Guide Neon Ring (Ceiling Passage)
    const upperGuideGeom = new THREE.TorusGeometry(radius - 0.1, 0.22, 8, 32, Math.PI);
    const cyanGuideMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    barrierGroup.add(new THREE.Mesh(upperGuideGeom, cyanGuideMat));

    this.addToScene(scene, barrierGroup);

    // 5. Grand Cyber Entrance Portal (Slice startSlice)
    this.createTubePortal(scene, startSlice, true, tubeCfg.name);

    // 6. Grand Cyber Exit Portal (Slice endSlice)
    this.createTubePortal(scene, endSlice, false, 'GRAVITY RESTORED // EXIT');
  }

  private createTubePortal(scene: THREE.Scene, sliceIdx: number, isEntry: boolean, titleText: string) {
    if (!this.config.antiGravTube) return;
    const radius = this.config.antiGravTube.radius;
    const normT = (sliceIdx % Track.SAMPLES) / Track.SAMPLES;
    const slice = this.getTrackSlice(normT);
    const center = slice.position.clone().addScaledVector(slice.normal, radius);

    const portalGroup = new THREE.Group();
    portalGroup.position.copy(center);
    portalGroup.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(slice.binormal, slice.normal, slice.tangent)
    );

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x181f2f, roughness: 0.4, metalness: 0.9 });
    const neonColor = isEntry ? 0x00f0ff : 0x00ff88;
    const neonMat = new THREE.MeshBasicMaterial({ color: neonColor });

    // Side Support Columns (Positioned cleanly outside the road curbs)
    const colGeom = new THREE.BoxGeometry(1.2, radius, 1.2);
    const colL = new THREE.Mesh(colGeom, frameMat);
    colL.position.set(-(radius + 0.65), -radius / 2, 0);
    portalGroup.add(colL);

    const colR = new THREE.Mesh(colGeom, frameMat);
    colR.position.set(radius + 0.65, -radius / 2, 0);
    portalGroup.add(colR);

    // Overhead Semicircular Arch (Strictly curves above the track, ZERO road penetration)
    const archGeom = new THREE.TorusGeometry(radius + 0.65, 0.45, 8, 32, Math.PI);
    portalGroup.add(new THREE.Mesh(archGeom, frameMat));

    // Outer neon contour arch
    const neonRingGeom = new THREE.TorusGeometry(radius + 1.15, 0.14, 8, 32, Math.PI);
    portalGroup.add(new THREE.Mesh(neonRingGeom, neonMat));

    // Inner neon rim arch
    const innerNeonGeom = new THREE.TorusGeometry(radius + 0.05, 0.14, 8, 32, Math.PI);
    portalGroup.add(new THREE.Mesh(innerNeonGeom, neonMat));

    // Holographic Header Display Gantry (Floating at the top of the arch)
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 512;
    pCanvas.height = 128;
    const pCtx = pCanvas.getContext('2d')!;

    pCtx.fillStyle = isEntry ? '#00f0ff' : '#00ff88';
    pCtx.fillRect(0, 0, 512, 128);

    // Cyber hazard stripes
    pCtx.fillStyle = isEntry ? '#ff00bb' : '#ffe600';
    for (let x = -50; x < 550; x += 40) {
      pCtx.beginPath();
      pCtx.moveTo(x, 0); pCtx.lineTo(x + 24, 0); pCtx.lineTo(x, 128); pCtx.lineTo(x - 24, 128);
      pCtx.fill();
    }

    pCtx.fillStyle = '#090e18';
    pCtx.fillRect(14, 14, 484, 100);

    pCtx.fillStyle = isEntry ? '#00f0ff' : '#00ff88';
    pCtx.font = 'bold 32px Rajdhani, Arial';
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'middle';
    pCtx.fillText(titleText, 256, 42);

    pCtx.fillStyle = isEntry ? '#ffe600' : '#ffffff';
    pCtx.font = 'bold 20px Teko, Arial';
    pCtx.fillText(
      isEntry ? '⚡ 360° WALL-RIDE // MAGNETIC ANTI-GRAV ON ⚡' : '⚡ OPEN SKY RUNWAY // PREPARE FOR JUMP 3 ⚡',
      256,
      82
    );

    const pTex = new THREE.CanvasTexture(pCanvas);

    // Front sign: faces oncoming racers approaching from -Z (normal, non-mirrored text)
    const signFront = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4.0),
      new THREE.MeshBasicMaterial({ map: pTex })
    );
    signFront.position.set(0, radius + 1.8, -0.5);
    signFront.rotation.y = Math.PI;
    portalGroup.add(signFront);

    // Back sign: faces racers looking backward (+Z)
    const signBack = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4.0),
      new THREE.MeshBasicMaterial({ map: pTex })
    );
    signBack.position.set(0, radius + 1.8, 0.5);
    portalGroup.add(signBack);

    this.addToScene(scene, portalGroup);
  }

  private createKickerRamps(scene: THREE.Scene) {
    const kCanvas = document.createElement('canvas');
    kCanvas.width = 512;
    kCanvas.height = 512;
    const kCtx = kCanvas.getContext('2d')!;

    kCtx.fillStyle = '#11141c';
    kCtx.fillRect(0, 0, 512, 512);

    const drawHazardStripe = (xStart: number, width: number) => {
      kCtx.save();
      kCtx.beginPath();
      kCtx.rect(xStart, 0, width, 512);
      kCtx.clip();
      kCtx.fillStyle = '#ffde00';
      kCtx.fillRect(xStart, 0, width, 512);
      kCtx.fillStyle = '#0a0d14';
      for (let y = -100; y < 650; y += 48) {
        kCtx.beginPath();
        kCtx.moveTo(xStart - 10, y);
        kCtx.lineTo(xStart + width + 10, y + 36);
        kCtx.lineTo(xStart + width + 10, y + 60);
        kCtx.lineTo(xStart - 10, y + 24);
        kCtx.closePath();
        kCtx.fill();
      }
      kCtx.restore();
    };
    drawHazardStripe(0, 48);
    drawHazardStripe(464, 48);

    kCtx.strokeStyle = '#00f0ff';
    kCtx.lineWidth = 6;
    kCtx.beginPath(); kCtx.moveTo(50, 0); kCtx.lineTo(50, 512); kCtx.stroke();
    kCtx.beginPath(); kCtx.moveTo(462, 0); kCtx.lineTo(462, 512); kCtx.stroke();

    const arrowYPositions = [120, 260, 400];
    for (const cy of arrowYPositions) {
      kCtx.fillStyle = '#ffe600';
      kCtx.beginPath();
      kCtx.moveTo(256, cy - 65);
      kCtx.lineTo(420, cy + 30);
      kCtx.lineTo(380, cy + 55);
      kCtx.lineTo(256, cy - 15);
      kCtx.lineTo(132, cy + 55);
      kCtx.lineTo(92, cy + 30);
      kCtx.closePath();
      kCtx.fill();

      kCtx.fillStyle = '#ffffff';
      kCtx.beginPath();
      kCtx.moveTo(256, cy - 48);
      kCtx.lineTo(360, cy + 22);
      kCtx.lineTo(336, cy + 38);
      kCtx.lineTo(256, cy - 10);
      kCtx.lineTo(176, cy + 38);
      kCtx.lineTo(152, cy + 22);
      kCtx.closePath();
      kCtx.fill();
    }

    const kTex = new THREE.CanvasTexture(kCanvas);
    const kMat = new THREE.MeshStandardMaterial({
      map: kTex,
      emissive: 0xffaa00,
      emissiveMap: kTex,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.5, metalness: 0.5 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xffde00, roughness: 0.3, metalness: 0.2 });

    for (const cfg of this.config.kickerRamps) {
      const slice = this.getTrackSlice(cfg.t);
      const pos = slice.position.clone()
        .addScaledVector(slice.binormal, cfg.offsetLat)
        .addScaledVector(slice.normal, 0.02);

      const rampGroup = new THREE.Group();
      rampGroup.position.copy(pos);
      rampGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(slice.binormal, slice.normal, slice.tangent));

      const w = 1.35;
      const l = 2.6;
      const h = 0.40;

      const baseGeom = new THREE.BoxGeometry(w * 2 + 0.1, 0.04, l + 0.1);
      const baseMesh = new THREE.Mesh(baseGeom, darkMetalMat);
      baseMesh.position.set(0, 0.02, 0);
      rampGroup.add(baseMesh);

      const wedgeGeom = new THREE.BufferGeometry();
      const positions = new Float32Array([
        -w, 0.03, -l/2,   -w, h, l/2,    w, h, l/2,
        -w, 0.03, -l/2,    w, h, l/2,    w, 0.03, -l/2,
        -w, h, l/2,        w, 0.03, l/2,  w, h, l/2,
        -w, h, l/2,       -w, 0.03, l/2,  w, 0.03, l/2,
        -w, 0.03, -l/2,   -w, 0.03, l/2,  -w, h, l/2,
         w, 0.03, -l/2,    w, h, l/2,     w, 0.03, l/2,
      ]);

      const uvs = new Float32Array([
        0, 0,   0, 1,   1, 1,
        0, 0,   1, 1,   1, 0,
        0.1, 0,  0.9, 0.2,  0.9, 0,
        0.1, 0,  0.1, 0.2,  0.9, 0.2,
        0, 0,   0.2, 0,   0.2, 0.2,
        0, 0,   0.2, 0.2, 0.2, 0,
      ]);

      wedgeGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      wedgeGeom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      wedgeGeom.computeVertexNormals();

      const rampMesh = new THREE.Mesh(wedgeGeom, kMat);
      rampMesh.castShadow = true;
      rampMesh.receiveShadow = true;
      rampGroup.add(rampMesh);

      const slopeHypot = Math.hypot(l, h);
      const slopeAngle = Math.atan2(h, l);
      const railGeom = new THREE.BoxGeometry(0.08, 0.12, slopeHypot);

      const railL = new THREE.Mesh(railGeom, curbMat);
      railL.position.set(-w + 0.04, h * 0.5 + 0.06, 0);
      railL.rotation.x = -slopeAngle;
      rampGroup.add(railL);

      const railR = new THREE.Mesh(railGeom, curbMat);
      railR.position.set(w - 0.04, h * 0.5 + 0.06, 0);
      railR.rotation.x = -slopeAngle;
      rampGroup.add(railR);

      this.addToScene(scene, rampGroup);

      this.kickerRamps.push({
        position: pos.clone(),
        forward: slice.tangent.clone(),
        mesh: rampGroup,
        triggerRadius: 2.4,
      });
    }
  }

  private createHazardBlocks(scene: THREE.Scene) {
    const bCanvas = document.createElement('canvas');
    bCanvas.width = 128;
    bCanvas.height = 128;
    const bCtx = bCanvas.getContext('2d')!;
    bCtx.fillStyle = '#222630';
    bCtx.fillRect(0, 0, 128, 128);
    bCtx.fillStyle = '#ff1133';
    for (let x = -60; x < 200; x += 36) {
      bCtx.beginPath();
      bCtx.moveTo(x, 0);
      bCtx.lineTo(x + 18, 0);
      bCtx.lineTo(x - 18, 128);
      bCtx.lineTo(x - 36, 128);
      bCtx.fill();
    }
    const bTex = new THREE.CanvasTexture(bCanvas);
    const blockMat = new THREE.MeshStandardMaterial({
      map: bTex,
      roughness: 0.5,
      metalness: 0.4,
    });
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    for (const cfg of this.config.hazardBlocks) {
      const slice = this.getTrackSlice(cfg.t);
      const pos = slice.position.clone()
        .addScaledVector(slice.binormal, cfg.offsetLat)
        .addScaledVector(slice.normal, 0.75);

      const blockGroup = new THREE.Group();
      blockGroup.position.copy(pos);
      blockGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(slice.binormal, slice.normal, slice.tangent));

      const geom = new THREE.BoxGeometry(3.2, 1.5, 1.2);
      const bMesh = new THREE.Mesh(geom, blockMat);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      blockGroup.add(bMesh);

      const beaconGeom = new THREE.CylinderGeometry(0.2, 0.25, 0.4, 8);
      const beacon = new THREE.Mesh(beaconGeom, beaconMat);
      beacon.position.set(0, 0.95, 0);
      blockGroup.add(beacon);

      this.addToScene(scene, blockGroup);

      this.hazardBlocks.push({
        id: cfg.id,
        position: pos.clone(),
        tangent: slice.tangent.clone(),
        binormal: slice.binormal.clone(),
        halfWidth: 1.65,
        halfDepth: 0.65,
        mesh: blockGroup,
        radius: 3.5,
        isDestroyed: false,
        respawnTimer: 0,
      });
    }
  }

  private createUnderTrackPillars(scene: THREE.Scene) {
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x181f2f, roughness: 0.7, metalness: 0.5 });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x004466 });

    const pillarSteps = 24;
    for (let i = 0; i < pillarSteps; i++) {
      const t = (i / pillarSteps);
      const slice = this.getTrackSlice(t);
      if (slice.isGap) continue;

      const pt = slice.position;
      const height = 150;
      const strutGeom = new THREE.CylinderGeometry(2.8, 6.0, height, 6);
      const strut = new THREE.Mesh(strutGeom, pillarMat);
      strut.position.set(pt.x, pt.y - height / 2 - 2, pt.z);
      this.addToScene(scene, strut);

      const ringGeom = new THREE.TorusGeometry(4.5, 0.5, 6, 16);
      const ring = new THREE.Mesh(ringGeom, beamMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(pt.x, pt.y - 12, pt.z);
      this.addToScene(scene, ring);
    }
  }

  private buildArenaMeshes(scene: THREE.Scene, physics: PhysicsEngine) {
    const arenaRadius = (this.config as RumbleArenaConfig).arenaRadius || 98.0;

    // 1. High-Density Circular Flat Deck with Center Dais & Razor-Sharp Cliff Rim
    // Pure flat coliseum floor with zero edge ledges and instant free-fall into open sky!
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(0, 0.35),       // Center turbo dais stage floor
      new THREE.Vector2(11.5, 0.35),    // Edge of flat elevated center stage
      new THREE.Vector2(12.8, 0.30),    // Aerodynamic crown crest
      new THREE.Vector2(14.2, 0.18),    // Smooth gradual transition slope
      new THREE.Vector2(15.6, 0.06),    // Gentle approach ramp
      new THREE.Vector2(16.8, 0.0),     // Flush seamless blend to arena asphalt floor
      new THREE.Vector2(36.0, 0.0),     // Mid inner combat floor
      new THREE.Vector2(72.0, 0.0),     // Outer battleground
      new THREE.Vector2(88.0, 0.0),     // Perimeter combat ring
      new THREE.Vector2(93.0, 0.0),     // Hazard strip inner boundary
      new THREE.Vector2(96.0, 0.0),     // Clean razor-sharp flat deck edge
      new THREE.Vector2(96.0, -0.6),    // Pure vertical drop edge (no bevel, no ledge, no shelf)
      new THREE.Vector2(0, -0.6),       // Ultra-thin underside bottom (only 0.6m thick)
    ];

    const platformGeom = new THREE.LatheGeometry(profile, 96);

    // Planar top-down UV projection with sharp 12m repeat rate for tactile road texture
    const posAttr = platformGeom.attributes.position;
    const uvAttr = platformGeom.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      uvAttr.setXY(i, x / 12.0, z / 12.0);
    }
    uvAttr.needsUpdate = true;
    platformGeom.computeVertexNormals();

    // 2. High-Definition Tactile Paved Asphalt Texture
    const asphaltCanvas = document.createElement('canvas');
    asphaltCanvas.width = 512;
    asphaltCanvas.height = 512;
    const aCtx = asphaltCanvas.getContext('2d')!;

    // Rich dark slate road surface (realistic asphalt)
    aCtx.fillStyle = '#2c313d';
    aCtx.fillRect(0, 0, 512, 512);

    // Micro-pebble & road aggregate noise
    const imgData = aCtx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 32;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise + 3));
    }
    aCtx.putImageData(imgData, 0, 0);

    // Pavement expansion joints / road block seams
    aCtx.strokeStyle = 'rgba(20, 24, 32, 0.40)';
    aCtx.lineWidth = 2;
    for (let p = 0; p <= 512; p += 64) {
      aCtx.beginPath(); aCtx.moveTo(p, 0); aCtx.lineTo(p, 512); aCtx.stroke();
      aCtx.beginPath(); aCtx.moveTo(0, p); aCtx.lineTo(512, p); aCtx.stroke();
    }

    // Weathered tire skid arcs
    aCtx.strokeStyle = 'rgba(15, 18, 24, 0.30)';
    aCtx.lineWidth = 14;
    aCtx.beginPath(); aCtx.arc(140, 160, 100, 0.2, 1.5); aCtx.stroke();
    aCtx.beginPath(); aCtx.arc(380, 370, 110, 2.0, 3.4); aCtx.stroke();

    const asphaltTex = new THREE.CanvasTexture(asphaltCanvas);
    asphaltTex.wrapS = THREE.RepeatWrapping;
    asphaltTex.wrapT = THREE.RepeatWrapping;

    const deckMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.65,
      metalness: 0.15,
    });

    const deckMesh = new THREE.Mesh(platformGeom, deckMat);
    deckMesh.receiveShadow = true;
    this.addToScene(scene, deckMesh);

    // 3. Crisp Stadium Battle Markings & Kerb Ring Overlay
    // Sits at y = 0.025m so it rests seamlessly on the paved asphalt
    const markingsCanvas = document.createElement('canvas');
    markingsCanvas.width = 1024;
    markingsCanvas.height = 1024;
    const mCtx = markingsCanvas.getContext('2d')!;
    mCtx.clearRect(0, 0, 1024, 1024);

    const mCX = 512;
    const mCY = 512;

    // Grand Prix Racing Kerb Ring at radius = 72m (corresponds to r = 485px in 146m diameter overlay)
    // 72 alternating red & white segments
    const kerbRadius = 485;
    const kerbWidth = 24;
    const totalSegments = 72;
    for (let s = 0; s < totalSegments; s++) {
      const aStart = (s / totalSegments) * Math.PI * 2;
      const aEnd = ((s + 1) / totalSegments) * Math.PI * 2;
      mCtx.fillStyle = s % 2 === 0 ? '#e62644' : '#ffffff';
      mCtx.beginPath();
      mCtx.arc(mCX, mCY, kerbRadius, aStart, aEnd);
      mCtx.arc(mCX, mCY, kerbRadius - kerbWidth, aEnd, aStart, true);
      mCtx.closePath();
      mCtx.fill();
    }

    // Outer kerb black contour borders
    mCtx.strokeStyle = '#000000';
    mCtx.lineWidth = 3;
    mCtx.beginPath(); mCtx.arc(mCX, mCY, kerbRadius, 0, Math.PI * 2); mCtx.stroke();
    mCtx.beginPath(); mCtx.arc(mCX, mCY, kerbRadius - kerbWidth, 0, Math.PI * 2); mCtx.stroke();

    // Center Stage Ring (Gold border at r = 16m -> 108px)
    mCtx.strokeStyle = '#ffcc00';
    mCtx.lineWidth = 8;
    mCtx.beginPath();
    mCtx.arc(mCX, mCY, 108, 0, Math.PI * 2);
    mCtx.stroke();

    // Center Demarcation Line (White checkered dividing line)
    mCtx.strokeStyle = '#ffffff';
    mCtx.lineWidth = 4;
    mCtx.setLineDash([16, 12]);
    mCtx.beginPath();
    mCtx.moveTo(120, mCY); mCtx.lineTo(904, mCY);
    mCtx.stroke();
    mCtx.setLineDash([]);

    // Team Frost (North) Start Grid Markings & Crest
    mCtx.strokeStyle = 'rgba(0, 210, 255, 0.75)';
    mCtx.lineWidth = 4;
    for (let gx = -120; gx <= 120; gx += 60) {
      mCtx.strokeRect(mCX + gx - 20, mCY - 280, 40, 60);
    }
    mCtx.font = 'bold 36px "Fredoka", sans-serif';
    mCtx.fillStyle = 'rgba(0, 210, 255, 0.55)';
    mCtx.textAlign = 'center';
    mCtx.textBaseline = 'middle';
    mCtx.fillText('★ TEAM FROST TERRITORY ★', mCX, mCY - 160);

    // Team Blaze (South) Start Grid Markings & Crest
    mCtx.strokeStyle = 'rgba(255, 68, 34, 0.75)';
    mCtx.lineWidth = 4;
    for (let gx = -120; gx <= 120; gx += 60) {
      mCtx.strokeRect(mCX + gx - 20, mCY + 220, 40, 60);
    }
    mCtx.fillStyle = 'rgba(255, 68, 34, 0.55)';
    mCtx.fillText('★ TEAM BLAZE TERRITORY ★', mCX, mCY + 160);

    const markingsTex = new THREE.CanvasTexture(markingsCanvas);
    const markingsPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(146, 146),
      new THREE.MeshBasicMaterial({
        map: markingsTex,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      })
    );
    markingsPlane.rotation.x = -Math.PI / 2;
    markingsPlane.position.y = 0.025;
    this.addToScene(scene, markingsPlane);

    // 4. Perimeter Hazard Caution Decal Strip (Radius 93.0m -> 95.6m at deck level)
    // Warns racers they are approaching the open-sky drop-off zone
    const hazardCanvas = document.createElement('canvas');
    hazardCanvas.width = 512;
    hazardCanvas.height = 64;
    const hCtx = hazardCanvas.getContext('2d')!;
    hCtx.fillStyle = '#ffb700'; // Safety hazard amber-yellow
    hCtx.fillRect(0, 0, 512, 64);
    hCtx.fillStyle = '#161a22'; // Dark carbon black
    for (let x = -64; x <= 512; x += 32) {
      hCtx.beginPath();
      hCtx.moveTo(x, 0);
      hCtx.lineTo(x + 20, 0);
      hCtx.lineTo(x + 6, 64);
      hCtx.lineTo(x - 14, 64);
      hCtx.closePath();
      hCtx.fill();
    }
    const hazardTex = new THREE.CanvasTexture(hazardCanvas);
    hazardTex.wrapS = THREE.RepeatWrapping;
    hazardTex.wrapT = THREE.ClampToEdgeWrapping;

    const hazardRingGeom = new THREE.RingGeometry(93.0, 95.6, 128);
    hazardRingGeom.rotateX(-Math.PI / 2);
    const hPosAttr = hazardRingGeom.attributes.position;
    const hUvAttr = hazardRingGeom.attributes.uv;
    for (let i = 0; i < hPosAttr.count; i++) {
      const x = hPosAttr.getX(i);
      const z = hPosAttr.getZ(i);
      const angle = Math.atan2(z, x);
      const u = (angle + Math.PI) / (Math.PI * 2);
      const r = Math.hypot(x, z);
      const v = (r - 93.0) / (95.6 - 93.0);
      hUvAttr.setXY(i, u * 96, v); // 96 repeating hazard chevrons around edge
    }
    hUvAttr.needsUpdate = true;

    const hazardRingMesh = new THREE.Mesh(
      hazardRingGeom,
      new THREE.MeshBasicMaterial({
        map: hazardTex,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
    );
    hazardRingMesh.position.y = 0.015;
    this.addToScene(scene, hazardRingMesh);

    // 5. High-Visibility Glowing Neon Horizon Border (Flat 2D Decal Ring at 95.6m -> 96.0m)
    // Sits completely flush at y = 0.02 so tires roll cleanly over with ZERO snagging or hanging
    const neonRingGeom = new THREE.RingGeometry(95.6, 96.0, 128);
    neonRingGeom.rotateX(-Math.PI / 2);
    const neonRingMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const neonRingMesh = new THREE.Mesh(neonRingGeom, neonRingMat);
    neonRingMesh.position.y = 0.02;
    this.addToScene(scene, neonRingMesh);

    // 6. RAPID RAPIER COLLIDER (Clean Flat Arena Trimesh)
    // Zero grey models, zero underside colliders — pure open air beneath the stadium!
    const R = PhysicsEngine.RAPIER;
    const vertices = new Float32Array(posAttr.array);
    const indices = new Uint32Array(platformGeom.index!.array);

    const arenaColDesc = R.ColliderDesc.trimesh(vertices, indices)
      .setFriction(0.85)
      .setRestitution(0.2)
      .setCollisionGroups((0x0001 << 16) | 0x0002);

    this.collider = physics.world.createCollider(arenaColDesc);
  }

  private createArenaProps(scene: THREE.Scene, physics: PhysicsEngine) {
    const R = PhysicsEngine.RAPIER;

    // 1. Center Mega-Nitro Surge Stage (Directly sits on the elevated 0.35m lathe stage)
    const coreRingGeom = new THREE.TorusGeometry(11.8, 0.22, 8, 36);
    coreRingGeom.rotateX(Math.PI / 2);
    const coreRingMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.25,
      metalness: 0.85,
    });
    const coreRing = new THREE.Mesh(coreRingGeom, coreRingMat);
    coreRing.position.y = 0.36;
    this.addToScene(scene, coreRing);

    // Glowing Turbo Pad in Center of Podium
    const centerPadGeom = new THREE.PlaneGeometry(9.0, 9.0);
    centerPadGeom.rotateX(-Math.PI / 2);
    const padCanvas = document.createElement('canvas');
    padCanvas.width = 256;
    padCanvas.height = 256;
    const pCtx = padCanvas.getContext('2d')!;
    pCtx.fillStyle = '#1e2430';
    pCtx.fillRect(0, 0, 256, 256);
    pCtx.strokeStyle = '#ffea00';
    pCtx.lineWidth = 10;
    pCtx.strokeRect(8, 8, 240, 240);

    pCtx.fillStyle = '#ffea00';
    for (let i = 0; i < 3; i++) {
      const y = 60 + i * 65;
      pCtx.beginPath();
      pCtx.moveTo(128, y - 36);
      pCtx.lineTo(210, y + 20);
      pCtx.lineTo(128, y);
      pCtx.lineTo(46, y + 20);
      pCtx.closePath();
      pCtx.fill();
    }
    const padTex = new THREE.CanvasTexture(padCanvas);
    const centerPadMesh = new THREE.Mesh(centerPadGeom, new THREE.MeshBasicMaterial({ map: padTex }));
    centerPadMesh.position.set(0, 0.36, 0);
    this.addToScene(scene, centerPadMesh);

    this.boostPads.push({
      position: new THREE.Vector3(0, 0.36, 0),
      direction: new THREE.Vector3(0, 0, 1),
      mesh: centerPadMesh,
      isRampPad: false,
    });

    // 2. 4 Tactical Perimeter Boost Pads at radius 48m (0°, 90°, 180°, 270°)
    // Symmetrically alternating with the 4 kicker ramps (45°, 135°, 225°, 315°)
    const periPadConfigs = [
      { pos: new THREE.Vector3(48.0, 0.08, 0.0), dir: new THREE.Vector3(-1, 0, 0), rotY: -Math.PI / 2 }, // East -> West
      { pos: new THREE.Vector3(-48.0, 0.08, 0.0), dir: new THREE.Vector3(1, 0, 0), rotY: Math.PI / 2 },  // West -> East
      { pos: new THREE.Vector3(0.0, 0.08, -48.0), dir: new THREE.Vector3(0, 0, 1), rotY: 0 },            // North -> South
      { pos: new THREE.Vector3(0.0, 0.08, 48.0), dir: new THREE.Vector3(0, 0, -1), rotY: Math.PI },      // South -> North
    ];

    const periPadGeom = new THREE.PlaneGeometry(6.5, 8.5);
    periPadGeom.rotateX(-Math.PI / 2);

    for (const pCfg of periPadConfigs) {
      const pMesh = new THREE.Mesh(periPadGeom, new THREE.MeshBasicMaterial({ map: padTex }));
      pMesh.position.copy(pCfg.pos);
      pMesh.rotation.y = pCfg.rotY;
      this.addToScene(scene, pMesh);

      this.boostPads.push({
        position: pCfg.pos.clone(),
        direction: pCfg.dir.clone(),
        mesh: pMesh,
        isRampPad: false,
      });
    }

    // 3. 4 Symmetrical Kicker Ramps at radius 48m (45°, 135°, 225°, 315°)
    // Designed as authentic Stunt Jump Ramps with yellow/black hazard striping & directional arrows
    const kickerAngles = [
      Math.PI / 4,
      (3 * Math.PI) / 4,
      (5 * Math.PI) / 4,
      (7 * Math.PI) / 4,
    ];

    const rampDeckCanvas = document.createElement('canvas');
    rampDeckCanvas.width = 256;
    rampDeckCanvas.height = 256;
    const rCtx = rampDeckCanvas.getContext('2d')!;
    rCtx.fillStyle = '#252a36';
    rCtx.fillRect(0, 0, 256, 256);

    // Hazard stripes on borders
    rCtx.fillStyle = '#ffea00';
    rCtx.fillRect(0, 0, 24, 256);
    rCtx.fillRect(232, 0, 24, 256);
    rCtx.fillStyle = '#000000';
    for (let y = 0; y < 256; y += 32) {
      rCtx.fillRect(0, y, 24, 16);
      rCtx.fillRect(232, y, 24, 16);
    }

    // Launch Chevron
    rCtx.fillStyle = '#ffea00';
    rCtx.beginPath();
    rCtx.moveTo(128, 40);
    rCtx.lineTo(200, 180);
    rCtx.lineTo(128, 140);
    rCtx.lineTo(56, 180);
    rCtx.closePath();
    rCtx.fill();

    const rampDeckTex = new THREE.CanvasTexture(rampDeckCanvas);
    const rampDeckMat = new THREE.MeshStandardMaterial({ map: rampDeckTex, roughness: 0.35 });
    const rampFrameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.7 });

    kickerAngles.forEach((angle) => {
      const kX = Math.cos(angle) * 48.0;
      const kZ = Math.sin(angle) * 48.0;
      const pos = new THREE.Vector3(kX, 0.05, kZ);

      // Angled inward toward center
      const forward = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle)).normalize();

      const rampGroup = new THREE.Group();
      rampGroup.position.copy(pos);
      const rotY = Math.atan2(forward.x, forward.z);
      rampGroup.rotation.y = rotY;

      // Incline Ramp Deck
      const rampMesh = new THREE.Mesh(
        new THREE.BoxGeometry(6.0, 0.25, 5.0),
        rampDeckMat
      );
      rampMesh.position.set(0, 0.40, 0);
      rampMesh.rotation.x = -0.16; // incline
      rampGroup.add(rampMesh);

      // Side Guardrails
      const sideGuardGeom = new THREE.BoxGeometry(0.35, 0.75, 5.0);
      const leftGuard = new THREE.Mesh(sideGuardGeom, rampFrameMat);
      leftGuard.position.set(-3.0, 0.55, 0);
      leftGuard.rotation.x = -0.16;
      rampGroup.add(leftGuard);

      const rightGuard = new THREE.Mesh(sideGuardGeom, rampFrameMat);
      rightGuard.position.set(3.0, 0.55, 0);
      rightGuard.rotation.x = -0.16;
      rampGroup.add(rightGuard);

      this.addToScene(scene, rampGroup);

      // Rapier solid box collider for ramp base
      const rampColDesc = R.ColliderDesc.cuboid(3.0, 0.35, 2.5)
        .setTranslation(pos.x, 0.35, pos.z)
        .setRotation({
          x: 0,
          y: Math.sin(rotY / 2),
          z: 0,
          w: Math.cos(rotY / 2),
        })
        .setFriction(0.6)
        .setRestitution(0.2)
        .setCollisionGroups((0x0001 << 16) | 0x0002);
      const rampCol = physics.world.createCollider(rampColDesc);
      this.propColliders.push(rampCol);

      this.kickerRamps.push({
        position: pos.clone(),
        forward: forward.clone(),
        mesh: rampGroup,
        triggerRadius: 4.8,
      });
    });

    // 3. 4 Championship Tree Garden Planters at radius 36m (clear of all spawns & driving lines)
    // Replaces plain rocks with magnificent landscaped oases (Evergreen cyber-pine tree, granite curb, cyan neon ring)
    const gardenAngles = [Math.PI / 8, (5 * Math.PI) / 8, (9 * Math.PI) / 8, (13 * Math.PI) / 8];
    const curbGeom = new THREE.CylinderGeometry(3.2, 3.4, 0.40, 24);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x1f242d, roughness: 0.65, metalness: 0.4 });
    const gardenTurfGeom = new THREE.CylinderGeometry(3.0, 3.0, 0.16, 24);
    const gardenTurfMat = new THREE.MeshLambertMaterial({ color: 0x228834, flatShading: true });
    const neonRingGeom = new THREE.TorusGeometry(3.2, 0.08, 8, 32);
    neonRingGeom.rotateX(Math.PI / 2);
    const neonRingMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    // Multi-tiered Pine Tree Components
    const treeBarkMat = new THREE.MeshLambertMaterial({ color: 0x6e4a2d, flatShading: true });
    const treeFoliageMat1 = new THREE.MeshLambertMaterial({ color: 0x185a24, flatShading: true });
    const treeFoliageMat2 = new THREE.MeshLambertMaterial({ color: 0x247e32, flatShading: true });
    const treeFoliageMat3 = new THREE.MeshLambertMaterial({ color: 0x309a40, flatShading: true });
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffaa00, emissiveIntensity: 0.8 });

    gardenAngles.forEach((angle) => {
      const gx = Math.cos(angle) * 36.0;
      const gz = Math.sin(angle) * 36.0;

      const gardenGroup = new THREE.Group();
      gardenGroup.position.set(gx, 0.0, gz);

      // Granite Planter Curb
      const curbMesh = new THREE.Mesh(curbGeom, curbMat);
      curbMesh.position.y = 0.20;
      curbMesh.receiveShadow = true;
      gardenGroup.add(curbMesh);

      // Raised Garden Turf
      const turfMesh = new THREE.Mesh(gardenTurfGeom, gardenTurfMat);
      turfMesh.position.y = 0.28;
      gardenGroup.add(turfMesh);

      // Center Pine Tree Trunk
      const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, 3.2, 8), treeBarkMat);
      trunkMesh.position.y = 1.8;
      trunkMesh.castShadow = true;
      gardenGroup.add(trunkMesh);

      // 3 Tiered Foliage Cones
      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 8), treeFoliageMat1);
      cone1.position.y = 2.9;
      cone1.castShadow = true;
      gardenGroup.add(cone1);

      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.9, 8), treeFoliageMat2);
      cone2.position.y = 4.0;
      cone2.castShadow = true;
      gardenGroup.add(cone2);

      const cone3 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.7, 8), treeFoliageMat3);
      cone3.position.y = 5.0;
      cone3.castShadow = true;
      gardenGroup.add(cone3);

      // Golden Lantern Beacon on top
      const lantern = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32), lanternMat);
      lantern.position.y = 6.0;
      gardenGroup.add(lantern);

      // Accent Bush Spheres
      const bush1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 1), treeFoliageMat2);
      bush1.position.set(1.4, 0.55, 0.8);
      gardenGroup.add(bush1);

      const bush2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 1), treeFoliageMat3);
      bush2.position.set(-1.2, 0.50, -1.0);
      gardenGroup.add(bush2);

      this.addToScene(scene, gardenGroup);

      // Rapier cylinder collider for solid garden oasis
      const gardenColDesc = R.ColliderDesc.cylinder(1.5, 3.1)
        .setTranslation(gx, 1.5, gz)
        .setFriction(0.6)
        .setRestitution(0.3)
        .setCollisionGroups((0x0001 << 16) | 0x0002);
      const gardenCol = physics.world.createCollider(gardenColDesc);
      this.propColliders.push(gardenCol);

      // Registered solid physical obstacle for bumper deflection & crash sparks
      this.boulders.push({
        position: new THREE.Vector3(gx, 0.5, gz),
        radius: 3.1,
        lastHitTimes: new Map(),
      });
    });

    // 4. 4 High-Speed Outer Stunt Jump Ramps on Banked Slope at radius 76m (45°, 135°, 225°, 315°)
    // Gives players big air opportunities from the banked slope into the arena!
    const outerRampAngles = [
      Math.PI / 4,
      (3 * Math.PI) / 4,
      (5 * Math.PI) / 4,
      (7 * Math.PI) / 4,
    ];

    outerRampAngles.forEach((angle) => {
      const oX = Math.cos(angle) * 76.0;
      const oZ = Math.sin(angle) * 76.0;
      const pos = new THREE.Vector3(oX, 0.55, oZ);

      // Inward launch trajectory aimed down the banked bowl towards center
      const forward = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle)).normalize();

      const rampGroup = new THREE.Group();
      rampGroup.position.copy(pos);
      const rotY = Math.atan2(forward.x, forward.z);
      rampGroup.rotation.y = rotY;

      // Incline Ramp Deck
      const rampMesh = new THREE.Mesh(
        new THREE.BoxGeometry(6.5, 0.30, 5.5),
        rampDeckMat
      );
      rampMesh.position.set(0, 0.45, 0);
      rampMesh.rotation.x = -0.18; // steeper incline for thrilling stunt jump!
      rampGroup.add(rampMesh);

      // Side Guardrails
      const sideGuardGeom = new THREE.BoxGeometry(0.35, 0.85, 5.5);
      const leftGuard = new THREE.Mesh(sideGuardGeom, rampFrameMat);
      leftGuard.position.set(-3.25, 0.65, 0);
      leftGuard.rotation.x = -0.18;
      rampGroup.add(leftGuard);

      const rightGuard = new THREE.Mesh(sideGuardGeom, rampFrameMat);
      rightGuard.position.set(3.25, 0.65, 0);
      rightGuard.rotation.x = -0.18;
      rampGroup.add(rightGuard);

      // Glowing Cyan Edge Lighting along Ramp Lip
      const lipLightGeom = new THREE.BoxGeometry(6.5, 0.12, 0.25);
      const lipLightMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
      const lipLight = new THREE.Mesh(lipLightGeom, lipLightMat);
      lipLight.position.set(0, 0.92, -2.4);
      rampGroup.add(lipLight);

      this.addToScene(scene, rampGroup);

      // Rapier solid box collider for ramp base
      const rampColDesc = R.ColliderDesc.cuboid(3.25, 0.45, 2.75)
        .setTranslation(pos.x, 0.55, pos.z)
        .setRotation({
          x: 0,
          y: Math.sin(rotY / 2),
          z: 0,
          w: Math.cos(rotY / 2),
        })
        .setFriction(0.6)
        .setRestitution(0.2)
        .setCollisionGroups((0x0001 << 16) | 0x0002);
      const rampCol = physics.world.createCollider(rampColDesc);
      this.propColliders.push(rampCol);

      this.kickerRamps.push({
        position: pos.clone(),
        forward: forward.clone(),
        mesh: rampGroup,
        triggerRadius: 5.2,
      });
    });

    // 5. 8 Perimeter Clutch Pine Trees (Radius 89.5m)
    // Symmetrically spaced at 22.5°, 67.5°, 112.5°, 157.5°, 202.5°, 247.5°, 292.5°, 337.5°
    // Identical solid architecture to center garden planters (sturdy granite curb & Rapier cylinder collider)
    const clutchTreeAngles = [
      (1 * Math.PI) / 8,
      (3 * Math.PI) / 8,
      (5 * Math.PI) / 8,
      (7 * Math.PI) / 8,
      (9 * Math.PI) / 8,
      (11 * Math.PI) / 8,
      (13 * Math.PI) / 8,
      (15 * Math.PI) / 8,
    ];

    clutchTreeAngles.forEach((angle) => {
      const tx = Math.cos(angle) * 89.5;
      const tz = Math.sin(angle) * 89.5;

      const gardenGroup = new THREE.Group();
      gardenGroup.position.set(tx, 0.0, tz);

      // Granite Planter Curb (Same as center planters)
      const curbMesh = new THREE.Mesh(curbGeom, curbMat);
      curbMesh.position.y = 0.20;
      curbMesh.receiveShadow = true;
      gardenGroup.add(curbMesh);

      // Raised Garden Turf
      const turfMesh = new THREE.Mesh(gardenTurfGeom, gardenTurfMat);
      turfMesh.position.y = 0.28;
      gardenGroup.add(turfMesh);

      // Center Pine Tree Trunk
      const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, 3.2, 8), treeBarkMat);
      trunkMesh.position.y = 1.8;
      trunkMesh.castShadow = true;
      gardenGroup.add(trunkMesh);

      // 3 Tiered Foliage Cones
      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 8), treeFoliageMat1);
      cone1.position.y = 2.9;
      cone1.castShadow = true;
      gardenGroup.add(cone1);

      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.9, 8), treeFoliageMat2);
      cone2.position.y = 4.0;
      cone2.castShadow = true;
      gardenGroup.add(cone2);

      const cone3 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.7, 8), treeFoliageMat3);
      cone3.position.y = 5.0;
      cone3.castShadow = true;
      gardenGroup.add(cone3);

      this.addToScene(scene, gardenGroup);

      // Rapier cylinder collider for solid tree oasis (Identical to center planters)
      const treeColDesc = R.ColliderDesc.cylinder(1.5, 3.1)
        .setTranslation(tx, 1.5, tz)
        .setFriction(0.6)
        .setRestitution(0.3)
        .setCollisionGroups((0x0001 << 16) | 0x0002);
      const treeCol = physics.world.createCollider(treeColDesc);
      this.propColliders.push(treeCol);

      // Registered solid physical obstacle
      this.boulders.push({
        position: new THREE.Vector3(tx, 0.5, tz),
        radius: 3.1,
        lastHitTimes: new Map(),
      });
    });
  }

  public getClosestT(position: THREE.Vector3, hintT: number = -1): number {
    if (this.isArena) {
      const angle = Math.atan2(position.z, position.x);
      return ((angle / (Math.PI * 2)) + 1.0) % 1.0;
    }

    let bestT = hintT >= 0 ? hintT : 0;
    let minDistSq = Infinity;

    if (hintT >= 0) {
      const totalSteps = 360;
      for (let i = -4; i <= 14; i++) {
        const testT = (hintT + (i / totalSteps) + 1.0) % 1.0;
        const slice = this.getTrackSlice(testT);
        const distSq = slice.position.distanceToSquared(position);
        if (distSq < minDistSq) {
          minDistSq = distSq;
          bestT = testT;
        }
      }
    } else {
      const steps = 180;
      for (let i = 0; i < steps; i++) {
        const testT = i / steps;
        const slice = this.getTrackSlice(testT);
        const distSq = slice.position.distanceToSquared(position);
        if (distSq < minDistSq) {
          minDistSq = distSq;
          bestT = testT;
        }
      }
    }
    return bestT;
  }
}
