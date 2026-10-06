import * as THREE from 'three';
import { Track } from './Track';
import { sounds } from '../core/Sound';
import { SparkParticles } from './SparkParticles';
import { Kart } from '../entities/Kart';

import { TurbineConfig, PendulumConfig } from './tracks/TrackTypes';

export interface KineticTurbine {
  id: string;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  binormal: THREE.Vector3;
  normal: THREE.Vector3;
  hubY: number;
  bladeRadius: number;
  spanHalfWidth: number;
  rotationSpeed: number;
  angleOffset: number;
  currentAngle: number;
  group: THREE.Group;
  rotorGroup: THREE.Group;
  lastHitTimes: Map<string, number>;
}

export interface KineticPendulum {
  id: string;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  binormal: THREE.Vector3;
  normal: THREE.Vector3;
  pivotY: number;
  armLength: number;
  hammerRadius: number;
  spanHalfWidth: number;
  swingSpeed: number;
  phaseOffset: number;
  maxAngle: number;
  currentAngle: number;
  hammerWorldPos: THREE.Vector3;
  hammerLinearVel: THREE.Vector3;
  group: THREE.Group;
  armGroup: THREE.Group;
  lastHitTimes: Map<string, number>;
}

// Static scratch vectors (eliminates 60fps GC pause spikes on mobile)
const _khToKart = new THREE.Vector3();
const _khReboundDir = new THREE.Vector3();
const _khBounceVel = new THREE.Vector3();
const _khLaunchVel = new THREE.Vector3();
const _khRadDir = new THREE.Vector3();
const _khBladeDir = new THREE.Vector3();
const _khLocalHeadPos = new THREE.Vector3();
const _khLateralStrike = new THREE.Vector3();

export class KineticHazardManager {
  public turbines: KineticTurbine[] = [];
  public pendulums: KineticPendulum[] = [];

  private time: number = 0;

  constructor(
    private scene: THREE.Scene,
    private track: Track,
    turbineConfigs: TurbineConfig[] = [],
    pendulumConfigs: PendulumConfig[] = []
  ) {
    this.createTurbines(turbineConfigs);
    this.createPendulums(pendulumConfigs);
  }

