import * as THREE from 'three';
import { Kart } from './Kart';
import { Track } from '../world/Track';
import { PhysicsEngine } from '../core/Physics';

// Reusable scratch vectors to eliminate runtime GC allocations
const _botKartPos = new THREE.Vector3();
const _botQ = new THREE.Quaternion();
const _botForward = new THREE.Vector3();
const _botRight = new THREE.Vector3();
const _botToKart = new THREE.Vector3();
const _botToCenter = new THREE.Vector3();
const _botTargetDest = new THREE.Vector3();
const _botToDest = new THREE.Vector3();
const _botToT = new THREE.Vector3();
const _botToBlock = new THREE.Vector3();
const _botToRival = new THREE.Vector3();

export class BotKart {
  public kart: Kart;
  private track: Track;
  public currentT: number;
  private baseLaneOffset: number;
  private currentLaneOffset: number;

  // Stuck / recovery state
  private stuckTimer: number = 0;
  private isReversing: boolean = false;
  private reverseTimer: number = 0;
  // No stuck detection for first 3 s (bots start from speed 0)
  private startupGrace: number = 3.0;

  // Combat
  private retaliateTarget: Kart | null = null;
  private retaliateTimer: number = 0;
  private randomNudgeCooldown: number = 3.0 + Math.random() * 4.0;
  private nitroCooldown: number = 2.0 + Math.random() * 3.0;

  // Total track perimeter (metres) – computed dynamically from track curve
  private trackLength: number = 1750.0;

  constructor(kart: Kart, track: Track, laneOffset: number = 0, startT: number = 0.005) {
    this.kart              = kart;
    this.track             = track;
    this.trackLength       = track.curve.getLength();
    this.baseLaneOffset    = THREE.MathUtils.clamp(laneOffset * 0.45, -2.2, 2.2);
    this.currentLaneOffset = this.baseLaneOffset;
    this.currentT          = startT;
  }

  public setTrack(newTrack: Track) {
    this.track = newTrack;
    this.trackLength = newTrack.curve.getLength();
  }

  public onRespawn(pos: THREE.Vector3, _rot: THREE.Quaternion) {
    this.currentT          = this.track.getClosestT(pos, -1);
    this.stuckTimer        = 0;
    this.isReversing       = false;
    this.reverseTimer      = 0;
    this.retaliateTimer    = 0;
    this.retaliateTarget   = null;
    this.startupGrace      = 2.0;
    this.currentLaneOffset = this.baseLaneOffset;
  }

  public onRammed(attacker: Kart) {
    if (attacker === this.kart) return;
    this.retaliateTarget = attacker;
    this.retaliateTimer  = 1.5;
  }

  public update(dt: number, physics: PhysicsEngine, otherKarts: Kart[]) {
    if (!this.kart.rigidBody) return;

    if (this.track && this.track.isArena) {
      this.updateArenaAI(dt, physics, otherKarts);
      return;
    }
    const trans   = this.kart.rigidBody.translation();
    const rot     = this.kart.rigidBody.rotation();
    const kartPos = _botKartPos.set(trans.x, trans.y, trans.z);
    const q       = _botQ.set(rot.x, rot.y, rot.z, rot.w);
    const forward = _botForward.set(0, 0, 1).applyQuaternion(q);
    const right   = _botRight.set(1, 0, 0).applyQuaternion(q);

    if (this.startupGrace > 0) this.startupGrace -= dt;

    // ── 1. VELOCITY-PROJECTED SPLINE TRACKING ─────────────────────────
    // Primary: project kart velocity onto track tangent → advance T.
    // This CANNOT skip over hairpins because T moves at physical kart speed.
    const curSliceForProj = this.track.getTrackSlice(this.currentT);
    const lv = this.kart.rigidBody.linvel();
    const fwdProgress = lv.x * curSliceForProj.tangent.x + lv.z * curSliceForProj.tangent.z;
    const dT = THREE.MathUtils.clamp(
      (fwdProgress * dt) / this.trackLength,
      -2.0 / this.trackLength,
       8.0 / this.trackLength
    );
    this.currentT = (this.currentT + dT + 1.0) % 1.0;
    // Secondary XZ correction: ONLY when speed > 3 m/s (bot is clearly moving).
    // Skipping this at low speed prevents the closed-loop start-area snap where
    // t=0.005 and t=0.995 are at the same physical location and correction picks wrong side.
    if (Math.abs(fwdProgress) > 3.0) {
      let bestT     = this.currentT;
      let minDistSq = Infinity;
      for (let step = -2; step <= 2; step++) {
        const testT = (this.currentT + step / Track.SAMPLES + 1.0) % 1.0;
        const s     = this.track.getTrackSlice(testT);
        const dx    = s.position.x - kartPos.x;
        const dz    = s.position.z - kartPos.z;
        const dSq   = dx * dx + dz * dz;
        if (dSq < minDistSq) { minDistSq = dSq; bestT = testT; }
      }
      this.currentT = bestT;
    }

    const currentSlice = this.track.getTrackSlice(this.currentT);
    const sliceIdx     = Math.round(this.currentT * Track.SAMPLES) % Track.SAMPLES;

    // Lateral distance from centreline (XZ only, signed)
    const toKart     = _botToKart.set(
      kartPos.x - currentSlice.position.x, 0,
      kartPos.z - currentSlice.position.z
    );
    const currentLat = toKart.dot(currentSlice.binormal);

    // Timers
    if (this.retaliateTimer > 0) {
      this.retaliateTimer -= dt;
      if (this.retaliateTimer <= 0) this.retaliateTarget = null;
    }
    this.randomNudgeCooldown -= dt;
    this.nitroCooldown       -= dt;

    // ── 2. DYNAMIC JUMP ZONES & ANTI-GRAV TUBE (Works for Classic & Hardcore) ──
    const isNearAnyJump = this.track.config.jumpZones.some(
      (j) => sliceIdx >= (j.startSlice - 4) && sliceIdx <= (j.endSlice + 4)
    ) || currentSlice.isRamp;

    const isNearTube = !!(this.track.config.antiGravTube?.enabled &&
      sliceIdx >= (this.track.config.antiGravTube.startSlice - 3) &&
      sliceIdx <= (this.track.config.antiGravTube.endSlice + 3));

    // ── 3. AIRBORNE ───────────────────────────────────────────────────
    if (!this.kart.isGrounded) {
      const tangent = currentSlice.tangent;
      const vel     = this.kart.rigidBody.linvel();

      if (isNearAnyJump) {
        const horizSpd = Math.hypot(vel.x, vel.z);
        if (horizSpd < 28.0) {
          this.kart.rigidBody.setLinvel(
            { x: tangent.x * 30.0, y: vel.y, z: tangent.z * 30.0 }, true
          );
        }
        if (currentSlice.isGap && vel.y < -3.0) {
          this.kart.rigidBody.setLinvel({ x: vel.x, y: -1.0, z: vel.z }, true);
        }
      }

      const cross    = forward.x * tangent.z - forward.z * tangent.x;
      const airSteer = THREE.MathUtils.clamp(cross * 1.0, -0.30, 0.30);
      this.kart.applyInput(1.0, airSteer, false, dt, physics);
      return;
    }

    // ── 4. BLOCK COLLISION / STUCK RECOVERY ───────────────────────────
    let blockedByHazard = false;
    for (const block of this.track.hazardBlocks) {
      const d = kartPos.distanceTo(block.position);
      if (d < 2.8 && Math.abs(this.kart.currentSpeed) < 4.0) {
        blockedByHazard = true;
        break;
      }
    }

    if (!blockedByHazard && this.startupGrace <= 0 &&
        Math.abs(this.kart.currentSpeed) < 1.5 && !isNearAnyJump && !isNearTube) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 2.2) {
        this.isReversing = true;
        this.reverseTimer = 0.8;
        this.stuckTimer   = 0;
      }
    } else {
      this.stuckTimer = 0;
    }

    if (this.isReversing || blockedByHazard) {
      if (this.isReversing) {
        this.reverseTimer -= dt;
        if (this.reverseTimer <= 0) this.isReversing = false;
      }
      this.kart.applyInput(-0.7, 0, false, dt, physics);
      return;
    }

    // ── 5. LANE TARGET ────────────────────────────────────────────────
    let targetLane = this.baseLaneOffset;

    if (isNearAnyJump) {
      targetLane = 0.0;
      if (this.nitroCooldown <= 0.8) {
        this.kart.applyBoost(1.8, 1.5);
        this.nitroCooldown = 7.0;
      }
    } else {
      for (const block of this.track.hazardBlocks) {
        const toBlock = _botToBlock.subVectors(block.position, kartPos);
        const dist    = toBlock.length();
        if (dist < 25.0 && dist > 3.0 && toBlock.dot(forward) > 0) {
          const side = toBlock.dot(currentSlice.binormal);
          targetLane = side < 0 ? 2.0 : -2.0;
          break;
        }
      }
    }

    this.currentLaneOffset = THREE.MathUtils.lerp(this.currentLaneOffset, targetLane, dt * 2.5);

    // ── 6. LOOKAHEAD & DESTINATION ────────────────────────────────────
    const probeT     = (this.currentT + 0.020) % 1.0;
    const probeSlice = this.track.getTrackSlice(probeT);
    const turnAngle  = currentSlice.tangent.angleTo(probeSlice.tangent);

    const lookaheadM  = turnAngle > 0.28 ? 8.0 : (turnAngle > 0.12 ? 13.0 : 19.0);
    const targetT     = (this.currentT + lookaheadM / this.trackLength) % 1.0;
    const targetSlice = this.track.getTrackSlice(targetT);

    // Mild apex: ±1.2 m, very slow lerp to avoid frame-to-frame oscillation
    let effectiveOffset = this.currentLaneOffset;
    if (turnAngle > 0.22 && !isNearAnyJump) {
      const cross2   = currentSlice.tangent.x * targetSlice.tangent.z
                     - currentSlice.tangent.z * targetSlice.tangent.x;
      effectiveOffset = THREE.MathUtils.lerp(
        effectiveOffset, cross2 > 0 ? 1.2 : -1.2, 0.12
      );
    }

    const safeHalf  = Math.min(5.0, currentSlice.halfWidth - 2.0);
    effectiveOffset = THREE.MathUtils.clamp(effectiveOffset, -safeHalf, safeHalf);

    const destination = _botTargetDest.copy(targetSlice.position)
      .addScaledVector(targetSlice.binormal, effectiveOffset);

    // ── 7. STEERING (Pure Pursuit) ────────────────────────────────────
    const toDest = _botToDest.set(
      destination.x - kartPos.x, 0, destination.z - kartPos.z
    );
    const lenDest = toDest.length();
    if (lenDest < 0.01) {
      this.kart.applyInput(1.0, 0, false, dt, physics);
      return;
    }
    toDest.divideScalar(lenDest);

    const localFwd = forward.x * toDest.x + forward.z * toDest.z;
    const localRgt = right.x   * toDest.x + right.z   * toDest.z;
    const rawSteer = Math.atan2(localRgt, localFwd);
    let   steer    = THREE.MathUtils.clamp(rawSteer * 1.5, -1.0, 1.0);

    // ── 8. EDGE SAFETY (Applied strictly on open road, not inside 360° tube) ──
    if (!this.kart.isInAntiGravTube) {
      const safeLat = Math.min(5.0, currentSlice.halfWidth - 2.0);
      if (Math.abs(currentLat) > safeLat) {
        const excess = Math.abs(currentLat) - safeLat;
        steer = -Math.sign(currentLat) * THREE.MathUtils.clamp(0.55 + excess * 0.25, 0.55, 1.0);
        this.currentLaneOffset = THREE.MathUtils.lerp(this.currentLaneOffset, 0, dt * 5.0);
        const vel2   = this.kart.rigidBody.linvel();
        const outV   = vel2.x * currentSlice.binormal.x + vel2.z * currentSlice.binormal.z;
        if (outV * currentLat > 0) {
          this.kart.rigidBody.setLinvel({
            x: vel2.x - currentSlice.binormal.x * outV * 0.65,
            y: vel2.y,
            z: vel2.z - currentSlice.binormal.z * outV * 0.65,
          }, true);
        }
      }
    }

    // ── 9. COMBAT ─────────────────────────────────────────────────────
    const isSafe = Math.abs(currentLat) < 4.0;
    if (this.retaliateTarget && isSafe && !isNearAnyJump) {
      const toRival = _botToRival.subVectors(this.retaliateTarget.group.position, kartPos);
      if (toRival.length() < 4.5) {
        steer = THREE.MathUtils.clamp(
          steer + toRival.dot(currentSlice.binormal) * 0.16, -1.0, 1.0
        );
      }
    } else if (this.randomNudgeCooldown <= 0 && isSafe && !isNearAnyJump && this.kart.currentSpeed > 18.0) {
      for (const rival of otherKarts) {
        if (rival === this.kart) continue;
        const toR = _botToRival.subVectors(rival.group.position, kartPos);
        if (toR.length() < 3.5 && Math.abs(toR.y) < 1.5) {
          steer = THREE.MathUtils.clamp(
            steer + Math.sign(toR.dot(currentSlice.binormal)) * 0.15, -1.0, 1.0
          );
          this.randomNudgeCooldown = 5.0 + Math.random() * 4.0;
          break;
        }
      }
    }

    // ── 10. THROTTLE & DRIFT ──────────────────────────────────────────
    let throttle = 1.0;
    let drift    = false;

    if (isNearAnyJump) {
      throttle = 1.0;
    } else {
      const safeSpd = turnAngle > 0.32 ? 22.0 : turnAngle > 0.18 ? 30.0 : 46.0;
      if (this.kart.currentSpeed > safeSpd + 4.0) {
        throttle = -0.25; drift = true;
      } else if (this.kart.currentSpeed > safeSpd || Math.abs(steer) > 0.42) {
        throttle = 0.62; drift = true;
      } else if (turnAngle < 0.07 && this.nitroCooldown <= 0 && isSafe) {
        this.kart.applyBoost(1.2, 1.3);
        this.nitroCooldown = 6.0 + Math.random() * 3.0;
      }
    }

    // Pass -steer to Kart.applyInput because Kart physics uses steerDirection = -1
    // (where negative steer turns right, and positive steer turns left).
    const kartSteer = -steer;

    this.kart.applyInput(throttle, kartSteer, drift, dt, physics);
  }

  private updateArenaAI(dt: number, physics: PhysicsEngine, otherKarts: Kart[]) {
    const trans = this.kart.rigidBody.translation();
    const rot = this.kart.rigidBody.rotation();
    const kartPos = _botKartPos.set(trans.x, trans.y, trans.z);
    const q = _botQ.set(rot.x, rot.y, rot.z, rot.w);
    const forward = _botForward.set(0, 0, 1).applyQuaternion(q);
    const right = _botRight.set(1, 0, 0).applyQuaternion(q);

    if (this.startupGrace > 0) this.startupGrace -= dt;
    this.nitroCooldown -= dt;

    const distFromCenter = Math.hypot(kartPos.x, kartPos.z);

    // 1. AIRBORNE
    if (!this.kart.isGrounded) {
      const toCenter = _botToCenter.set(-kartPos.x, 0, -kartPos.z).normalize();
      const cross = forward.x * toCenter.z - forward.z * toCenter.x;
      const airSteer = THREE.MathUtils.clamp(cross * 1.5, -0.4, 0.4);
      this.kart.applyInput(1.0, airSteer, false, dt, physics);
      return;
    }

    // 2. EDGE DANGER OVERRIDE (High priority)
    // If the kart is on the outer banked slope (> 76m) and moving outwards, force steer towards center (0,0,0)
    if (distFromCenter > 76.0) {
      const toCenter = _botToCenter.set(-kartPos.x, 0, -kartPos.z).normalize();
      const localFwd = forward.x * toCenter.x + forward.z * toCenter.z;
      const localRgt = right.x * toCenter.x + right.z * toCenter.z;
      const rawSteer = Math.atan2(localRgt, localFwd);
      const steer = THREE.MathUtils.clamp(rawSteer * 2.2, -1.0, 1.0);

      let throttle = 1.0;
      if (localFwd < -0.2 && distFromCenter > 88.0) {
        throttle = -0.5;
      }
      this.kart.applyInput(throttle, -steer, false, dt, physics);
      return;
    }

    // 3. STUCK DETECTION (e.g. pinned against kicker or dais)
    if (this.startupGrace <= 0 && Math.abs(this.kart.currentSpeed) < 1.5) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.8) {
        this.isReversing = true;
        this.reverseTimer = 0.8;
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }

    if (this.isReversing) {
      this.reverseTimer -= dt;
      if (this.reverseTimer <= 0) this.isReversing = false;
      this.kart.applyInput(-0.8, 0.5, false, dt, physics);
      return;
    }

    // 4. COMBAT TARGETING: Find nearest valid enemy kart
    let bestTarget: Kart | null = null;
    let bestDistSq = Infinity;

    for (const other of otherKarts) {
      if (other === this.kart) continue;
      // In TDM, ignore teammates
      if (this.kart.team && other.team && this.kart.team === other.team) continue;
      // Ignore fallen or ghost karts
      if (other.group.position.y < -3.0 || other.isGhost) continue;

      const dx = other.group.position.x - kartPos.x;
      const dz = other.group.position.z - kartPos.z;
      const dSq = dx * dx + dz * dz;

      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestTarget = other;
      }
    }

    let targetDest = _botTargetDest;

    if (bestTarget) {
      // Intercept targeting
      const targetLinvel = bestTarget.rigidBody ? bestTarget.rigidBody.linvel() : { x: 0, y: 0, z: 0 };
      const dist = Math.sqrt(bestDistSq);
      const leadTime = THREE.MathUtils.clamp(dist / 35.0, 0.1, 0.4);
      targetDest.set(
        bestTarget.group.position.x + targetLinvel.x * leadTime,
        0,
        bestTarget.group.position.z + targetLinvel.z * leadTime
      );
    } else {
      targetDest.set(0, 0, 0);
    }

    // 5. STEER TOWARDS TARGET / DESTINATION
    const toDest = _botToDest.set(targetDest.x - kartPos.x, 0, targetDest.z - kartPos.z);
    const lenDest = toDest.length();
    let steer = 0;
    if (lenDest > 0.5) {
      toDest.divideScalar(lenDest);
      const localFwd = forward.x * toDest.x + forward.z * toDest.z;
      const localRgt = right.x * toDest.x + right.z * toDest.z;
      const rawSteer = Math.atan2(localRgt, localFwd);
      steer = THREE.MathUtils.clamp(rawSteer * 1.8, -1.0, 1.0);
    }

    // 6. 100% FAIR DRIVING: Pure throttle, steering & drift. Zero fake nitro cheats.
    const throttle = 1.0;
    const drift = Math.abs(steer) > 0.65;

    this.kart.applyInput(throttle, -steer, drift, dt, physics);
  }
}