  // ── 1. GIANT ROTATING SKY TURBINES (Fan Blades) ───────────────────
  private createTurbines(turbineConfigs: TurbineConfig[]) {

    const metalMat = new THREE.MeshLambertMaterial({
      color: 0x141822,
    });

    const bladeMat = new THREE.MeshLambertMaterial({
      color: 0x1e2430,
    });

    const cautionTipMat = new THREE.MeshBasicMaterial({
      color: 0xffe600,
    });

    const neonCyanMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
    });

    const redBeaconMat = new THREE.MeshBasicMaterial({
      color: 0xff0033,
    });

    for (const cfg of turbineConfigs) {
      const slice = this.track.getTrackSlice(cfg.t);
      const group = new THREE.Group();
      group.position.copy(slice.position);

      const rotMatrix = new THREE.Matrix4().makeBasis(slice.binormal, slice.normal, slice.tangent);
      group.quaternion.setFromRotationMatrix(rotMatrix);

      const hubElevation = 6.2; // Hub sits 6.2m above road - blades sweep down to ground and smash karts into the air!

      // 1. Heavy Industrial Overhead Truss Gantry Arch
      const spanHalfWidth = slice.halfWidth + 0.8;
      const gantryHeight = 14.5;

      const pGeom = new THREE.BoxGeometry(1.6, gantryHeight, 1.6);
      const pillarL = new THREE.Mesh(pGeom, metalMat);
      pillarL.position.set(-spanHalfWidth, gantryHeight / 2, 0);
      pillarL.castShadow = true;
      group.add(pillarL);

      const pillarR = new THREE.Mesh(pGeom, metalMat);
      pillarR.position.set(spanHalfWidth, gantryHeight / 2, 0);
      pillarR.castShadow = true;
      group.add(pillarR);

      // Heavy Curb Mounting Foot Clamps
      const clampGeom = new THREE.BoxGeometry(2.0, 1.2, 2.2);
      const clampL = new THREE.Mesh(clampGeom, metalMat);
      clampL.position.set(-spanHalfWidth, 0.4, 0);
      group.add(clampL);
      const clampR = new THREE.Mesh(clampGeom, metalMat);
      clampR.position.set(spanHalfWidth, 0.4, 0);
      group.add(clampR);

      // Top Crossbeam
      const beamGeom = new THREE.BoxGeometry(spanHalfWidth * 2 + 1.8, 1.8, 2.0);
      const crossBeam = new THREE.Mesh(beamGeom, metalMat);
      crossBeam.position.set(0, gantryHeight, 0);
      crossBeam.castShadow = true;
      group.add(crossBeam);

      // Warning Signboard
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 512;
      signCanvas.height = 128;
      const sCtx = signCanvas.getContext('2d')!;
      sCtx.fillStyle = '#0f172a';
      sCtx.fillRect(0, 0, 512, 128);
      sCtx.fillStyle = '#ff1744';
      sCtx.fillRect(0, 0, 512, 16);
      sCtx.fillRect(0, 112, 512, 16);
      sCtx.fillStyle = '#ffe600';
      sCtx.font = '900 42px Rajdhani, Arial, sans-serif';
      sCtx.textAlign = 'center';
      sCtx.textBaseline = 'middle';
      sCtx.fillText('⚠️ SKY TURBINE // TIMING ZONE ⚠️', 256, 52);
      sCtx.fillStyle = '#00f0ff';
      sCtx.font = '800 24px Teko, Arial, sans-serif';
      sCtx.fillText('THREAD THE BLADE GAPS // IMPACT = INSTANT SMASH', 256, 88);

      const signTex = new THREE.CanvasTexture(signCanvas);
      // Front sign: faces oncoming racers (coming from -Z) with correct left-to-right text
      const signFront = new THREE.Mesh(
        new THREE.PlaneGeometry(15, 3.2),
        new THREE.MeshBasicMaterial({ map: signTex })
      );
      signFront.position.set(0, gantryHeight + 2.2, -0.4);
      signFront.rotation.y = Math.PI;
      group.add(signFront);

      // Back sign: faces racers looking backward (+Z)
      const signBack = new THREE.Mesh(
        new THREE.PlaneGeometry(15, 3.2),
        new THREE.MeshBasicMaterial({ map: signTex })
      );
      signBack.position.set(0, gantryHeight + 2.2, 0.4);
      group.add(signBack);

      // Central Hub Axle
      const axleGeom = new THREE.CylinderGeometry(1.4, 1.4, 3.2, 16);
      axleGeom.rotateX(Math.PI / 2);
      const axle = new THREE.Mesh(axleGeom, metalMat);
      axle.position.set(0, hubElevation, 0);
      group.add(axle);

      // Rotating Rotor Assembly
      const rotorGroup = new THREE.Group();
      rotorGroup.position.set(0, hubElevation, 0);

      // Central Spinner Dome with pulsing red warning beacon
      const hubDome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 16), metalMat);
      rotorGroup.add(hubDome);

      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 8), redBeaconMat);
      beacon.rotateX(Math.PI / 2);
      beacon.position.set(0, 0, 1.6);
      rotorGroup.add(beacon);

      // 3 Giant Heavy Aero Blades (120° apart for generous open timing window!)
      const numBlades = 3;
      const bladeLength = cfg.bladeRadius;
      const bladeWidth = 1.35;
      const bladeThick = 0.55;

      for (let b = 0; b < numBlades; b++) {
        const bladePivot = new THREE.Group();
        bladePivot.rotation.z = (b * Math.PI * 2) / numBlades;

        // Blade Aerodynamic Mesh
        const bGeom = new THREE.BoxGeometry(bladeWidth, bladeLength, bladeThick);
        const bladeMesh = new THREE.Mesh(bGeom, bladeMat);
        bladeMesh.position.set(0, bladeLength / 2 + 0.8, 0);
        bladeMesh.castShadow = true;
        bladePivot.add(bladeMesh);

        // Bright Yellow Hazard Tip
        const tipGeom = new THREE.BoxGeometry(bladeWidth + 0.05, 1.8, bladeThick + 0.05);
        const tipMesh = new THREE.Mesh(tipGeom, cautionTipMat);
        tipMesh.position.set(0, bladeLength + 0.1, 0);
        bladePivot.add(tipMesh);

        // Neon Cyan Edge Strip
        const neonGeom = new THREE.BoxGeometry(0.12, bladeLength * 0.8, bladeThick + 0.08);
        const neonMesh = new THREE.Mesh(neonGeom, neonCyanMat);
        neonMesh.position.set(bladeWidth / 2, bladeLength / 2 + 0.8, 0);
        bladePivot.add(neonMesh);

        rotorGroup.add(bladePivot);
      }

      group.add(rotorGroup);
      this.scene.add(group);

      this.turbines.push({
        id: cfg.id,
        position: slice.position.clone(),
        tangent: slice.tangent.clone(),
        binormal: slice.binormal.clone(),
        normal: slice.normal.clone(),
        hubY: hubElevation,
        bladeRadius: cfg.bladeRadius,
        spanHalfWidth,
        rotationSpeed: cfg.speed,
        angleOffset: cfg.angleOffset || 0,
        currentAngle: cfg.angleOffset || 0,
        group,
        rotorGroup,
        lastHitTimes: new Map(),
      });
    }
  }

  // ── 2. GIANT SWINGING PENDULUM HAMMER (Wrecking Smasher) ──────────
  private createPendulums(pendulumConfigs: PendulumConfig[]) {
    const metalMat = new THREE.MeshLambertMaterial({
      color: 0x111622,
    });

    const hammerMat = new THREE.MeshLambertMaterial({
      color: 0x242838,
    });

    const hazardStripeCanvas = document.createElement('canvas');
    hazardStripeCanvas.width = 256;
    hazardStripeCanvas.height = 256;
    const hCtx = hazardStripeCanvas.getContext('2d')!;
    hCtx.fillStyle = '#ffde00';
    hCtx.fillRect(0, 0, 256, 256);
    hCtx.fillStyle = '#0a0d14';
    for (let x = -100; x < 400; x += 48) {
      hCtx.beginPath();
      hCtx.moveTo(x, 0);
      hCtx.lineTo(x + 28, 0);
      hCtx.lineTo(x - 20, 256);
      hCtx.lineTo(x - 48, 256);
      hCtx.closePath();
      hCtx.fill();
    }
    const hazardStripeTex = new THREE.CanvasTexture(hazardStripeCanvas);
    hazardStripeTex.wrapS = THREE.RepeatWrapping;
    hazardStripeTex.wrapT = THREE.RepeatWrapping;
    hazardStripeTex.repeat.set(2, 1);

    const hammerBumperMat = new THREE.MeshLambertMaterial({
      map: hazardStripeTex,
    });

    for (const cfg of pendulumConfigs) {
      const slice = this.track.getTrackSlice(cfg.t);
      const group = new THREE.Group();
      group.position.copy(slice.position);

      const rotMatrix = new THREE.Matrix4().makeBasis(slice.binormal, slice.normal, slice.tangent);
      group.quaternion.setFromRotationMatrix(rotMatrix);

      const pivotElevation = 17.8;
      const spanHalfWidth = slice.halfWidth + 0.8;

      // Heavy Industrial Gantry Pillars (Sitting firmly on the curb)
      const pGeom = new THREE.BoxGeometry(1.8, pivotElevation + 2.5, 2.0);
      const pL = new THREE.Mesh(pGeom, metalMat);
      pL.position.set(-spanHalfWidth, (pivotElevation + 2.5) / 2, 0);
      pL.castShadow = true;
      group.add(pL);

      const pR = new THREE.Mesh(pGeom, metalMat);
      pR.position.set(spanHalfWidth, (pivotElevation + 2.5) / 2, 0);
      pR.castShadow = true;
      group.add(pR);

      // Heavy Curb Mounting Foot Clamps
      const clampGeom = new THREE.BoxGeometry(2.2, 1.4, 2.4);
      const clampL = new THREE.Mesh(clampGeom, metalMat);
      clampL.position.set(-spanHalfWidth, 0.5, 0);
      group.add(clampL);
      const clampR = new THREE.Mesh(clampGeom, metalMat);
      clampR.position.set(spanHalfWidth, 0.5, 0);
      group.add(clampR);

      // Top Crossbar & Pivot Bearings
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(spanHalfWidth * 2 + 2.2, 2.4, 2.4), metalMat);
      topBar.position.set(0, pivotElevation, 0);
      topBar.castShadow = true;
      group.add(topBar);

      // Overhead Signboard Canvas
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 512;
      signCanvas.height = 128;
      const sCtx = signCanvas.getContext('2d')!;
      sCtx.fillStyle = '#0f172a';
      sCtx.fillRect(0, 0, 512, 128);
      sCtx.fillStyle = '#ffde00';
      sCtx.font = '900 40px Rajdhani, Arial';
      sCtx.textAlign = 'center';
      sCtx.textBaseline = 'middle';
      sCtx.fillText('🔨 WRECKING PENDULUM 🔨', 256, 50);
      sCtx.fillStyle = '#ff1744';
      sCtx.font = '800 24px Teko, Arial';
      sCtx.fillText('TIMING HAZARD // DO NOT GET SWATTED', 256, 88);

      const signTex = new THREE.CanvasTexture(signCanvas);
      // Front sign (faces oncoming racers from -Z without mirroring)
      const signFront = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 3.0),
        new THREE.MeshBasicMaterial({ map: signTex })
      );
      signFront.position.set(0, pivotElevation + 2.2, -0.4);
      signFront.rotation.y = Math.PI;
      group.add(signFront);

      // Back sign (faces racers looking backward)
      const signBack = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 3.0),
        new THREE.MeshBasicMaterial({ map: signTex })
      );
      signBack.position.set(0, pivotElevation + 2.2, 0.4);
      group.add(signBack);

      // Swinging Arm Assembly
      const armGroup = new THREE.Group();
      armGroup.position.set(0, pivotElevation, 0);

      // High-Strength Industrial Shaft
      const shaftGeom = new THREE.CylinderGeometry(0.35, 0.42, cfg.armLength, 12);
      const shaft = new THREE.Mesh(shaftGeom, metalMat);
      shaft.position.set(0, -cfg.armLength / 2, 0);
      shaft.castShadow = true;
      armGroup.add(shaft);

      // Massive Spiked Wrecking Hammer Head at bottom of shaft
      const headGroup = new THREE.Group();
      headGroup.position.set(0, -cfg.armLength, 0);

      // Main Lower Spiked Heavy Cylinder (sweeps right at kart height: 1.3m above road!)
      const cylGeom = new THREE.CylinderGeometry(1.65, 1.65, 3.6, 16);
      cylGeom.rotateZ(Math.PI / 2);
      const cyl = new THREE.Mesh(cylGeom, hammerBumperMat);
      cyl.castShadow = true;
      headGroup.add(cyl);

      // Secondary upper weight collar (blocks high cars and prevents sneaking under)
      const upperCyl = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 2.6, 16), metalMat);
      upperCyl.position.set(0, 1.4, 0);
      upperCyl.rotateZ(Math.PI / 2);
      headGroup.add(upperCyl);

      // Heavy End Caps with Studs
      const capGeom = new THREE.CylinderGeometry(1.85, 1.85, 0.45, 16);
      capGeom.rotateZ(Math.PI / 2);
      const capL = new THREE.Mesh(capGeom, metalMat);
      capL.position.set(-1.8, 0, 0);
      headGroup.add(capL);

      const capR = new THREE.Mesh(capGeom, metalMat);
      capR.position.set(1.8, 0, 0);
      headGroup.add(capR);

      // Brutalist Impact Studs radiating around the head (8 spikes for full coverage)
      for (let s = 0; s < 8; s++) {
        const angle = (s * Math.PI * 2) / 8;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.85, 6), metalMat);
        spike.position.set(0, Math.cos(angle) * 1.9, Math.sin(angle) * 1.9);
        spike.rotation.x = -angle - Math.PI / 2;
        headGroup.add(spike);
      }

      armGroup.add(headGroup);
      group.add(armGroup);
      this.scene.add(group);

      this.pendulums.push({
        id: cfg.id,
        position: slice.position.clone(),
        tangent: slice.tangent.clone(),
        binormal: slice.binormal.clone(),
        normal: slice.normal.clone(),
        pivotY: pivotElevation,
        armLength: cfg.armLength,
        hammerRadius: 2.2,
        spanHalfWidth,
        swingSpeed: cfg.speed,
        phaseOffset: cfg.phaseOffset || 0,
        maxAngle: Math.min(cfg.maxAngle || 0.44, 0.44),
        currentAngle: 0,
        hammerWorldPos: new THREE.Vector3(),
        hammerLinearVel: new THREE.Vector3(),
        group,
        armGroup,
        lastHitTimes: new Map(),
      });
    }
  }

  // ── UPDATE & COLLISION SYSTEM ────────────────────────────────────
  public update(dt: number, allKarts: Kart[], _sparks?: SparkParticles, onAlert?: (msg: string, type: string) => void) {
    this.time += dt;

    // 1. Update Sky Turbines
    for (const turbine of this.turbines) {
      turbine.currentAngle += turbine.rotationSpeed * dt;
      turbine.rotorGroup.rotation.z = turbine.currentAngle;

      // Check collision with all active karts
      for (const kart of allKarts) {
        if (kart.airLaunchTimer > 0) continue;

        _khToKart.subVectors(kart.group.position, turbine.position);
        const distLong = _khToKart.dot(turbine.tangent); // Distance along track (plane thickness)
        const lat = _khToKart.dot(turbine.binormal);
        const vert = _khToKart.dot(turbine.normal);

        // 1. Solid Rigid Gantry Side Pillars (Left & Right - cannot be passed through!)
        const pillarSign = lat >= 0 ? 1 : -1;
        const pillarCenterLat = pillarSign * turbine.spanHalfWidth;
        const dPillarLat = Math.abs(lat - pillarCenterLat);
        const dPillarLong = Math.abs(distLong);
        const maxPillarLat = 1.75; // 0.8m half-width + 0.95m kart padding
        const maxPillarLong = 2.20; // 0.8m half-depth + 1.40m kart padding

        if (dPillarLat < maxPillarLat && dPillarLong < maxPillarLong && vert >= -0.5 && vert <= 15.0) {
          const overlapLat = maxPillarLat - dPillarLat;
          const overlapLong = maxPillarLong - dPillarLong;

          if (overlapLong <= overlapLat) {
            const signZ = distLong >= 0 ? 1 : -1;
            _khReboundDir.copy(turbine.tangent).multiplyScalar(signZ);
          } else {
            _khReboundDir.copy(turbine.binormal).multiplyScalar(lat >= pillarCenterLat ? 1 : -1);
          }
          _khReboundDir.y = 0;
          _khReboundDir.normalize();

          // Continuous hard pushback: guarantees kart never penetrates or passes through pillar
          const pushDist = Math.max(0.45, Math.min(overlapLat, overlapLong) + 0.25);
          kart.group.position.addScaledVector(_khReboundDir, pushDist);
          kart.rigidBody.setTranslation({
            x: kart.group.position.x,
            y: kart.group.position.y,
            z: kart.group.position.z,
          }, true);

          // Kill velocity heading into the pillar
          const curLv = kart.rigidBody.linvel();
          const dotIntoPillar = -(curLv.x * _khReboundDir.x + curLv.z * _khReboundDir.z);
          if (dotIntoPillar > 0) {
            kart.rigidBody.setLinvel({
              x: curLv.x + _khReboundDir.x * dotIntoPillar,
              y: curLv.y,
              z: curLv.z + _khReboundDir.z * dotIntoPillar,
            }, true);
          }

          const now = performance.now();
          const lastPillarHit = turbine.lastHitTimes.get(kart.id + '_pillar') || 0;
          if (now - lastPillarHit > 600) {
            turbine.lastHitTimes.set(kart.id + '_pillar', now);

            // Strong physical rebound bounce away from pillar
            const bounceVel = _khBounceVel.set(_khReboundDir.x * 16.0, 4.0, _khReboundDir.z * 16.0);
            kart.rigidBody.setLinvel({ x: bounceVel.x, y: bounceVel.y, z: bounceVel.z }, true);
            kart.currentSpeed *= -0.25;

            sounds.playCrash(2.0);
            if (onAlert && kart.id === 'kart-player') {
              onAlert('GANTRY PILLAR // SOLID IMPACT!', 'recoil');
            }
          }
          continue;
        }

        if (kart.isGhost) continue;

        if (Math.abs(distLong) < 2.6) {
          const vertHub = vert - turbine.hubY; // Offset from hub center
          const radialDist = Math.hypot(lat, vertHub);

          const now = performance.now();
          const lastHit = turbine.lastHitTimes.get(kart.id) || 0;

          // 1. Central Motor Hub & Axle (Solid Rigid Steel Core at y = 6.2m)
          if (radialDist < 2.0) {
            if (now - lastHit > 900) {
              turbine.lastHitTimes.set(kart.id, now);
              _khLaunchVel.copy(turbine.tangent).multiplyScalar(-26.0);
              _khLaunchVel.y += 14.0;
              kart.launchIntoAir(_khLaunchVel, false);
              sounds.playCrash(2.2);
              if (onAlert && kart.id === 'kart-player') {
                onAlert('TURBINE HUB SMASH // SOLID CORE!', 'recoil');
              }
            }
            continue;
          }

          // 2. Rotating Turbine Aero Blades (Accurate Dynamic Vector Collision & Wing Sweep Launch)
          if (radialDist <= (turbine.bladeRadius + 1.2)) {
            const numBlades = 3;
            let hitBlade = false;
            let hitBladeAngle = 0;
            let hitDistAlong = 0;

            for (let b = 0; b < numBlades; b++) {
              const bladeAngle = turbine.currentAngle + (b * Math.PI * 2) / numBlades;
              const bx = -Math.sin(bladeAngle);
              const by = Math.cos(bladeAngle);

              // Projection along blade centerline from hub
              const distAlong = lat * bx + vertHub * by;
              // Perpendicular distance to blade centerline
              const distPerp = Math.abs(lat * by - vertHub * bx);

              // Blade half-width (0.68m) + kart collision boundary padding (~1.4m) = 2.08m
              if (distAlong >= 1.0 && distAlong <= (turbine.bladeRadius + 1.1) && distPerp < 2.15) {
                hitBlade = true;
                hitBladeAngle = bladeAngle;
                hitDistAlong = distAlong;
                break;
              }
            }

            if (hitBlade) {
              if (now - lastHit > 800) {
                turbine.lastHitTimes.set(kart.id, now);

                // Exact 3D direction the striking wing/blade is traveling:
                // Tangential velocity of rotation around +Z (turbine.tangent):
                // In local plane (binormal, normal):
                // radial vector u = (-sin(theta), cos(theta))
                // tangential sweep vector = (-cos(theta), -sin(theta))
                const rotSign = Math.sign(turbine.rotationSpeed) || 1;
                const wingDirBinormal = -Math.cos(hitBladeAngle) * rotSign;
                const wingDirNormal = -Math.sin(hitBladeAngle) * rotSign;

                _khBladeDir.copy(turbine.binormal).multiplyScalar(wingDirBinormal)
                  .addScaledVector(turbine.normal, wingDirNormal)
                  .normalize();

                // Linear tangential velocity of the blade at the contact radius
                const linearSpeed = Math.abs(turbine.rotationSpeed) * Math.max(hitDistAlong, 4.5);
                const strikeSpeed = Math.max(30.0, linearSpeed * 2.0);

                // Launch velocity: powerful fling directly along the wing sweep arc
                _khLaunchVel.copy(_khBladeDir).multiplyScalar(strikeSpeed);

                // Upward skyward boost: ensure car launches high into the air
                if (_khLaunchVel.y < 12.0) {
                  _khLaunchVel.y = Math.max(0, _khLaunchVel.y) + 16.5;
                } else {
                  _khLaunchVel.y += 10.0;
                }

                // Slight backward track push
                _khLaunchVel.addScaledVector(turbine.tangent, -6.0);

                // High-energy rotational tumble torque matching the blade smack
                _khBounceVel.copy(_khBladeDir).multiplyScalar(14.0);
                _khBounceVel.y += 8.0;

                kart.launchIntoAir(_khLaunchVel, false, _khBounceVel);
                sounds.playCrash(2.4);

                if (onAlert && kart.id === 'kart-player') {
                  onAlert('TURBINE BLADE SMACKED // AIRBORNE!', 'recoil');
                }
              }
            }
          }
        }
      }
    }

    // 2. Update Swinging Pendulum Hammers
    for (const pendulum of this.pendulums) {
      const prevAngle = pendulum.currentAngle;
      pendulum.currentAngle = Math.sin(this.time * pendulum.swingSpeed + pendulum.phaseOffset) * pendulum.maxAngle;
      pendulum.armGroup.rotation.z = pendulum.currentAngle;

      // Angular velocity & linear velocity of the heavy hammer head
      const angVel = (pendulum.currentAngle - prevAngle) / Math.max(dt, 0.001);
      const swingLinearSpeed = angVel * pendulum.armLength;

      // Compute world position of the swinging hammer head (zero allocation)
      _khLocalHeadPos.set(
        Math.sin(pendulum.currentAngle) * pendulum.armLength,
        pendulum.pivotY - Math.cos(pendulum.currentAngle) * pendulum.armLength,
        0
      );
      pendulum.hammerWorldPos.copy(pendulum.position)
        .addScaledVector(pendulum.binormal, _khLocalHeadPos.x)
        .addScaledVector(pendulum.normal, _khLocalHeadPos.y);

      // Swing direction in 3D: along binormal
      pendulum.hammerLinearVel.copy(pendulum.binormal).multiplyScalar(swingLinearSpeed);

      // Test collision with karts (swept slice-plane & height envelope check)
      for (const kart of allKarts) {
        if (kart.airLaunchTimer > 0) continue;

        _khToKart.subVectors(kart.group.position, pendulum.position);
        const distLong = _khToKart.dot(pendulum.tangent); // Distance along track (plane thickness)
        const lat = _khToKart.dot(pendulum.binormal);
        const vert = _khToKart.dot(pendulum.normal);

        // 1. Solid Rigid Gantry Side Pillars (Left & Right - cannot be passed through!)
        const pillarSign = lat >= 0 ? 1 : -1;
        const pillarCenterLat = pillarSign * pendulum.spanHalfWidth;
        const dPillarLat = Math.abs(lat - pillarCenterLat);
        const dPillarLong = Math.abs(distLong);
        const maxPillarLat = 1.85; // 0.9m half-width + 0.95m kart padding
        const maxPillarLong = 2.40; // 1.0m half-depth + 1.40m kart padding

        if (dPillarLat < maxPillarLat && dPillarLong < maxPillarLong && vert >= -0.5 && vert <= 21.0) {
          const overlapLat = maxPillarLat - dPillarLat;
          const overlapLong = maxPillarLong - dPillarLong;

          if (overlapLong <= overlapLat) {
            const signZ = distLong >= 0 ? 1 : -1;
            _khReboundDir.copy(pendulum.tangent).multiplyScalar(signZ);
          } else {
            _khReboundDir.copy(pendulum.binormal).multiplyScalar(lat >= pillarCenterLat ? 1 : -1);
          }
          _khReboundDir.y = 0;
          _khReboundDir.normalize();

          // Continuous hard pushback: guarantees kart never penetrates or passes through pillar
          const pushDist = Math.max(0.45, Math.min(overlapLat, overlapLong) + 0.25);
          kart.group.position.addScaledVector(_khReboundDir, pushDist);
          kart.rigidBody.setTranslation({
            x: kart.group.position.x,
            y: kart.group.position.y,
            z: kart.group.position.z,
          }, true);

          // Kill velocity heading into the pillar
          const curLv = kart.rigidBody.linvel();
          const dotIntoPillar = -(curLv.x * _khReboundDir.x + curLv.z * _khReboundDir.z);
          if (dotIntoPillar > 0) {
            kart.rigidBody.setLinvel({
              x: curLv.x + _khReboundDir.x * dotIntoPillar,
              y: curLv.y,
              z: curLv.z + _khReboundDir.z * dotIntoPillar,
            }, true);
          }

          const now = performance.now();
          const lastPillarHit = pendulum.lastHitTimes.get(kart.id + '_pillar') || 0;
          if (now - lastPillarHit > 600) {
            pendulum.lastHitTimes.set(kart.id + '_pillar', now);

            // Strong physical rebound bounce away from pillar
            _khBounceVel.copy(_khReboundDir).multiplyScalar(16.0);
            _khBounceVel.y += 4.0;
            kart.rigidBody.setLinvel({ x: _khBounceVel.x, y: _khBounceVel.y, z: _khBounceVel.z }, true);
            kart.currentSpeed *= -0.25;

            sounds.playCrash(2.0);
            if (onAlert && kart.id === 'kart-player') {
              onAlert('GANTRY PILLAR // SOLID IMPACT!', 'recoil');
            }
          }
          continue;
        }

        if (kart.isGhost) continue;

        if (Math.abs(distLong) < 2.5) {

          const now = performance.now();
          const lastHit = pendulum.lastHitTimes.get(kart.id) || 0;

          // Hammer Head & Swept Smasher (Accurate 2D circular cross-section check)
          const dLat = lat - _khLocalHeadPos.x;
          const dVert = vert - _khLocalHeadPos.y;
          const distToHammerHead = Math.hypot(dLat, dVert);
          const hitRadius = pendulum.hammerRadius + 0.85; // Bumper radius + kart collision radius

          if (distToHammerHead < hitRadius) {
            if (now - lastHit > 2000) {
              pendulum.lastHitTimes.set(kart.id, now);

              const swingDir = Math.sign(angVel) || 1;
              _khLateralStrike.copy(pendulum.binormal).multiplyScalar(swingDir * Math.max(28.0, Math.abs(swingLinearSpeed) * 1.6));
              _khLaunchVel.copy(_khLateralStrike)
                .addScaledVector(pendulum.tangent, 12.0);
              _khLaunchVel.y += 16.5;

              kart.launchIntoAir(_khLaunchVel, false);
              sounds.playCrash(2.2);

              if (onAlert && kart.id === 'kart-player') {
                onAlert('HAMMER SMASHED // WATCH THE SWING!', 'recoil');
              }
            }
          }
        }
      }
    }
  }

  public dispose(scene: THREE.Scene) {
    for (const t of this.turbines) {
      scene.remove(t.group);
      t.group.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.geometry?.dispose();
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material?.dispose();
        }
      });
    }
    for (const p of this.pendulums) {
      scene.remove(p.group);
      p.group.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.geometry?.dispose();
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material?.dispose();
        }
      });
    }
    this.turbines = [];
    this.pendulums = [];
  }
}
